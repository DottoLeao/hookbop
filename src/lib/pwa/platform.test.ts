import { describe, expect, it } from 'vitest';
import { platformFromNavigator } from './platform';

const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints });

describe('platformFromNavigator', () => {
  it('knows an Android phone, in Chrome or in Samsung Internet', () => {
    expect(
      platformFromNavigator(
        nav('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', 'Linux armv81', 5),
      ),
    ).toBe('android');
    expect(
      platformFromNavigator(nav('Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36')),
    ).toBe('android');
  });

  it('knows an iPhone and an iPad, in Safari or in another browser', () => {
    expect(
      platformFromNavigator(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', 'iPhone', 5)),
    ).toBe('ios');
    expect(
      platformFromNavigator(nav('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1', 'iPad', 5)),
    ).toBe('ios');
  });

  it('knows an iPad that says it is a Mac (iPadOS asks for the desktop site) by its touch screen', () => {
    const macUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
    expect(platformFromNavigator(nav(macUserAgent, 'MacIntel', 5))).toBe('ios');
    expect(platformFromNavigator(nav(macUserAgent, 'MacIntel', 0))).toBe('other');
  });

  it('calls everything else other', () => {
    expect(platformFromNavigator(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'Win32'))).toBe('other');
    expect(platformFromNavigator(nav(''))).toBe('other');
  });
});
