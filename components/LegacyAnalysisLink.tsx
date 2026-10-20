const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * The forward on a moved address's stub (components/MovedPage.tsx), as a small classic script in the page itself: it runs
 * while the browser reads the HTML, before anything else loads, and costs the page no JavaScript bundle. Vercel answers
 * these addresses with a 308 first, so it only runs on a host that cannot redirect (the GitHub Pages build).
 *
 * It replaces the page, as a 308 would, so the stub stays out of the history: the base path and the query are kept, and
 * the visitor's hash too unless the target names its own (#downloads, a weather tab). `guides` maps an old
 * personalized-guide hash (guide-profile …) to the analysis that answers it, read on the server (lib/seo-routes); a guide
 * hash with no page of its own goes to the target without it. scripts/verify-seo.cjs reads the arguments back from the
 * script (`data-forward`) and checks them against lib/seo-routes.ts.
 */
export default function LegacyAnalysisLink({ to, guides }: { to: string; guides?: Record<string, string> }) {
  const args = [to, guides ?? null, BASE].map((value) => JSON.stringify(value).replace(/</g, '\\u003c')).join(',');
  const forward = `(function(to,guides,base){try{var l=window.location,h=l.hash,k=h.slice(1),`
    + `g=guides&&Object.prototype.hasOwnProperty.call(guides,k)?guides[k]:null,p=(g||to).split('#'),`
    + `f=p[1]?'#'+p[1]:guides&&h.indexOf('#guide-')===0?'':h;l.replace(base+p[0]+l.search+f)}catch(e){}})(${args})`;
  return <script data-forward="" dangerouslySetInnerHTML={{ __html: forward }} />;
}
