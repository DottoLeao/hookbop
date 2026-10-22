import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasteLink } from './PasteLink';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const INVALID = 'Esse link não parece do YouTube.';

function paste(text: string) {
  fireEvent.change(screen.getByLabelText('Link do YouTube'), { target: { value: text } });
}

function play() {
  fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));
}

beforeEach(() => {
  push.mockClear();
});

describe('PasteLink', () => {
  it('asks for the link of the song, with an example in the field', () => {
    render(<PasteLink />);

    const field = screen.getByLabelText('Link do YouTube');
    expect(field).toHaveAttribute('placeholder', 'Cole o link do YouTube');
    expect(field).toHaveAttribute('inputmode', 'url');
    expect(screen.getByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it('says so when what was pasted is not a YouTube link, and goes nowhere', () => {
    render(<PasteLink />);

    paste('olha essa');
    play();

    expect(screen.getByRole('alert')).toHaveTextContent(INVALID);
    expect(push).not.toHaveBeenCalled();
  });

  it('opens the song screen for a valid link', () => {
    render(<PasteLink />);

    paste('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    play();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/jogar/dQw4w9WgXcQ');
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it.each([
    ['a short link', 'https://youtu.be/dQw4w9WgXcQ?si=abc'],
    ['a link from the phone', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'],
    ['a link with spaces around it', '   https://youtu.be/dQw4w9WgXcQ  '],
    ['the bare id', 'dQw4w9WgXcQ'],
  ])('takes %s', (_name, link) => {
    render(<PasteLink />);

    paste(link);
    play();

    expect(push).toHaveBeenCalledWith('/jogar/dQw4w9WgXcQ');
  });

  it.each([
    ['a playlist', 'https://www.youtube.com/playlist?list=PL1234567890'],
    ['another site', 'https://example.com/watch?v=dQw4w9WgXcQ'],
    ['nothing at all', ''],
  ])('does not take %s', (_name, text) => {
    render(<PasteLink />);

    paste(text);
    play();

    expect(screen.getByRole('alert')).toHaveTextContent(INVALID);
    expect(push).not.toHaveBeenCalled();
  });

  it('submits with the keyboard too', () => {
    render(<PasteLink />);

    paste('https://youtu.be/dQw4w9WgXcQ');
    fireEvent.submit(screen.getByLabelText('Link do YouTube'));

    expect(push).toHaveBeenCalledWith('/jogar/dQw4w9WgXcQ');
  });

  it('marks the field as wrong while the message is there, and lets go of both when the text changes', () => {
    render(<PasteLink />);
    const field = screen.getByLabelText('Link do YouTube');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');

    paste('olha essa');
    play();

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(INVALID);

    paste('olha essa de novo');

    expect(field).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it('makes the field and the button easy to touch', () => {
    render(<PasteLink />);

    expect(screen.getByLabelText('Link do YouTube').className).toMatch(/\bmin-h-(12|13|14)\b/);
    expect(screen.getByRole('button', { name: 'Jogar' }).className).toMatch(/\bmin-h-(12|13|14)\b/);
    // 16 px or more keeps the phone from zooming into the field.
    expect(screen.getByLabelText('Link do YouTube')).toHaveClass('text-button');
  });
});
