import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { tokenize } from '@/lib/game/blanks';
import { makeTiles, tileSeed } from '@/lib/game/tiles';
import type { Blank } from '@/lib/types';
import { MontarArea } from './MontarArea';

const ID = 'dQw4w9WgXcQ';
// An invented line, not a lyric.
const TOKENS = tokenize('Please come back home tonight');
const BLANK: Blank = { id: '0:-1', lineIndex: 0, tokenIndex: -1, answer: TOKENS.join(' ') };

type Props = Parameters<typeof MontarArea>[0];

function areaProps(over: Partial<Props> = {}) {
  const onTile = vi.fn<(word: string) => void>();
  const onExplain = vi.fn<(target: string) => void>();
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

describe('MontarArea', () => {
  it('shows the words of the line as shuffled tiles, one per word, in the order the song seed gives', () => {
    renderArea();

    const shown = tiles().map((button) => button.textContent);
    expect(shown).toEqual(makeTiles(TOKENS, tileSeed(ID, BLANK.lineIndex)));
    expect([...shown].sort()).toEqual([...TOKENS].sort());
    expect(shown).not.toEqual(TOKENS);
    for (const button of tiles()) expect(button).toBeEnabled();
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
    // It is not part of what a screen reader or a query for the placed words sees.
    expect(placedWords()).toEqual(['Please', 'come']);
  });

  it('hands the tapped word to onTile', () => {
    const { onTile } = renderArea();

    fireEvent.click(tile('Please'));

    expect(onTile).toHaveBeenCalledExactlyOnceWith('Please');
  });

  it('puts a placed word in the lime row, followed by empty slots, and its tile is disabled, dashed and faint', () => {
    renderArea({ placed: ['Please', 'come'] });

    expect(placedWords()).toEqual(['Please', 'come']);
    for (const chip of within(row()).getAllByRole('listitem')) expect(chip).toHaveClass('bg-lime', 'text-bg');
    expect(emptySlots()).toHaveLength(TOKENS.length - 2);
    for (const word of ['Please', 'come']) {
      expect(tile(word)).toBeDisabled();
      expect(tile(word)).toHaveClass('border-dashed', 'border-faint', 'text-faint');
    }
    expect(tile('back')).toBeEnabled();
    expect(tile('back')).not.toHaveClass('border-dashed');
    // The check belongs to a solved line only.
    expect(row().querySelector('[data-icon]')).toBeNull();
  });

  it('turns a wrong tile red with a cross, with the result only in its accessible name, until the next tap', () => {
    const { onTile } = renderArea();

    fireEvent.click(tile('tonight'));

    expect(onTile).toHaveBeenCalledExactlyOnceWith('tonight');
    const miss = tile('tonight, errou');
    expect(miss).toHaveClass('bg-error');
    expect(miss.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(miss).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/acertou|errou/i);

    // The next tap, on any tile, takes the red away.
    fireEvent.click(tile('Please'));
    expect(screen.queryByRole('button', { name: 'tonight, errou' })).not.toBeInTheDocument();
    expect(tile('tonight')).not.toHaveClass('bg-error');
    expect(onTile).toHaveBeenLastCalledWith('Please');
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

  it('shows a solved line: the row is lime with a check, every tile is disabled, and nothing can be placed', () => {
    const { onTile } = renderArea({ placed: TOKENS, solved: true });

    expect(placedWords()).toEqual(TOKENS);
    expect(emptySlots()).toHaveLength(0);
    expect(row()).toHaveClass('border-lime');
    expect(row().querySelector('[data-icon="check"]')).not.toBeNull();
    expect(row()).toHaveAccessibleName('Please come back home tonight, acertou');
    expect(document.body.textContent).not.toMatch(/acertou|errou/i);
    for (const button of tiles()) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onTile).not.toHaveBeenCalled();
  });

  it('keeps the same picture when it is shown again from the same placed words', () => {
    const { rerender, props, unmount } = renderArea({ tokens: ['come', 'baby', 'baby', 'back'], placed: [] });
    rerender(<MontarArea {...props} placed={['baby']} />);
    const picture = () => tiles().map((button) => [button.textContent, button.hasAttribute('disabled')]);
    const before = picture();
    unmount();

    renderArea({ tokens: ['come', 'baby', 'baby', 'back'], placed: ['baby'] });

    expect(picture()).toEqual(before);
  });

  it('"Não entendi a ordem" asks for an explanation with no word', () => {
    const { onExplain } = renderArea();

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi a ordem' }));

    expect(onExplain).toHaveBeenCalledExactlyOnceWith('');
  });

  it('keeps every tile and "Não entendi a ordem" at least 44 px tall', () => {
    renderArea({ placed: ['Please'] });

    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11');
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

  it('disables exactly one of the two tiles when one is placed, and both when both are', () => {
    const { rerender, props } = renderArea({ tokens: REPEATED });

    rerender(<MontarArea {...props} placed={['baby']} />);
    expect(babies().filter((button) => button.hasAttribute('disabled'))).toHaveLength(1);
    expect(babies().filter((button) => button.hasAttribute('disabled') === false)).toHaveLength(1);

    rerender(<MontarArea {...props} placed={['baby', 'baby']} />);
    expect(babies().every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(tile('come')).toBeEnabled();
  });

  it('ignores capitals when it marks the tile a placed word stands for', () => {
    const { rerender, props } = renderArea({ tokens: ['Baby', 'baby', 'come', 'back'] });

    rerender(<MontarArea {...props} placed={['Baby']} />);
    const disabled = tiles().filter((button) => button.hasAttribute('disabled'));
    expect(disabled).toHaveLength(1);
    expect(disabled[0].textContent?.toLowerCase()).toBe('baby');

    rerender(<MontarArea {...props} placed={['Baby', 'baby']} />);
    expect(tiles().filter((button) => button.hasAttribute('disabled'))).toHaveLength(2);
  });
});
