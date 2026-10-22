import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUpRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileVideo,
  FolderOpen,
  Globe2,
  HardDrive,
  History,
  Link2,
  Loader2,
  LockKeyhole,
  MonitorPlay,
  Music2,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import "./style.css";
import { ClipSelector } from "./ClipSelector";
import { formatETA, parseTimestamp, timestamp } from "./time";

type Format = {
  format_id: string;
  ext: string;
  height: number | null;
  fps: number | null;
  vcodec: string;
  acodec: string;
  filesize: number | null;
  filesize_approx: number | null;
};
type Media = {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  formats: Format[];
  heights: number[];
};
type Job = {
  id: string;
  title: string;
  status: string;
  created: number;
  downloaded: number;
  total: number | null;
  speed?: number;
  eta?: number;
  clip_start?: number | null;
  clip_end?: number | null;
  filename?: string;
  size?: number;
  error?: string;
  folder: string;
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Please check your input and try again.",
    );
  return data;
}
function bytes(n?: number | null) {
  if (!n) return "—";
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 3);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${["B", "KB", "MB", "GB"][i]}`;
}
function duration(n: number) {
  return timestamp(n);
}
function App() {
  const [url, setUrl] = useState(""),
    [media, setMedia] = useState<Media | null>(null),
    [analyzing, setAnalyzing] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState<"video" | "audio">("video"),
    [quality, setQuality] = useState("best"),
    [container, setContainer] = useState("mkv"),
    [audioFormat, setAudioFormat] = useState("original"),
    [bitrate, setBitrate] = useState("320"),
    [formatId, setFormatId] = useState("");
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipStart, setClipStart] = useState("0:00");
  const [clipEnd, setClipEnd] = useState("0:00");
  const clipFrom = parseTimestamp(clipStart),
    clipTo = parseTimestamp(clipEnd);
  const clipValid =
    !clipEnabled ||
    !!(
      media &&
      clipFrom !== null &&
      clipTo !== null &&
      clipTo > clipFrom &&
      clipTo <= Math.floor(media.duration)
    );
  const [clearingHistory, setClearingHistory] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]),
    [folder, setFolder] = useState(""),
    [draftFolder, setDraftFolder] = useState(""),
    [showSettings, setShowSettings] = useState(false),
    [showHelp, setShowHelp] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [online, setOnline] = useState(false),
    [ffmpeg, setFfmpeg] = useState(true),
    [page, setPage] = useState("studio"),
    [notice, setNotice] = useState("");
  const refresh = async () => {
    try {
      const j = await api<Job[]>("/jobs");
      setJobs(j);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };
  useEffect(() => {
    void refresh();
    void api<{ folder: string }>("/settings")
      .then((s) => {
        setFolder(s.folder);
        setDraftFolder(s.folder);
      })
      .catch(() => {});
    void api<{ ffmpeg: boolean }>("/health")
      .then((s) => setFfmpeg(s.ffmpeg))
      .catch(() => {});
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, []);
  const analyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAnalyzing(true);
    setMedia(null);
    setFormatId("");
    setQuality("best");
    setClipEnabled(false);
    setClipStart("0:00");
    try {
      const result = await api<Media>("/analyze", "POST", { url });
      setMedia(result);
      setClipEnd(timestamp(result.duration || 0));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };
  const download = async () => {
    if (!media || !clipValid) return;
    setSubmitting(true);
    setError("");
    try {
      await api("/jobs", "POST", {
        url: media.url,
        title: media.title,
        mode,
        container: mode === "video" ? container : audioFormat,
        quality,
        audio_quality: Number(bitrate),
        clip_start: clipEnabled ? clipFrom : null,
        clip_end: clipEnabled ? clipTo : null,
        format_id: mode === "video" && formatId ? formatId : null,
      });
      await refresh();
      setNotice(
        "Added to your download queue. Your file will be saved automatically.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  const jobAction = async (id: string, action: string) => {
    try {
      await api(`/jobs/${id}/${action}`, "POST");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const clearHistory = async () => {
    if (
      !window.confirm(
        "Clear finished download history? Your saved videos and audio files will stay on your Mac. Downloads in progress will be kept.",
      )
    )
      return;
    setClearingHistory(true);
    setError("");
    try {
      const result = await api<{ cleared: number }>("/jobs", "DELETE");
      await refresh();
      setNotice(
        `${result.cleared} history ${result.cleared === 1 ? "entry" : "entries"} cleared. Your saved files have not been deleted.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClearingHistory(false);
    }
  };
  const completed = jobs.filter((j) => j.status === "completed"),
    active = jobs.filter((j) =>
      ["queued", "downloading", "processing"].includes(j.status),
    );
  const shown = page === "history" ? jobs : jobs.slice(0, 5);
  const selectedFormat = media?.formats.find((f) => f.format_id === formatId);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("studio");
          }}
        >
          <span className="brand-icon">
            <ArrowDownToLine size={23} />
          </span>
          <span>
            MediaGrab<span className="brand-sub">STUDIO</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          <button
            className={page === "studio" ? "nav-item selected" : "nav-item"}
            onClick={() => setPage("studio")}
          >
            <MonitorPlay size={19} /> Download studio{" "}
            <span className="nav-dot" />
          </button>
          <button
            className={page === "history" ? "nav-item selected" : "nav-item"}
            onClick={() => setPage("history")}
          >
            <History size={19} /> Download history{" "}
            <span className="count">{jobs.length}</span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setDraftFolder(folder);
              setShowSettings(true);
            }}
          >
            <Settings2 size={19} /> Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <ShieldCheck size={21} />
            </span>
            <strong>Your media. Your machine.</strong>
            <p>
              Runs locally. No accounts.
              <br />
              No subscriptions. Just you.
            </p>
            <div>
              <i /> 100% local & private
            </div>
          </div>
          <button className="help-link" onClick={() => setShowHelp(true)}>
            <CircleHelp size={17} /> Help & getting started{" "}
            <ArrowUpRight size={15} />
          </button>
          <span className="version">
            MediaGrab Studio <span>v1.0.0</span>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <span>
              {page === "studio" ? "Download studio" : "Download history"}
            </span>
          </div>
          <div className="server-status">
            <i className={online ? "" : "offline"} />
            {online ? "Local server connected" : "Connecting to local server"}
          </div>
          <button
            className="header-settings"
            aria-label="Open settings"
            onClick={() => setShowSettings(true)}
          >
            <Settings2 size={18} />
          </button>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> MADE FOR YOUR PERSONAL COLLECTION
              </div>
              <h1>
                {page === "studio" ? (
                  <>
                    Great media.
                    <br className="mobile-break" /> <span>Yours to keep.</span>
                  </>
                ) : (
                  "Your media library."
                )}
              </h1>
              <p>
                {page === "studio"
                  ? "Download video and audio in their best original quality. All on your Mac."
                  : "Your downloads, right where you left them. Saved on your Mac."}
              </p>
            </div>
            <div className="private-pill">
              <LockKeyhole size={13} /> Private by design
            </div>
          </div>
          {!online && (
            <div className="alert">
              <CircleHelp size={18} /> Cannot reach the local service. If this
              continues, double-click start.command again.
            </div>
          )}
          {!ffmpeg && (
            <div className="alert">
              FFmpeg is missing. Run setup.command to enable downloads and
              conversion.
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "studio" && (
            <>
              <section className="analyze-card">
                <div className="section-caption">
                  <span className="step">01</span>
                  <h2>Start with a link</h2>
                  <span className="youtube-tag">
                    <Play size={10} fill="currentColor" /> YouTube
                  </span>
                </div>
                <form onSubmit={analyze}>
                  <div className="url-input">
                    <Link2 size={21} />
                    <input
                      aria-label="YouTube video URL"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste a YouTube video link here…"
                      required
                      type="url"
                    />
                    <button
                      className="primary analyze-button"
                      disabled={analyzing || !url.trim() || !online}
                    >
                      {analyzing ? (
                        <Loader2 className="spin" size={17} />
                      ) : (
                        <Sparkles size={17} />
                      )}{" "}
                      {analyzing ? "Analyzing…" : "Analyze"}{" "}
                      {!analyzing && <ArrowUpRight size={16} />}
                    </button>
                  </div>
                </form>
                <p className="input-hint">
                  <ShieldCheck size={13} /> Only download content you own or
                  have permission to use.
                </p>
              </section>
              <div className="studio-grid">
                <section className="download-card">
                  <div className="section-caption">
                    <span className="step">02</span>
                    <h2>Make it yours</h2>
                    <span className="subtle-label">DOWNLOAD PREFERENCES</span>
                  </div>
                  <div className="media-preview">
                    {analyzing ? (
                      <div className="preview-empty">
                        <Loader2 className="spin" size={26} />
                        <span>Finding the best available formats…</span>
                      </div>
                    ) : media ? (
                      <>
                        <div className="thumbnail">
                          <img src={media.thumbnail} alt="Video thumbnail" />
                          <span>{duration(media.duration || 0)}</span>
                        </div>
                        <div className="media-details">
                          <span className="source-label">YOUTUBE VIDEO</span>
                          <h3>{media.title}</h3>
                          <p>{media.uploader}</p>
                          <div>
                            <span>
                              <CheckCircle2 size={12} /> Ready to download
                            </span>
                            <span>
                              {media.heights[0]
                                ? `${media.heights[0]}p max`
                                : "Audio available"}
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="preview-empty">
                        <span className="preview-symbol">
                          <Play size={23} />
                        </span>
                        <strong>Your next favorite, right here.</strong>
                        <span>Paste a link above to preview your media.</span>
                      </div>
                    )}
                  </div>
                  {media && (
                    <ClipSelector
                      duration={media.duration}
                      enabled={clipEnabled}
                      start={clipStart}
                      end={clipEnd}
                      onEnabled={setClipEnabled}
                      onStart={setClipStart}
                      onEnd={setClipEnd}
                    />
                  )}
                  <div
                    className="mode-tabs"
                    role="tablist"
                    aria-label="Download type"
                  >
                    <button
                      role="tab"
                      aria-selected={mode === "video"}
                      className={mode === "video" ? "active" : ""}
                      onClick={() => setMode("video")}
                    >
                      <Video size={17} /> Video <span>WITH AUDIO</span>
                    </button>
                    <button
                      role="tab"
                      aria-selected={mode === "audio"}
                      className={mode === "audio" ? "active" : ""}
                      onClick={() => setMode("audio")}
                    >
                      <AudioLines size={17} /> Audio only
                    </button>
                  </div>
                  <div className="selectors">
                    <label>
                      {mode === "video" ? "Video quality" : "Audio format"}
                      {mode === "video" ? (
                        <select
                          value={quality}
                          onChange={(e) => {
                            setQuality(e.target.value);
                            setFormatId("");
                          }}
                          disabled={!media || !!formatId}
                        >
                          <option value="best">
                            Best available · Original quality
                          </option>
                          {[
                            ["4320", "8K · 4320p"],
                            ["2160", "4K · 2160p"],
                            ["1440", "1440p · QHD"],
                            ["1080", "1080p · Full HD"],
                            ["720", "720p · HD"],
                            ["480", "480p"],
                            ["360", "360p"],
                          ].map(([v, l]) => (
                            <option
                              key={v}
                              value={v}
                              disabled={
                                !media?.heights.some((h) => h <= Number(v))
                              }
                            >
                              {l}
                              {media?.heights.includes(Number(v))
                                ? ""
                                : " (up to)"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={audioFormat}
                          onChange={(e) => {
                            setAudioFormat(e.target.value);
                            if (e.target.value === "opus" && bitrate === "320")
                              setBitrate("256");
                          }}
                        >
                          {[
                            ["original", "Best original audio"],
                            ["mp3", "MP3"],
                            ["m4a", "M4A"],
                            ["wav", "WAV · Uncompressed"],
                            ["flac", "FLAC · Lossless container"],
                            ["opus", "Opus"],
                          ].map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                    <label>
                      {mode === "video" ? "File format" : "Encoding quality"}
                      {mode === "video" ? (
                        <select
                          value={container}
                          onChange={(e) => {
                            setContainer(e.target.value);
                            setFormatId("");
                          }}
                        >
                          <option value="mkv">
                            MKV · Preserve source codecs
                          </option>
                          <option value="mp4">MP4</option>
                          <option value="webm">
                            WebM · Compatible sources only
                          </option>
                        </select>
                      ) : (
                        <select
                          disabled={["original", "wav", "flac"].includes(
                            audioFormat,
                          )}
                          value={bitrate}
                          onChange={(e) => setBitrate(e.target.value)}
                        >
                          {(audioFormat === "opus"
                            ? ["256", "192", "128"]
                            : ["320", "256", "192", "128"]
                          ).map((v) => (
                            <option key={v} value={v}>
                              {v} kbps{v === "320" ? " · Highest" : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>
                  {media && mode === "video" && (
                    <label className="source-selector">
                      Specific source <span>OPTIONAL</span>
                      <select
                        value={formatId}
                        onChange={(e) => setFormatId(e.target.value)}
                      >
                        <option value="">
                          Automatically choose the best streams
                        </option>
                        {media.formats
                          .filter(
                            (f) =>
                              f.vcodec !== "none" &&
                              (container !== "webm" || f.ext === "webm"),
                          )
                          .map((f) => (
                            <option key={f.format_id} value={f.format_id}>
                              {f.height ? `${f.height}p` : ""}{" "}
                              {f.fps ? `${f.fps} fps` : ""} · {f.ext} ·{" "}
                              {f.vcodec} · ID {f.format_id}
                              {f.filesize ? ` · ${bytes(f.filesize)}` : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <div className="quality-note">
                    <Sparkles size={16} />
                    <p>
                      {mode === "video"
                        ? "Original frames. Original detail. We merge streams without unnecessary re-encoding."
                        : audioFormat === "flac" || audioFormat === "wav"
                          ? "WAV and FLAC do not restore detail lost in compressed source audio."
                          : "We always start with the best available source audio. Higher bitrates cannot improve the source."}
                    </p>
                  </div>
                  <button
                    className="primary download-button"
                    disabled={
                      !media || !clipValid || submitting || !online || !ffmpeg
                    }
                    onClick={() => void download()}
                  >
                    {submitting ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <ArrowDownToLine size={19} />
                    )}{" "}
                    {submitting
                      ? "Adding to queue…"
                      : "Download " + (mode === "video" ? "video" : "audio")}
                    <span>
                      {clipEnabled &&
                      clipValid &&
                      clipFrom !== null &&
                      clipTo !== null
                        ? `Clip · ${timestamp(clipTo - clipFrom)}`
                        : selectedFormat
                          ? bytes(
                              selectedFormat.filesize ||
                                selectedFormat.filesize_approx,
                            )
                          : "Best source quality"}
                    </span>
                  </button>
                  <div className="save-location">
                    <FolderOpen size={13} />
                    <span>
                      Save to{" "}
                      <button
                        title={folder}
                        onClick={() => setShowSettings(true)}
                      >
                        {folder
                          ? folder.replace(/^\/Users\/[^/]+/, "~")
                          : "Downloads"}
                      </button>
                    </span>
                    <button
                      aria-label="Change download folder"
                      onClick={() => setShowSettings(true)}
                    >
                      <Settings2 size={13} />
                    </button>
                  </div>
                </section>
                <aside className="details-column">
                  <div className="quality-card">
                    <div className="orb">
                      <ArrowDown size={35} />
                      <span className="orb-star">✦</span>
                    </div>
                    <span className="small-kicker">
                      EVERY PIXEL. EVERY NOTE.
                    </span>
                    <h2>
                      Nothing lost.
                      <br />
                      <span>Everything yours.</span>
                    </h2>
                    <p>
                      From crisp 8K video to your favorite soundtrack. Keep the
                      best the source has to offer.
                    </p>
                    <div className="feature-line">
                      <span>
                        <MonitorPlay size={16} />
                      </span>
                      <div>
                        <strong>Up to 8K resolution</strong>
                        <p>When available from the source</p>
                      </div>
                    </div>
                    <div className="feature-line">
                      <span>
                        <Music2 size={16} />
                      </span>
                      <div>
                        <strong>Audio, your way</strong>
                        <p>Original, MP3, FLAC & more</p>
                      </div>
                    </div>
                    <div className="feature-line">
                      <span>
                        <HardDrive size={16} />
                      </span>
                      <div>
                        <strong>Straight to your Mac</strong>
                        <p>No uploads. No middleman.</p>
                      </div>
                    </div>
                  </div>
                  <div className="tip-card">
                    <span className="tip-icon">
                      <CircleHelp size={17} />
                    </span>
                    <div>
                      <h3>A little quality tip</h3>
                      <p>
                        “Best available” keeps the highest source quality. MKV
                        is a great choice for preserving modern video and audio
                        codecs.
                      </p>
                      <button onClick={() => setShowHelp(true)}>
                        Good to know <ArrowUpRight size={12} />
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}
          <section className="history-section">
            <div className="history-heading">
              <h2>
                {page === "history" ? "All downloads" : "Recent downloads"}{" "}
                <span>{jobs.length}</span>
              </h2>
              <div className="history-controls">
                {page === "studio" && (
                  <button onClick={() => setPage("history")}>
                    View history <ArrowUpRight size={14} />
                  </button>
                )}
                <button
                  onClick={() => void clearHistory()}
                  disabled={
                    !online ||
                    clearingHistory ||
                    !jobs.some((j) =>
                      ["completed", "failed", "cancelled"].includes(j.status),
                    )
                  }
                  title="Remove finished history entries. Saved media files are kept."
                >
                  {clearingHistory ? (
                    <Loader2 className="spin" size={14} />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {clearingHistory ? "Clearing…" : "Clear history"}
                </button>
              </div>
            </div>
            <div className="history-table">
              <div className="table-labels">
                <span>FILE NAME</span>
                <span>STATUS / SIZE</span>
                <span>ACTIONS</span>
              </div>
              {shown.length ? (
                shown.map((job) => (
                  <div className="job-row" key={job.id}>
                    <div className="job-name">
                      <span
                        className={
                          "file-icon " +
                          (job.status === "completed" ? "done" : "")
                        }
                      >
                        <FileVideo size={20} />
                      </span>
                      <div>
                        <strong title={job.title}>{job.title}</strong>
                        <span>
                          {new Date(job.created * 1000).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}{" "}
                          ·{" "}
                          {job.filename?.split(".").pop()?.toUpperCase() ||
                            "Media download"}
                          {job.clip_start != null && job.clip_end != null && (
                            <>
                              {" "}
                              · Clip {timestamp(job.clip_start)}–
                              {timestamp(job.clip_end)}
                            </>
                          )}
                        </span>
                        {job.error && <p className="job-error">{job.error}</p>}
                        {["downloading", "processing", "queued"].includes(
                          job.status,
                        ) && (
                          <div
                            className="progress-track"
                            role="progressbar"
                            aria-label="Current stream download progress"
                            aria-valuenow={
                              job.total
                                ? Math.min(
                                    100,
                                    Math.round(
                                      (job.downloaded / job.total) * 100,
                                    ),
                                  )
                                : undefined
                            }
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className={
                                job.status === "processing" || !job.total
                                  ? "indeterminate"
                                  : ""
                              }
                              style={{
                                width: job.total
                                  ? `${Math.min(100, (job.downloaded / job.total) * 100)}%`
                                  : "35%",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="job-status">
                      <span className={"status " + job.status}>
                        {job.status === "completed" ? (
                          <Check size={12} />
                        ) : ["downloading", "processing"].includes(
                            job.status,
                          ) ? (
                          <Loader2 className="spin" size={12} />
                        ) : (
                          <Clock3 size={12} />
                        )}{" "}
                        {job.status === "processing"
                          ? "Merging / converting"
                          : job.status}
                      </span>
                      <small>
                        {job.status === "completed"
                          ? bytes(job.size)
                          : job.status === "downloading"
                            ? `${bytes(job.downloaded)}${job.total ? " / " + bytes(job.total) : ""}${job.speed ? " · " + bytes(job.speed) + "/s" : ""}${formatETA(job.eta) !== null ? " · " + formatETA(job.eta) + " left" : ""}`
                            : "—"}
                      </small>
                    </div>
                    <div className="job-actions">
                      {["queued", "downloading", "processing"].includes(
                        job.status,
                      ) ? (
                        <button
                          title="Cancel download"
                          aria-label="Cancel download"
                          onClick={() => void jobAction(job.id, "cancel")}
                        >
                          <X size={16} />
                        </button>
                      ) : ["failed", "cancelled"].includes(job.status) ? (
                        <button
                          title="Retry download"
                          aria-label="Retry download"
                          onClick={() => void jobAction(job.id, "retry")}
                        >
                          <RotateCcw size={16} />
                        </button>
                      ) : (
                        <a
                          title="Save another copy in browser"
                          aria-label="Save another copy in browser"
                          href={`/api/jobs/${job.id}/file`}
                        >
                          <ArrowDownToLine size={17} />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-history">
                  <span>
                    <History size={23} />
                  </span>
                  <div>
                    <strong>A fresh start for your collection</strong>
                    <p>
                      Your downloads will appear here. Let’s find something
                      worth keeping.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
          <footer>
            <span>
              <LockKeyhole size={12} /> Local by default. Private by nature.
            </span>
            <span>
              {active.length
                ? `${active.length} in queue`
                : `${completed.length} files saved`}
              <span className="footer-dot">·</span> Made for your Mac{" "}
              <Globe2 size={12} />
            </span>
          </footer>
        </main>
      </div>
      {(showSettings || showHelp) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowSettings(false);
            setShowHelp(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={showSettings ? "Settings" : "Getting started"}
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => {
                setShowSettings(false);
                setShowHelp(false);
              }}
            >
              <X size={20} />
            </button>
            {showSettings ? (
              <>
                <Settings2 className="modal-icon" size={25} />
                <h2>Make yourself at home.</h2>
                <p>
                  Downloads are saved automatically to this folder on the
                  machine running MediaGrab Studio.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const s = await api<{ folder: string }>(
                        "/settings",
                        "PUT",
                        { folder: draftFolder },
                      );
                      setFolder(s.folder);
                      setDraftFolder(s.folder);
                      setShowSettings(false);
                      setNotice("Download folder updated.");
                    } catch (e) {
                      setError((e as Error).message);
                      setShowSettings(false);
                    }
                  }}
                >
                  <label>
                    Download folder
                    <input
                      value={draftFolder}
                      onChange={(e) => setDraftFolder(e.target.value)}
                      placeholder="~/Downloads"
                      required
                    />
                  </label>
                  <p className="modal-hint">
                    Use a full path or ~/Downloads. Existing downloads stay in
                    their original folders.
                  </p>
                  <button className="primary">
                    Save settings <Check size={16} />
                  </button>
                </form>
              </>
            ) : (
              <>
                <CircleHelp className="modal-icon" size={25} />
                <h2>Your collection starts here.</h2>
                <ol>
                  <li>Paste a single YouTube video URL and click Analyze.</li>
                  <li>Choose video or audio, then your format and quality.</li>
                  <li>
                    Click Download. The file is saved to your selected folder
                    automatically.
                  </li>
                </ol>
                <p>
                  Best available selects the highest actual source quality.
                  Resolution choices are upper limits; the exact source list
                  shows available streams. MP4 compatibility depends on your
                  player; MKV preserves a wider range of codecs. WebM needs
                  compatible streams.
                </p>
                <p>
                  Converting to WAV or FLAC cannot restore lost quality. DRM,
                  private videos, sign-in requirements, region restrictions, and
                  platform blocks are not bypassed.
                </p>
                <p>
                  Only download content you own or have permission to download,
                  in accordance with platform rules.
                </p>
                <button className="primary" onClick={() => setShowHelp(false)}>
                  Got it <Check size={16} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
