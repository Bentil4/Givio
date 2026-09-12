/**
 * Client-side reversible obfuscation for the family access code in the URL (AD-10: the code
 * itself is still the whole credential — this only keeps it from appearing as a plain,
 * human-readable string in the address bar, browser history, or a screenshot). NOT encryption:
 * anyone who knows this is base64url can decode it, same as the raw code would grant access
 * either way. A URL-safe variant of base64 (RFC 4648 §5) — no '+', '/', or '=' padding — so it
 * drops cleanly into a route segment with no extra escaping.
 */
export function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns null on malformed input so callers can fall back to treating it as a plain code. */
export function base64UrlDecode(value: string): string | null {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  try {
    return atob(withPadding);
  } catch {
    return null;
  }
}
