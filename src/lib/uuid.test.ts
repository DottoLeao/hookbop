import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './uuid';

/** An RFC 4122 version 4 UUID: 8-4-4-4-12 hex digits, version 4, variant 10xx. */
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('randomUuid', () => {
  it('uses crypto.randomUUID when the browser has it', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-4333-8444-555555555555');

    expect(randomUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('falls back to a v4 UUID from getRandomValues when randomUUID throws (http on a LAN, not a secure context)', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('crypto.randomUUID is not available in an insecure context');
    });
    const values = vi.spyOn(crypto, 'getRandomValues');

    const id = randomUuid();

    expect(id).toMatch(V4);
    expect(values).toHaveBeenCalledOnce();
  });

  it('falls back when randomUUID is missing altogether', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    try {
      expect(randomUuid()).toMatch(V4);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: original });
    }
  });

  it('sets the version and variant bits whatever the random bytes are', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('no');
    });
    for (const fill of [0x00, 0xff]) {
      vi.spyOn(crypto, 'getRandomValues').mockImplementationOnce(<T extends ArrayBufferView | null>(array: T) => {
        new Uint8Array((array as unknown as Uint8Array).buffer).fill(fill);
        return array;
      });

      expect(randomUuid()).toMatch(V4);
    }
  });

  it('gives a new id every time', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('no');
    });

    expect(new Set(Array.from({ length: 50 }, randomUuid)).size).toBe(50);
  });
});
