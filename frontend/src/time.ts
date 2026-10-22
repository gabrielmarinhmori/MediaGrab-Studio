/** Human-readable durations and precise, editable media timestamps. */
export function formatETA(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const total = Math.ceil(value);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;
}
export function timestamp(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
export function parseTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?::\d{1,2}){0,2}$/.test(trimmed)) return null;
  const parts = trimmed.split(":").map(Number);
  if (
    (parts.length > 1 && parts[parts.length - 1] >= 60) ||
    (parts.length === 3 && parts[1] >= 60)
  )
    return null;
  const result = parts.reduce((total, part) => total * 60 + part, 0);
  return Number.isSafeInteger(result) ? result : null;
}
