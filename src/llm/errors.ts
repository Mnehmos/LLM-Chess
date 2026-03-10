/** Non-retryable API error (4xx client errors like model not found or auth failures). */
export class PermanentAPIError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PermanentAPIError';
    this.status = status;
  }
}

/** Transient rate-limit error; callers should retry with backoff. */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}
