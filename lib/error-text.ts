/**
 * The words a failed data load shows: the loader's own message (lib/*: "The comparison could not load. Check your
 * connection and try again.", "The runner data could not be verified. …"), or the caller's fallback when the error is the
 * browser's own (a TypeError such as "Failed to fetch", a SyntaxError from a cut-off file, a DOMException) or has no
 * words (design review D8, November 11, 2026: "Failed to fetch" reached the page).
 */
export function loadErrorText(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || error instanceof TypeError || error instanceof SyntaxError ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException)) return fallback;
  return error.message.trim() || fallback;
}
