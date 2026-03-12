# screenshotcenter

Official Node.js SDK for the [ScreenshotCenter API](https://screenshotcenter.com).  
Capture screenshots, PDFs, HTML, and videos of any web page at scale.

[![npm version](https://img.shields.io/npm/v/screenshotcenter.svg)](https://www.npmjs.com/package/screenshotcenter)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Requirements

- Node.js ≥ 18 (uses native `fetch` and `FormData`)
- A [ScreenshotCenter API key](https://screenshotcenter.com/)

---

## Installation

```bash
npm install screenshotcenter
```

---

## Quick start

```js
import { ScreenshotCenterClient } from 'screenshotcenter';

const client = new ScreenshotCenterClient({ apiKey: 'YOUR_API_KEY' });

// Request a screenshot and wait for it to finish
const screenshot = await client.screenshot.create({ url: 'https://browshot.com' });
const result = await client.waitFor(screenshot.id);

console.log(result.status);      // 'finished'
console.log(result.storage_url); // S3 URL
```

---

## Authentication

Pass your API key when creating the client:

```js
const client = new ScreenshotCenterClient({ apiKey: 'YOUR_API_KEY' });
```

The key is sent as the `key` query parameter on every request.  
You can also point the client at a self-hosted instance:

```js
const client = new ScreenshotCenterClient({
  apiKey: 'YOUR_API_KEY',
  baseUrl: 'https://api.example.com/api/v1',
});
```

---

## Use cases

### Take a basic screenshot

```js
const screenshot = await client.screenshot.create({
  url: 'https://browshot.com',
});

// Poll until finished
const result = await client.waitFor(screenshot.id);
console.log(result.storage_url);
```

---

### Save the image to disk

```js
const screenshot = await client.screenshot.create({ url: 'https://blitapp.com' });
const result = await client.waitFor(screenshot.id);

await client.screenshot.saveImage(result.id, './output/homepage.png');
```

---

### Take a full-page screenshot in a specific country

```js
const screenshot = await client.screenshot.create({
  url: 'https://blitapp.com',
  size: 'page',       // capture the full scrollable page
  country: 'fr'      // route through a browser located in France
});

const result = await client.waitFor(screenshot.id);
await client.screenshot.saveImage(result.id, './output/fr-full.png');
```

---

### Generate a PDF

```js
const screenshot = await client.screenshot.create({
  url: 'https://screenshotcenter.com/blog',
  pdf: true,
  pdf_landscape: true,
  pdf_format: 'A4',
});

const result = await client.waitFor(screenshot.id);
await client.screenshot.savePDF(result.id, './output/report.pdf');
```

---

### Capture rendered HTML source

```js
const screenshot = await client.screenshot.create({
  url: 'https://screenshotcenter.com',
  html: true,
});

const result = await client.waitFor(screenshot.id);
await client.screenshot.saveHTML(result.id, './output/page.html');
```

---

### Record a video

```js
const screenshot = await client.screenshot.create({
  url: 'https://thumbalizr.com',
  video: true,
  video_duration: 10,  // seconds
  video_format: 'webm',
});

const result = await client.waitFor(screenshot.id);
await client.screenshot.saveVideo(result.id, './output/recording.webm');
```

---

### Multiple shots (carousel / scroll)

```js
const screenshot = await client.screenshot.create({
  url: 'https://browshot.com',
  shots: 4,
  shot_interval: 1000, // ms between shots
});

const result = await client.waitFor(screenshot.id);

// Save each shot individually
for (let i = 1; i <= 4; i++) {
  await client.screenshot.saveImage(result.id, `./output/shot-${i}.png`, { shot: i });
}
```

---

### Save all outputs at once

```js
const screenshot = await client.screenshot.create({
  url: 'https://browshot.com',
  html: true,
  pdf: true,
  video: true,
});

const result = await client.waitFor(screenshot.id);

const saved = await client.screenshot.saveAll(result.id, './output/', {
  basename: 'homepage',
});

// saved.image  → ./output/homepage.png
// saved.html   → ./output/homepage.html  (if captured)
// saved.pdf    → ./output/homepage.pdf   (if captured)
// saved.video  → ./output/homepage.webm  (if captured)
```

---

### Automate interactions with steps

```js
const screenshot = await client.screenshot.create({
  url: 'https://browshot.com/login',
  steps: [
    { command: 'fill',  selector: '#email',    value: 'user@example.com' },
    { command: 'fill',  selector: '#password', value: 'secret' },
    { command: 'click', selector: '#login-btn' },
    { command: 'wait',  value: '2000' },
    { command: 'screenshot' },
  ],
});

const result = await client.waitFor(screenshot.id);
await client.screenshot.saveImage(result.id, './output/after-login.png');
```

---

### Use a custom device

```js
const screenshot = await client.screenshot.create({
  url: 'https://browshot.com',
  device_name: 'iphone_14',
  device_mobile: true,
  device_touch: true,
});

const result = await client.waitFor(screenshot.id);
await client.screenshot.saveImage(result.id, './output/mobile.png');
```

---

### Batch processing

Submit a list of URLs for parallel processing.

```js
const urls = [
  'https://browshot.com',
  'https://thumbalizr.com',
  'https://blitapp.com',
];

// Submit the batch
const batch = await client.batch.create(urls, { country: 'us' });

// Wait for all screenshots to finish
const result = await client.batch.waitFor(batch.id);
console.log(`Processed ${result.processed}/${result.count}`);

// Download the ZIP archive of all screenshots
await client.batch.saveZip(result.id, './output/batch-results.zip');
```

You can also pass a file path or a plain newline-separated string:

```js
import fs from 'fs';

const fileBuffer = fs.readFileSync('./urls.txt');
const batch = await client.batch.create(fileBuffer, { country: 'de', size: 'page' });
```

---

### Check your credit balance

```js
const { balance } = await client.account.info();
console.log(`Credits remaining: ${balance}`);
```

---

### List and search screenshots

```js
// List the 20 most recent screenshots
const { screenshots } = await client.screenshot.list({ limit: 20 });

// Search by URL pattern
const { screenshots: results } = await client.screenshot.search({
  q: 'github.com',
  limit: 10,
});
```

---

### Delete a screenshot

```js
// Delete image + metadata + URL record
await client.screenshot.delete(screenshotId);

// Delete only the image file, keep metadata
await client.screenshot.delete(screenshotId, 'image');
```

Available values: `"image"`, `"metadata"`, `"url"`, `"all"` (default).

---

## API reference

### `new ScreenshotCenterClient(options)`

| Option | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | ✓ | Your API key |
| `baseUrl` | `string` | | Override the API base URL |
| `timeout` | `number` | | Request timeout in ms (default: `30000`) |

---

### `client.screenshot`

| Method | Description |
|---|---|
| `create(params)` | Request a new screenshot. `url` is the only required field. |
| `info(id)` | Get status and metadata for a screenshot. |
| `list(params?)` | List recent screenshots. |
| `search(params)` | Search by URL pattern (`q` required). |
| `thumbnail(id, params?)` | Fetch the image as a `Buffer`. |
| `html(id)` | Fetch the rendered HTML as a string. |
| `pdf(id)` | Fetch the PDF as a `Buffer`. |
| `video(id)` | Fetch the video as a `Buffer`. |
| `delete(id, data?)` | Delete screenshot data. |
| `saveImage(id, path, params?)` | Download image and write to disk. |
| `saveHTML(id, path)` | Download HTML and write to disk. |
| `savePDF(id, path)` | Download PDF and write to disk. |
| `saveVideo(id, path)` | Download video and write to disk. |
| `saveAll(id, dir, opts?)` | Download all available outputs to a directory. |

---

### `client.batch`

| Method | Description |
|---|---|
| `create(urls, params)` | Submit a batch. `country` is required. |
| `info(id)` | Get batch status and progress. |
| `list(params?)` | List recent batches. |
| `cancel(id)` | Cancel a running batch. |
| `download(id)` | Download the results ZIP as a `Buffer`. |
| `saveZip(id, path)` | Download the results ZIP to disk. |
| `waitFor(id, opts?)` | Poll until the batch finishes. |

---

### `client.account`

| Method | Description |
|---|---|
| `info()` | Returns `{ balance }` with current credit count. |

---

### `client.waitFor(id, options?)`

Polls `screenshot.info` until the screenshot reaches `finished` or `error`.

| Option | Type | Default | Description |
|---|---|---|---|
| `interval` | `number` | `2000` | Poll interval in ms |
| `timeout` | `number` | `120000` | Maximum wait time in ms |

Throws `TimeoutError` if the deadline is reached, or `ScreenshotFailedError` if the screenshot errors out.

---

## Error handling

```js
import {
  ScreenshotCenterClient,
  ApiError,
  TimeoutError,
  ScreenshotFailedError,
} from 'screenshotcenter';

try {
  const screenshot = await client.screenshot.create({ url: 'https://browshot.com' });
  const result = await client.waitFor(screenshot.id, { timeout: 60_000 });
} catch (err) {
  if (err instanceof ApiError) {
    console.error(`API error ${err.status}: ${err.message} (${err.code})`);
    if (err.fields) console.error('Validation errors:', err.fields);
  } else if (err instanceof TimeoutError) {
    console.error(`Timed out waiting for screenshot ${err.screenshotId}`);
  } else if (err instanceof ScreenshotFailedError) {
    console.error(`Screenshot failed: ${err.screenshotError}`);
  } else {
    throw err;
  }
}
```

---

## TypeScript

The package ships full TypeScript types. All parameters beyond `url` are optional and typed, and an index signature (`[key: string]: unknown`) lets you pass any future API parameter without a type error:

```ts
import { ScreenshotCenterClient, type CreateParams } from 'screenshotcenter';

const params: CreateParams = {
  url: 'https://blitapp.com',
  country: 'us',
  new_future_param: 'value', // accepted without type error
};
```

---

## Testing

### `npm test` — unit + integration (recommended)

`npm test` always runs the full test suite. Integration tests automatically
skip themselves when `SCREENSHOTCENTER_API_KEY` is not set, so it is always
safe to run without any credentials.

```bash
# Unit tests only (no API key needed)
npm test

# Unit tests + live integration tests against the production API
SCREENSHOTCENTER_API_KEY=your_key npm test

# Unit tests + live integration tests against a local instance
SCREENSHOTCENTER_API_KEY=your_key \
SCREENSHOTCENTER_BASE_URL=http://localhost:3000/api/v1 \
npm test
```

### `npm run test:integration` — integration tests only

Useful in CI pipelines that run unit and integration jobs separately.

```bash
SCREENSHOTCENTER_API_KEY=your_key npm run test:integration

# Against a local instance
SCREENSHOTCENTER_API_KEY=your_key \
SCREENSHOTCENTER_BASE_URL=http://localhost:3000/api/v1 \
npm run test:integration
```

| Variable | Required | Description |
|---|---|---|
| `SCREENSHOTCENTER_API_KEY` | Yes (to run live tests) | API key for all live requests |
| `SCREENSHOTCENTER_BASE_URL` | No | Override the base URL (default: `https://api.screenshotcenter.com/api/v1`) |

Integration tests create real screenshots on the account. Each test cleans up
(deletes) the screenshots it creates in `afterAll`, so they won't accumulate.

---

## CommonJS

The package ships both ESM and CommonJS builds:

```js
const { ScreenshotCenterClient } = require('screenshotcenter');
```

---

## License

[MIT](LICENSE) © ScreenshotCenter
