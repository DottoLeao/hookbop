import { expect } from '@playwright/test';
import { signIn } from './support/session';
import { test, uniqueSuffix } from './support/seed';

// These need the local Supabase stack (npx supabase start) and SUPABASE_SERVICE_ROLE_KEY in .env.local, like the
// other specs that sign in: the tests create members, videos and plays with the service role key and delete them again.

test.describe('home page', () => {
  test('a member pastes a link, sees the songs of the gang and the shortcuts, but not "Admin"', async ({ page, seed }) => {
    const suffix = uniqueSuffix();
    const maria = await seed.member({ name: `Maria ${suffix}` });
    const older = await seed.video({ title: `Invented Artist - Older Song ${suffix}` });
    const newer = await seed.video({ title: `Invented Artist - Newer Song ${suffix} (Official Video)` });
    const noLyrics = await seed.video({ title: `Invented Artist - Silent Song ${suffix}`, status: 'no_lyrics' });
    await seed.play({ userId: maria.id, youtubeId: older, minutesAgo: 30 });
    await seed.play({ userId: maria.id, youtubeId: newer, minutesAgo: 20 });
    await seed.play({ userId: maria.id, youtubeId: older, minutesAgo: 10 });
    await seed.play({ userId: maria.id, youtubeId: noLyrics, minutesAgo: 5 });

    await signIn(page, maria.email);
    await expect(page).toHaveURL(/\/$/);

    // The songs, newest play first, each once, and none of the video without lyrics.
    const songs = page.getByRole('list', { name: 'Músicas da galera' }).getByRole('link');
    const mine = songs.filter({ hasText: suffix });
    await expect(mine).toHaveCount(2);
    await expect(mine.nth(0)).toContainText(`Older Song ${suffix}`);
    await expect(mine.nth(0)).toHaveAttribute('href', `/jogar/${older}`);
    await expect(mine.nth(1)).toContainText(`Newer Song ${suffix}`);
    await expect(mine.nth(1)).not.toContainText('Official Video');
    await expect(page.getByText(`Silent Song ${suffix}`)).toHaveCount(0);

    // The shortcuts: invite for everyone, no admin, and the licences.
    await expect(page.getByRole('link', { name: 'Convidar' })).toHaveAttribute('href', '/convidar');
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Licenças de terceiros' })).toHaveAttribute('href', '/licencas.txt');

    // Something that is not a link stays on the page and says so.
    const field = page.getByLabel('Link do YouTube');
    await field.fill('olha essa');
    await page.getByRole('button', { name: 'Jogar', exact: true }).click();
    await expect(page.getByText('Esse link não parece do YouTube.')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    // A link opens the song.
    await field.fill('https://youtu.be/dQw4w9WgXcQ?si=abc');
    await page.getByRole('button', { name: 'Jogar', exact: true }).click();
    await expect(page).toHaveURL(/\/jogar\/dQw4w9WgXcQ$/);
  });

  test('a card opens its song', async ({ page, seed }) => {
    const suffix = uniqueSuffix();
    const maria = await seed.member({ name: `Maria ${suffix}` });
    const video = await seed.video({ title: `Invented Artist - Card Song ${suffix}` });
    await seed.play({ userId: maria.id, youtubeId: video });

    await signIn(page, maria.email);
    await page.getByRole('link', { name: new RegExp(`Card Song ${suffix}`) }).click();

    await expect(page).toHaveURL(new RegExp(`/jogar/${video}$`));
  });

  test('the owner also gets "Admin", which opens the members', async ({ page, seed }) => {
    const owner = await seed.member({ name: `Dono ${uniqueSuffix()}`, owner: true });

    await signIn(page, owner.email);

    await expect(page.getByRole('link', { name: 'Convidar' })).toBeVisible();
    await page.getByRole('link', { name: 'Admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Membros' })).toBeVisible();
  });
});
