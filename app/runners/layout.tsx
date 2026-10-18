import type { ReactNode } from 'react';
import '@/app/styles/pages/report.css';
import '@/app/styles/pages/runners.css';

// The race report opens inside the runner view, so its styles come with the page (not its JavaScript, which loads on
// request). Kept in a layout so scripts/verify-runner-search.cjs can still load the page module.
export default function RunnersLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
