/** A content page registered for the sitemap by the module that owns it. */
export type ExtraPage = {
  path: string;
  /** YYYY-MM-DD, or a function returning one at build time (e.g. a data as_of date). Leave it out when unknown. */
  lastmod?: string | (() => string | undefined);
};
