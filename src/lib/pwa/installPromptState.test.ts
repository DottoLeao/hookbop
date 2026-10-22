import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_FINISH_KEY } from './firstFinish';
import { dismissInstallPrompt, installPromptDue } from './installPromptState';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installPromptDue', () => {
  it('is not due before the first song is finished', () => {
    expect(installPromptDue()).toBe(false);
  });

  it('is due once the first song is finished', () => {
    localStorage.setItem(FIRST_FINISH_KEY, '1');
    expect(installPromptDue()).toBe(true);
  });

  it('is not due again after "Agora não"', () => {
    localStorage.setItem(FIRST_FINISH_KEY, '1');
    dismissInstallPrompt();

    expect(localStorage.getItem('hb_install_dismissed')).toBe('1');
    expect(installPromptDue()).toBe(false);
  });

  it('is not due when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(installPromptDue()).toBe(false);
  });
});

describe('dismissInstallPrompt', () => {
  it('does not throw when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(() => dismissInstallPrompt()).not.toThrow();
  });
});

describe('FIRST_FINISH_KEY', () => {
  it('is the name the song screen writes and the e2e specs set', () => {
    expect(FIRST_FINISH_KEY).toBe('hb_first_finish');
  });
});
