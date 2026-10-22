import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearInstallEvent, getInstallEvent, listenForInstallEvent, subscribeInstallEvent } from './installEvent';

function offer(): Event {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

afterEach(() => {
  clearInstallEvent();
});

describe('install event', () => {
  it('keeps the offer the browser makes, and holds back the browser own banner', () => {
    const stop = listenForInstallEvent();

    const event = offer();

    expect(getInstallEvent()).toBe(event);
    expect(event.defaultPrevented).toBe(true);
    stop();
  });

  it('tells subscribers when the offer arrives and when it is used up', () => {
    const stop = listenForInstallEvent();
    const onChange = vi.fn();
    const unsubscribe = subscribeInstallEvent(onChange);

    offer();
    expect(onChange).toHaveBeenCalledTimes(1);

    clearInstallEvent();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(getInstallEvent()).toBeNull();

    unsubscribe();
    offer();
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it('drops the offer once the app is installed', () => {
    const stop = listenForInstallEvent();
    offer();

    window.dispatchEvent(new Event('appinstalled'));

    expect(getInstallEvent()).toBeNull();
    stop();
  });

  it('stops listening when told to', () => {
    const stop = listenForInstallEvent();
    stop();

    offer();

    expect(getInstallEvent()).toBeNull();
  });
});
