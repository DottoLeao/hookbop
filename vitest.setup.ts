import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// No test sends a usage event: the client of the events route (src/lib/metrics/track.ts) is a stand-in everywhere, so
// no screen under test starts a timer or reaches for `fetch` on its own. The tests that look at what a screen tracks
// read this mock; the client's own test file takes it away (`vi.unmock`) and loads the real one.
vi.mock('@/lib/metrics/track', () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
});
