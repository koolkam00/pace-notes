import QualifyingChecker from '@/components/tools/QualifyingChecker';
import { QualifyingRaceLinks } from '@/components/tools/QualifyingRaceLinks';
import { ToolHeader, ToolNext } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { STANDARDS } from '@/lib/tools/qualifying';
import './qualifying.css';

export const metadata = pageMetadata({
  title: 'Marathon Qualifying Times Checker: Boston, NYC, Chicago',
  description: 'Check a marathon time against Boston, NYC, Chicago, London, Berlin and Sydney standards for your age, with each window and every published Boston cut-off.',
  path: '/tools/qualifying',
});

export default function QualifyingPage() {
  return (
    <div className="container tool-page">
      <ToolHeader slug="qualifying">
        <nav className="qrace-index" aria-labelledby="qrace-index-title">
          <p id="qrace-index-title">Every standard by age group, race by race</p>
          <QualifyingRaceLinks races={STANDARDS} compact />
        </nav>
      </ToolHeader>
      <QualifyingChecker />
      <ToolNext current="qualifying" />
    </div>
  );
}
