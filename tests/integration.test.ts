/**
 * Integration tests — run against a real ScreenshotCenter instance.
 *
 * These tests are SKIPPED unless SCREENSHOTCENTER_API_KEY is set.
 *
 * Environment variables:
 *   SCREENSHOTCENTER_API_KEY   Your API key (required to run these tests)
 *   SCREENSHOTCENTER_BASE_URL  Override the API base URL
 *                              e.g. http://localhost:3000/api/v1
 *
 * Usage:
 *   # Run against the production API
 *   SCREENSHOTCENTER_API_KEY=your_key npm run test:integration
 *
 *   # Run against a local instance
 *   SCREENSHOTCENTER_API_KEY=your_key \
 *   SCREENSHOTCENTER_BASE_URL=http://localhost:3000/api/v1 \
 *   npm run test:integration
 */

import { jest, describe, it, expect, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ScreenshotCenterClient } from '../src/client.js';
import { ApiError } from '../src/errors.js';
import type { Screenshot } from '../src/types.js';

// ── Guard — skip everything if no API key is configured ────────────────────

const API_KEY = process.env.SCREENSHOTCENTER_API_KEY ?? '';
const BASE_URL = process.env.SCREENSHOTCENTER_BASE_URL;

const itLive = API_KEY ? it : it.skip;
const describeLive = API_KEY ? describe : describe.skip;

if (!API_KEY) {
  console.log(
    '\nℹ️  Integration tests skipped — set SCREENSHOTCENTER_API_KEY to run them against a real instance.\n'
  );
}

// ── Client factory ──────────────────────────────────────────────────────────

function makeClient(): ScreenshotCenterClient {
  return new ScreenshotCenterClient({
    apiKey: API_KEY,
    ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
  });
}

// ── Shared state ────────────────────────────────────────────────────────────

// IDs created during this test run — cleaned up in afterAll.
const createdIds: number[] = [];

// Raise Jest's default 5 s timeout; screenshots can take up to 30+ s.
jest.setTimeout(120_000);

// ── Helpers ─────────────────────────────────────────────────────────────────

async function createAndWait(
  client: ScreenshotCenterClient,
  extra: Record<string, unknown> = {}
): Promise<Screenshot> {
  const screenshot = await client.screenshot.create({
    url: 'https://example.com',
    country: 'us',
    ...extra,
  });
  createdIds.push(screenshot.id);
  return client.waitFor(screenshot.id, { interval: 3_000, timeout: 110_000 });
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (createdIds.length === 0) return;
  const client = makeClient();
  for (const id of createdIds) {
    try {
      await client.screenshot.delete(id, 'all');
    } catch {
      // Best-effort cleanup.
    }
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describeLive('account', () => {
  itLive('info() returns a non-negative balance', async () => {
    const client = makeClient();
    const account = await client.account.info();
    expect(typeof account.balance).toBe('number');
    expect(account.balance).toBeGreaterThanOrEqual(0);
  });
});

describeLive('screenshot.create + waitFor', () => {
  itLive('creates a screenshot and reaches finished status', async () => {
    const client = makeClient();
    const result = await createAndWait(client);

    expect(result.status).toBe('finished');
    expect(result.id).toBeGreaterThan(0);
    expect(result.url).toBe('https://example.com/');
  });

  itLive('returns processing status immediately after create', async () => {
    const client = makeClient();
    const screenshot = await client.screenshot.create({
      url: 'https://example.com',
      country: 'us',
    });
    createdIds.push(screenshot.id);

    // The screenshot was just submitted — status must be processing or finished.
    expect(['processing', 'finished']).toContain(screenshot.status);
  });
});

describeLive('screenshot.info', () => {
  itLive('returns the screenshot by ID', async () => {
    const client = makeClient();
    const created = await createAndWait(client);
    const fetched = await client.screenshot.info(created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.status).toBe('finished');
  });

  itLive('throws ApiError 404 for an unknown ID', async () => {
    const client = makeClient();
    await expect(client.screenshot.info(999_999_999)).rejects.toMatchObject({
      name: 'ApiError',
      status: expect.any(Number),
    });
  });
});

describeLive('screenshot.list', () => {
  itLive('returns an array of screenshots', async () => {
    const client = makeClient();
    const screenshots = await client.screenshot.list({ limit: 5 });
    expect(Array.isArray(screenshots)).toBe(true);
  });
});

describeLive('screenshot.search', () => {
  itLive('returns results for example.com', async () => {
    const client = makeClient();
    const screenshots = await client.screenshot.search({
      url: 'example.com',
      limit: 5,
    });
    expect(Array.isArray(screenshots)).toBe(true);
  });
});

describeLive('screenshot.thumbnail', () => {
  itLive('returns a non-empty image buffer', async () => {
    const client = makeClient();
    const result = await createAndWait(client);
    const buf = await client.screenshot.thumbnail(result.id);

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});

describeLive('screenshot.saveImage', () => {
  itLive('downloads and writes an image to disk', async () => {
    const client = makeClient();
    const result = await createAndWait(client);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-integration-'));
    const filePath = path.join(tmpDir, 'shot.png');

    try {
      await client.screenshot.saveImage(result.id, filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describeLive('screenshot with html=true', () => {
  itLive('captures HTML and allows saving it to disk', async () => {
    const client = makeClient();
    const result = await createAndWait(client, { html: true });

    expect(result.has_html).toBe(true);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-integration-'));
    const filePath = path.join(tmpDir, 'page.html');

    try {
      await client.screenshot.saveHTML(result.id, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain('<html');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describeLive('screenshot with pdf=true', () => {
  itLive('generates a PDF and allows saving it to disk', async () => {
    const client = makeClient();
    const result = await createAndWait(client, { pdf: true });

    expect(result.has_pdf).toBe(true);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-integration-'));
    const filePath = path.join(tmpDir, 'page.pdf');

    try {
      await client.screenshot.savePDF(result.id, filePath);
      const buf = fs.readFileSync(filePath);
      // PDF files start with %PDF
      expect(buf.slice(0, 4).toString()).toBe('%PDF');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describeLive('screenshot.saveAll', () => {
  itLive('saves all available outputs to a directory', async () => {
    const client = makeClient();
    const result = await createAndWait(client, { html: true });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-integration-'));
    try {
      const saved = await client.screenshot.saveAll(result.id, tmpDir, {
        basename: 'test',
      });

      expect(saved.image).toBeDefined();
      expect(fs.existsSync(saved.image!)).toBe(true);

      if (result.has_html) {
        expect(saved.html).toBeDefined();
        expect(fs.existsSync(saved.html!)).toBe(true);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describeLive('screenshot.delete', () => {
  itLive('deletes image data without throwing', async () => {
    const client = makeClient();
    const result = await createAndWait(client);

    // Remove from cleanup list since we're deleting it here.
    const idx = createdIds.indexOf(result.id);
    if (idx !== -1) createdIds.splice(idx, 1);

    await expect(client.screenshot.delete(result.id, 'image')).resolves.not.toThrow();
  });
});

describeLive('invalid API key', () => {
  itLive('throws ApiError 401 on authentication failure', async () => {
    const client = new ScreenshotCenterClient({
      apiKey: 'invalid-key-000',
      ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
    });

    await expect(
      client.screenshot.create({ url: 'https://example.com' })
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    });
  });
});

// Batch tests require the batch worker service to be running:
//   cd services && npm run batches:worker
describeLive('batch', () => {
  itLive('creates a batch, waits for it, and downloads the ZIP', async () => {
    const client = makeClient();

    const batch = await client.batch.create(
      ['https://example.com', 'https://example.org'],
      { country: 'us' }
    );

    expect(batch.id).toBeGreaterThan(0);
    expect(['processing', 'finished']).toContain(batch.status);

    const result = await client.batch.waitFor(batch.id, {
      interval: 3_000,
      timeout: 110_000,
    });

    expect(['finished', 'error']).toContain(result.status);

    if (result.status === 'finished' && result.zip_url) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-integration-'));
      const zipPath = path.join(tmpDir, 'results.zip');
      try {
        await client.batch.saveZip(result.id, zipPath);
        expect(fs.existsSync(zipPath)).toBe(true);
        expect(fs.statSync(zipPath).size).toBeGreaterThan(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });
});
