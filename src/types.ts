// ── Request types ──────────────────────────────────────────────────────────────

/**
 * Parameters for creating a screenshot.
 * Only `url` is required. All other fields are optional and passed through
 * to the API as-is, so new parameters introduced in future API versions
 * are automatically supported without a library update.
 */
export interface CreateParams {
  /** Page URL to capture. Required. */
  url: string;

  // ── Output & Format ──
  size?: 'screen' | 'page';
  format?: 'png' | 'jpeg' | 'webp';
  width?: number;
  height?: number;
  /** Capture full-page HTML source */
  html?: boolean;
  /** Render a PDF */
  pdf?: boolean;
  /** Record a video */
  video?: boolean;

  // ── Geolocation ──
  /** ISO 3166-1 alpha-2 country code, e.g. "us", "fr" */
  country?: string;
  language?: string;
  timezone?: string;
  geo_enable?: boolean;
  geo_latitude?: number;
  geo_longitude?: number;

  // ── Device ──
  screen_width?: number;
  screen_height?: number;
  device_name?: string;
  device_scale?: number;
  device_mobile?: boolean;
  device_touch?: boolean;
  device_landscape?: boolean;

  // ── Request ──
  header?: string;
  referer?: string;
  cookie?: string;
  post_data?: string;
  user_agent?: string;

  // ── Automation ──
  delay?: number;
  max_wait?: number;
  script?: string;
  script_inline?: string;
  steps?: Step[];
  tracker?: Tracker;
  trackers?: Tracker[];

  // ── Capture Controls ──
  shots?: number;
  shot_interval?: number;
  cache?: boolean;
  max_height?: number;
  target?: string;
  strict_ssl?: boolean;

  // ── Content Blocking ──
  hide_popups?: boolean;
  hide_ads?: boolean;

  // ── App ──
  dark?: boolean;
  tag?: string | string[];
  priority?: number;

  // ── PDF Options ──
  pdf_background?: boolean;
  pdf_one_page?: boolean;
  pdf_landscape?: boolean;
  pdf_format?: string;
  pdf_margin?: number;
  pdf_margin_top?: number;
  pdf_margin_bottom?: number;
  pdf_margin_left?: number;
  pdf_margin_right?: number;

  // ── Video Options ──
  video_format?: 'webm' | 'mp4';
  video_quality?: number;
  video_speed?: number;
  video_duration?: number;

  /** Pass-through for any future API parameters not yet typed here. */
  [key: string]: unknown;
}

export interface Step {
  command: string;
  selector?: string;
  value?: string;
  [key: string]: unknown;
}

export interface Tracker {
  id?: string;
  name?: string;
  value?: string;
  selector?: string;
  name_type?: string;
  value_type?: string;
  [key: string]: unknown;
}

// ── Screenshot response ────────────────────────────────────────────────────────

export interface Screenshot {
  id: number;
  status: 'processing' | 'finished' | 'error';
  url: string;
  final_url: string | null;
  error: string | null;
  cost: number;
  tag: string[];
  created_at: string;
  finished_at: string | null;
  country: string;
  region: string | null;
  language: string | null;
  timezone: string | null;
  size: string;
  shots: number;
  html: boolean;
  pdf: boolean;
  video: boolean;
  has_html: boolean;
  has_pdf: boolean;
  has_video: boolean;
  /** Any additional fields returned by the API */
  [key: string]: unknown;
}

// ── Thumbnail options ──────────────────────────────────────────────────────────

export interface ThumbnailParams {
  format?: 'png' | 'jpeg' | 'webp';
  width?: number;
  height?: number;
  /** Shot index (1-based) for multi-shot screenshots */
  shot?: number;
  [key: string]: unknown;
}

// ── List / search ──────────────────────────────────────────────────────────────

export interface ListParams {
  limit?: number;
  offset?: number;
  status?: string;
  country?: string;
  tag?: string;
  [key: string]: unknown;
}

export interface SearchParams {
  url: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export type DeleteData = 'image' | 'metadata' | 'url' | 'all';

// ── Batch ──────────────────────────────────────────────────────────────────────

export interface BatchCreateParams {
  /** ISO 3166-1 alpha-2 country code. Required. */
  country: string;
  size?: 'screen' | 'page';
  [key: string]: unknown;
}

export interface Batch {
  id: number;
  status: 'processing' | 'finished' | 'error';
  error?: string | null;
  started?: number | null;
  finished?: number | null;
  count?: number;
  processed?: number;
  failed?: number;
  zip_url?: string | null;
  [key: string]: unknown;
}


// ── Crawl ──────────────────────────────────────────────────────────────────────

export type Crawl = {
  id: number;
  status: string;
  domain: string;
  start_url: string;
  max_urls: number;
  total_discovered: number;
  processed: number;
  failed: number;
  error?: string;
  created_at?: string;
  started?: number;
  finished?: number;
  screenshots?: any[];
};

// ── Account ────────────────────────────────────────────────────────────────────

export interface Account {
  balance: number;
  [key: string]: unknown;
}

// ── Client options ─────────────────────────────────────────────────────────────

export interface ClientOptions {
  /** Your API key */
  apiKey: string;
  /** Override the API base URL (default: https://api.screenshotcenter.com/api/v1) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30_000) */
  timeout?: number;
}

export interface WaitOptions {
  /** How often to poll in ms (default: 2000) */
  interval?: number;
  /** Maximum total wait time in ms (default: 120_000) */
  timeout?: number;
}

// ── Internal API envelope ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}
