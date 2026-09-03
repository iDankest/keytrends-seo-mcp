export type Dimension =
  | 'DATE'
  | 'QUERY'
  | 'PAGE'
  | 'COUNTRY'
  | 'DEVICE'
  | 'SEARCH_APPEARANCE'
  | 'HOUR';

export type SearchType =
  | 'WEB'
  | 'IMAGE'
  | 'VIDEO'
  | 'NEWS'
  | 'DISCOVER'
  | 'GOOGLE_NEWS';

export type DataState =
  | 'DATA_STATE_UNSPECIFIED'
  | 'FINAL'
  | 'ALL'
  | 'HOURLY_ALL';

export type AggregationType =
  | 'AUTO'
  | 'BY_PROPERTY'
  | 'BY_PAGE'
  | 'BY_NEWS_SHOWCASE_PANEL';

export type FilterOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'INCLUDING_REGEX'
  | 'EXCLUDING_REGEX';

export interface ApiDimensionFilter {
  dimension: 'QUERY' | 'PAGE' | 'COUNTRY' | 'DEVICE' | 'SEARCH_APPEARANCE';
  operator: FilterOperator;
  expression: string;
}

export interface ApiDimensionFilterGroup {
  groupType: 'AND';
  filters: ApiDimensionFilter[];
}

export interface SearchAnalyticsQueryRequest {
  startDate: string;
  endDate: string;
  dimensions?: Dimension[];
  type?: SearchType;
  dataState?: DataState;
  aggregationType?: AggregationType;
  dimensionFilterGroups?: ApiDimensionFilterGroup[];
  rowLimit?: number;
  startRow?: number;
}

export interface ApiDataRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

export interface Metadata {
  firstIncompleteDate?: string;
  firstIncompleteHour?: string;
}

export interface SearchAnalyticsQueryResponse {
  rows?: ApiDataRow[];
  responseAggregationType?: string;
  metadata?: Metadata;
}

export type PermissionLevel =
  | 'SITE_PERMISSION_LEVEL_UNSPECIFIED'
  | 'SITE_OWNER'
  | 'SITE_FULL_USER'
  | 'SITE_RESTRICTED_USER'
  | 'SITE_UNVERIFIED_USER';

export interface WmxSite {
  siteUrl: string;
  permissionLevel: PermissionLevel;
}

export interface SitesListResponse {
  siteEntry?: WmxSite[];
}

export type SitemapType =
  | 'NOT_SITEMAP'
  | 'URL_LIST'
  | 'SITEMAP'
  | 'RSS_FEED'
  | 'ATOM_FEED'
  | 'PATTERN_SITEMAP'
  | 'OCEANFRONT';

export interface WmxSitemapContent {
  type?: string;
  submitted?: string | number;
  indexed?: string | number; // Deprecated in official GSC API discovery
}

export interface WmxSitemap {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: SitemapType;
  warnings?: string | number;
  errors?: string | number;
  contents?: WmxSitemapContent[];
}

export interface SitemapsListResponse {
  sitemap?: WmxSitemap[];
}

export type InspectionVerdict =
  | 'VERDICT_UNSPECIFIED'
  | 'PASS'
  | 'PARTIAL'
  | 'FAIL'
  | 'NEUTRAL';

export type RobotsTxtState =
  | 'ROBOTS_TXT_STATE_UNSPECIFIED'
  | 'ALLOWED'
  | 'DISALLOWED';

export type IndexingState =
  | 'INDEXING_STATE_UNSPECIFIED'
  | 'INDEXING_ALLOWED'
  | 'BLOCKED_BY_META_TAG'
  | 'BLOCKED_BY_HTTP_HEADER'
  | 'BLOCKED_BY_ROBOTS_TXT';

export type PageFetchState =
  | 'PAGE_FETCH_STATE_UNSPECIFIED'
  | 'SUCCESSFUL'
  | 'SOFT_404'
  | 'BLOCKED_ROBOTS_TXT'
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'SERVER_ERROR'
  | 'REDIRECT_ERROR'
  | 'ACCESS_FORBIDDEN'
  | 'BLOCKED_4XX'
  | 'INTERNAL_CRAWL_ERROR'
  | 'INVALID_URL';

export type CrawledAs =
  | 'CRAWLING_USER_AGENT_UNSPECIFIED'
  | 'DESKTOP'
  | 'MOBILE';

export interface IndexStatusResult {
  verdict?: InspectionVerdict;
  coverageState?: string;
  robotsTxtState?: RobotsTxtState;
  indexingState?: IndexingState;
  pageFetchState?: PageFetchState;
  lastCrawlTime?: string;
  googleCanonical?: string;
  userCanonical?: string;
  sitemap?: string[];
  referringUrls?: string[];
  crawledAs?: CrawledAs;
}

export interface UrlInspectionResult {
  inspectionResult?: {
    inspectionUrl?: string;
    indexStatusResult?: IndexStatusResult;
  };
}
