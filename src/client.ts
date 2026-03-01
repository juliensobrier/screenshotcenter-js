import fs from 'fs';
import path from 'path';
import { ApiError, ScreenshotFailedError, TimeoutError } from './errors.js';
import type {
  Account,
  ApiResponse,
  Batch,
  BatchCreateParams,
  ClientOptions,
  CreateParams,
  DeleteData,
  ListParams,
  Screenshot,
  SearchParams,
  ThumbnailParams,
  WaitOptions,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.screenshotcenter.com/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      // Arrays are sent as repeated keys: tag=a&tag=b
      for (const item of v) q.append(k, String(item));
    } else if (typeof v === 'object') {
      q.set(k, JSON.stringify(v));
    } else {
      q.set(k, String(v));
    }
  }
  return q.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Client ─────────────────────────────────────────────────────────────────────

export class ScreenshotCenterClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  readonly screenshot: ScreenshotNamespace;
  readonly batch: BatchNamespace;
  readonly account: AccountNamespace;

  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new Error('apiKey is required');
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

    this.screenshot = new ScreenshotNamespace(this);
    this.batch = new BatchNamespace(this);
    this.account = new AccountNamespace(this);
  }

  // ── Internal request helpers (used by namespaces) ──────────────────────────

  async _get<T>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const allParams = { key: this.apiKey, ...params };
    const qs = buildQuery(allParams);
    const url = `${this.baseUrl}${endpoint}?${qs}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new ApiError(`Request timed out after ${this.timeout}ms`, 408);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    return this._parseResponse<T>(res);
  }

  async _getBuffer(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<Buffer> {
    const allParams = { key: this.apiKey, ...params };
    const qs = buildQuery(allParams);
    const url = `${this.baseUrl}${endpoint}?${qs}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new ApiError(`Request timed out after ${this.timeout}ms`, 408);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let body: any = {};
      try { body = await res.json(); } catch { /* ignore */ }
      throw new ApiError(
        body?.error ?? res.statusText,
        res.status,
        body?.code,
        body?.fields
      );
    }

    return Buffer.from(await res.arrayBuffer());
  }

  async _post<T>(
    endpoint: string,
    body: BodyInit,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const allParams = { key: this.apiKey, ...params };
    const qs = buildQuery(allParams);
    const url = `${this.baseUrl}${endpoint}?${qs}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', body, signal: controller.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new ApiError(`Request timed out after ${this.timeout}ms`, 408);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    return this._parseResponse<T>(res);
  }

  private async _parseResponse<T>(res: Response): Promise<T> {
    let body: any;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    if (!res.ok) {
      throw new ApiError(
        body?.error ?? body ?? res.statusText,
        res.status,
        body?.code,
        body?.fields
      );
    }

    // Unwrap the { success, data } envelope when present.
    if (body && typeof body === 'object' && 'success' in body) {
      const envelope = body as ApiResponse<T>;
      if (!envelope.success) {
        throw new ApiError(
          (body.error as string) ?? 'API request failed',
          res.status,
          body.code,
          body.fields
        );
      }
      return envelope.data as T;
    }

    return body as T;
  }

  // ── Polling helper ─────────────────────────────────────────────────────────

  /**
   * Poll until a screenshot reaches a terminal state (`finished` or `error`).
   * Resolves with the final screenshot object, or rejects with
   * `TimeoutError` / `ScreenshotFailedError`.
   *
   * @example
   * const result = await client.waitFor(screenshot.id, { timeout: 60_000 });
   * console.log(result.storage_url);
   */
  async waitFor(
    id: number | string,
    options: WaitOptions = {}
  ): Promise<Screenshot> {
    const interval = options.interval ?? DEFAULT_POLL_INTERVAL_MS;
    const timeout = options.timeout ?? DEFAULT_WAIT_TIMEOUT_MS;
    const deadline = Date.now() + timeout;

    while (true) {
      const s = await this.screenshot.info(id);

      if (s.status === 'finished') return s;

      if (s.status === 'error') {
        throw new ScreenshotFailedError(s.id, s.error ?? null);
      }

      // status === 'processing' — keep polling
      if (Date.now() + interval > deadline) {
        throw new TimeoutError(Number(id), timeout);
      }

      await sleep(interval);
    }
  }
}

// ── Screenshot namespace ───────────────────────────────────────────────────────

class ScreenshotNamespace {
  constructor(private readonly client: ScreenshotCenterClient) {}

  /**
   * Request a new screenshot.
   *
   * @example
   * const s = await client.screenshot.create({ url: 'https://example.com' });
   * console.log(s.id, s.status);
   */
  async create(params: CreateParams): Promise<Screenshot> {
    const { url, ...rest } = params;
    if (!url) throw new Error('"url" is required');
    return this.client._get<Screenshot>('/screenshot/create', { url, ...rest });
  }

  /**
   * Get screenshot status and details by ID.
   *
   * @example
   * const s = await client.screenshot.info(12345);
   */
  async info(id: number | string): Promise<Screenshot> {
    return this.client._get<Screenshot>('/screenshot/info', { id });
  }

  /**
   * List recent screenshots.
   *
   * @example
   * const screenshots = await client.screenshot.list({ limit: 10 });
   */
  async list(params: ListParams = {}): Promise<Screenshot[]> {
    return this.client._get<Screenshot[]>('/screenshot/list', params);
  }

  /**
   * Search screenshots by URL pattern.
   *
   * @example
   * const screenshots = await client.screenshot.search({ url: 'example.com' });
   */
  async search(params: SearchParams): Promise<Screenshot[]> {
    if (!params.url) throw new Error('"url" is required');
    return this.client._get<Screenshot[]>('/screenshot/search', params);
  }

  /**
   * Fetch the screenshot image as a Buffer.
   *
   * @example
   * const buf = await client.screenshot.thumbnail(12345);
   * fs.writeFileSync('shot.png', buf);
   */
  async thumbnail(
    id: number | string,
    params: ThumbnailParams = {}
  ): Promise<Buffer> {
    return this.client._getBuffer('/screenshot/thumbnail', { id, ...params });
  }

  /**
   * Fetch the rendered HTML source as a string.
   */
  async html(id: number | string): Promise<string> {
    const buf = await this.client._getBuffer('/screenshot/html', { id });
    return buf.toString('utf-8');
  }

  /**
   * Fetch the rendered PDF as a Buffer.
   */
  async pdf(id: number | string): Promise<Buffer> {
    return this.client._getBuffer('/screenshot/pdf', { id });
  }

  /**
   * Fetch the recorded video as a Buffer.
   */
  async video(id: number | string): Promise<Buffer> {
    return this.client._getBuffer('/screenshot/video', { id });
  }

  /**
   * Delete screenshot data.
   *
   * @param data  What to delete: `"image"`, `"metadata"`, `"url"`, or `"all"`.
   */
  async delete(
    id: number | string,
    data: DeleteData = 'all'
  ): Promise<void> {
    await this.client._get('/screenshot/delete', { id, data });
  }

  // ── File-save helpers ────────────────────────────────────────────────────

  /**
   * Download a screenshot thumbnail and save it to `filePath`.
   *
   * @example
   * await client.screenshot.saveImage(12345, './shots/homepage.png');
   * await client.screenshot.saveImage(12345, './shots/shot2.png', { shot: 2 });
   */
  async saveImage(
    id: number | string,
    filePath: string,
    params: ThumbnailParams = {}
  ): Promise<void> {
    const buf = await this.thumbnail(id, params);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buf);
  }

  /**
   * Download the rendered PDF and save it to `filePath`.
   *
   * @example
   * await client.screenshot.savePDF(12345, './pdfs/page.pdf');
   */
  async savePDF(id: number | string, filePath: string): Promise<void> {
    const buf = await this.pdf(id);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buf);
  }

  /**
   * Download the rendered HTML and save it to `filePath`.
   *
   * @example
   * await client.screenshot.saveHTML(12345, './html/page.html');
   */
  async saveHTML(id: number | string, filePath: string): Promise<void> {
    const content = await this.html(id);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Download the recorded video and save it to `filePath`.
   *
   * @example
   * await client.screenshot.saveVideo(12345, './videos/recording.webm');
   */
  async saveVideo(id: number | string, filePath: string): Promise<void> {
    const buf = await this.video(id);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buf);
  }

  /**
   * Save all available outputs (image, HTML, PDF, video) for a screenshot.
   * Files that were not captured are silently skipped.
   *
   * @example
   * await client.screenshot.saveAll(12345, './output/');
   * // Produces: output/12345.png, output/12345.html, output/12345.pdf, output/12345.webm
   */
  async saveAll(
    id: number | string,
    directory: string,
    options: { basename?: string } = {}
  ): Promise<{ image?: string; html?: string; pdf?: string; video?: string }> {
    const s = await this.info(id);
    const base = options.basename ?? String(id);
    const saved: { image?: string; html?: string; pdf?: string; video?: string } = {};

    await fs.promises.mkdir(directory, { recursive: true });

    // Image (always available for finished screenshots)
    if (s.status === 'finished') {
      const imgPath = path.join(directory, `${base}.png`);
      await this.saveImage(id, imgPath);
      saved.image = imgPath;
    }

    if (s.has_html) {
      const htmlPath = path.join(directory, `${base}.html`);
      await this.saveHTML(id, htmlPath);
      saved.html = htmlPath;
    }

    if (s.has_pdf) {
      const pdfPath = path.join(directory, `${base}.pdf`);
      await this.savePDF(id, pdfPath);
      saved.pdf = pdfPath;
    }

    if (s.has_video) {
      const ext = String(s.video_format ?? 'webm');
      const videoPath = path.join(directory, `${base}.${ext}`);
      await this.saveVideo(id, videoPath);
      saved.video = videoPath;
    }

    return saved;
  }
}

// ── Batch namespace ────────────────────────────────────────────────────────────

class BatchNamespace {
  constructor(private readonly client: ScreenshotCenterClient) {}

  /**
   * Submit a batch job from a newline-separated list of URLs.
   *
   * `urls` can be a plain string (one URL per line), a string array, or a
   * Buffer containing the file contents.
   *
   * @example
   * const batch = await client.batch.create(
   *   ['https://example.com', 'https://news.ycombinator.com'],
   *   { country: 'us' }
   * );
   */
  async create(
    urls: string | string[] | Buffer,
    params: BatchCreateParams
  ): Promise<Batch> {
    if (!params.country) throw new Error('"country" is required');

    let fileContent: Buffer;
    if (Buffer.isBuffer(urls)) {
      fileContent = urls;
    } else if (Array.isArray(urls)) {
      fileContent = Buffer.from(urls.join('\n'), 'utf-8');
    } else {
      fileContent = Buffer.from(urls, 'utf-8');
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(fileContent)], { type: 'text/plain' }),
      'urls.txt'
    );
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        form.append(k, String(v));
      }
    }

    return this.client._post<Batch>('/batch/create', form);
  }

  /**
   * Get batch status and progress.
   */
  async info(id: number | string): Promise<Batch> {
    return this.client._get<Batch>('/batch/info', { id });
  }

  /**
   * List recent batches.
   */
  async list(params: { limit?: number; offset?: number } = {}): Promise<Batch[]> {
    return this.client._get<Batch[]>('/batch/list', params);
  }

  /**
   * Cancel a running batch.
   */
  async cancel(id: number | string): Promise<void> {
    await this.client._post('/batch/cancel', JSON.stringify({ id }), {});
  }

  /**
   * Download the batch results ZIP as a Buffer.
   *
   * @example
   * const zip = await client.batch.download(batchId);
   * fs.writeFileSync('results.zip', zip);
   */
  async download(id: number | string): Promise<Buffer> {
    return this.client._getBuffer('/batch/download', { id });
  }

  /**
   * Download the batch results ZIP and save it to `filePath`.
   *
   * @example
   * await client.batch.saveZip(batchId, './output/results.zip');
   */
  async saveZip(id: number | string, filePath: string): Promise<void> {
    const buf = await this.download(id);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buf);
  }

  /**
   * Poll until a batch reaches a terminal state.
   *
   * @example
   * const result = await client.batch.waitFor(batch.id);
   * console.log(`Processed ${result.processed}/${result.count}`);
   */
  async waitFor(
    id: number | string,
    options: WaitOptions = {}
  ): Promise<Batch> {
    const interval = options.interval ?? DEFAULT_POLL_INTERVAL_MS;
    const timeout = options.timeout ?? DEFAULT_WAIT_TIMEOUT_MS;
    const deadline = Date.now() + timeout;

    while (true) {
      const b = await this.info(id);
      if (b.status === 'finished' || b.status === 'error') return b;
      if (Date.now() + interval > deadline) {
        throw new TimeoutError(Number(id), timeout);
      }
      await sleep(interval);
    }
  }
}

// ── Account namespace ──────────────────────────────────────────────────────────

class AccountNamespace {
  constructor(private readonly client: ScreenshotCenterClient) {}

  /**
   * Get account info including current credit balance.
   *
   * @example
   * const { balance } = await client.account.info();
   * console.log(`Credits remaining: ${balance}`);
   */
  async info(): Promise<Account> {
    return this.client._get<Account>('/account/info');
  }
}
