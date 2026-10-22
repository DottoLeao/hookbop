import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Blank } from '@/lib/types';
import type { DigitacaoAreaProps } from './DigitacaoArea';
import { LazyDigitacaoArea, preloadDigitacaoArea, type AreaLoader } from './LazyDigitacaoArea';

const BLANK: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'get' };

/** Stands in for the typing area: what these tests look at is how it gets loaded, not how it works. */
function StubArea({ blank }: DigitacaoAreaProps) {
  return <p>campo da palavra {blank.answer}</p>;
}

const loaded = () => Promise.resolve({ default: StubArea });
const failed = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // React logs a failure that a boundary caught. These tests make it fail on purpose.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderLazy(load: AreaLoader, blank: Blank = BLANK) {
  const onAnswer = vi.fn();
  const view = render(
    <>
      <p>o resto do jogo</p>
      <LazyDigitacaoArea load={load} blank={blank} onAnswer={onAnswer} />
    </>,
  );
  return { onAnswer, ...view };
}

/** Lets the load, and whatever it set going, finish. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('LazyDigitacaoArea', () => {
  it('keeps the room of the area while its code loads, then shows the area', async () => {
    let release: () => void = () => {};
    const load = vi.fn<AreaLoader>(
      () => new Promise((resolve) => (release = () => resolve({ default: StubArea }))),
    );

    renderLazy(load);

    expect(load).toHaveBeenCalledOnce();
    expect(screen.getByTestId('digitacao-loading')).toHaveClass('h-18.5');
    expect(screen.queryByText('campo da palavra get')).not.toBeInTheDocument();

    await act(async () => release());

    expect(screen.getByText('campo da palavra get')).toBeInTheDocument();
    expect(screen.queryByTestId('digitacao-loading')).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the loaded area for good: an area mounted again draws at once and asks for no code', async () => {
    const load = vi.fn<AreaLoader>(loaded);
    const first = renderLazy(load);
    await settle();
    expect(screen.getByText('campo da palavra get')).toBeInTheDocument();
    first.unmount();

    renderLazy(load);

    expect(screen.getByText('campo da palavra get')).toBeInTheDocument();
    expect(screen.queryByTestId('digitacao-loading')).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
  });

  it('passes the area what the game gives it, with a new area for each blank', async () => {
    const seen: DigitacaoAreaProps[] = [];
    function Recorder(props: DigitacaoAreaProps) {
      seen.push(props);
      return null;
    }
    const load: AreaLoader = () => Promise.resolve({ default: Recorder });
    const { rerender, onAnswer } = renderLazy(load);
    await settle();

    expect(seen.at(-1)).toMatchObject({ blank: BLANK, onAnswer });

    const next: Blank = { id: '1:1', lineIndex: 1, tokenIndex: 1, answer: 'gave' };
    rerender(
      <>
        <p>o resto do jogo</p>
        <LazyDigitacaoArea load={load} blank={next} hinted solved corrected={[1]} onAnswer={onAnswer} />
      </>,
    );
    expect(seen.at(-1)).toMatchObject({ blank: next, hinted: true, solved: true, corrected: [1] });
  });

  describe('when the code does not load', () => {
    it('takes the place of the area only: a short line and "Tentar de novo", and the rest of the game stays', async () => {
      renderLazy(failed);
      await settle();

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('O campo de digitar não carregou.');
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveClass('min-h-11');
      expect(screen.getByText('o resto do jogo')).toBeInTheDocument();
      expect(screen.queryByTestId('digitacao-loading')).not.toBeInTheDocument();
      // The voice rules: 8 words at most, and nothing like "Errado" or "Tente".
      expect(alert.querySelector('p')!.textContent!.trim().split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(consoleError).toHaveBeenCalled();
    });

    it('"Tentar de novo" asks for the code again, with a new lazy component, and shows the area', async () => {
      const load = vi.fn<AreaLoader>().mockImplementationOnce(failed).mockImplementation(loaded);
      renderLazy(load);
      await settle();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(load).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      // Right away: the room of the area, while the code comes.
      expect(screen.getByTestId('digitacao-loading')).toBeInTheDocument();
      await settle();

      expect(load).toHaveBeenCalledTimes(2);
      expect(screen.getByText('campo da palavra get')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('o resto do jogo')).toBeInTheDocument();
    });

    it('shows the line and the button again when the second try fails too, and takes a third', async () => {
      const load = vi
        .fn<AreaLoader>()
        .mockImplementationOnce(failed)
        .mockImplementationOnce(failed)
        .mockImplementation(loaded);
      renderLazy(load);
      await settle();

      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      await settle();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      await settle();
      expect(load).toHaveBeenCalledTimes(3);
      expect(screen.getByText('campo da palavra get')).toBeInTheDocument();
    });

    it('also holds when the area breaks while it draws, so it never takes the game down', async () => {
      function Broken(): never {
        throw new Error('the area broke');
      }
      renderLazy(() => Promise.resolve({ default: Broken }));
      await settle();

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('o resto do jogo')).toBeInTheDocument();
    });
  });
});

describe('preloadDigitacaoArea', () => {
  it('asks for the code once, right away', () => {
    const load = vi.fn<AreaLoader>(loaded);

    preloadDigitacaoArea(load);

    expect(load).toHaveBeenCalledOnce();
  });

  it('lets a failure go: the area asks again when it is needed', async () => {
    const load = vi.fn<AreaLoader>(failed);

    expect(() => preloadDigitacaoArea(load)).not.toThrow();
    // A rejection nobody caught would fail the whole test run.
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
  });
});
