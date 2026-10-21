import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyLinkButton } from './CopyLinkButton';

const URL_TO_COPY = 'https://hookbop.app/convite/ABCDEFGH23';

/** jsdom has no clipboard, so give the page one (or none, as on a page that is not secure). */
function useClipboard(clipboard: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

function copy() {
  fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
}

afterEach(() => {
  useClipboard(undefined);
});

describe('CopyLinkButton', () => {
  it('copies the link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    useClipboard({ writeText });
    render(<CopyLinkButton url={URL_TO_COPY} />);
    expect(screen.queryByText('Link copiado!')).not.toBeInTheDocument();

    copy();

    expect(await screen.findByText('Link copiado!')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_TO_COPY);
  });

  it('says it did not work when the browser refuses to copy', async () => {
    useClipboard({ writeText: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) });
    render(<CopyLinkButton url={URL_TO_COPY} />);

    copy();

    expect(await screen.findByText('Não rolou. Tenta de novo?')).toBeInTheDocument();
    expect(screen.queryByText('Link copiado!')).not.toBeInTheDocument();
  });

  it('says it did not work when the browser has no clipboard (a page that is not secure)', async () => {
    useClipboard(undefined);
    render(<CopyLinkButton url={URL_TO_COPY} />);

    copy();

    expect(await screen.findByText('Não rolou. Tenta de novo?')).toBeInTheDocument();
  });
});
