/**
 * Shared helpers for keeping ingestion queries current.
 *
 * Search queries used to hardcode a calendar year (e.g. "... campus 2025"),
 * which silently went stale and biased results toward the past. These helpers
 * compute the year at ingestion time so queries track the calendar automatically.
 * Call them INSIDE the run function (not at module load) so a long-running
 * server process never serves a stale year.
 */

export function currentYear(): number {
  return new Date().getFullYear();
}

/**
 * Recency hint spanning the current and previous year, e.g. "2026 OR 2025".
 * Appended to news/search queries so results stay current across the year
 * boundary without ever hardcoding a fixed year.
 */
export function yearHint(): string {
  const y = currentYear();
  return `${y} OR ${y - 1}`;
}
