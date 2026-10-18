import QualifyingChecker from '@/components/tools/QualifyingChecker';
import { QualifyingRaceLinks } from '@/components/tools/QualifyingRaceLinks';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { STANDARDS } from '@/lib/tools/qualifying';

export const metadata = pageMetadata({
  title: 'Marathon Qualifying Times Checker: Boston, NYC, Chicago',
  description: 'Check a marathon time against Boston, NYC, Chicago, London, Berlin and Sydney standards for your age, with each window and every published Boston cut-off.',
  path: '/tools/qualifying',
});

export default function QualifyingPage() {
  return (
    <div className="tool-page">
      <ToolHeader slug="qualifying" />
      <QualifyingChecker />
      <nav className="qrace-more" aria-labelledby="qrace-index-title">
        <h2 id="qrace-index-title" className="tool-handoffs-label">Every standard by age group</h2>
        <QualifyingRaceLinks races={STANDARDS} />
      </nav>
      <ToolEnd path="/tools/qualifying" how="/methodology#tools-qualifying" />
    </div>
  );
}
