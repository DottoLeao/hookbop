import { useMemo, useState } from 'react';
import { foldWord } from '@/lib/game/text';
import type { LyricLine } from '@/lib/types';
import { HELP_STATUSES, HelpError, type HelpStatus } from './helpError';
import type { HelpKind, HelpRequest } from './helpService';

/** Sends one ask to the server and gives back the help. Rejects with a HelpError. */
export type HelpRequester = (request: HelpRequest) => Promise<string>;

const KNOWN_STATUSES: ReadonlySet<number> = new Set<number>(HELP_STATUSES);

/**
 * `POST /api/help`. A redirect is not followed: it is how src/proxy.ts turns away a request with no session or from
 * someone who is not a member, and following it would read the sign-in page as the help. Any failure the route does not
 * name, and no answer at all, is a 503: the player may try again.
 */
export const postHelp: HelpRequester = async (request) => {
  let response: Response;
  try {
    response = await fetch('/api/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    throw new HelpError(503);
  }
  if (response.type === 'opaqueredirect') throw new HelpError(401);
  if (!response.ok) throw new HelpError(KNOWN_STATUSES.has(response.status) ? (response.status as HelpStatus) : 503);

  const body: unknown = await response.json().catch(() => null);
  const content = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).content : undefined;
  if (typeof content !== 'string' || content === '') throw new HelpError(503);
  return content;
};

export interface LineHelp {
  /** "Não entendi": `target` in the line, or the whole line for ''. */
  explain(lineIndex: number, target: string): Promise<string>;
  /** "Traduzir verso", and the translations of Karaokê. */
  translate(lineIndex: number): Promise<string>;
}

interface LineHelpOptions {
  youtubeId: string;
  /** The video's `lyricsRef`. A song without one cannot be helped with: every ask rejects with 400. */
  lyricsRef: string | undefined;
  /** The lines of the game. The offset moves their times only, so their indexes and texts are the stored ones. */
  lines: readonly LyricLine[];
  /** How an ask reaches the server. `postHelp` when left out; tests pass a fake. */
  request?: HelpRequester;
}

/**
 * The AI help for the lines of a song. Each help (line, kind and target, the target folded the way the server folds
 * it) is asked for once in the session: a second ask gets the same promise, even while the first is on its way. A
 * failure is forgotten, so asking again (the "Tentar de novo" of a 503) asks the server again.
 */
export function useLineHelp({ youtubeId, lyricsRef, lines, request = postHelp }: LineHelpOptions): LineHelp {
  // Kept for the life of the screen, whatever React does with memoized values.
  const [asked] = useState(() => new Map<string, Promise<string>>());

  return useMemo(() => {
    function ask(kind: HelpKind, lineIndex: number, target: string): Promise<string> {
      const key = JSON.stringify([youtubeId, lyricsRef, lineIndex, kind, foldWord(target.trim())]);
      const known = asked.get(key);
      if (known) return known;

      const line = lines[lineIndex];
      const pending =
        line && lyricsRef
          ? request({ youtubeId, lyricsRef, lineIndex, lineText: line.text, kind, target: target.trim() })
          : Promise.reject(new HelpError(400));
      asked.set(key, pending);
      pending.catch(() => {
        if (asked.get(key) === pending) asked.delete(key);
      });
      return pending;
    }

    return {
      explain: (lineIndex, target) => ask('explain', lineIndex, target),
      translate: (lineIndex) => ask('translate', lineIndex, ''),
    };
  }, [asked, youtubeId, lyricsRef, lines, request]);
}
