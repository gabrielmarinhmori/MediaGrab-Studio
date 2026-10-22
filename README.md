# MediaGrab Studio

A private, local YouTube video and audio downloader for your Mac. React + TypeScript, Tailwind CSS, FastAPI, yt-dlp, and FFmpeg. No account, subscription, paid API, cloud hosting, or public deployment.

## Start here — Mac installation

Works on Apple Silicon and Intel Macs with a current supported macOS version, Python 3.10+, Node.js 22.12+ (or 20.19+), and FFmpeg. An internet connection is needed for initial setup and YouTube downloads. Allow enough free space for both the source streams and the final file; 4K/8K files can be large.

1. Download this project and unzip it. Keep the **entire folder** together, for example in `Documents/MediaGrab-Studio`. Do not run it inside the ZIP preview.
2. If you do not already have **Homebrew**, install the free package manager by following the instructions at **https://brew.sh**. Homebrew may ask you to install Apple's Command Line Tools and enter your Mac password in Terminal. Follow its final “Next steps” instructions. This is a one-time prerequisite; MediaGrab Studio never asks for your password in its web interface.
3. Double-click **`setup.command`**. It checks your tools, installs missing Python, Node.js, and FFmpeg through Homebrew, creates a private Python environment, installs dependencies, and builds the interface. Wait for **“Setup complete.”** The first run can take several minutes.
4. Double-click **`start.command`**. Your browser opens automatically when the local server is ready.
5. When finished, double-click **`stop.command`**. Closing a browser tab or Terminal window does **not** stop the background service.

After initial setup, you only need **start.command** and **stop.command**. Keep the project folder in place; if you move it, rerun setup.command to refresh the Python environment.

If macOS asks whether to open an unsigned `.command` file, use Finder's **Control-click → Open** and the normal macOS approval prompt for a project you trust. Do not disable system security. If downloaded scripts lack executable permission, open Terminal, type `cd `, drag the extracted project folder into Terminal, press Return, then run:

```bash
chmod +x setup.command start.command stop.command
./setup.command
./start.command
```

## Download your media

1. Paste an HTTPS YouTube video URL (`youtube.com/watch`, `youtu.be`, Shorts, or completed live video).
2. Click **Analyze**. The app retrieves the title, thumbnail, duration, and actual unprotected formats.
3. Choose **Video** or **Audio only**, then a quality and format.
4. Click **Download video** or **Download audio**. The file is saved **automatically to your Mac's Downloads folder**. No browser save dialog is needed.
5. Watch progress in **Recent downloads**. Cancel active or queued jobs, retry failed/cancelled jobs, and see persistent **Download history**. The history's download icon saves an additional copy through your browser.

Open **Settings** to choose another folder, for example `~/Downloads`, `/Users/yourname/Movies`, or `/Volumes/My Drive/Media`. Your Mac may ask Terminal for permission to access Downloads or an external drive. Existing files stay in the folder originally selected for their download. File access is limited to completed files recorded by this app; there is no arbitrary file browser.

### Video quality and compatibility

- **Best available** selects yt-dlp's best actual source video plus best audio; it does not upscale or invent quality. Sources up to 8K are supported when available.
- 8K/4K/1440p/1080p/720p/480p/360p choices are **upper limits**. If that exact resolution is absent, the highest available stream below the limit is used. The **Specific source** menu shows actual formats, frame rates, codecs, and sizes when supplied by YouTube. A selected source overrides the resolution selector.
- **MKV** is the default because it preserves a wide range of original codecs. **MP4** remuxes without deliberately re-encoding; modern AV1/VP9/Opus sources may not play in every version of QuickTime. Use a compatible player such as the free VLC player, or choose an available H.264 source when appropriate. MP4 does not mean H.264 or guaranteed QuickTime compatibility.
- **WebM** uses compatible WebM sources only. If no compatible stream exists, the job reports an error instead of silently converting it.
- Separate audio and video streams are merged by FFmpeg. Resolution and frame rate are preserved. If a container cannot represent a selected codec, choose MKV or another actual source.
- Formats and size estimates come from the source. Missing sizes are shown as `—`; the app does not fabricate estimates. Download byte counts, speed, and ETA describe the **current source stream** and can restart when the next stream begins. Merging/conversion shows an indeterminate processing indicator because FFmpeg does not provide a reliable overall percentage here.

### Audio formats

| Output | Behavior |
| --- | --- |
| Best original audio | Downloads the best audio-only source in its native container, without conversion. |
| MP3 | Encodes from the best source; 128, 192, 256, or 320 kbps. |
| M4A | Keeps compatible AAC audio where possible, otherwise encodes AAC. |
| WAV | Decodes source audio to uncompressed PCM. Files can be very large. |
| FLAC | Stores decoded source audio losslessly. |
| Opus | Keeps compatible Opus audio where possible, otherwise encodes Opus; up to 256 kbps for reliable mono/stereo support. |

**Converting compressed audio to WAV or FLAC does not restore lost detail.** A 320 kbps MP3 cannot improve an inferior source. Compatible existing M4A/Opus streams may be copied without re-encoding; the bitrate selector is an encoding target when conversion is necessary, not a claim about original source quality.

## Reliability, privacy, and restrictions

- The production server binds exclusively to **127.0.0.1**, port **8765**. It serves both the compiled frontend and API. No public tunnel or hosting is configured.
- Host and browser-origin checks reject external websites. There is no permissive CORS configuration. Downloads use Python APIs and argument lists, never user-supplied shell commands. URL validation accepts single YouTube videos only.
- yt-dlp contacts YouTube and its media servers directly from your machine; thumbnail images are loaded from YouTube. The app sends no analytics and has no third-party account service. npm/PyPI/Homebrew are contacted during installation.
- There is no cookie import, credential injection, DRM decryption, proxy rotation, or authentication/access-control bypass. Private videos, sign-in requirements, DRM, unavailable content, region blocks, bot checks, or platform restrictions can prevent extraction. The app reports errors rather than bypassing them.
- Only download content you own or have permission to download, in accordance with copyright law and applicable platform rules. Technical availability is not permission.
- One job processes at a time, with up to ten active/queued jobs, to avoid overloading your Mac. Cancel kills the isolated worker process group, including its FFmpeg child processes. Failed/cancelled jobs clean their temporary files. A retry starts a fresh job.
- History and settings live at `~/Library/Application Support/MediaGrab Studio/state.json`; temporary streams live in its `temp` subfolder. Completed files use descriptive titles, video IDs, and a unique suffix. They are not removed automatically.
- Graceful shutdown stops workers. If the app is interrupted, unfinished jobs are marked failed on the next start and leftover temporary directories are cleaned. Retry these jobs from history. The app does not claim to resume interrupted stream bytes.
- This is a single-user local app. Anyone already able to run programs under your Mac account can also access its local service and files. Do not run the server with public bind addresses or as an administrator.

## Troubleshooting

**Homebrew not found:** Finish the installation and “Next steps” at https://brew.sh. Setup checks `/opt/homebrew/bin` (Apple Silicon) and `/usr/local/bin` (Intel).

**Missing FFmpeg, Python, Node.js, or dependencies:** Stop the app and rerun setup.command. The script checks versions and explains failures. It never installs Python packages into your system Python.

**YouTube changed, or extraction fails:** Stop the app, open Terminal in the project folder, and run:

```bash
.venv/bin/python -m pip install --upgrade 'yt-dlp[default]'
```

Then double-click start.command. A recent yt-dlp release, its bundled EJS helper, and Node.js are used for supported standard extraction. Updating does not bypass platform restrictions. Do not share or paste authentication cookies into the app.

**“Sign in”, “not available”, or bot/access errors:** Try content you are authorized to download that is available without authentication. The app cannot guarantee access to every YouTube video or network. It will not work around access controls.

**Server does not start / port already in use:** Run stop.command and try start.command again. Check `.runtime/server.log` inside the project folder. If another application uses port 8765, close that application; the launcher will not kill unrelated processes. Startup is idempotent and does not create duplicate servers.

**Folder not writable / disk full:** Choose a writable folder in Settings, grant the appropriate normal macOS file permission when prompted, and ensure enough storage for temporary streams plus the final file. Retry after resolving the issue.

**History file download returns “moved or deleted”:** Open your chosen folder in Finder. The app does not search unrelated folders or follow file symlinks.

**Remove the application:** Run stop.command, delete the project folder and `~/Library/Application Support/MediaGrab Studio`. Your completed downloads remain in their selected folders.

## Development and testing

Use the existing checkout; a separate Git worktree is unnecessary. The normal production launch uses the built frontend and needs only the Python service. For hot reload, use two terminals from the project folder:

```bash
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
```

```bash
npm run dev --prefix frontend
```

The frontend dev server binds to localhost and proxies `/api` to the local backend. Production startup uses `scripts/server.py` rather than a public server.

```bash
.venv/bin/python -m pytest -q
npm run build --prefix frontend
```

Browser tests (start the built local app first):

```bash
cd frontend
npx playwright install chromium
npx playwright test
```

On Linux with an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` instead of downloading a browser. Set `MEDIAGRAB_NO_BROWSER=1` to prevent launcher browser opening, and `MEDIAGRAB_DATA_DIR=/absolute/path` for isolated development data.

### Validation in the development workspace

- Production TypeScript/Vite build passes.
- 39 Python tests pass: URL safety, origin/host checks, API validation, queue/retry/cancellation, settings, file-serving restrictions, real HTTP downloads through yt-dlp, MKV/MP4/WebM output, all six audio choices, separate DASH audio/video merging, codec/frame-rate preservation, persistence, and cleanup. Media integration tests generate original synthetic audio/video with FFmpeg and serve it on loopback; they do not download third-party content.
- Three Chromium browser tests pass: actual invalid-URL handling, source/audio control behavior and request construction with an explicitly mocked analysis response, and responsive mobile/settings behavior.
- Launcher start/repeated-start/stop/restart passes on Linux; shell syntax checks pass. **macOS Finder launch, Homebrew installation, and automatic browser opening require verification on an actual Mac.**
- **Live YouTube extraction could not be verified here:** the development workspace proxy returns HTTP 403 for YouTube. The app does not contain a fake success path; real extraction uses yt-dlp and reports the error. Live extraction/download needs verification on your Mac with your authorized content and network.

The source is provided under the MIT license. External tools retain their respective licenses.
