import { AppwriteException } from 'appwrite';
import { FunctionRejectedError } from '../appwrite/invoke-admin-function';

/**
 * 4xx codes that still mean "try again later", not "this record is wrong": 401 is an expired
 * session (signing back in fixes it), 408/425/429 are timing/throttling.
 */
const RETRYABLE_CLIENT_STATUSES = new Set([401, 408, 425, 429]);

function statusOf(error: unknown): number | undefined {
  if (error instanceof FunctionRejectedError) return error.status;
  if (error instanceof AppwriteException) return error.code;
  return undefined;
}

/**
 * The server's reason when it definitively refused an outbox entry (any other 4xx), or null
 * when the failure is transient — no response at all (offline, timeout, a thrown fetch) or a
 * 5xx — and the entry should simply stay queued for the next drain.
 */
export function definitiveRejectionReason(error: unknown): string | null {
  const status = statusOf(error);
  if (status === undefined || status < 400 || status >= 500) return null;
  if (RETRYABLE_CLIENT_STATUSES.has(status)) return null;
  const message = error instanceof Error ? error.message.trim() : '';
  return message || `Rejected by the server (status ${status})`;
}
