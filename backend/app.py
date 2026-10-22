import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.media import MediaError, analyze, validate_url

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(
    os.environ.get(
        "MEDIAGRAB_DATA_DIR",
        str(Path.home() / "Library/Application Support/MediaGrab Studio"),
    )
).expanduser()
DATA.mkdir(parents=True, exist_ok=True)
TEMP = DATA / "temp"
TEMP.mkdir(exist_ok=True)
STATE = DATA / "state.json"
lock = threading.RLock()
pool = ThreadPoolExecutor(max_workers=1)
processes = {}
jobs = {}
folder = str(Path.home() / "Downloads")
if STATE.exists():
    try:
        saved = json.loads(STATE.read_text())
        folder = saved.get("folder", folder)
        jobs = saved.get("jobs", {})
    except (ValueError, OSError):
        pass
for job in jobs.values():
    if job["status"] in {"queued", "downloading", "processing"}:
        job.update(
            status="failed",
            error="The application stopped before this download finished. You can retry it.",
        )


def persist():
    with lock:
        tmp = STATE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"folder": folder, "jobs": jobs}, ensure_ascii=False))
        tmp.replace(STATE)


def update(job_id, **values):
    with lock:
        jobs[job_id].update(values)
        persist()


def terminate(proc):
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
        except ProcessLookupError:
            pass


def run(job_id):
    temp = TEMP / job_id
    proc = None
    try:
        with lock:
            job = jobs.get(job_id)
            if not job or job["status"] == "cancelled":
                return
            temp.mkdir()
            task = dict(job["request"], temp=str(temp))
            proc = subprocess.Popen(
                [sys.executable, "-m", "backend.worker"],
                cwd=ROOT,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,
            )
            processes[job_id] = proc
            update(job_id, status="downloading")
        errors = []

        def drain():
            for line in proc.stderr:
                errors.append(line)
                if len(errors) > 30:
                    errors.pop(0)

        reader = threading.Thread(target=drain, daemon=True)
        reader.start()
        proc.stdin.write(json.dumps(task))
        proc.stdin.close()
        for line in proc.stdout:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            with lock:
                if jobs[job_id]["status"] == "cancelled":
                    break
                if event.get("status") == "error":
                    update(job_id, error=event.get("error", "Download failed."))
                elif event.get("status") in {"downloading", "processing"}:
                    update(job_id, **event)
        code = proc.wait()
        reader.join(timeout=2)
        with lock:
            if jobs[job_id]["status"] == "cancelled":
                return
            if code:
                raise RuntimeError(
                    jobs[job_id].get("error")
                    or "".join(errors)[-1800:]
                    or "Download failed."
                )
            files = [
                p
                for p in temp.iterdir()
                if p.is_file() and p.suffix not in {".part", ".ytdl", ".json"}
            ]
            if len(files) != 1:
                raise RuntimeError(
                    "No single completed media file was produced. Try another compatible format."
                )
            source = files[0]
            target_dir = Path(job["folder"])
            target_dir.mkdir(parents=True, exist_ok=True)
            # Unique suffix prevents overwriting an existing personal file.
            target = target_dir / f"{source.stem} — {job_id[:8]}{source.suffix}"
            shutil.move(str(source), str(target))
            update(
                job_id,
                status="completed",
                path=str(target.resolve()),
                filename=target.name,
                size=target.stat().st_size,
                downloaded=target.stat().st_size,
                error=None,
            )
    except Exception as e:
        with lock:
            if jobs[job_id]["status"] != "cancelled":
                update(job_id, status="failed", error=str(e))
    finally:
        if proc:
            terminate(proc)
        with lock:
            processes.pop(job_id, None)
        shutil.rmtree(temp, ignore_errors=True)


@asynccontextmanager
async def lifespan(app):
    for item in TEMP.iterdir():
        if item.is_dir() and not item.is_symlink():
            shutil.rmtree(item)
    persist()
    yield
    with lock:
        active = list(processes.values())
    for proc in active:
        terminate(proc)
    pool.shutdown(wait=True, cancel_futures=True)
    persist()


app = FastAPI(title="MediaGrab Studio", lifespan=lifespan)


@app.middleware("http")
async def local_only(request: Request, call_next):
    host = request.headers.get("host", "").split(":")[0]
    if host not in {"127.0.0.1", "localhost"}:
        return JSONResponse(
            {"detail": "Only localhost access is allowed."}, status_code=403
        )
    origin = request.headers.get("origin")
    if origin:
        try:
            p = urlparse(origin)
            allowed = (
                p.scheme == "http"
                and p.hostname in {"localhost", "127.0.0.1"}
                and p.port in {8765, 5173}
            )
        except ValueError:
            allowed = False
        if not allowed:
            return JSONResponse(
                {"detail": "Request origin is not allowed."}, status_code=403
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' https://i.ytimg.com https://*.ytimg.com data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
    )
    return response


class AnalyzeRequest(BaseModel):
    url: str = Field(max_length=2048)


class DownloadRequest(AnalyzeRequest):
    title: str = Field(default="YouTube media", max_length=300)
    mode: str = "video"
    container: str = "mkv"
    quality: str = "best"
    audio_quality: int = 320
    format_id: str | None = None


class SettingsRequest(BaseModel):
    folder: str = Field(min_length=1, max_length=1024)


@app.get("/api/health")
def health():
    import yt_dlp.version

    return {
        "status": "ok",
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "yt_dlp": yt_dlp.version.__version__,
    }


@app.post("/api/analyze")
def analyze_video(body: AnalyzeRequest):
    try:
        return analyze(body.url)
    except Exception as e:
        raise HTTPException(400, str(e)[-1800:]) from e


@app.get("/api/settings")
def settings():
    return {"folder": folder}


@app.put("/api/settings")
def save_settings(body: SettingsRequest):
    global folder
    p = Path(body.folder).expanduser()
    if not p.is_absolute() or ".." in p.parts:
        raise HTTPException(400, "Enter an absolute folder path, such as ~/Downloads.")
    try:
        p.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile(dir=p):
            pass
    except OSError as e:
        raise HTTPException(
            400, "This folder is not writable. Check its path and permissions."
        ) from e
    folder = str(p.resolve())
    persist()
    return {"folder": folder}


@app.get("/api/jobs")
def list_jobs():
    with lock:
        return [public(j) for j in reversed(list(jobs.values()))]


@app.delete("/api/jobs")
def clear_history():
    """Forget stopped downloads without deleting media or touching running workers."""
    with lock:
        removable = [
            job_id
            for job_id, job in jobs.items()
            if job["status"] in {"completed", "failed", "cancelled"}
            and job_id not in processes
        ]
        for job_id in removable:
            del jobs[job_id]
        persist()
        return {"cleared": len(removable)}


def public(job):
    return {k: v for k, v in job.items() if k not in {"path", "request"}}


@app.post("/api/jobs", status_code=201)
def create_job(body: DownloadRequest):
    try:
        url = validate_url(body.url)
    except MediaError as e:
        raise HTTPException(400, str(e)) from e
    if body.mode not in {"video", "audio"} or body.container not in (
        {"mp4", "mkv", "webm"}
        if body.mode == "video"
        else {"original", "mp3", "m4a", "wav", "flac", "opus"}
    ):
        raise HTTPException(400, "Unsupported media type or container.")
    if body.quality not in {
        "best",
        "4320",
        "2160",
        "1440",
        "1080",
        "720",
        "480",
        "360",
    } or body.audio_quality not in {128, 192, 256, 320}:
        raise HTTPException(400, "Unsupported quality setting.")
    if body.format_id and not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", body.format_id):
        raise HTTPException(400, "Invalid source format.")
    if not shutil.which("ffmpeg"):
        raise HTTPException(503, "FFmpeg is missing. Run setup.command again.")
    with lock:
        if (
            sum(
                j["status"] in {"queued", "downloading", "processing"}
                for j in jobs.values()
            )
            >= 10
        ):
            raise HTTPException(
                429, "The queue is full. Wait for a download to finish."
            )
        job_id = uuid.uuid4().hex
        jobs[job_id] = {
            "id": job_id,
            "title": body.title,
            "status": "queued",
            "created": time.time(),
            "folder": folder,
            "request": dict(body.model_dump(), url=url),
            "downloaded": 0,
            "total": None,
        }
        persist()
        pool.submit(run, job_id)
        return public(jobs[job_id])


@app.post("/api/jobs/{job_id}/cancel")
def cancel(job_id: str):
    with lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Download not found.")
        if job["status"] not in {"queued", "downloading", "processing"}:
            raise HTTPException(409, "This download has already stopped.")
        update(job_id, status="cancelled")
        proc = processes.get(job_id)
    if proc:
        terminate(proc)
    return {"status": "cancelled"}


@app.post("/api/jobs/{job_id}/retry", status_code=201)
def retry(job_id: str):
    with lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Download not found.")
        if job["status"] not in {"failed", "cancelled"}:
            raise HTTPException(
                409, "Only failed or cancelled downloads can be retried."
            )
        return create_job(DownloadRequest(**job["request"]))


@app.get("/api/jobs/{job_id}/file")
def get_file(job_id: str):
    with lock:
        job = jobs.get(job_id)
        if not job or job["status"] != "completed":
            raise HTTPException(404, "Completed download not found.")
        path = Path(job["path"])
        if (
            path.is_symlink()
            or path.parent.resolve() != Path(job["folder"]).resolve()
            or not path.is_file()
        ):
            raise HTTPException(404, "The downloaded file was moved or deleted.")
        return FileResponse(
            path, filename=job["filename"], media_type="application/octet-stream"
        )


DIST = ROOT / "frontend/dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
