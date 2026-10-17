/** Keep exact download provenance in URLs; describe data plainly in the interface. */
export const sourceReleaseTag = (exportId: string) => exportId.replace(/^private-(\d{8}-\d{4})$/, 'private-export-$1');
export const sourceReleaseHref = (exportId: string) => 'https://github.com/koolkam00/pace-notes/releases/tag/' + encodeURIComponent(sourceReleaseTag(exportId));
export const sourceLabel = (_asOf: string, _exportId: string) => 'Marathon results, weather and course data';
