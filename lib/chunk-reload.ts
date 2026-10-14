// A page whose JavaScript file failed to load (a tab left open across a deploy, a dropped connection) reloads itself
// once. This tab's sessionStorage keeps only the time of that reload, so a file that keeps failing cannot loop the page;
// where storage is unavailable the page does not reload by itself and the visitor gets the reload button instead.
const RELOAD_KEY = 'pace-notes-chunk-reload';
// A file the page's HTML names that fails a second time, after the reload, reaches the error page only after webpack's
// two-minute chunk timeout, so a shorter window would reload such a page every two minutes.
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

// For the root layout's <head>, with the same once-per-five-minutes reload. Webpack does not notice when a script the
// page's HTML names fails (it waits out its two-minute timeout), and when that script is React or webpack itself no
// error page ever shows, so this listens for those failures as they happen. Only the HTML's own scripts and stylesheets
// count: webpack marks the scripts it adds (data-webpack) and reports their failures itself, and everything the HTML
// names has loaded or failed by the window's load event. It goes in as an async module script, which runs as soon as it
// is parsed: a plain inline script there would wait for the stylesheets above it, and Chromium then holds back the
// page's scripts as well (measured). Old-style JavaScript, because Next.js does not compile it.
export const RELOAD_ON_FAILED_FILE = `(function () {
  function failed(event) {
    var el = event.target;
    var url = !el ? '' : el.tagName === 'SCRIPT' && !el.hasAttribute('data-webpack') ? el.src : el.tagName === 'LINK' && el.rel === 'stylesheet' ? el.href : '';
    if (!url || url.indexOf('/_next/static/') < 0) return;
    try {
      var last = Number(sessionStorage.getItem('${RELOAD_KEY}'));
      if (last && Date.now() - last < ${RELOAD_AFTER_MS}) return;
      sessionStorage.setItem('${RELOAD_KEY}', String(Date.now()));
    } catch (e) {
      return;
    }
    removeEventListener('error', failed, true);
    location.reload();
  }
  addEventListener('error', failed, true);
  addEventListener('load', function () { removeEventListener('error', failed, true); });
})();`;
