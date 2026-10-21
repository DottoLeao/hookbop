import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { tokenize } from '@/lib/game/blanks';
import { makeDistractors } from '@/lib/game/distractors';
import { seededRng, shuffled } from '@/lib/game/rng';
import type { Blank, LyricLine } from '@/lib/types';
import { EscolhaArea, escolhaOptions } from './EscolhaArea';

const BLANK: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' };
const OPTIONS = ['late', 'let', 'lead'];

function renderArea(props: Partial<Parameters<typeof EscolhaArea>[0]> = {}) {
  const onAnswer = vi.fn<(correct: boolean) => void>();
  render(<EscolhaArea blank={BLANK} options={OPTIONS} onAnswer={onAnswer} {...props} />);
  return onAnswer;
}

function option(name: string) {
  return screen.getByRole('button', { name });
}

describe('EscolhaArea', () => {
  it('shows the 3 options as buttons, and one of them is the answer', () => {
    renderArea();

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(OPTIONS);
    expect(buttons.filter((button) => button.textContent === 'let')).toHaveLength(1);
    for (const button of buttons) expect(button).toBeEnabled();
  });

  it('turns the answer lime with a check once it is picked, with no "Acertou" or "Errou" on screen', () => {
    const onAnswer = renderArea();

    fireEvent.click(option('let'));

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(true);
    const hit = option('let, acertou');
    expect(hit).toHaveClass('bg-lime');
    expect(hit.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/acertou|errou/i);
    // The question is over. The picked option stays focusable, so focus stays on it and its result is read out;
    // a second tap does nothing. The others can no longer be picked.
    expect(hit).toHaveAttribute('aria-disabled', 'true');
    expect(hit).not.toHaveAttribute('disabled');
    fireEvent.click(hit);
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(option('late')).toBeDisabled();
    expect(option('lead')).toBeDisabled();
  });

  it('turns a wrong option red with a cross, and the other two can still be picked', () => {
    const onAnswer = renderArea();

    fireEvent.click(option('late'));

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(false);
    const miss = option('late, errou');
    expect(miss).toHaveClass('bg-error');
    expect(miss.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(miss).toHaveAttribute('aria-disabled', 'true');
    expect(miss).not.toHaveAttribute('disabled');
    fireEvent.click(miss);
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toMatch(/acertou|errou/i);
    expect(option('let')).toBeEnabled();
    expect(option('lead')).toBeEnabled();

    fireEvent.click(option('let'));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    expect(option('let, acertou')).toHaveClass('bg-lime');
    expect(option('late, errou')).toHaveClass('bg-error');
  });

  it('greys out one wrong option after a hint, never the answer', () => {
    renderArea({ hinted: true });

    const disabled = screen.getAllByRole('button').filter((button) => button.hasAttribute('disabled'));
    expect(disabled).toHaveLength(1);
    expect(['late', 'lead']).toContain(disabled[0].textContent);
    expect(disabled[0]).toHaveClass('border-dashed', 'text-faint');
    expect(option('let')).toBeEnabled();
  });

  it('after a miss, the hint takes away the other wrong option', () => {
    const { rerender } = render(<EscolhaArea blank={BLANK} options={OPTIONS} onAnswer={vi.fn()} />);
    fireEvent.click(option('late'));

    rerender(<EscolhaArea blank={BLANK} options={OPTIONS} onAnswer={vi.fn()} hinted />);

    expect(option('late, errou')).toHaveAttribute('aria-disabled', 'true');
    expect(option('lead')).toBeDisabled();
    expect(option('lead')).toHaveClass('border-dashed');
    expect(option('let')).toBeEnabled();
  });

  it('shows a blank that is already right with the check on the answer, and takes no answer', () => {
    const onAnswer = renderArea({ solved: true });

    expect(option('let, acertou')).toHaveClass('bg-lime');
    expect(option('let, acertou')).toHaveAttribute('aria-disabled', 'true');
    expect(option('late')).toBeDisabled();
    expect(option('lead')).toBeDisabled();
    fireEvent.click(option('let, acertou'));
    fireEvent.click(option('lead'));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('keeps every option at least 44 px tall', () => {
    renderArea();
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-13');
  });
});

describe('escolhaOptions', () => {
  const ID = 'dQw4w9WgXcQ';
  const LINE: LyricLine = { index: 0, startMs: 0, endMs: 4000, text: "Please don't let me down" };

  it('is the answer and its two distractors, shuffled with the seed blank id + video id', () => {
    const seed = `${BLANK.id}${ID}`;
    const distractors = makeDistractors('let', tokenize(LINE.text), seed);

    const options = escolhaOptions(BLANK, LINE, ID);

    expect(options).toEqual(shuffled(['let', ...distractors], seededRng(seed)));
    expect([...options].sort()).toEqual(['let', ...distractors].sort());
  });

  it('gives the same options every time for the same blank and video', () => {
    expect(escolhaOptions(BLANK, LINE, ID)).toEqual(escolhaOptions(BLANK, LINE, ID));
  });
});
