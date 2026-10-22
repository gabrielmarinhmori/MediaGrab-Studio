"""Real yt-dlp HTTP downloads and FFmpeg processing using self-generated media.
No third-party content or external network is needed for these integration tests.
"""

import functools
import http.server
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

import backend.app as service


@pytest.fixture(scope="module")
def media_server(tmp_path_factory):
    directory = tmp_path_factory.mktemp("media")
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=160x90:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=44100",
            "-t",
            "1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(directory / "sample.mp4"),
        ],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(directory / "sample.mp4"),
            "-vn",
            "-c:a",
            "copy",
            str(directory / "sample.m4a"),
        ],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(directory / "sample.mp4"),
            "-c:v",
            "libvpx-vp9",
            "-c:a",
            "libopus",
            "-b:a",
            "128k",
            str(directory / "sample.webm"),
        ],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(directory / "sample.mp4"),
            "-map",
            "0:v",
            "-map",
            "0:a",
            "-c",
            "copy",
            "-f",
            "dash",
            str(directory / "manifest.mpd"),
        ],
        check=True,
    )
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(directory)
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    thread.join()


@pytest.mark.parametrize(
    "mode,container,suffix",
    [
        ("video", "mkv", "mkv"),
        ("video", "mp4", "mp4"),
        ("video", "webm", "webm"),
        ("audio", "original", "m4a"),
        ("audio", "mp3", "mp3"),
        ("audio", "m4a", "m4a"),
        ("audio", "wav", "wav"),
        ("audio", "flac", "flac"),
        ("audio", "opus", "opus"),
    ],
)
def test_real_worker_download_and_conversion(
    media_server, tmp_path, mode, container, suffix
):
    source = (
        ("sample.webm" if container == "webm" else "sample.mp4")
        if mode == "video"
        else "sample.m4a"
    )
    task = {
        "url": f"{media_server}/{source}",
        "mode": mode,
        "container": container,
        "quality": "best",
        "audio_quality": 320,
        "temp": str(tmp_path),
    }
    result = subprocess.run(
        [sys.executable, "-m", "backend.worker"],
        input=json.dumps(task),
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    events = [
        json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")
    ]
    assert any(e["status"] == "downloading" and e["downloaded"] > 0 for e in events)
    assert events[-1]["status"] == "finished"
    files = list(tmp_path.glob("*." + suffix))
    assert len(files) == 1
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(files[0])],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(probe.stdout)["streams"]
    assert any(s["codec_type"] == "audio" for s in streams)
    assert any(s["codec_type"] == "video" for s in streams) == (mode == "video")


def test_manager_moves_completed_file_and_cleans_temp(media_server, tmp_path):
    job_id = "integration-job"
    destination = tmp_path / "downloads"
    service.jobs[job_id] = {
        "id": job_id,
        "title": "Generated test video",
        "status": "queued",
        "created": time.time(),
        "folder": str(destination),
        "request": {
            "url": media_server + "/sample.mp4",
            "mode": "video",
            "container": "mkv",
            "quality": "best",
            "audio_quality": 320,
        },
    }
    service.run(job_id)
    job = service.jobs[job_id]
    assert job["status"] == "completed", job.get("error")
    assert Path(job["path"]).is_file()
    assert job["size"] > 1000
    assert not (service.TEMP / job_id).exists()
    assert "integration-job" in json.loads(service.STATE.read_text())["jobs"]


def test_real_separate_dash_streams_are_merged(media_server, tmp_path):
    task = {
        "url": media_server + "/manifest.mpd",
        "mode": "video",
        "container": "mkv",
        "quality": "best",
        "audio_quality": 320,
        "temp": str(tmp_path),
    }
    result = subprocess.run(
        [sys.executable, "-m", "backend.worker"],
        input=json.dumps(task),
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    files = list(tmp_path.glob("*.mkv"))
    assert len(files) == 1
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(files[0])],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(probe.stdout)["streams"]
    assert {s["codec_type"] for s in streams} == {"video", "audio"}
    video = next(s for s in streams if s["codec_type"] == "video")
    assert video["codec_name"] == "h264"
    assert video["r_frame_rate"] == "24/1"


def test_active_worker_cancellation_cleans_temp(tmp_path):
    # A real worker is blocked in an HTTP read, then cancelled via the manager.
    started = threading.Event()
    release = threading.Event()

    class SlowHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", "10000000")
            self.end_headers()
            started.set()
            release.wait(8)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SlowHandler)
    server.daemon_threads = True
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    job_id = "cancel-integration"
    service.jobs[job_id] = {
        "id": job_id,
        "title": "Cancellation test",
        "status": "queued",
        "folder": str(tmp_path),
        "request": {
            "url": f"http://127.0.0.1:{server.server_port}/slow.mp4",
            "mode": "video",
            "container": "mkv",
            "quality": "best",
            "audio_quality": 320,
        },
    }
    worker = threading.Thread(target=service.run, args=(job_id,))
    worker.start()
    try:
        assert started.wait(5), "Worker never requested test media"
        proc = service.processes[job_id]
        service.cancel(job_id)
        worker.join(timeout=5)
        assert not worker.is_alive()
        assert proc.poll() is not None
        assert service.jobs[job_id]["status"] == "cancelled"
        assert not (service.TEMP / job_id).exists()
    finally:
        release.set()
        server.shutdown()
        server_thread.join()
        worker.join(timeout=5)
