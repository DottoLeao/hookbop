import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '@/lib/game/blanks';
import { makeTiles, tileSeed } from '@/lib/game/tiles';
import type { Blank } from '@/lib/types';
import { animations, animationsOf, changedBy, preferReducedMotion } from './answerFeedbackTesting';
import { MontarArea } from './MontarArea';

// jsdom plays no animation, so GSAP is only watched: what the area asks it to animate, and how.
vi.mock('gsap');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const ID = 'dQw4w9WgXcQ';
// An invented line, not a lyric.
const TOKENS = tokenize('Please come back home tonight');
const BLANK: Blank = { id: '0:-1', lineIndex: 0, tokenIndex: -1, answer: TOKENS.join(' ') };

type Props = Parameters<typeof MontarArea>[0];

function areaProps(over: Partial<Props> = {}) {
  const onTile = vi.fn<(word: string) => void>();
  const onExplain = vi.fn<(target: string, lineIndex: number, opener: HTMLElement) => void>();
  const props: Props = { blank: BLANK, tokens: TOKENS, placed: [], youtubeId: ID, onTile, onExplain, ...over };
  return { props, onTile, onExplain };
}

function renderArea(over: Partial<Props> = {}) {
  const { props, onTile, onExplain } = areaProps(over);
  const view = render(<MontarArea {...props} />);
  return { onTile, onExplain, props, ...view };
}

/** The tiles, in the order they are shown. */
function tiles() {
  return within(screen.getByRole('group', { name: 'Coloque as palavras na ordem' })).getAllByRole('button');
}

function tile(name: string) {
  return within(screen.getByRole('group', { name: 'Coloque as palavras na ordem' })).getByRole('button', { name });
}

/** A tile that takes no tap: `aria-disabled`, and never `disabled`, which would take the focus away. */
function isBlocked(button: HTMLElement) {
  expect(button).not.toHaveAttribute('disabled');
  return button.getAttribute('aria-disabled') === 'true';
}

/** The row of words placed so far (the empty slots are not words, and are hidden from screen readers). */
function row() {
  return screen.getByTestId('montar-row');
}

function placedWords() {
  return within(row())
    .queryAllByRole('listitem')
    .map((item) => item.textContent);
}

function emptySlots() {
  return row().querySelectorAll('[data-testid="montar-slot"]');
}

/** What a sighted player can read: the page's text without what is only there for screen readers. */
function visibleText() {
  const copy = document.body.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove());
  return copy.textContent;
}

describe('MontarArea', () => {
  it('shows the words of the line as shuffled tiles, one per word, in the order the song seed gives', () => {
    renderArea();

    const shown = tiles().map((button) => button.textContent);
    expect(shown).toEqual(makeTiles(TOKENS, tileSeed(ID, BLANK.lineIndex)));
    expect([...shown].sort()).toEqual([...TOKENS].sort());
    expect(shown).not.toEqual(TOKENS);
    for (const button of tiles()) expect(isBlocked(button)).toBe(false);
  });

  it('shows an empty slot for each word of the line before anything is placed', () => {
    renderArea();

    expect(placedWords()).toEqual([]);
    expect(emptySlots()).toHaveLength(TOKENS.length);
    expect(emptySlots()[0]).toHaveClass('border-dashed');
  });

  it('holds the room of the finished line from the start, unseen, so the tiles never move as words are placed', () => {
    const { rerender, props } = renderArea();
    const reserved = () => row().querySelector('[aria-hidden="true"].invisible');

    expect(reserved()).toHaveTextContent(TOKENS.join(''));
    rerender(<MontarArea {...props} placed={['Please', 'come']} />);
    expect(reserved()).toHaveTextContent(TOKENS.join(''));
    // It is not part of what a screen reader or a query for the placed words sees, and nothing in it can be focused.
    expect(placedWords()).toEqual(['Please', 'come']);
    expect(reserved()?.querySelector('button, a, input, [tabindex]')).toBeNull();
  });

  it('hands the tapped word to onTile', () => {
    const { onTile } = renderArea();

    fireEvent.click(tile('Please'));

    expect(onTile).toHaveBeenCalledExactlyOnceWith('Please');
  });

  it('puts a placed word in the lime row, followed by empty slots, and its tile is aria-disabled, dashed and faint', () => {
    renderArea({ placed: ['Please', 'come'] });

    expect(placedWords()).toEqual(['Please', 'come']);
    for (const chip of within(row()).getAllByRole('listitem')) expect(chip).toHaveClass('bg-lime', 'text-bg');
    expect(emptySlots()).toHaveLength(TOKENS.length - 2);
    for (const word of ['Please', 'come']) {
      expect(isBlocked(tile(word))).toBe(true);
      expect(tile(word)).toHaveClass('border-dashed', 'border-faint', 'text-faint');
    }
    expect(isBlocked(tile('back'))).toBe(false);
    expect(tile('back')).not.toHaveClass('border-dashed');
    // The check belongs to a solved line only.
    expect(row().querySelector('[data-icon]')).toBeNull();
  });

  it('takes no tap on a tile that is placed', () => {
    const { onTile } = renderArea({ placed: ['Please'] });

    fireEvent.click(tile('Please'));

    expect(onTile).not.toHaveBeenCalled();
  });

  it('keeps the focus on the tile that was tapped, also once it is placed (ruling R58)', () => {
    const { rerender, props, onTile } = renderArea();
    const tapped = tile('Please');
    tapped.focus();
    expect(tapped).toHaveFocus();

    fireEvent.click(tapped);
    expect(onTile).toHaveBeenCalledExactlyOnceWith('Please');
    rerender(<MontarArea {...props} placed={['Please']} />);

    // The same button, still focused, and no longer to be tapped.
    expect(tile('Please')).toBe(tapped);
    expect(tapped).toHaveFocus();
    expect(isBlocked(tapped)).toBe(true);
  });

  it('keeps the focus on the last tile too when the line is right', () => {
    const { rerender, props } = renderArea({ placed: TOKENS.slice(0, -1) });
    const last = tile('tonight');
    last.focus();

    rerender(<MontarArea {...props} placed={TOKENS} solved />);

    expect(tile('tonight')).toHaveFocus();
    expect(isBlocked(tile('tonight'))).toBe(true);
  });

  it('turns a wrong tile red with a cross, with the result only in its accessible name, until the next tap', () => {
    const { onTile } = renderArea();

    fireEvent.click(tile('tonight'));

    expect(onTile).toHaveBeenCalledExactlyOnceWith('tonight');
    const miss = tile('tonight, errou');
    expect(miss).toHaveClass('bg-error');
    expect(miss.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(isBlocked(miss)).toBe(false);
    expect(visibleText()).not.toMatch(/acertou|errou/i);

    // The next tap, on any tile, takes the red away.
    fireEvent.click(tile('Please'));
    expect(screen.queryByRole('button', { name: 'tonight, errou' })).not.toBeInTheDocument();
    expect(tile('tonight')).not.toHaveClass('bg-error');
    expect(onTile).toHaveBeenLastCalledWith('Please');
  });

  it('keeps a wrong tile as wide as it was: its weight does not change, and it takes no more room for the cross', () => {
    renderArea();
    const before = tile('tonight').className;

    fireEvent.click(tile('tonight'));

    const miss = tile('tonight, errou');
    expect(miss).toHaveClass('font-semibold');
    expect(miss).not.toHaveClass('font-bold');
    // The cross sits in the padding: 24 + 8 = 16 + 16, the padding of a tile that is not red.
    expect(before).toContain('px-4');
    expect(miss).toHaveClass('pl-6', 'pr-2');
    expect(miss.querySelector('[data-icon="cross"]')?.parentElement).toHaveClass('absolute');
  });

  it('takes the red off the wrong tile when a hint fills the row again, as the next tap does', () => {
    const { rerender, props } = renderArea();
    fireEvent.click(tile('tonight'));
    expect(tile('tonight, errou')).toHaveClass('bg-error');

    // The hint places the next word, "Please".
    rerender(<MontarArea {...props} placed={['Please']} />);

    expect(screen.queryByRole('button', { name: /errou/ })).not.toBeInTheDocument();
    expect(tile('tonight')).not.toHaveClass('bg-error');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('does not turn a right tile red', () => {
    renderArea({ placed: ['Please'] });

    fireEvent.click(tile('come'));

    expect(screen.queryByRole('button', { name: /errou/ })).not.toBeInTheDocument();
    expect(tile('come')).not.toHaveClass('bg-error');
  });

  it('turns a wrong tile red again when it is tapped again, since the row starts over', () => {
    const { onTile } = renderArea();

    fireEvent.click(tile('tonight'));
    fireEvent.click(tile('tonight, errou'));

    expect(onTile).toHaveBeenCalledTimes(2);
    expect(tile('tonight, errou')).toHaveClass('bg-error');
  });

  it('shows a solved line: the row is lime with a check, every tile is aria-disabled, and nothing can be placed', () => {
    const { onTile } = renderArea({ placed: TOKENS, solved: true });

    expect(placedWords()).toEqual(TOKENS);
    expect(emptySlots()).toHaveLength(0);
    expect(row()).toHaveClass('border-lime');
    expect(row().querySelector('[data-icon="check"]')).not.toBeNull();
    expect(row()).toHaveAccessibleName('Please come back home tonight, acertou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);
    for (const button of tiles()) {
      expect(isBlocked(button)).toBe(true);
      fireEvent.click(button);
    }
    expect(onTile).not.toHaveBeenCalled();
  });

  it('says the result to screen readers in a status line that is never seen, and says nothing before a result', () => {
    const { rerender, props } = renderArea();
    const status = screen.getByRole('status');
    expect(status).toHaveClass('sr-only');
    expect(status).toBeEmptyDOMElement();

    fireEvent.click(tile('tonight'));
    expect(status).toHaveTextContent('tonight, errou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);

    rerender(<MontarArea {...props} placed={TOKENS} solved />);
    expect(status).toHaveTextContent('Please come back home tonight, acertou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);
  });

  it('keeps the same picture when it is shown again from the same placed words', () => {
    const { rerender, props, unmount } = renderArea({ tokens: ['come', 'baby', 'baby', 'back'], placed: [] });
    rerender(<MontarArea {...props} placed={['baby']} />);
    const picture = () => tiles().map((button) => [button.textContent, button.getAttribute('aria-disabled')]);
    const before = picture();
    unmount();

    renderArea({ tokens: ['come', 'baby', 'baby', 'back'], placed: ['baby'] });

    expect(picture()).toEqual(before);
  });

  it('"Não entendi a ordem" asks for an explanation of the whole line, with no word and the index of the line', () => {
    const { onExplain } = renderArea({ answered: true, blank: { ...BLANK, lineIndex: 4 } });

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi a ordem' }));

    expect(onExplain).toHaveBeenCalledExactlyOnceWith('', 4, expect.any(HTMLButtonElement));
  });

  it('keeps "Não entendi a ordem" away until the line has an answer, as it would give the order away (ruling R65)', () => {
    const { rerender, props, onExplain } = renderArea({ placed: ['Please'] });
    expect(screen.queryByRole('button', { name: 'Não entendi a ordem' })).not.toBeInTheDocument();
    // Its place is kept, unseen and out of reach, so nothing under it moves when it comes.
    const reserved = screen.getByText('Não entendi a ordem');
    expect(reserved).toHaveClass('invisible', 'min-h-11');
    expect(reserved).toHaveAttribute('aria-hidden', 'true');
    expect(reserved).toBeDisabled();
    fireEvent.click(reserved);
    expect(onExplain).not.toHaveBeenCalled();

    // A miss is an answer: the first try is spent, so explaining the order gives nothing away.
    rerender(<MontarArea {...props} placed={[]} answered />);
    expect(screen.getByRole('button', { name: 'Não entendi a ordem' })).not.toHaveClass('invisible');
    // The same button: the focus is never lost to a new one.
    expect(screen.getByRole('button', { name: 'Não entendi a ordem' })).toBe(reserved);

    rerender(<MontarArea {...props} placed={TOKENS} solved answered />);
    expect(screen.getByRole('button', { name: 'Não entendi a ordem' })).toBeInTheDocument();
  });

  describe('a line that is right', () => {
    it('lets every word of the row be tapped, to explain it with the index of the line', () => {
      const { onExplain } = renderArea({ placed: TOKENS, solved: true, answered: true, blank: { ...BLANK, lineIndex: 4 } });

      const words = within(row()).getAllByRole('button');
      expect(words.map((word) => word.textContent)).toEqual(TOKENS);
      fireEvent.click(words[2]);

      expect(onExplain).toHaveBeenCalledExactlyOnceWith('back', 4, words[2]);
    });

    it('keeps the row’s words lime chips of the same size, each reaching 44 px with its touch area', () => {
      renderArea({ placed: TOKENS, solved: true, answered: true });

      for (const word of within(row()).getAllByRole('button')) {
        expect(word).toHaveClass('h-10', 'bg-lime', 'text-bg', 'before:-inset-y-0.5');
      }
    });

    it('gives no word of the row to tap while the line is still being built', () => {
      renderArea({ placed: ['Please', 'come'] });

      expect(within(row()).queryAllByRole('button')).toHaveLength(0);
    });
  });

  it('keeps every tile and "Não entendi a ordem" at least 44 px tall, and every tile 44 px wide', () => {
    renderArea({ placed: ['Please'], answered: true });

    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11');
    for (const button of tiles()) expect(button).toHaveClass('min-w-11');
  });

  it('gives a one-letter word a tile as wide as a touch target', () => {
    renderArea({ tokens: ['I', 'love', 'you'] });

    expect(tile('I')).toHaveClass('min-w-11');
  });
});

describe('MontarArea: the feedback of an answer', () => {
  it('shakes a wrong tile, changing only its x, as its cross comes, and no other tile', () => {
    renderArea();
    expect(animations()).toHaveLength(0);

    fireEvent.click(tile('tonight'));

    const [shake, ...more] = animationsOf(tile('tonight, errou'));
    expect(more).toHaveLength(0);
    expect(changedBy(shake)).toEqual(['x']);
    expect(shake.to.duration).toBeLessThanOrEqual(0.3);
    expect(animations()).toHaveLength(1);
  });

  it('shakes the same wrong tile again when it is tapped again, since the row starts over', () => {
    renderArea();

    fireEvent.click(tile('tonight'));
    fireEvent.click(tile('tonight, errou'));

    expect(animationsOf(tile('tonight, errou')).map(changedBy)).toEqual([['x'], ['x']]);
  });

  it('shakes another wrong tile too, and not the one that was red before', () => {
    renderArea();

    fireEvent.click(tile('tonight'));
    fireEvent.click(tile('home'));

    expect(animationsOf(tile('home, errou'))).toHaveLength(1);
    expect(animationsOf(tile('tonight'))).toHaveLength(1);
    expect(animations()).toHaveLength(2);
  });

  it('animates nothing for a right tap that does not finish the line', () => {
    renderArea();

    fireEvent.click(tile('Please'));

    expect(animations()).toHaveLength(0);
  });

  it('pops the row, changing only its scale, when the last word makes the line right', () => {
    const { rerender, props } = renderArea({ placed: TOKENS.slice(0, -1) });
    expect(animations()).toHaveLength(0);

    rerender(<MontarArea {...props} placed={TOKENS} solved />);

    const [pop, ...more] = animationsOf(row());
    expect(more).toHaveLength(0);
    expect(changedBy(pop)).toEqual(['scale']);
    expect(pop.to.scale).toBeGreaterThan(1);
    expect(pop.to.duration).toBeLessThanOrEqual(0.3);
    expect(animations()).toHaveLength(1);
  });

  it('animates nothing for a line that is already right when the area is drawn', () => {
    renderArea({ placed: TOKENS, solved: true });

    expect(animations()).toHaveLength(0);
  });

  it('does not shake when a hint fills the row and takes the red away', () => {
    const { rerender, props } = renderArea();
    fireEvent.click(tile('tonight'));

    rerender(<MontarArea {...props} placed={['Please']} />);

    expect(animations()).toHaveLength(1);
  });

  it('only fades, for a wrong tile and for a right line, when motion is reduced', () => {
    preferReducedMotion(true);
    const { rerender, props } = renderArea();

    fireEvent.click(tile('tonight'));
    rerender(<MontarArea {...props} placed={TOKENS} solved />);

    expect(animations()).toHaveLength(2);
    for (const animation of animations()) expect(changedBy(animation)).toEqual(['opacity']);
  });

  it('keeps the focus on the tile that was tapped, and its name, aria and text as they were', () => {
    renderArea();
    const tapped = tile('tonight');
    tapped.focus();

    fireEvent.click(tapped);

    expect(tile('tonight, errou')).toBe(tapped);
    expect(tapped).toHaveFocus();
    expect(tapped).not.toHaveAttribute('aria-disabled');
    expect(tapped).toHaveTextContent('tonight');
    expect(screen.getByRole('status')).toHaveTextContent('tonight, errou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);
  });

  it('never holds back a new try: the next tile is taken while the shake runs', () => {
    const { onTile } = renderArea();

    fireEvent.click(tile('tonight'));
    fireEvent.click(tile('Please'));

    expect(onTile.mock.calls).toEqual([['tonight'], ['Please']]);
  });
});

describe('MontarArea: a word that is on the line twice', () => {
  const REPEATED = ['come', 'baby', 'baby', 'back'];
  const babies = () => tiles().filter((button) => button.textContent === 'baby');

  it('shows one tile for each time the word is sung', () => {
    renderArea({ tokens: REPEATED });

    expect(tiles()).toHaveLength(4);
    expect(babies()).toHaveLength(2);
  });

  it('blocks exactly one of the two tiles when one is placed, and both when both are', () => {
    const { rerender, props } = renderArea({ tokens: REPEATED });

    rerender(<MontarArea {...props} placed={['baby']} />);
    expect(babies().filter(isBlocked)).toHaveLength(1);
    expect(babies().filter((button) => !isBlocked(button))).toHaveLength(1);

    rerender(<MontarArea {...props} placed={['baby', 'baby']} />);
    expect(babies().every(isBlocked)).toBe(true);
    expect(isBlocked(tile('come'))).toBe(false);
  });

  it('takes the tile spelled the same first, whatever order the tiles are in', () => {
    const { rerender, props } = renderArea({ tokens: ['Baby', 'baby', 'come', 'back'] });
    const blockedWords = () => tiles().filter(isBlocked).map((button) => button.textContent);

    rerender(<MontarArea {...props} placed={['Baby']} />);
    expect(blockedWords()).toEqual(['Baby']);

    rerender(<MontarArea {...props} placed={['baby']} />);
    expect(blockedWords()).toEqual(['baby']);

    rerender(<MontarArea {...props} placed={['Baby', 'baby']} />);
    expect(blockedWords().sort()).toEqual(['Baby', 'baby']);
    rerender(<MontarArea {...props} placed={['baby', 'Baby']} />);
    expect(blockedWords().sort()).toEqual(['Baby', 'baby']);
  });

  it('falls back to a tile that differs in capitals alone when none is spelled the same', () => {
    const { rerender, props } = renderArea({ tokens: ['Baby', 'come', 'back'] });

    // The game takes "baby" for the next word "Baby", and puts the line's own spelling in the row.
    rerender(<MontarArea {...props} placed={['baby']} />);

    expect(tiles().filter(isBlocked).map((button) => button.textContent)).toEqual(['Baby']);
  });
});
