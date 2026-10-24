import { act, fireEvent, render, screen, within } from '@testing-library/react';
import gsap from 'gsap';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpError } from '@/lib/help/helpError';
import { HelpSheet } from './HelpSheet';

// jsdom has no animation, so GSAP is only watched: what the sheet asks it to animate, and how.
vi.mock('gsap');
const fromTo = vi.mocked(gsap.fromTo);

afterEach(() => {
  vi.unstubAllGlobals();
  fromTo.mockClear();
});

type Props = Parameters<typeof HelpSheet>[0];

function renderSheet(over: Partial<Props> = {}) {
  const onClose = vi.fn();
  const load = vi.fn<() => Promise<string>>(async () => '"River" é rio. Aqui é um rio de luz, uma imagem bonita.');
  const props: Props = { target: 'river', load, onClose, ...over };
  render(<HelpSheet {...props} />);
  return { onClose, load: props.load as typeof load };
}

/** Lets the answer of `load` come in. */
async function settle() {
  await act(async () => {});
}

function sheet() {
  return screen.getByRole('dialog', { name: 'Explicação do DJ Bop' });
}

describe('HelpSheet', () => {
  it('shows DJ Bop, the text that came back, and "Valeu"', async () => {
    renderSheet();
    await settle();

    expect(within(sheet()).getByRole('img', { name: 'DJ Bop' })).toBeInTheDocument();
    expect(within(sheet()).getByText('"River" é rio. Aqui é um rio de luz, uma imagem bonita.')).toBeInTheDocument();
    expect(within(sheet()).getByRole('button', { name: 'Valeu' })).toBeInTheDocument();
  });

  it('marks the explanation as Brazilian Portuguese and the word as English', async () => {
    renderSheet();
    await settle();

    expect(within(sheet()).getByText(/River" é rio/)).toHaveAttribute('lang', 'pt-BR');
    expect(within(sheet()).getByRole('heading', { name: 'river' })).toHaveAttribute('lang', 'en');
  });

  it('asks for the help once when it opens', async () => {
    const { load } = renderSheet();
    await settle();

    expect(load).toHaveBeenCalledOnce();
  });

  it('says it is thinking while the help is on its way', () => {
    renderSheet({ load: () => new Promise<string>(() => {}) });

    expect(within(sheet()).getByRole('status')).toHaveTextContent('Peraí, deixa eu ver...');
  });

  it('calls the whole line "O verso inteiro" when there is no word', async () => {
    renderSheet({ target: '' });
    await settle();

    const heading = within(sheet()).getByRole('heading', { name: 'O verso inteiro' });
    expect(heading).not.toHaveAttribute('lang');
  });

  it('"Valeu" closes it', async () => {
    const { onClose } = renderSheet();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes with Escape too', async () => {
    const { onClose } = renderSheet();
    await settle();

    fireEvent.keyDown(sheet(), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('takes the focus when it opens, so a screen reader starts in it', () => {
    renderSheet();

    expect(sheet()).toHaveFocus();
  });

  describe('when the help cannot be had', () => {
    it('asks the player to come back later past the limit, with no retry', async () => {
      renderSheet({ load: async () => Promise.reject(new HelpError(429)) });
      await settle();

      expect(within(sheet()).getByRole('status')).toHaveTextContent('Pausa rapidinha! Volta daqui a pouco?');
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    });

    it('offers to try again when the service is down, and asks again on a tap', async () => {
      const load = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new HelpError(503))
        .mockResolvedValueOnce('Agora foi.');
      renderSheet({ load });
      await settle();

      expect(within(sheet()).getByRole('status')).toHaveTextContent('Não rolou agora. Tenta de novo?');
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(within(sheet()).getByRole('status')).toHaveTextContent('Peraí, deixa eu ver...');
      await settle();

      expect(load).toHaveBeenCalledTimes(2);
      expect(within(sheet()).getByText('Agora foi.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    });

    it('keeps the focus in the sheet when "Tentar de novo" goes away, so Escape still closes it', async () => {
      const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new HelpError(503)).mockReturnValue(new Promise(() => {}));
      const { onClose } = renderSheet({ load });
      await settle();
      const retry = screen.getByRole('button', { name: 'Tentar de novo' });
      retry.focus();

      fireEvent.click(retry);

      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
      expect(sheet()).toHaveFocus();
      fireEvent.keyDown(sheet(), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it.each([400, 401, 403, 422] as const)('gives a calm general line for %i, with no retry', async (status) => {
      renderSheet({ load: async () => Promise.reject(new HelpError(status)) });
      await settle();

      expect(within(sheet()).getByRole('status')).toHaveTextContent('Essa agora não deu. Fica pra próxima?');
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    });

    it('never shows a status code or a stack trace', async () => {
      renderSheet({ load: async () => Promise.reject(new Error('TypeError at line 42')) });
      await settle();

      expect(sheet()).not.toHaveTextContent(/\d{3}|error|line 42/i);
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    });

    it('still closes with "Valeu"', async () => {
      const { onClose } = renderSheet({ load: async () => Promise.reject(new HelpError(429)) });
      await settle();

      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('rising from below as it opens', () => {
    type Vars = Record<string, unknown>;

    /** What the sheet was asked to do, as the call was made. */
    function animation() {
      const calls = fromTo.mock.calls as unknown as [Element, Vars, Vars][];
      return calls.filter(([target]) => target === sheet()).map(([, from, to]) => ({ from, to }));
    }

    it('rises with a fade, once, with only transform and opacity', async () => {
      renderSheet();
      await settle();

      const [only, ...more] = animation();
      expect(more).toHaveLength(0);
      expect(only.from.y).toBeGreaterThan(0);
      expect(only.from.opacity).toBe(0);
      expect(only.to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
      expect(only.to.duration).toBeLessThanOrEqual(0.3);
      // What it changes is what it is asked to start from, and nothing else but how to run it.
      expect(Object.keys(only.from).sort()).toEqual(['opacity', 'y']);
      expect(Object.keys(only.to).filter((name) => !['duration', 'ease', 'clearProps'].includes(name)).sort()).toEqual([
        'opacity',
        'y',
      ]);
    });

    it('does not rise again when the explanation comes in, nor when it is asked for again', async () => {
      const load = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new HelpError(503))
        .mockResolvedValueOnce('Agora foi.');
      renderSheet({ load });
      await settle();
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      await settle();

      expect(within(sheet()).getByText('Agora foi.')).toBeInTheDocument();
      expect(animation()).toHaveLength(1);
    });

    it('only fades when motion is reduced', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
      renderSheet();

      const [only] = animation();
      expect(Object.keys(only.from)).toEqual(['opacity']);
      expect(Object.keys(only.to)).not.toContain('y');
      expect(only.from.opacity).toBe(0);
    });

    it('is in the tab order, focused and tappable from its first frame', () => {
      const { onClose } = renderSheet();

      expect(sheet()).toHaveFocus();
      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
      expect(onClose).toHaveBeenCalledOnce();
      expect(sheet()).not.toHaveAttribute('hidden');
      expect(sheet()).not.toHaveAttribute('inert');
    });

    it('goes away at once when it closes: nothing is animated on the way out', () => {
      const { unmount } = render(<HelpSheet target="river" load={() => new Promise<string>(() => {})} onClose={vi.fn()} />);
      fromTo.mockClear();

      unmount();

      expect(fromTo).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keeps every button at least 44 px tall', async () => {
    renderSheet({ load: async () => Promise.reject(new HelpError(503)) });
    await settle();

    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11');
  });

  it('ignores an answer that comes in after it was closed', async () => {
    let resolve!: (text: string) => void;
    const { unmount } = render(
      <HelpSheet target="river" load={() => new Promise<string>((done) => (resolve = done))} onClose={vi.fn()} />,
    );
    unmount();

    await act(async () => resolve('Tarde demais.'));

    expect(screen.queryByText('Tarde demais.')).not.toBeInTheDocument();
  });
});
