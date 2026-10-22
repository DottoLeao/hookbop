/** A version 4 UUID (RFC 4122) made from 16 random bytes: the version in byte 6, the variant in byte 8. */
function uuidFromRandomBytes(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A random version 4 UUID. `crypto.randomUUID` exists only in a secure context (https, or localhost): opened over
 * plain http, on a phone on the same network as a dev machine for one, it is missing and calling it throws. Then the
 * id is built from `crypto.getRandomValues`, which works everywhere.
 */
export function randomUuid(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // Not a secure context: fall back below.
  }
  return uuidFromRandomBytes();
}
