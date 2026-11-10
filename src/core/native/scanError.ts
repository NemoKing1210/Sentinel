export type ScanErrorCode = 'rate_limited' | 'too_large' | 'missing' | 'rejected' | 'other';

const SCAN_ERROR_CODES: ReadonlySet<ScanErrorCode> = new Set([
  'rate_limited',
  'too_large',
  'missing',
  'rejected',
  'other',
]);

/** A scan failure with a stable code the scheduler can branch on. */
export class ScanError extends Error {
  readonly code: ScanErrorCode;
  readonly retryAfterSecs?: number;

  constructor(code: ScanErrorCode, message: string, retryAfterSecs?: number) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    if (typeof retryAfterSecs === 'number' && Number.isFinite(retryAfterSecs)) {
      this.retryAfterSecs = Math.max(0, Math.round(retryAfterSecs));
    }
  }
}

function isScanErrorCode(value: unknown): value is ScanErrorCode {
  return typeof value === 'string' && SCAN_ERROR_CODES.has(value as ScanErrorCode);
}

/** Normalizes a rejected Tauri command (typed payload, Error, or string) into a ScanError. */
export function toScanError(error: unknown): ScanError {
  if (error instanceof ScanError) return error;
  if (error instanceof Error) return new ScanError('other', error.message);
  if (typeof error === 'string') return new ScanError('other', error);
  if (error && typeof error === 'object') {
    const raw = error as Record<string, unknown>;
    const message = typeof raw.message === 'string' && raw.message ? raw.message : 'Unknown scan error';
    if (isScanErrorCode(raw.code)) {
      const retryAfter = typeof raw.retryAfterSecs === 'number' ? raw.retryAfterSecs : undefined;
      return new ScanError(raw.code, message, retryAfter);
    }
    return new ScanError('other', message);
  }
  return new ScanError('other', 'Unknown scan error');
}
