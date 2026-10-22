"""Validated extraction and loss-aware format selection. No shell commands."""

import math
import re
from urllib.parse import parse_qs, urlparse

import yt_dlp


class MediaError(ValueError):
    pass


def validate_url(value: str) -> str:
    try:
        p = urlparse(value.strip())
        if p.scheme != "https" or p.username or p.password or p.port not in (None, 443):
            raise MediaError("Enter a valid HTTPS YouTube video URL.")
        host = (p.hostname or "").lower()
        if host == "youtu.be":
            vid = p.path.strip("/")
        elif host in {
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
        }:
            if p.path == "/watch":
                vid = parse_qs(p.query).get("v", [""])[0]
            elif p.path.startswith(("/shorts/", "/live/", "/embed/")):
                vid = p.path.split("/")[2]
            else:
                vid = ""
        else:
            vid = ""
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
            raise MediaError(
                "Use a single YouTube video URL, not a channel or playlist."
            )
        return f"https://www.youtube.com/watch?v={vid}"
    except (ValueError, IndexError) as e:
        raise MediaError("Enter a valid HTTPS YouTube video URL.") from e


def base_options():
    return {
        "quiet": True,
        "noprogress": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 20,
        "retries": 3,
        "fragment_retries": 3,
        "ignoreconfig": True,
        "cachedir": False,
        "js_runtimes": {"node": {}},
        "restrictfilenames": False,
        "windowsfilenames": True,
    }


def analyze(url: str):
    with yt_dlp.YoutubeDL(base_options()) as ydl:
        info = ydl.extract_info(validate_url(url), download=False)
    if not info or info.get("is_live"):
        raise MediaError(
            "Live streams are not supported. Try again after the stream has ended."
        )
    formats = []
    for f in info.get("formats", []):
        if (
            f.get("has_drm")
            or not f.get("url")
            or f.get("vcodec") == "none"
            and f.get("acodec") == "none"
        ):
            continue
        formats.append(
            {
                k: f.get(k)
                for k in [
                    "format_id",
                    "ext",
                    "height",
                    "width",
                    "fps",
                    "vcodec",
                    "acodec",
                    "abr",
                    "filesize",
                    "filesize_approx",
                    "format_note",
                ]
            }
        )
    if not formats:
        raise MediaError(
            "No supported, unprotected formats are available for this video."
        )
    return {
        "id": info["id"],
        "url": validate_url(url),
        "title": info.get("title", "Untitled"),
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
        "formats": formats,
        "heights": sorted(
            {
                f["height"]
                for f in formats
                if f.get("height") and f.get("vcodec") != "none"
            },
            reverse=True,
        ),
    }


def download_options(
    mode,
    container,
    quality,
    audio_quality,
    format_id=None,
    clip_start=None,
    clip_end=None,
):
    opts = base_options()
    if clip_start is not None or clip_end is not None:
        if (
            clip_start is None
            or clip_end is None
            or not all(math.isfinite(t) for t in (clip_start, clip_end))
            or clip_start < 0
            or clip_end <= clip_start
        ):
            raise MediaError("Choose a valid clip start and end time.")

        def selected_range(info, ydl):
            duration = info.get("duration")
            if duration is not None and (clip_start >= duration or clip_end > duration):
                raise MediaError(
                    "The selected clip is outside this video's duration. Analyze the video again and choose valid times."
                )
            return [{"start_time": clip_start, "end_time": clip_end}]

        opts["download_ranges"] = selected_range
        opts["force_keyframes_at_cuts"] = False
        # Keep original timestamps through input seeking, then bound the output.
        # Some DASH demuxers otherwise return an entire segment from before the cut.
        opts["external_downloader_args"] = {
            "ffmpeg_o": [
                "-copyts",
                "-ss",
                str(clip_start),
                "-t",
                str(clip_end - clip_start),
                "-avoid_negative_ts",
                "make_zero",
            ]
        }
    if mode == "audio":
        opts["format"] = "bestaudio"
        if container != "original":
            opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": container,
                    "preferredquality": str(
                        min(audio_quality, 256)
                        if container == "opus"
                        else audio_quality
                    ),
                }
            ]
    else:
        cap = "" if quality == "best" else f"[height<={int(quality)}]"
        # MP4 permits modern codecs; remuxing preserves the original frames.
        if format_id:
            opts["format"] = f"{format_id}+bestaudio/{format_id}"
        else:
            opts["format"] = f"bestvideo{cap}+bestaudio/best{cap}"
        if container == "webm":
            opts["format"] = (
                f"{format_id}+bestaudio[ext=webm]/{format_id}"
                if format_id
                else f"bestvideo{cap}[ext=webm]+bestaudio[ext=webm]/best{cap}[ext=webm]"
            )
        opts["merge_output_format"] = container
        opts["postprocessors"] = [
            {"key": "FFmpegVideoRemuxer", "preferedformat": container}
        ]
    return opts
