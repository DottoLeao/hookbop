import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_DATE, POLICY_NOTICE_KEY } from '@/lib/privacy/policyNotice';
import { PolicyNotice } from './PolicyNotice';

/** A member from before the policy changed, and one who joined after it. */
const EARLY_MEMBER = '2026-10-20T10:00:00Z';
const NEW_MEMBER = '2026-11-02T12:00:00Z';

function notice() {
  return screen.queryByRole('status');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PolicyNotice', () => {
  it('tells a member who knew the older policy that it changed, with a link to it and an "Ok"', () => {
    render(<PolicyNotice joinedAt={EARLY_MEMBER} />);

    expect(notice()).toHaveTextContent('A política de privacidade mudou.');
    expect(screen.getByRole('link', { name: 'Ler a política' })).toHaveAttribute('href', '/privacidade');
    expect(screen.getByRole('button', { name: 'Ok' })).toHaveClass('min-h-11');
  });

  it('goes away on "Ok"', () => {
    render(<PolicyNotice joinedAt={EARLY_MEMBER} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));

    expect(notice()).not.toBeInTheDocument();
  });

  it('shows once for this date: the device remembers it, and the next visit has no notice', () => {
    const { unmount } = render(<PolicyNotice joinedAt={EARLY_MEMBER} />);
    expect(notice()).toBeInTheDocument();
    expect(localStorage.getItem(POLICY_NOTICE_KEY)).toBe(POLICY_DATE);
    unmount();

    render(<PolicyNotice joinedAt={EARLY_MEMBER} />);

    expect(notice()).not.toBeInTheDocument();
  });

  it('shows once under StrictMode too', () => {
    render(
      <StrictMode>
        <PolicyNotice joinedAt={EARLY_MEMBER} />
      </StrictMode>,
    );

    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('shows for a member told of an older change only', () => {
    localStorage.setItem(POLICY_NOTICE_KEY, '2026-01-01');

    render(<PolicyNotice joinedAt={EARLY_MEMBER} />);

    expect(notice()).toBeInTheDocument();
  });

  it('says nothing to a member who joined after the change and never saw an older policy', () => {
    render(<PolicyNotice joinedAt={NEW_MEMBER} />);

    expect(notice()).not.toBeInTheDocument();
    expect(localStorage.getItem(POLICY_NOTICE_KEY)).toBeNull();
  });

  it('says nothing, and does not break the page, when the browser refuses its storage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    render(<PolicyNotice joinedAt={EARLY_MEMBER} />);

    expect(notice()).not.toBeInTheDocument();
  });
});
