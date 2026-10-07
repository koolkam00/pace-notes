/** Simple line icons for the runner tools (decorative). */
const PATHS: Record<string, JSX.Element> = {
  'pace-calculator': <><circle cx="24" cy="27" r="15" /><path d="M24 27l7-7M20 7h8M24 7v5M36 14l3-3" /></>,
  predictor: <><path d="M6 38l10-12 8 6 9-14 9 6" /><path d="M33 18l9 6M6 42h36" /><circle cx="42" cy="24" r="2.5" /></>,
  'pace-band': <><rect x="12" y="5" width="24" height="38" rx="6" /><path d="M17 13h14M17 19h14M17 25h14M17 31h14M17 37h9" /></>,
  'course-chooser': <><path d="M8 36c6-14 12 4 18-10s10-12 14-18" /><circle cx="8" cy="36" r="3" /><path d="M40 8l-1 6 6-1-5-5z" /><path d="M6 44h36" /></>,
  'weather-match': <><path d="M22 30V9a4 4 0 0 1 8 0v21a8 8 0 1 1-8 0z" /><path d="M26 18v14M38 12h6M38 20h4M38 28h6" /></>,
  projector: <><circle cx="24" cy="24" r="17" /><path d="M24 24l10-6M24 7v4M24 37v4M7 24h4M37 24h4" /><circle cx="24" cy="24" r="2.5" /></>,
  'split-check': <><path d="M8 40V10M8 40h34" /><path d="M13 33h4v7h-4zM21 29h4v11h-4zM29 25h4v15h-4zM37 15h4v25h-4z" /></>,
  qualifying: <><path d="M14 6h20v8a10 10 0 0 1-20 0z" /><path d="M14 9H8a6 6 0 0 0 6 7M34 9h6a6 6 0 0 1-6 7M24 24v8M16 42h16l-2-10H18z" /></>,
};

export default function ToolIcon({ slug, className }: { slug: string; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[slug] ?? <circle cx="24" cy="24" r="16" />}
    </svg>
  );
}
