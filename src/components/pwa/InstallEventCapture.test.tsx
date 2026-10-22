import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearInstallEvent, getInstallEvent } from '@/lib/pwa/installEvent';
import { InstallEventCapture } from './InstallEventCapture';

afterEach(() => {
  clearInstallEvent();
});

describe('InstallEventCapture', () => {
  it('keeps the browser install offer for later, while mounted', () => {
    const { unmount } = render(<InstallEventCapture />);
    const event = new Event('beforeinstallprompt', { cancelable: true });

    window.dispatchEvent(event);

    expect(getInstallEvent()).toBe(event);
    unmount();

    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    expect(getInstallEvent()).toBe(event);
  });
});
