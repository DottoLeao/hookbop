import type { ProgressStorage } from './savedProgress';

/** A storage that lives in memory, for tests: `localStorage` as far as the saved progress touches it. */
export class MemoryStorage implements ProgressStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  /** Test helper: the keys that are stored. */
  keys(): string[] {
    return [...this.items.keys()];
  }
}

/** A storage that refuses every call, as `localStorage` does when site data is blocked (SecurityError) or full. */
export class BrokenStorage implements ProgressStorage {
  getItem(): string | null {
    throw new DOMException('blocked', 'SecurityError');
  }

  setItem(): void {
    throw new DOMException('full', 'QuotaExceededError');
  }

  removeItem(): void {
    throw new DOMException('blocked', 'SecurityError');
  }
}
