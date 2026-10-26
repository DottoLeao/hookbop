import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUserId } from '@/lib/auth/currentUser';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { listActiveMembers, type Member } from '@/lib/supabase/members';
import { recentSongs } from '@/lib/supabase/plays';
import { GangSongs, HomeShortcuts, PasteLinkWithShareError, PolicyNoticeForMember } from './HomeSections';

// The sections read the signed-in member's data on the server; here the reads are fakes.
const SUPABASE = { fake: 'client' };
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn(async () => SUPABASE) }));
vi.mock('@/lib/supabase/plays', () => ({ recentSongs: vi.fn() }));
// The paste box is a client component that navigates.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/auth/currentUser', () => ({ currentUserId: vi.fn() }));
vi.mock('@/lib/supabase/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/members')>()),
  listActiveMembers: vi.fn(),
}));

function song(id: string, title: string): VideoRecord {
  return {
    youtubeId: id,
    title: `Invented Artist - ${title}`,
    channel: 'Invented Artist',
    durationS: 200,
    ytFetchedAt: '2026-10-20T10:00:00+00:00',
    status: 'ok',
    offsetMs: 0,
  };
}

const MEMBERS: Member[] = [
  { id: 'owner-1', displayName: 'Dono', joinedAt: '2026-10-20T10:00:00Z', isOwner: true },
  { id: 'user-2', displayName: 'Joana', joinedAt: '2026-10-21T10:00:00Z', isOwner: false },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(recentSongs).mockResolvedValue([]);
  vi.mocked(listActiveMembers).mockResolvedValue(MEMBERS);
  vi.mocked(currentUserId).mockResolvedValue('user-2');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GangSongs', () => {
  it("lists the songs the gang played with the member's own session", async () => {
    vi.mocked(recentSongs).mockResolvedValue([song('aaaaaaaaaaa', 'First Invented Song'), song('bbbbbbbbbbb', 'Second Invented Song')]);

    render(await GangSongs());

    expect(recentSongs).toHaveBeenCalledWith(SUPABASE);
    expect(screen.getByRole('heading', { name: 'Músicas da galera' })).toBeInTheDocument();
    expect(screen.getByText('First Invented Song')).toBeInTheDocument();
    expect(screen.getByText('Second Invented Song')).toBeInTheDocument();
  });

  it('has DJ Bop invite the first song when nobody played anything yet', async () => {
    render(await GangSongs());

    expect(screen.getByText('Tá silêncio por aqui. Cola a primeira!')).toBeInTheDocument();
  });

  it('says quietly that the songs did not load when reading them fails, and does not fail the page', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(recentSongs).mockRejectedValue(new Error('offline'));

    render(await GangSongs());

    expect(screen.getByRole('heading', { name: 'Músicas da galera' })).toBeInTheDocument();
    expect(screen.getByText('Não deu pra carregar as músicas agora.')).toBeInTheDocument();
    expect(screen.queryByText('Tá silêncio por aqui. Cola a primeira!')).not.toBeInTheDocument();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('HomeShortcuts', () => {
  it('shows "Admin" to the owner, who is decided the way /admin decides it', async () => {
    vi.mocked(currentUserId).mockResolvedValue('owner-1');

    render(await HomeShortcuts());

    expect(listActiveMembers).toHaveBeenCalledWith(SUPABASE);
    expect(currentUserId).toHaveBeenCalledWith(SUPABASE);
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Métricas' })).toHaveAttribute('href', '/admin/metricas');
    expect(screen.getByRole('link', { name: 'Convidar' })).toBeInTheDocument();
  });

  it('shows no "Admin" and no "Métricas" to another member', async () => {
    render(await HomeShortcuts());

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Métricas' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Convidar' })).toBeInTheDocument();
  });

  it('leaves "Admin" out, and keeps the other links, when the members cannot be read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(listActiveMembers).mockRejectedValue(new Error('offline'));
    vi.mocked(currentUserId).mockResolvedValue('owner-1');

    render(await HomeShortcuts());

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Métricas' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Convidar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Licenças de terceiros' })).toBeInTheDocument();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('leaves "Admin" out when who is signed in cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(currentUserId).mockRejectedValue(new Error('offline'));

    render(await HomeShortcuts());

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Convidar' })).toBeInTheDocument();
  });

  it('reads the members and the signed-in member at the same time, not one after the other', async () => {
    const members = deferred<Member[]>();
    const user = deferred<string | null>();
    vi.mocked(listActiveMembers).mockReturnValue(members.promise);
    vi.mocked(currentUserId).mockReturnValue(user.promise);

    const rendering = HomeShortcuts();
    await vi.waitFor(() => expect(listActiveMembers).toHaveBeenCalled());

    // Both are asked for while neither has answered.
    expect(currentUserId).toHaveBeenCalled();
    members.resolve(MEMBERS);
    user.resolve('owner-1');
    render(await rendering);
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });
});

describe('PasteLinkWithShareError', () => {
  it('opens the paste box with the message when the home page comes from a share with no video (?erro=link)', async () => {
    render(await PasteLinkWithShareError({ searchParams: Promise.resolve({ erro: 'link' }) }));

    expect(screen.getByRole('alert')).toHaveTextContent('Esse link não parece do YouTube.');
    expect(screen.getByLabelText('Link do YouTube')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['no query', {}],
    ['another value', { erro: 'outro' }],
    ['the flag twice', { erro: ['link', 'link'] }],
  ])('opens the paste box quietly with %s', async (_name, query) => {
    render(await PasteLinkWithShareError({ searchParams: Promise.resolve(query) }));

    expect(screen.getByLabelText('Link do YouTube')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PolicyNoticeForMember', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hands the notice the day the signed-in member joined, read with their own session', async () => {
    // Joana joined on 21/10, before the policy changed.
    render(await PolicyNoticeForMember());

    expect(listActiveMembers).toHaveBeenCalledWith(SUPABASE);
    expect(currentUserId).toHaveBeenCalledWith(SUPABASE);
    expect(screen.getByRole('status')).toHaveTextContent('A política de privacidade mudou.');
  });

  it('shows nothing to a member who joined after the policy changed', async () => {
    vi.mocked(listActiveMembers).mockResolvedValue([
      ...MEMBERS,
      { id: 'user-3', displayName: 'Bia', joinedAt: '2026-11-02T12:00:00Z', isOwner: false },
    ]);
    vi.mocked(currentUserId).mockResolvedValue('user-3');

    render(await PolicyNoticeForMember());

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows nothing, and does not fail the page, when who joined when cannot be read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(listActiveMembers).mockRejectedValue(new Error('offline'));

    const { container } = render(await PolicyNoticeForMember());

    expect(container).toBeEmptyDOMElement();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('shows nothing for someone who is not among the members', async () => {
    vi.mocked(currentUserId).mockResolvedValue('someone-else');

    const { container } = render(await PolicyNoticeForMember());

    expect(container).toBeEmptyDOMElement();
  });
});
