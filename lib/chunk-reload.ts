// A page whose JavaScript file failed to load (a tab left open across a deploy, a dropped connection) reloads itself
// once. This tab's sessionStorage keeps only the time of that reload, so a file that keeps failing cannot loop the page;
// where storage is unavailable the page does not reload by itself and the visitor gets the reload button instead.
const RELOAD_KEY = 'pace-notes-chunk-reload';
// When a script named in the page itself fails, webpack reports it only after waiting two minutes, so the next failure
// comes two minutes after the reload: a shorter window would reload such a page every two minutes.
const RELOAD_AFTER_MS = 5 * 60_000;
const CHUNK_FAILURE = /Loading (CSS )?chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** Reload the page if the error is a failed chunk load and this tab has not reloaded for one in the last five minutes. */
export function reloadAfterChunkError(error: Error): boolean {
  if (error?.name !== 'ChunkLoadError' && !CHUNK_FAILURE.test(String(error?.message))) return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY));
    if (last && Date.now() - last < RELOAD_AFTER_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
