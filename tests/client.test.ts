import { jest, describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ScreenshotCenterClient } from '../src/client.js';
import { ApiError, ScreenshotFailedError, TimeoutError } from '../src/errors.js';
import type { Screenshot, Batch } from '../src/types.js';

// ── Fetch mock ─────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function mockJson(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => data,
    arrayBuffer: async () => Buffer.from(JSON.stringify(data)).buffer,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function mockBinary(buf: Buffer, status = 200): Response {
  // buf.buffer is the underlying pooled ArrayBuffer which may be larger than buf.
  // Slice to the exact bytes so Buffer.from(arrayBuffer) reproduces the original data.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'image/png' },
    json: async () => { throw new Error('not json'); },
    arrayBuffer: async () => ab,
    text: async () => buf.toString(),
  } as unknown as Response;
}

function envelope<T>(data: T) {
  return { success: true, data };
}

const FIXTURE_SCREENSHOT: Screenshot = {
  id: 1001,
  status: 'finished',
  url: 'https://example.com',
  final_url: 'https://example.com/',
  error: null,
  cost: 1,
  tag: [],
  created_at: '2026-01-01T00:00:00.000Z',
  finished_at: '2026-01-01T00:00:05.000Z',
  country: 'us',
  region: null,
  language: 'en-US',
  timezone: 'America/New_York',
  size: 'screen',
  shots: 1,
  html: false,
  pdf: false,
  video: false,
  has_html: false,
  has_pdf: false,
  has_video: false,
};

const FIXTURE_BATCH: Batch = {
  id: 2001,
  status: 'finished',
  count: 3,
  processed: 3,
  failed: 0,
  zip_url: 'https://api.screenshotcenter.com/api/v1/batch/download?id=2001',
};

// ── Setup ──────────────────────────────────────────────────────────────────────

let client: ScreenshotCenterClient;

beforeEach(() => {
  mockFetch.mockReset();
  client = new ScreenshotCenterClient({ apiKey: 'test-key' });
});

// ── Constructor ────────────────────────────────────────────────────────────────

describe('ScreenshotCenterClient constructor', () => {
  it('throws when apiKey is missing', () => {
    expect(() => new ScreenshotCenterClient({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('uses default base URL', () => {
    expect((client as any).baseUrl).toBe('https://api.screenshotcenter.com/api/v1');
  });

  it('accepts a custom base URL and strips trailing slash', () => {
    const c = new ScreenshotCenterClient({
      apiKey: 'k',
      baseUrl: 'https://custom.example.com/api/v1/',
    });
    expect((c as any).baseUrl).toBe('https://custom.example.com/api/v1');
  });

  it('exposes screenshot, batch, and account namespaces', () => {
    expect(client.screenshot).toBeDefined();
    expect(client.batch).toBeDefined();
    expect(client.account).toBeDefined();
  });
});

// ── screenshot.create ──────────────────────────────────────────────────────────

describe('screenshot.create', () => {
  it('sends the URL and API key as query params', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_SCREENSHOT)));
    await client.screenshot.create({ url: 'https://example.com' });

    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get('url')).toBe('https://example.com');
    expect(calledUrl.searchParams.get('key')).toBe('test-key');
    expect(calledUrl.pathname).toContain('/screenshot/create');
  });

  it('returns the screenshot object', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_SCREENSHOT)));
    const s = await client.screenshot.create({ url: 'https://example.com' });
    expect(s.id).toBe(1001);
    expect(s.status).toBe('finished');
  });

  it('passes optional parameters', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_SCREENSHOT)));
    await client.screenshot.create({
      url: 'https://example.com',
      country: 'fr',
      shots: 3,
      html: true,
      pdf: true,
    });

    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get('country')).toBe('fr');
    expect(calledUrl.searchParams.get('shots')).toBe('3');
    expect(calledUrl.searchParams.get('html')).toBe('true');
    expect(calledUrl.searchParams.get('pdf')).toBe('true');
  });

  it('passes through unknown future parameters', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_SCREENSHOT)));
    await client.screenshot.create({
      url: 'https://example.com',
      future_param: 'some_value',
    } as any);

    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get('future_param')).toBe('some_value');
  });

  it('throws when url is missing', async () => {
    await expect(client.screenshot.create({ url: '' })).rejects.toThrow('"url" is required');
  });

  it('throws ApiError on 401', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJson({ success: false, error: 'Invalid API key', code: 'INVALID_API_KEY' }, 401)
    );
    await expect(client.screenshot.create({ url: 'https://example.com' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'INVALID_API_KEY',
    });
  });

  it('throws ApiError with validation fields on 422', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJson(
        {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          fields: { country: ['Invalid country code'] },
        },
        422
      )
    );
    const err = await client.screenshot
      .create({ url: 'https://example.com', country: 'zz' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.fields?.country).toContain('Invalid country code');
  });

  it('throws ApiError on 429 rate limit', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJson({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED', retry_after: 60 }, 429)
    );
    await expect(
      client.screenshot.create({ url: 'https://example.com' })
    ).rejects.toMatchObject({ name: 'ApiError', status: 429 });
  });
});

// ── screenshot.info ────────────────────────────────────────────────────────────

describe('screenshot.info', () => {
  it('passes the screenshot ID', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_SCREENSHOT)));
    await client.screenshot.info(1001);
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('id')).toBe('1001');
  });

  it('accepts string IDs', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_SCREENSHOT)));
    const s = await client.screenshot.info('1001');
    expect(s.id).toBe(1001);
  });
});

// ── screenshot.list ────────────────────────────────────────────────────────────

describe('screenshot.list', () => {
  it('returns an array with no params', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJson(envelope([FIXTURE_SCREENSHOT]))
    );
    const result = await client.screenshot.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('passes limit and offset', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope([])));
    await client.screenshot.list({ limit: 5, offset: 10 });
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('offset')).toBe('10');
  });
});

// ── screenshot.search ──────────────────────────────────────────────────────────

describe('screenshot.search', () => {
  it('sends the search url', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope([])));
    await client.screenshot.search({ url: 'example.com' });
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('url')).toBe('example.com');
  });

  it('throws when url is missing', async () => {
    await expect(client.screenshot.search({ url: '' })).rejects.toThrow('"url" is required');
  });
});

// ── screenshot.thumbnail ───────────────────────────────────────────────────────

describe('screenshot.thumbnail', () => {
  it('returns a Buffer', async () => {
    const fakeImage = Buffer.from('PNG-DATA');
    mockFetch.mockResolvedValueOnce(mockBinary(fakeImage));
    const buf = await client.screenshot.thumbnail(1001);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('passes thumbnail options', async () => {
    mockFetch.mockResolvedValueOnce(mockBinary(Buffer.from('x')));
    await client.screenshot.thumbnail(1001, { width: 400, shot: 2 });
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('width')).toBe('400');
    expect(url.searchParams.get('shot')).toBe('2');
  });
});

// ── screenshot.saveImage ───────────────────────────────────────────────────────

describe('screenshot.saveImage', () => {
  it('writes the image buffer to disk', async () => {
    const fakeImage = Buffer.from('PNG-BYTES');
    mockFetch.mockResolvedValueOnce(mockBinary(fakeImage));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-'));
    const filePath = path.join(tmpDir, 'shot.png');

    await client.screenshot.saveImage(1001, filePath);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath)).toEqual(fakeImage);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates intermediate directories', async () => {
    mockFetch.mockResolvedValueOnce(mockBinary(Buffer.from('x')));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-'));
    const filePath = path.join(tmpDir, 'deep', 'nested', 'shot.png');

    await client.screenshot.saveImage(1001, filePath);
    expect(fs.existsSync(filePath)).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── screenshot.savePDF ─────────────────────────────────────────────────────────

describe('screenshot.savePDF', () => {
  it('writes the PDF buffer to disk', async () => {
    const fakePDF = Buffer.from('%PDF-1.4');
    mockFetch.mockResolvedValueOnce(mockBinary(fakePDF));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-'));
    const filePath = path.join(tmpDir, 'page.pdf');

    await client.screenshot.savePDF(1001, filePath);
    expect(fs.readFileSync(filePath)).toEqual(fakePDF);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── screenshot.saveHTML ────────────────────────────────────────────────────────

describe('screenshot.saveHTML', () => {
  it('writes the HTML string to disk', async () => {
    const fakeHTML = Buffer.from('<html><body>Hello</body></html>');
    mockFetch.mockResolvedValueOnce(mockBinary(fakeHTML));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-'));
    const filePath = path.join(tmpDir, 'page.html');

    await client.screenshot.saveHTML(1001, filePath);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('<html><body>Hello</body></html>');

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── screenshot.delete ──────────────────────────────────────────────────────────

describe('screenshot.delete', () => {
  it('sends data=all by default', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope({})));
    await client.screenshot.delete(1001);
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('data')).toBe('all');
  });

  it('passes a specific data value', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope({})));
    await client.screenshot.delete(1001, 'image');
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('data')).toBe('image');
  });
});

// ── waitFor ────────────────────────────────────────────────────────────────────

describe('client.waitFor', () => {
  it('resolves immediately when status is finished', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_SCREENSHOT)));
    const s = await client.waitFor(1001);
    expect(s.status).toBe('finished');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('polls until finished', async () => {
    const processing: Screenshot = { ...FIXTURE_SCREENSHOT, status: 'processing' };
    mockFetch
      .mockResolvedValueOnce(mockJson(envelope(processing)))
      .mockResolvedValueOnce(mockJson(envelope(FIXTURE_SCREENSHOT)));

    const s = await client.waitFor(1001, { interval: 10 });
    expect(s.status).toBe('finished');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws ScreenshotFailedError when status is error', async () => {
    const failed: Screenshot = {
      ...FIXTURE_SCREENSHOT,
      status: 'error',
      error: 'Navigation timeout',
    };
    mockFetch.mockResolvedValueOnce(mockJson(envelope(failed)));

    await expect(client.waitFor(1001, { interval: 10 })).rejects.toMatchObject({
      name: 'ScreenshotFailedError',
      screenshotId: 1001,
      screenshotError: 'Navigation timeout',
    });
  });

  it('throws TimeoutError when deadline is exceeded', async () => {
    const queued: Screenshot = { ...FIXTURE_SCREENSHOT, status: 'processing' };
    mockFetch.mockResolvedValue(mockJson(envelope(queued)));

    await expect(
      client.waitFor(1001, { interval: 10, timeout: 25 })
    ).rejects.toMatchObject({
      name: 'TimeoutError',
      screenshotId: 1001,
    });
  });
});

// ── batch.create ───────────────────────────────────────────────────────────────

describe('batch.create', () => {
  it('accepts a URL array and sends multipart form', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_BATCH)));
    const result = await client.batch.create(
      ['https://example.com', 'https://news.ycombinator.com'],
      { country: 'us' }
    );
    expect(result.id).toBe(2001);
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(mockFetch.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });

  it('accepts a plain string', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_BATCH)));
    await client.batch.create('https://example.com\nhttps://other.com', { country: 'fr' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('accepts a Buffer', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope(FIXTURE_BATCH)));
    await client.batch.create(
      Buffer.from('https://example.com\n'),
      { country: 'de' }
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws when country is missing', async () => {
    await expect(
      client.batch.create(['https://example.com'], { country: '' })
    ).rejects.toThrow('"country" is required');
  });
});

// ── batch.waitFor ──────────────────────────────────────────────────────────────

describe('batch.waitFor', () => {
  it('resolves when batch finishes', async () => {
    const processing: Batch = { ...FIXTURE_BATCH, status: 'processing' };
    mockFetch
      .mockResolvedValueOnce(mockJson(envelope(processing)))
      .mockResolvedValueOnce(mockJson(envelope(FIXTURE_BATCH)));

    const b = await client.batch.waitFor(2001, { interval: 10 });
    expect(b.status).toBe('finished');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('resolves immediately on error status', async () => {
    const failed: Batch = { ...FIXTURE_BATCH, status: 'error', error: 'Canceled' };
    mockFetch.mockResolvedValueOnce(mockJson(envelope(failed)));

    const b = await client.batch.waitFor(2001, { interval: 10 });
    expect(b.status).toBe('error');
  });
});

// ── account.info ───────────────────────────────────────────────────────────────

describe('account.info', () => {
  it('returns account with balance', async () => {
    mockFetch.mockResolvedValueOnce(mockJson(envelope({ balance: 500 })));
    const account = await client.account.info();
    expect(account.balance).toBe(500);
  });
});

// ── Error classes ──────────────────────────────────────────────────────────────

describe('error classes', () => {
  it('ApiError carries status and code', () => {
    const e = new ApiError('Unauthorized', 401, 'INVALID_API_KEY');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ApiError');
    expect(e.status).toBe(401);
    expect(e.code).toBe('INVALID_API_KEY');
  });

  it('TimeoutError carries screenshotId', () => {
    const e = new TimeoutError(999, 30_000);
    expect(e.name).toBe('TimeoutError');
    expect(e.screenshotId).toBe(999);
    expect(e.message).toContain('30000');
  });

  it('ScreenshotFailedError carries screenshotError', () => {
    const e = new ScreenshotFailedError(42, 'Navigation timeout');
    expect(e.name).toBe('ScreenshotFailedError');
    expect(e.screenshotError).toBe('Navigation timeout');
  });
});
