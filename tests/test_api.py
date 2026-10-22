import pytest
from fastapi.testclient import TestClient

import backend.app as service


@pytest.fixture
def client(tmp_path, monkeypatch):
    service.jobs.clear()
    monkeypatch.setattr(service, "folder", str(tmp_path / "downloads"))
    with TestClient(service.app, base_url="http://127.0.0.1:8765") as c:
        yield c
    # Lifespan closes the executor; replace it for the next application run.
    from concurrent.futures import ThreadPoolExecutor

    service.pool = ThreadPoolExecutor(max_workers=1)


def test_health_and_origin_protection(client):
    assert client.get("/api/health").json()["ffmpeg"] is True
    assert (
        client.get("/api/health", headers={"Host": "evil.example"}).status_code == 403
    )
    assert (
        client.post(
            "/api/analyze",
            headers={"Origin": "https://evil.example"},
            json={"url": "x"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/analyze",
            headers={"Origin": "http://localhost:9999"},
            json={"url": "x"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/analyze",
            headers={"Origin": "http://localhost:invalid"},
            json={"url": "x"},
        ).status_code
        == 403
    )


def test_reject_injection_and_unsupported_download(client):
    body = {
        "url": "https://youtube.com/watch?v=BaW_jenozKc",
        "container": "$(touch /tmp/evil)",
    }
    assert client.post("/api/jobs", json=body).status_code == 400
    body["container"] = "mkv"
    body["format_id"] = "1;whoami"
    assert client.post("/api/jobs", json=body).status_code == 400
    assert (
        client.post("/api/analyze", json={"url": "file:///etc/passwd"}).status_code
        == 400
    )


def test_folder_settings_and_file_access(client, tmp_path):
    assert (
        client.put("/api/settings", json={"folder": "relative/path"}).status_code == 400
    )
    target = tmp_path / "my media"
    assert client.put("/api/settings", json={"folder": str(target)}).json()[
        "folder"
    ] == str(target)
    assert client.get("/api/jobs/unknown/file").status_code == 404
    assert client.get("/api/jobs/../../etc/passwd/file").status_code == 404
    path = target / "test.txt"
    path.write_text("saved download")
    service.jobs["valid"] = {
        "id": "valid",
        "status": "completed",
        "folder": str(target),
        "path": str(path),
        "filename": "test.txt",
    }
    assert client.get("/api/jobs/valid/file").text == "saved download"
    path.unlink()
    path.symlink_to("/etc/passwd")
    assert client.get("/api/jobs/valid/file").status_code == 404


def test_analysis_uses_extractor_data(client, monkeypatch):
    monkeypatch.setattr(
        service,
        "analyze",
        lambda u: {
            "title": "Owned test video",
            "formats": [{"format_id": "137", "height": 1080}],
        },
    )
    result = client.post("/api/analyze", json={"url": "https://youtu.be/BaW_jenozKc"})
    assert result.status_code == 200
    assert result.json()["formats"][0]["height"] == 1080


def test_cancel_queued_and_retry(client, monkeypatch):
    # Pause scheduling to test queue transitions without making network requests.
    monkeypatch.setattr(service.pool, "submit", lambda *args: None)
    body = {"url": "https://youtu.be/BaW_jenozKc", "title": "Owned test video"}
    result = client.post("/api/jobs", json=body)
    assert result.status_code == 201
    job = result.json()
    assert job["status"] == "queued"
    assert "request" not in job and "path" not in job
    assert client.post(f"/api/jobs/{job['id']}/cancel").status_code == 200
    assert client.post(f"/api/jobs/{job['id']}/retry").status_code == 201
    assert len(client.get("/api/jobs").json()) == 2
    assert client.post(f"/api/jobs/{job['id']}/cancel").status_code == 409


def test_clear_history_keeps_files_and_active_jobs(client, tmp_path):
    import json

    media = tmp_path / "personal-video.mp4"
    media.write_bytes(b"original media bytes")
    for status in [
        "completed",
        "failed",
        "cancelled",
        "queued",
        "downloading",
        "processing",
    ]:
        service.jobs[status] = {"id": status, "status": status, "path": str(media)}
    # A cancelled worker can still be winding down; do not remove its state yet.
    service.jobs["winding-down"] = {"id": "winding-down", "status": "cancelled"}
    service.processes["winding-down"] = object()
    try:
        response = client.delete("/api/jobs")
        assert response.status_code == 200
        assert response.json() == {"cleared": 3}
        assert set(service.jobs) == {
            "queued",
            "downloading",
            "processing",
            "winding-down",
        }
        assert set(json.loads(service.STATE.read_text())["jobs"]) == set(service.jobs)
        assert media.read_bytes() == b"original media bytes"
        assert client.delete("/api/jobs").json() == {"cleared": 0}
    finally:
        service.processes.pop("winding-down")


def test_cancelled_queued_worker_can_run_after_history_cleared(client):
    service.jobs["cancelled-job"] = {"id": "cancelled-job", "status": "cancelled"}
    assert client.delete("/api/jobs").json() == {"cleared": 1}
    service.run("cancelled-job")
    assert "cancelled-job" not in service.jobs
