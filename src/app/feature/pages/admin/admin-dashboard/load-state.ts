import type { Resource } from '@angular/core';

/** Where one of the overview's sources is: still loading, loaded, or failed (retryable). */
export type LoadState = 'loading' | 'ready' | 'error';

export function loadStateOf(source: Resource<unknown>): LoadState {
  const status = source.status();
  if (status === 'error') return 'error';
  return status === 'resolved' || status === 'local' ? 'ready' : 'loading';
}

/** The loaded value, or `fallback` while loading or after a failure. */
export function loadedValueOr<T>(source: Resource<T | undefined>, fallback: T): T {
  return loadStateOf(source) === 'ready' ? (source.value() ?? fallback) : fallback;
}
