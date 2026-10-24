import { render, screen, within } from '@testing-library/react';
import { notFound } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUserId } from '@/lib/auth/currentUser';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { listActiveMembers, type Member } from '@/lib/supabase/members';
import { createServerSupabase } from '@/lib/supabase/server';
import { MetricsPanel } from './MetricsPanel';
import { MetricsScreen } from './MetricsScreen';

// The screen decides who is asking with the person's own session, the way /admin does; here those reads are fakes. The
// panel, which reads the metrics with the service key, is a stand-in: its own test reads them.
const SUPABASE = { fake: 'session client' };
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn(async () => SUPABASE) }));
vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn() }));
vi.mock('@/lib/auth/currentUser', () => ({ currentUserId: vi.fn() }));
vi.mock('@/lib/supabase/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/members')>()),
  listActiveMembers: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
}));
vi.mock('./MetricsPanel', () => ({ MetricsPanel: vi.fn(({ days }: { days: number }) => <p>panel of {days} days</p>) }));

const MEMBERS: Member[] = [
  { id: 'owner-1', displayName: 'Dono', joinedAt: '2026-10-20T10:00:00Z', isOwner: true },
  { id: 'user-2', displayName: 'Joana', joinedAt: '2026-10-21T10:00:00Z', isOwner: false },
];

function page(dias?: string | string[]) {
  return MetricsScreen({ searchParams: Promise.resolve(dias === undefined ? {} : { dias }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listActiveMembers).mockResolvedValue(MEMBERS);
  vi.mocked(currentUserId).mockResolvedValue('owner-1');
});

describe('/admin/metricas for anyone but the owner', () => {
  it.each([
    ['a member', 'user-2'],
    ['someone signed out', null],
    ['a removed owner (not among the active members)', 'owner-gone'],
  ])('does not exist for %s, and nothing is read with the service key', async (_label, userId) => {
    vi.mocked(currentUserId).mockResolvedValue(userId);

    await expect(page()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');

    expect(notFound).toHaveBeenCalledOnce();
    expect(createServiceSupabase).not.toHaveBeenCalled();
    expect(MetricsPanel).not.toHaveBeenCalled();
  });

  it('does not exist when who is asking cannot be checked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(listActiveMembers).mockRejectedValue(new Error('offline'));

    await expect(page()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');

    expect(createServiceSupabase).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("checks with the person's own session, the way /admin does", async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-2');

    await expect(page()).rejects.toThrow();

    expect(createServerSupabase).toHaveBeenCalledOnce();
    expect(listActiveMembers).toHaveBeenCalledWith(SUPABASE);
    expect(currentUserId).toHaveBeenCalledWith(SUPABASE);
  });
});

describe('/admin/metricas for the owner', () => {
  it('shows the panel of the last 30 days by default', async () => {
    render(await page());

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Métricas' })).toBeInTheDocument();
    expect(await screen.findByText('panel of 30 days')).toBeInTheDocument();
  });

  it('offers 7 and 30 days, marking the one on screen', async () => {
    render(await page('7'));

    const periods = screen.getByRole('navigation', { name: 'Período' });
    const seven = within(periods).getByRole('link', { name: '7 dias' });
    const thirty = within(periods).getByRole('link', { name: '30 dias' });
    expect(seven).toHaveAttribute('href', '/admin/metricas?dias=7');
    expect(seven).toHaveAttribute('aria-current', 'page');
    expect(thirty).toHaveAttribute('href', '/admin/metricas?dias=30');
    expect(thirty).not.toHaveAttribute('aria-current');
    expect(await screen.findByText('panel of 7 days')).toBeInTheDocument();
  });

  it.each([
    ['another number', '90'],
    ['text', 'sete'],
    ['the key twice', ['7', '30']],
    ['empty', ''],
  ])('takes 30 days when ?dias= is %s', async (_label, dias) => {
    render(await page(dias));

    expect(await screen.findByText('panel of 30 days')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '30 dias' })).toHaveAttribute('aria-current', 'page');
  });

  it('downloads the export of the period on screen', async () => {
    render(await page('7'));

    const exportLink = screen.getByRole('link', { name: 'Exportar dados' });
    expect(exportLink).toHaveAttribute('href', '/admin/metricas/exportar?dias=7');
    expect(exportLink).toHaveAttribute('download');
  });

  it('has a way back to the home page, which an app installed on the phone has no button for', async () => {
    render(await page());

    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/');
  });

  it('keeps every link at least 44 px tall', async () => {
    render(await page());

    for (const link of screen.getAllByRole('link')) expect(link.className).toMatch(/\bmin-h-11\b/);
  });
});
