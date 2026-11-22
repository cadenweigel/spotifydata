/** Format a millisecond duration for display. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";

  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "<1m";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 100) {
    return `${hours.toLocaleString()}h`;
  }

  if (hours < 1) {
    return `${minutes}m`;
  }

  return minutes === 0 ? `${hours}h 0m` : `${hours}h ${minutes}m`;
}

/** Locale-formatted integer. */
export function formatInt(n: number): string {
  return n.toLocaleString();
}

/** Format a 0–1 ratio as a percentage with one decimal place. */
export function formatPercent(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Local date in the user's locale, no time. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/** Local date and time in the user's locale. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
