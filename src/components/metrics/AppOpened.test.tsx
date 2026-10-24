import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The same mock across the fresh pages below (loading the modules again would otherwise make a new one each time).
const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/metrics/track', () => ({ track }));

type Component = typeof import('./AppOpened').AppOpened;

/** A page that has just opened: the component remembers that it told the panel only while the page lives. */
async function freshPage(): Promise<Component> {
  vi.resetModules();
  return (await import('./AppOpened')).AppOpened;
}

beforeEach(() => {
  sessionStorage.clear();
  track.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppOpened', () => {
  it('draws nothing and tracks app_opened', async () => {
    const AppOpened = await freshPage();

    const { container } = render(<AppOpened />);

    expect(container).toBeEmptyDOMElement();
    expect(track).toHaveBeenCalledExactlyOnceWith('app_opened');
  });

  it('tracks it once for the session: not again when the page is shown again, nor on another page of the app', async () => {
    const AppOpened = await freshPage();
    const first = render(<AppOpened />);
    first.rerender(<AppOpened />);
    first.unmount();
    render(<AppOpened />);

    expect(track).toHaveBeenCalledOnce();
  });

  it('tracks it once for the session when the page is opened again in the same tab (a reload, a link)', async () => {
    const First = await freshPage();
    render(<First />);

    const Reloaded = await freshPage();
    render(<Reloaded />);

    expect(track).toHaveBeenCalledOnce();
  });

  it('tracks it again in another tab or a reopened app, where the session storage is empty', async () => {
    const First = await freshPage();
    render(<First />);
    sessionStorage.clear();

    const Reopened = await freshPage();
    render(<Reopened />);

    expect(track).toHaveBeenCalledTimes(2);
  });

  it('tracks it once in StrictMode, where React runs the effect twice', async () => {
    const AppOpened = await freshPage();

    render(
      <StrictMode>
        <AppOpened />
      </StrictMode>,
    );

    expect(track).toHaveBeenCalledOnce();
  });

  it('tracks it once for the page when the storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const AppOpened = await freshPage();

    const first = render(<AppOpened />);
    first.unmount();
    render(<AppOpened />);

    expect(track).toHaveBeenCalledOnce();
  });
});
