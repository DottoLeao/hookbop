import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterSW } from './RegisterSW';

interface FakeServiceWorkers {
  register?: () => Promise<unknown>;
  getRegistrations?: () => Promise<{ unregister: () => Promise<boolean> }[]>;
}

function withServiceWorker(container: FakeServiceWorkers) {
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
}

/** Lets the promises the component started settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllEnvs();
  // jsdom has no serviceWorker of its own, so removing ours puts it back as it was.
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('RegisterSW', () => {
  it('registers /sw.js for the whole site in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const register = vi.fn().mockResolvedValue({});
    withServiceWorker({ register, getRegistrations: vi.fn().mockResolvedValue([]) });

    render(<RegisterSW />);

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('does not register while developing or testing, when a cached page would hide the code being written', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const register = vi.fn().mockResolvedValue({});
    withServiceWorker({ register, getRegistrations: vi.fn().mockResolvedValue([]) });

    render(<RegisterSW />);

    expect(register).not.toHaveBeenCalled();
  });

  it('outside production, takes away a worker an earlier production run left on this origin', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const left = [{ unregister: vi.fn().mockResolvedValue(true) }, { unregister: vi.fn().mockResolvedValue(true) }];
    const register = vi.fn();
    withServiceWorker({ register, getRegistrations: vi.fn().mockResolvedValue(left) });

    render(<RegisterSW />);
    await settle();

    for (const registration of left) expect(registration.unregister).toHaveBeenCalledOnce();
    expect(register).not.toHaveBeenCalled();
  });

  it('never takes a worker away in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister: vi.fn() }]);
    withServiceWorker({ register: vi.fn().mockResolvedValue({}), getRegistrations });

    render(<RegisterSW />);
    await settle();

    expect(getRegistrations).not.toHaveBeenCalled();
  });

  it('lets the app go on when the workers cannot be listed or taken away', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const failures: unknown[] = [];
    const onUnhandled = (reason: unknown) => failures.push(reason);
    process.on('unhandledRejection', onUnhandled);
    withServiceWorker({ getRegistrations: vi.fn().mockRejectedValue(new Error('SecurityError')) });
    render(<RegisterSW />);
    await settle();
    withServiceWorker({
      getRegistrations: vi.fn().mockResolvedValue([{ unregister: vi.fn().mockRejectedValue(new Error('gone')) }]),
    });
    render(<RegisterSW />);
    await settle();

    process.off('unhandledRejection', onUnhandled);
    expect(failures).toEqual([]);
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
    withServiceWorker({ register: vi.fn().mockRejectedValue(new Error('SecurityError')) });

    render(<RegisterSW />);
    await settle();

    process.off('unhandledRejection', onUnhandled);
    expect(failures).toEqual([]);
  });
});
