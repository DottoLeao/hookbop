import { fireEvent, render, screen } from '@testing-library/react';
import { Activity } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InstallPrompt } from './InstallPrompt';

const IOS_HINT = 'Toque em Compartilhar e depois em Adicionar à Tela de Início';

describe('InstallPrompt', () => {
  it('on an iPhone tells how to add the app to the home screen, and has no install button', () => {
    render(<InstallPrompt platform="ios" standalone={false} />);

    expect(screen.getByText(IOS_HINT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar' })).not.toBeInTheDocument();
  });

  it('shows nothing when the app is already running installed', () => {
    const { container } = render(<InstallPrompt platform="ios" standalone={true} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();

    const android = render(<InstallPrompt platform="android" standalone={true} onInstall={vi.fn()} />);
    expect(android.container).toBeEmptyDOMElement();
  });

  it('on Android shows the install button when the browser has offered to install, and asks for the install on tap', () => {
    const onInstall = vi.fn();
    render(<InstallPrompt platform="android" standalone={false} onInstall={onInstall} />);

    fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));

    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(IOS_HINT)).not.toBeInTheDocument();
  });

  it('on Android shows nothing while the browser has not offered to install (there is nothing to tap)', () => {
    const { container } = render(<InstallPrompt platform="android" standalone={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing on other platforms', () => {
    const { container } = render(<InstallPrompt platform="other" standalone={false} onInstall={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lets the player say "Agora não"', () => {
    const onDismiss = vi.fn();
    render(<InstallPrompt platform="ios" standalone={false} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has buttons at least 44 px tall', () => {
    render(<InstallPrompt platform="android" standalone={false} onInstall={vi.fn()} onDismiss={vi.fn()} />);

    for (const name of ['Instalar', 'Agora não']) {
      const className = screen.getByRole('button', { name }).className;
      expect(className).toMatch(/\bmin-h-(11|12)\b/);
    }
  });

  describe('onShown', () => {
    it('is called once when the prompt is drawn, whatever happens to the screen after', () => {
      const onShown = vi.fn();
      const { rerender } = render(<InstallPrompt platform="ios" standalone={false} onShown={onShown} />);
      rerender(<InstallPrompt platform="ios" standalone={false} onShown={onShown} onDismiss={vi.fn()} />);

      expect(onShown).toHaveBeenCalledTimes(1);
    });

    it('is called by the Android prompt once the browser has offered to install, not before', () => {
      const onShown = vi.fn();
      const { rerender } = render(<InstallPrompt platform="android" standalone={false} onShown={onShown} />);
      expect(onShown).not.toHaveBeenCalled();

      rerender(<InstallPrompt platform="android" standalone={false} onInstall={vi.fn()} onShown={onShown} />);

      expect(onShown).toHaveBeenCalledTimes(1);
    });

    it('is not called when the prompt draws nothing: installed already, or a platform with nothing to offer', () => {
      const onShown = vi.fn();
      render(<InstallPrompt platform="ios" standalone={true} onShown={onShown} />);
      render(<InstallPrompt platform="other" standalone={false} onInstall={vi.fn()} onShown={onShown} />);

      expect(onShown).not.toHaveBeenCalled();
    });

    it('is called once when the page is hidden and shown again: Next keeps the route it left in an Activity', () => {
      const onShown = vi.fn();
      const page = (mode: 'visible' | 'hidden') => (
        <Activity mode={mode}>
          <InstallPrompt platform="ios" standalone={false} onShown={onShown} />
        </Activity>
      );
      const { rerender } = render(page('visible'));

      rerender(page('hidden'));
      rerender(page('visible'));

      expect(onShown).toHaveBeenCalledTimes(1);
    });

    it('is called only with the latest function given, when it changes between renders', () => {
      const first = vi.fn();
      const second = vi.fn();
      const { rerender } = render(<InstallPrompt platform="android" standalone={false} onShown={first} />);

      rerender(<InstallPrompt platform="android" standalone={false} onInstall={vi.fn()} onShown={second} />);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });
});
