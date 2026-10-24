import { fireEvent, render, screen, within } from '@testing-library/react';
import gsap from 'gsap';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { SettingsSheet } from './SettingsSheet';

// jsdom has no animation, so GSAP is only watched: what the sheet asks it to animate, and how.
vi.mock('gsap');
const fromTo = vi.mocked(gsap.fromTo);

type Props = Parameters<typeof SettingsSheet>[0];
type Vars = Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
  fromTo.mockClear();
});

function renderSheet(over: Partial<Props> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const props: Props = { settings: DEFAULT_SETTINGS, onChange, onClose, ...over };
  const view = render(<SettingsSheet {...props} />);
  return { onChange, onClose, props, ...view };
}

function sheet() {
  return screen.getByRole('dialog', { name: 'Configurações' });
}

/** What the sheet was asked to do, as the call was made. */
function animation() {
  const calls = fromTo.mock.calls as unknown as [Element, Vars, Vars][];
  return calls.filter(([target]) => target === sheet()).map(([, from, to]) => ({ from, to }));
}

describe('SettingsSheet', () => {
  it('names itself after its heading and has the three switches and "Pronto"', () => {
    renderSheet();

    expect(within(sheet()).getAllByRole('switch').map((item) => item.textContent)).toEqual([
      'Mostrar tradução sempre',
      'Repetir sozinho depois de errar',
      'Sons',
    ]);
    expect(within(sheet()).getByRole('button', { name: 'Pronto' })).toBeInTheDocument();
  });

  it('takes the focus when it opens, so a screen reader starts in it', () => {
    renderSheet();

    expect(sheet()).toHaveFocus();
  });

  it('gives the new settings on every switch, and closes with "Pronto" and with Escape', () => {
    const { onChange, onClose } = renderSheet();

    fireEvent.click(screen.getByRole('switch', { name: 'Sons' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, sounds: !DEFAULT_SETTINGS.sounds });
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));
    fireEvent.keyDown(sheet(), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe('rising from below as it opens', () => {
    it('rises with a fade, once, with only transform and opacity', () => {
      renderSheet();

      const [only, ...more] = animation();
      expect(more).toHaveLength(0);
      expect(only.from.y).toBeGreaterThan(0);
      expect(only.from.opacity).toBe(0);
      expect(only.to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
      expect(only.to.duration).toBeLessThanOrEqual(0.3);
      expect(Object.keys(only.from).sort()).toEqual(['opacity', 'y']);
      expect(Object.keys(only.to).filter((name) => !['duration', 'ease', 'clearProps'].includes(name)).sort()).toEqual([
        'opacity',
        'y',
      ]);
    });

    it('does not rise again when a switch is flipped', () => {
      const { rerender, props } = renderSheet();

      rerender(<SettingsSheet {...props} settings={{ ...DEFAULT_SETTINGS, sounds: false }} />);

      expect(screen.getByRole('switch', { name: 'Sons' })).toHaveAttribute('aria-checked', 'false');
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
    });

    it('is on screen, focused and tappable from its first frame: nothing is hidden or held back', () => {
      const { onChange } = renderSheet();

      fireEvent.click(screen.getByRole('switch', { name: 'Mostrar tradução sempre' }));

      expect(onChange).toHaveBeenCalledOnce();
      expect(sheet()).toHaveFocus();
      expect(sheet()).not.toHaveAttribute('hidden');
      expect(sheet()).not.toHaveAttribute('inert');
      expect(sheet()).not.toHaveAttribute('aria-hidden');
    });

    it('goes away at once when it closes: nothing is animated on the way out', () => {
      const { unmount } = renderSheet();
      fromTo.mockClear();

      unmount();

      expect(fromTo).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
