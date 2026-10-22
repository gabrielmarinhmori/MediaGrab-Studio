import pytest

from backend.media import MediaError, download_options, validate_url


@pytest.mark.parametrize(
    "url",
    [
        "https://youtu.be/BaW_jenozKc",
        "https://www.youtube.com/watch?v=BaW_jenozKc&list=whatever",
        "https://youtube.com/shorts/BaW_jenozKc",
        "https://m.youtube.com/live/BaW_jenozKc",
    ],
)
def test_valid_urls_are_canonicalized(url):
    assert validate_url(url) == "https://www.youtube.com/watch?v=BaW_jenozKc"


@pytest.mark.parametrize(
    "url",
    [
        "http://youtube.com/watch?v=BaW_jenozKc",
        "https://youtube.com.evil.example/watch?v=BaW_jenozKc",
        "https://youtube.com@evil.example/watch?v=BaW_jenozKc",
        "https://user:pass@youtube.com/watch?v=BaW_jenozKc",
        "https://youtube.com:99/watch?v=BaW_jenozKc",
        "https://127.0.0.1/private",
        "file:///etc/passwd",
        "https://youtube.com/playlist?list=test",
        "https://youtube.com/watch?v=bad;rm -rf /",
        "https://youtu.be/BaW_jenozKc/extra",
    ],
)
def test_unsafe_or_unsupported_urls_rejected(url):
    with pytest.raises(MediaError):
        validate_url(url)


def test_video_selection_preserves_streams():
    opts = download_options("video", "mkv", "best", 320)
    assert opts["format"] == "bestvideo+bestaudio/best"
    assert opts["merge_output_format"] == "mkv"
    assert opts["postprocessors"][0]["key"] == "FFmpegVideoRemuxer"


def test_resolution_is_an_upper_limit_and_webm_is_compatible():
    opts = download_options("video", "webm", "1080", 320)
    assert "[height<=1080][ext=webm]" in opts["format"]
    assert "bestaudio[ext=webm]" in opts["format"]


@pytest.mark.parametrize("codec", ["mp3", "m4a", "wav", "flac", "opus"])
def test_audio_always_starts_from_best_source(codec):
    opts = download_options("audio", codec, "best", 320)
    assert opts["format"] == "bestaudio"
    assert opts["postprocessors"][0]["preferredcodec"] == codec
    assert opts["postprocessors"][0]["preferredquality"] == (
        "256" if codec == "opus" else "320"
    )


def test_original_audio_is_not_converted():
    assert "postprocessors" not in download_options("audio", "original", "best", 320)


def test_clip_requests_section_without_reencoding():
    opts = download_options("video", "mkv", "best", 320, clip_start=60, clip_end=180)
    assert opts["download_ranges"]({"duration": 43200}, None) == [
        {"start_time": 60, "end_time": 180}
    ]
    assert opts["force_keyframes_at_cuts"] is False
    with pytest.raises(MediaError):
        opts["download_ranges"]({"duration": 120}, None)


def test_full_download_does_not_request_a_section():
    assert "download_ranges" not in download_options("video", "mkv", "best", 320)
