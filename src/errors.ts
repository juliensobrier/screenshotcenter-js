/**
 * Base error for all ScreenshotCenter SDK errors.
 */
export class ScreenshotCenterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenshotCenterError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API returns a non-2xx HTTP status code.
 */
export class ApiError extends ScreenshotCenterError {
  /** HTTP status code */
  readonly status: number;
  /** Machine-readable error code from the API */
  readonly code: string | undefined;
  /** Field-level validation errors (for 422 responses) */
  readonly fields: Record<string, string[]> | undefined;

  constructor(
    message: string,
    status: number,
    code?: string,
    fields?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Thrown when `waitFor()` times out before the screenshot reaches a
 * terminal state.
 */
export class TimeoutError extends ScreenshotCenterError {
  readonly screenshotId: number;

  constructor(screenshotId: number, timeoutMs: number) {
    super(
      `Screenshot ${screenshotId} did not complete within ${timeoutMs}ms`
    );
    this.name = 'TimeoutError';
    this.screenshotId = screenshotId;
  }
}

/**
 * Thrown when a screenshot finishes with status "error".
 */
export class ScreenshotFailedError extends ScreenshotCenterError {
  readonly screenshotId: number;
  readonly screenshotError: string | null;

  constructor(screenshotId: number, screenshotError: string | null) {
    super(
      `Screenshot ${screenshotId} failed: ${screenshotError ?? 'unknown error'}`
    );
    this.name = 'ScreenshotFailedError';
    this.screenshotId = screenshotId;
    this.screenshotError = screenshotError;
  }
}
