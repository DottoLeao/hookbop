import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterSW } from './RegisterSW';

function withServiceWorker(register: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
}

afterEach(() => {
  vi.unstubAllEnvs();
  // jsdom has no serviceWorker of its own, so removing ours puts it back as it was.
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('RegisterSW', () => {
  it('registers /sw.js for the whole site in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const register = vi.fn().mockResolvedValue({});
    withServiceWorker(register);

    render(<RegisterSW />);

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('does not register while developing or testing, when a cached page would hide the code being written', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const register = vi.fn().mockResolvedValue({});
    withServiceWorker(register);

    render(<RegisterSW />);

    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing in a browser without service workers', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => render(<RegisterSW />)).not.toThrow();
  });

  it('lets the app go on when the registration fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const failures: unknown[] = [];
    const onUnhandled = (reason: unknown) => failures.push(reason);
    process.on('unhandledRejection', onUnhandled);
    withServiceWorker(vi.fn().mockRejectedValue(new Error('SecurityError')));

    render(<RegisterSW />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', onUnhandled);
    expect(failures).toEqual([]);
  });
});
