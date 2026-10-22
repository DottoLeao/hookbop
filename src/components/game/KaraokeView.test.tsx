import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricLine } from '@/lib/types';
import { KaraokeView } from './KaraokeView';

// Invented lines, not lyrics. Six lines of four seconds each, the first one starting after a 2 s intro.
const LINES: LyricLine[] = [
  { index: 0, startMs: 2000, endMs: 6000, text: 'Paper boats on a river of light' },
  { index: 1, startMs: 6000, endMs: 10000, text: "We're counting the stars from the roof" },
  { index: 2, startMs: 10000, endMs: 14000, text: 'Hold the line till the morning comes' },
  { index: 3, startMs: 14000, endMs: 18000, text: "Don't you worry, I'm right here" },
  { index: 4, startMs: 18000, endMs: 22000, text: 'Dancing slow in the kitchen glow' },
  { index: 5, startMs: 22000, endMs: 26000, text: 'Sing it back to me once more' },
];

/** The same song with breaks in it: lines 0 and 1 are 2 s apart, and 8 s of music come before line 2. */
const GAPPED: LyricLine[] = [
  { index: 0, startMs: 2000, endMs: 6000, text: 'Paper boats on a river of light' },
  { index: 1, startMs: 8000, endMs: 12000, text: "We're counting the stars from the roof" },
  { index: 2, startMs: 20000, endMs: 24000, text: 'Hold the line till the morning comes' },
];

type Props = Parameters<typeof KaraokeView>[0];

const scrollTo = vi.fn();
const scrollIntoView = vi.fn();
let reducedMotion = false;

let props: Props;
let fetchTranslation: ReturnType<typeof vi.fn<(lineIndex: number) => Promise<string>>>;
let onExplain: ReturnType<typeof vi.fn<(target: string) => void>>;
let view: ReturnType<typeof render>;

/** The view on the song, at `timeMs`. Each line's translation is "Tradução <index>" unless `over` says otherwise. */
function renderKaraoke(timeMs: number, over: Partial<Props> = {}) {
  fetchTranslation = vi.fn(async (lineIndex: number) => `Tradução ${lineIndex}`);
  onExplain = vi.fn();
  props = { lines: LINES, timeMs, fetchTranslation, onExplain, ...over };
  view = render(<KaraokeView {...props} />);
}

/** The same view with other props, so it is the same component kept on screen. */
function update(over: Partial<Props>) {
  props = { ...props, ...over };
  view.rerender(<KaraokeView {...props} />);
}

/** Lets the answers of `fetchTranslation` come in. */
async function settle() {
  await act(async () => {});
}

function lineList() {
  return screen.getByRole('list', { name: 'Letra' });
}

function currentLines() {
  return [...lineList().querySelectorAll('[aria-current="true"]')];
}

function rows() {
  return within(lineList()).getAllByRole('listitem');
}

function askedFor() {
  return fetchTranslation.mock.calls.map(([lineIndex]) => lineIndex);
}

/** The pieces of the page jsdom does not have, which the view reaches for to follow the song. */
beforeEach(() => {
  reducedMotion = false;
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, writable: true, value: scrollTo });
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reducedMotion && query === '(prefers-reduced-motion: reduce)' })),
  );
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, 'scrollTo');
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('KaraokeView', () => {
  it('shows every line in a list, and marks only the line playing as current: lime, with dark text', () => {
    renderKaraoke(15000);

    expect(rows()).toHaveLength(6);
    const current = currentLines();
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(rows()[3]);
    expect(current[0]).toHaveClass('bg-lime', 'text-bg');
    expect(current[0]).toHaveTextContent("Don't you worry, I'm right here");
    for (const other of rows().filter((row) => row !== current[0])) {
      expect(other).not.toHaveClass('bg-lime');
    }
  });

  it('writes the current line in Space Grotesk, and the others smaller', () => {
    renderKaraoke(15000);

    const english = (row: HTMLElement) => row.querySelector('[lang="en"]');
    expect(english(rows()[3])).toHaveClass('font-heading', 'text-verse', 'font-bold');
    expect(english(rows()[2])).toHaveClass('text-lyric');
    expect(english(rows()[2])).not.toHaveClass('font-heading');
  });

  it('moves the current line along with the clock', () => {
    renderKaraoke(15000);

    update({ timeMs: 18500 });

    expect(currentLines()).toEqual([rows()[4]]);
  });

  it('puts the translation of a line under it, in Portuguese, with the English line marked as English', async () => {
    renderKaraoke(15000);
    await settle();

    const row = rows()[3];
    const english = row.querySelector('[lang="en"]');
    const portuguese = row.querySelector('[lang="pt-BR"]');
    expect(english).toHaveTextContent("Don't you worry, I'm right here");
    expect(portuguese).toHaveTextContent('Tradução 3');
    expect(english!.compareDocumentPosition(portuguese!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The next line has its translation too, and a line nobody asked for has none.
    expect(rows()[4].querySelector('[lang="pt-BR"]')).toHaveTextContent('Tradução 4');
    expect(rows()[1].querySelector('[lang="pt-BR"]')).toBeNull();
  });

  it('keeps the translations of the lines that went by under them', async () => {
    renderKaraoke(15000);
    await settle();

    update({ timeMs: 19000 });
    await settle();

    expect(rows()[3].querySelector('[lang="pt-BR"]')).toHaveTextContent('Tradução 3');
    expect(rows()[4].querySelector('[lang="pt-BR"]')).toHaveTextContent('Tradução 4');
    expect(rows()[5].querySelector('[lang="pt-BR"]')).toHaveTextContent('Tradução 5');
  });

  describe('which translations it asks for', () => {
    it('asks for the current line and the next one, and for each of them only once', async () => {
      renderKaraoke(15000);
      await settle();
      expect(askedFor()).toEqual([3, 4]);

      // Later in the same line, and the same line again after a render: nothing new to ask.
      update({ timeMs: 16000 });
      update({ timeMs: 17900 });
      await settle();
      expect(askedFor()).toEqual([3, 4]);

      // The next line starts: its translation is already there, so only the one after it is asked for.
      update({ timeMs: 18100 });
      await settle();
      expect(askedFor()).toEqual([3, 4, 5]);
    });

    it('does not ask again for a line the song comes back to (Repetir verso)', async () => {
      renderKaraoke(15000);
      update({ timeMs: 19000 });
      await settle();
      expect(askedFor()).toEqual([3, 4, 5]);

      update({ timeMs: 14000 });
      update({ timeMs: 15000 });
      await settle();

      expect(askedFor()).toEqual([3, 4, 5]);
    });

    it('asks only for the first line while the song is still in its intro', async () => {
      renderKaraoke(500);
      await settle();

      expect(currentLines()).toEqual([]);
      expect(askedFor()).toEqual([0]);
      expect(rows()[0].querySelector('[lang="pt-BR"]')).toHaveTextContent('Tradução 0');
    });

    it('asks only for the last line when it is the current one, as there is no line after it', async () => {
      renderKaraoke(23000);
      await settle();

      expect(askedFor()).toEqual([5]);
    });

    it('treats a break between two lines as the last line that started still playing: it stays current', async () => {
      renderKaraoke(7000, { lines: GAPPED });
      await settle();
      expect(askedFor()).toEqual([0, 1]);

      // 12 s to 20 s is music with no words: line 1 is still the current one, and line 2 the next.
      update({ timeMs: 15000 });
      await settle();

      expect(currentLines()).toEqual([rows()[1]]);
      expect(askedFor()).toEqual([0, 1, 2]);
    });

    it('keeps the last line current when the song is past it', () => {
      renderKaraoke(30000);

      expect(currentLines()).toEqual([rows()[5]]);
    });

    it('asks for nothing when there are no lines', async () => {
      renderKaraoke(5000, { lines: [] });
      await settle();

      expect(askedFor()).toEqual([]);
      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });
  });

  describe('hiding the translations', () => {
    it('shows no translation while they are hidden, and brings them back when they are shown', async () => {
      renderKaraoke(15000);
      await settle();
      expect(screen.getByText('Tradução 3')).toBeInTheDocument();

      update({ showTranslations: false });
      expect(screen.queryByText('Tradução 3')).not.toBeInTheDocument();
      expect(screen.queryByText('Tradução 4')).not.toBeInTheDocument();
      expect(lineList().querySelector('[lang="pt-BR"]')).toBeNull();

      update({ showTranslations: true });
      expect(screen.getByText('Tradução 3')).toBeInTheDocument();
      expect(screen.getByText('Tradução 4')).toBeInTheDocument();
    });

    it('asks for nothing while they are hidden, whatever line the song reaches', async () => {
      renderKaraoke(15000, { showTranslations: false });
      update({ timeMs: 19000 });
      await settle();

      expect(askedFor()).toEqual([]);
    });

    it('asks for the current and next lines once they are shown, and once per line for the whole session', async () => {
      renderKaraoke(15000);
      await settle();
      expect(askedFor()).toEqual([3, 4]);

      update({ showTranslations: false });
      update({ timeMs: 19000 });
      await settle();
      expect(askedFor()).toEqual([3, 4]);

      // Shown again on line 4: the next one, line 5, was never asked for.
      update({ showTranslations: true });
      await settle();
      expect(askedFor()).toEqual([3, 4, 5]);

      update({ showTranslations: false });
      update({ showTranslations: true });
      await settle();
      expect(askedFor()).toEqual([3, 4, 5]);
      expect(screen.getByText('Tradução 4')).toBeInTheDocument();
    });

    it('shows a translation that came in while the others were hidden, once they are shown', async () => {
      let answer: (text: string) => void = () => {};
      renderKaraoke(15000, {
        fetchTranslation: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              answer = resolve;
            }),
        ),
      });
      update({ showTranslations: false });

      await act(async () => answer('Já chegou'));
      expect(screen.queryByText('Já chegou')).not.toBeInTheDocument();

      update({ showTranslations: true });
      expect(screen.getByText('Já chegou')).toBeInTheDocument();
    });
  });

  describe('a translation that cannot be had (the service is down or does not exist yet)', () => {
    it('shows nothing under the line, no error, and never asks for it again', async () => {
      renderKaraoke(15000, { fetchTranslation: vi.fn().mockRejectedValue(new Error('offline')) });
      await settle();

      const failing = props.fetchTranslation as ReturnType<typeof vi.fn>;
      expect(failing.mock.calls.map(([lineIndex]) => lineIndex)).toEqual([3, 4]);
      expect(lineList().querySelector('[lang="pt-BR"]')).toBeNull();
      expect(rows()[3]).toHaveTextContent("Don't you worry, I'm right here");
      expect(rows()[3].textContent).toBe("Don't you worry, I'm right here");
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/erro|falha|offline|tentar/i);

      // Not on later renders, and not when the translations are hidden and shown again.
      update({ timeMs: 16000 });
      update({ showTranslations: false });
      update({ showTranslations: true });
      await settle();
      expect(failing).toHaveBeenCalledTimes(2);
    });

    it('still shows the translations of the other lines', async () => {
      renderKaraoke(15000, {
        fetchTranslation: vi.fn(async (lineIndex: number) => {
          if (lineIndex === 3) throw new Error('offline');
          return `Tradução ${lineIndex}`;
        }),
      });
      await settle();

      expect(rows()[3].querySelector('[lang="pt-BR"]')).toBeNull();
      expect(rows()[4].querySelector('[lang="pt-BR"]')).toHaveTextContent('Tradução 4');
    });
  });

  describe('tapping a word', () => {
    it('asks to explain the word, for a word of the current line', () => {
      renderKaraoke(15000);

      fireEvent.click(within(rows()[3]).getByRole('button', { name: 'worry' }));

      expect(onExplain).toHaveBeenCalledExactlyOnceWith('worry');
    });

    it('gives a word with an apostrophe whole', () => {
      renderKaraoke(15000);

      fireEvent.click(within(rows()[3]).getByRole('button', { name: "I'm" }));

      expect(onExplain).toHaveBeenCalledExactlyOnceWith("I'm");
    });

    it('makes every word of the current line a button, in order, and leaves out the punctuation', () => {
      renderKaraoke(15000);

      const words = within(rows()[3])
        .getAllByRole('button')
        .map((button) => button.textContent);

      expect(words).toEqual(["Don't", 'you', 'worry', "I'm", 'right', 'here']);
    });

    it('leaves the words of the other lines as plain text', () => {
      renderKaraoke(15000);

      expect(screen.getAllByRole('button')).toHaveLength(6);
      for (const index of [0, 1, 2, 4, 5]) expect(within(rows()[index]).queryAllByRole('button')).toHaveLength(0);
    });

    it('gives no word to tap before the first line starts', () => {
      renderKaraoke(500);

      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('keeps every word at least 44 px tall, with a focus ring that shows on lime', () => {
      renderKaraoke(15000);

      for (const button of screen.getAllByRole('button')) {
        expect(button).toHaveClass('min-h-11', 'focus-visible:outline-bg');
        expect(button).not.toHaveClass('focus-visible:outline-lime');
      }
    });
  });

  it('shows no combo and no points', async () => {
    renderKaraoke(15000);
    await settle();

    expect(document.body.textContent).not.toMatch(/combo|ponto|xp|x\d/i);
  });
});

describe('KaraokeView: following the song', () => {
  /** The list is 300 px tall and starts at y 100 of the page, scrolled by 50. The current line is 60 px tall, at y 400. */
  function layOut() {
    const rect = (top: number, height: number) => ({ top, height, bottom: top + height }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.getAttribute('aria-label') === 'Letra') return rect(100, 300);
      if (this.getAttribute('aria-current') === 'true') return rect(400, 60);
      return rect(0, 0);
    });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(300);
    vi.spyOn(Element.prototype, 'scrollTop', 'get').mockReturnValue(50);
  }

  it('centers the current line in the list: the list scrolls and nothing else does', () => {
    layOut();
    renderKaraoke(15000);

    // 50 (scrolled) + 300 (the line is 300 px under the top of the list) - 120 (half of the room left around it).
    expect(scrollTo.mock.instances[0]).toBe(lineList());
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 230, behavior: 'smooth' });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls without animation when the player prefers reduced motion', () => {
    reducedMotion = true;
    renderKaraoke(15000);

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('scrolls once for each new current line, and not while the same line goes on', () => {
    renderKaraoke(15000);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    update({ timeMs: 16000 });
    update({ timeMs: 17900 });
    expect(scrollTo).toHaveBeenCalledTimes(1);

    update({ timeMs: 18100 });
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('scrolls back when the song goes back to an earlier line', () => {
    renderKaraoke(19000);
    scrollTo.mockClear();

    update({ timeMs: 14500 });

    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('does not scroll before the first line starts', () => {
    renderKaraoke(500);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('centers the line again when the translations are hidden or shown, as every line changes its height', async () => {
    renderKaraoke(15000);
    await settle();
    scrollTo.mockClear();

    update({ showTranslations: false });
    expect(scrollTo).toHaveBeenCalledTimes(1);

    update({ showTranslations: true });
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('centers the line again when it is shown after being hidden, as hiding a list loses its scroll', () => {
    renderKaraoke(15000);
    scrollTo.mockClear();

    update({ visible: false });
    expect(scrollTo).not.toHaveBeenCalled();

    update({ visible: true });
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('can be reached with the keyboard, to scroll the lyrics', () => {
    renderKaraoke(15000);

    expect(lineList()).toHaveAttribute('tabindex', '0');
  });
});
