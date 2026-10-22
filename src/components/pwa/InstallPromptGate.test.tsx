import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearInstallEvent, listenForInstallEvent } from '@/lib/pwa/installEvent';
import { InstallPromptGate } from './InstallPromptGate';

const IOS_HINT = 'Toque em Compartilhar e depois em Adicionar à Tela de Início';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';

let stopListening: () => void;

function pretendToBe(userAgent: string, { standalone = false } = {}) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
  })) as unknown as typeof window.matchMedia;
}

/** What Chrome on Android sends when the app can be installed. */
function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  act(() => {
    window.dispatchEvent(event);
  });
  return { prompt };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('hb_first_finish', '1');
  stopListening = listenForInstallEvent();
});

afterEach(() => {
  stopListening();
  clearInstallEvent();
  vi.restoreAllMocks();
});

describe('InstallPromptGate', () => {
  it('on an iPhone, after the first finished song, shows how to add the app to the home screen', () => {
    pretendToBe(IPHONE_UA);
    render(<InstallPromptGate />);

    expect(screen.getByText(IOS_HINT)).toBeInTheDocument();
  });

  it('waits for the first finished song', () => {
    localStorage.removeItem('hb_first_finish');
    pretendToBe(IPHONE_UA);
    const { container } = render(<InstallPromptGate />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stays away once the player said "Agora não"', () => {
    localStorage.setItem('hb_install_dismissed', '1');
    pretendToBe(IPHONE_UA);
    const { container } = render(<InstallPromptGate />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stays away when the app is already running installed', () => {
    pretendToBe(IPHONE_UA, { standalone: true });
    const { container } = render(<InstallPromptGate />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stays away when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    pretendToBe(IPHONE_UA);
    const { container } = render(<InstallPromptGate />);

    expect(container).toBeEmptyDOMElement();
  });

  it('"Agora não" hides it and remembers, so it does not come back', () => {
    pretendToBe(IPHONE_UA);
    const { container, unmount } = render(<InstallPromptGate />);

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem('hb_install_dismissed')).toBe('1');

    unmount();
    const again = render(<InstallPromptGate />);
    expect(again.container).toBeEmptyDOMElement();
  });

  it('"Agora não" still hides it when the storage refuses to remember', () => {
    pretendToBe(IPHONE_UA);
    render(<InstallPromptGate />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(screen.queryByRole('button', { name: 'Agora não' })).not.toBeInTheDocument();
  });

  it('on Android shows "Instalar" once the browser offers it, and opens the browser install dialog on tap', async () => {
    pretendToBe(ANDROID_UA);
    const { container } = render(<InstallPromptGate />);
    expect(container).toBeEmptyDOMElement();

    const { prompt } = offerInstall();
    fireEvent.click(await screen.findByRole('button', { name: 'Instalar' }));

    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    // Installed: nothing to remember, the app opens on its own from now on.
    expect(localStorage.getItem('hb_install_dismissed')).toBeNull();
  });

  it('on Android, uses the offer that arrived before the home page opened (a song was played in between)', () => {
    pretendToBe(ANDROID_UA);
    offerInstall();

    render(<InstallPromptGate />);

    expect(screen.getByRole('button', { name: 'Instalar' })).toBeInTheDocument();
  });

  it('on Android, treats cancelling the browser dialog like "Agora não"', async () => {
    pretendToBe(ANDROID_UA);
    render(<InstallPromptGate />);
    offerInstall('dismissed');

    fireEvent.click(await screen.findByRole('button', { name: 'Instalar' }));

    await waitFor(() => expect(localStorage.getItem('hb_install_dismissed')).toBe('1'));
  });

  it('on Android, shows nothing when the browser never offers to install', () => {
    pretendToBe(ANDROID_UA);
    const { container } = render(<InstallPromptGate />);

    expect(container).toBeEmptyDOMElement();
  });
});
