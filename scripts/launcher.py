"""Idempotent launcher. Only stops a PID whose command matches our server."""

import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / ".runtime"
RUNTIME.mkdir(exist_ok=True)
PID = RUNTIME / "server.pid"
SERVER = str(ROOT / "scripts/server.py")
URL = "http://127.0.0.1:8765"


def owned_pid():
    try:
        pid = int(PID.read_text())
        cmd = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", "command="], text=True
        ).strip()
        return pid if SERVER in cmd and "python" in cmd.lower() else None
    except (OSError, ValueError, subprocess.CalledProcessError):
        return None


def ready():
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=1) as r:
            return json.load(r).get("status") == "ok"
    except Exception:
        return False


def main():
    pid = owned_pid()
    if sys.argv[1] == "stop":
        if pid:
            os.kill(pid, signal.SIGTERM)
            for _ in range(100):
                if not owned_pid():
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError(
                    "Server is still shutting down. Wait a moment and run stop.command again."
                )
        PID.unlink(missing_ok=True)
        print("MediaGrab Studio stopped. Your completed downloads are safe.")
        return
    if not pid:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", 8765)) == 0:
                raise RuntimeError(
                    "Port 8765 is used by another application. Close it before starting MediaGrab Studio."
                )
        with (RUNTIME / "server.log").open("a") as log:
            proc = subprocess.Popen(
                [sys.executable, SERVER],
                cwd=ROOT,
                stdout=log,
                stderr=log,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
            )
        PID.write_text(str(proc.pid))
        pid = proc.pid
    for _ in range(100):
        if ready():
            print("MediaGrab Studio is running locally. Opening your browser…")
            if os.environ.get("MEDIAGRAB_NO_BROWSER") != "1":
                webbrowser.open(URL)
            return
        if not owned_pid():
            break
        time.sleep(0.15)
    raise RuntimeError(
        "The server did not become ready. Read .runtime/server.log for details."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
