import { useEffect, useState } from 'react';
import type { PlayerAdapter } from './adapter';

/** The last reading, with the adapter it came from, so a reading is never shown for the wrong adapter. */
interface Reading {
  adapter: PlayerAdapter | null;
  timeMs: number;
}

/**
 * The player's current time in ms, read from the adapter every `intervalMs`.
 * It is 0 while there is no adapter. Polling stops when the component unmounts or the adapter changes.
 * It renders again only when the time actually moved, so a paused song costs nothing.
 */
export function usePlayerTime(adapter: PlayerAdapter | null, intervalMs = 100): number {
  const [reading, setReading] = useState<Reading>({ adapter: null, timeMs: 0 });

  useEffect(() => {
    if (!adapter) return;
    const read = () => {
      const timeMs = adapter.getCurrentTimeMs();
      setReading((prev) => (prev.adapter === adapter && prev.timeMs === timeMs ? prev : { adapter, timeMs }));
    };
    read();
    const id = setInterval(read, intervalMs);
    return () => clearInterval(id);
  }, [adapter, intervalMs]);

  return adapter !== null && reading.adapter === adapter ? reading.timeMs : 0;
}
