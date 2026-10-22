import { Scissors } from "lucide-react";
import { parseTimestamp, timestamp } from "./time";

type Props = {
  duration: number;
  enabled: boolean;
  start: string;
  end: string;
  onEnabled: (v: boolean) => void;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
};
export function ClipSelector({
  duration,
  enabled,
  start,
  end,
  onEnabled,
  onStart,
  onEnd,
}: Props) {
  const total = Math.floor(duration);
  const available = Number.isFinite(total) && total > 0;
  const from = parseTimestamp(start),
    to = parseTimestamp(end);
  const valid = from !== null && to !== null && from < to && to <= total;
  return (
    <section className="clip-selector" aria-label="Select a clip">
      <label className="clip-toggle">
        <span>
          <Scissors size={16} /> Download a clip
        </span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!available}
          onChange={(e) => onEnabled(e.target.checked)}
        />
      </label>
      {!available ? (
        <p>Clip selection requires a known video duration.</p>
      ) : enabled ? (
        <>
          <p>
            Drag the handles or enter exact times (hh:mm:ss). Works for video
            and audio.
          </p>
          <div className="clip-timeline">
            <div
              className="clip-selection"
              style={{
                left: `${valid ? (from / total) * 100 : 0}%`,
                width: `${valid ? ((to - from) / total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="clip-sliders">
            <label>
              Start handle
              <input
                aria-label="Clip start handle"
                type="range"
                min={0}
                max={Math.max(0, total - 1)}
                step={1}
                value={from ?? 0}
                onChange={(e) =>
                  onStart(
                    timestamp(
                      Math.min(Number(e.target.value), (to ?? total) - 1),
                    ),
                  )
                }
              />
            </label>
            <label>
              End handle
              <input
                aria-label="Clip end handle"
                type="range"
                min={1}
                max={total}
                step={1}
                value={to ?? total}
                onChange={(e) =>
                  onEnd(
                    timestamp(
                      Math.max(Number(e.target.value), (from ?? 0) + 1),
                    ),
                  )
                }
              />
            </label>
          </div>
          <div className="clip-time-fields">
            <label>
              Start time
              <input
                aria-label="Clip start time"
                value={start}
                onChange={(e) => onStart(e.target.value)}
                spellCheck={false}
                placeholder="0:00"
              />
            </label>
            <label>
              End time
              <input
                aria-label="Clip end time"
                value={end}
                onChange={(e) => onEnd(e.target.value)}
                spellCheck={false}
                placeholder={timestamp(total)}
              />
            </label>
          </div>
          {valid ? (
            <div className="clip-summary">
              <span>
                {timestamp(from)} → {timestamp(to)}
              </span>
              <strong>{timestamp(to - from)} selected</strong>
            </div>
          ) : (
            <p className="clip-error" role="alert">
              Enter valid times: start must be before end, within{" "}
              {timestamp(total)}.
            </p>
          )}
          <p className="clip-caveat">
            Fast cut preserves source quality. Video cuts may align to nearby
            keyframes. We request only this section; the source may require
            extra data. Time and size estimates may be unavailable.
          </p>
        </>
      ) : (
        <p>Keep the full video, or select just the part you want.</p>
      )}
    </section>
  );
}
