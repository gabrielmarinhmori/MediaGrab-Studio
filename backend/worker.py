"""Isolated yt-dlp worker: its process group can be cancelled, including FFmpeg."""

import json
import sys
from pathlib import Path

import yt_dlp

from backend.media import download_options


def emit(data):
    print(json.dumps(data), flush=True)


def main():
    task = json.loads(sys.stdin.read())

    def progress(d):
        if d["status"] == "downloading":
            emit(
                {
                    "status": "downloading",
                    "downloaded": d.get("downloaded_bytes", 0),
                    "total": d.get("total_bytes") or d.get("total_bytes_estimate"),
                    "speed": d.get("speed"),
                    "eta": d.get("eta"),
                }
            )
        elif d["status"] == "finished":
            emit({"status": "processing"})

    opts = download_options(
        task["mode"],
        task["container"],
        task["quality"],
        task["audio_quality"],
        task.get("format_id"),
    )
    opts.update(
        {
            "outtmpl": str(Path(task["temp"]) / "%(title).150B [%(id)s].%(ext)s"),
            "progress_hooks": [progress],
            "postprocessor_hooks": [lambda d: emit({"status": "processing"})],
        }
    )
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([task["url"]])
        emit({"status": "finished"})
    except Exception as e:
        emit({"status": "error", "error": str(e)[-1800:]})
        sys.exit(1)


if __name__ == "__main__":
    main()
