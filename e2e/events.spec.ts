import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './support/session';
import { test, uniqueSuffix } from './support/seed';

// These need the local Supabase stack (npx supabase start, with migration 0006 applied) and SUPABASE_SERVICE_ROLE_KEY in
// .env.local, like the other specs that sign in: the tests create a member with the service role key, and delete
// that member's events and the member afterwards.

test.describe('the app records what a member does', () => {
  test('opening the app is recorded under the member’s own id, and a request cannot say it was someone else', async ({
    page,
    seed,
  }) => {
    const suffix = uniqueSuffix();
    const maria = await seed.member({ name: `Maria ${suffix}` });
    const eventsOf = async (name: string) => {
      const { data, error } = await seed.db.from('app_events').select('*').eq('user_id', maria.id).eq('name', name);
      if (error) throw error;
      return data;
    };

    try {
      await signIn(page, maria.email);
      await expect(page).toHaveURL(/\/$/);

      // The home page tells the panel the app was opened; the client sends its events every 5 seconds.
      await expect.poll(async () => (await eventsOf('app_opened')).length, { timeout: 20_000 }).toBe(1);
      const [opened] = await eventsOf('app_opened');
      expect(opened.session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(opened.props).toEqual({});

      // A request made by hand: the song and the numbers are kept, the id the body claims and the field that is not
      // allowed are not.
      const response = await page.request.post('/api/events', {
        data: {
          sessionId: randomUUID(),
          user_id: randomUUID(),
          events: [
            {
              name: 'game_finished',
              youtubeId: 'aaaaaaaaaaa',
              mode: 'escolha',
              props: { pct: 80, durationMs: 61_000, totalBlanks: 10, email: 'maria@example.com' },
              user_id: randomUUID(),
            },
          ],
        },
      });
      expect(response.status()).toBe(204);
      expect(response.headers()['cache-control']).toBe('no-store');

      const [finished] = await eventsOf('game_finished');
      expect(finished).toMatchObject({
        user_id: maria.id,
        youtube_id: 'aaaaaaaaaaa',
        mode: 'escolha',
        props: { pct: 80, durationMs: 61_000, totalBlanks: 10 },
      });

      // An action that is not on the list is turned away and writes nothing.
      const refused = await page.request.post('/api/events', {
        data: { sessionId: randomUUID(), events: [{ name: 'page_view' }] },
      });
      expect(refused.status()).toBe(400);
      expect(await eventsOf('page_view')).toHaveLength(0);
    } finally {
      await seed.db.from('app_events').delete().eq('user_id', maria.id);
    }
  });

  test('an event waiting for its 5 seconds goes out as the page is left (sendBeacon), and an invite made is recorded', async ({
    page,
    seed,
  }) => {
    const suffix = uniqueSuffix();
    const maria = await seed.member({ name: `Maria ${suffix}` });

    try {
      await signIn(page, maria.email);
      await expect(page).toHaveURL(/\/$/);

      await page.goto('/convidar');
      await page.getByRole('button', { name: 'Criar convite' }).click();
      await expect(page.getByRole('region', { name: 'Meus convites' }).getByRole('listitem')).toHaveCount(1);

      // The page is left at once: the timer of the client never gets to run, so only the beacon can bring the event.
      await page.goto('/privacidade');

      await expect
        .poll(
          async () => {
            const { data, error } = await seed.db
              .from('app_events')
              .select('name')
              .eq('user_id', maria.id)
              .eq('name', 'invite_created');
            if (error) throw error;
            return data.length;
          },
          { timeout: 15_000 },
        )
        .toBe(1);
    } finally {
      await seed.db.from('app_events').delete().eq('user_id', maria.id);
    }
  });
});
