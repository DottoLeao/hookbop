import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CorrectedWord } from './CorrectedWord';

function fixedLetters(container: HTMLElement) {
  return [...container.querySelectorAll('[data-corrected]')].map((span) => span.textContent);
}

describe('CorrectedWord', () => {
  it('puts each fixed letter in a span with a wavy underline, and leaves the others plain', () => {
    const { container } = render(<CorrectedWord word="get" corrected={[1, 2]} />);

    expect(container).toHaveTextContent('get');
    expect(fixedLetters(container)).toEqual(['e', 't']);
    for (const span of container.querySelectorAll('[data-corrected]')) {
      expect(span).toHaveClass('underline', 'decoration-wavy', 'decoration-bg');
    }
    // The first letter was typed right: it is text, not a span.
    expect(container.firstElementChild?.firstChild?.textContent).toBe('g');
  });

  it('marks the place of a dropped apostrophe', () => {
    const { container } = render(<CorrectedWord word="it's" corrected={[2]} />);

    expect(container).toHaveTextContent("it's");
    expect(fixedLetters(container)).toEqual(["'"]);
  });

  it('is just the word when nothing was fixed', () => {
    const { container } = render(<CorrectedWord word="get" />);

    expect(container).toHaveTextContent('get');
    expect(fixedLetters(container)).toEqual([]);
  });

  it('ignores places that are not in the word, and marks a place once', () => {
    const { container } = render(<CorrectedWord word="get" corrected={[-1, 1, 1, 7]} />);

    expect(container).toHaveTextContent('get');
    expect(fixedLetters(container)).toEqual(['e']);
  });

  it('is one element, so it stays in one piece inside a flex row', () => {
    const { container } = render(<CorrectedWord word="get" corrected={[1, 2]} />);

    expect(container.childElementCount).toBe(1);
  });
});
