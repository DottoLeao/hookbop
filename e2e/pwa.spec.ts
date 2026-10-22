import { expect } from '@playwright/test';
import { signIn } from './support/session';
import { test, uniqueSuffix } from './support/seed';

// The member tests need the local Supabase stack (npx supabase start) and SUPABASE_SERVICE_ROLE_KEY in .env.local,
// like the other specs that sign in. The service worker has its own spec, offline.spec.ts, which needs a production build.

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const SHARED_TEXT = encodeURIComponent('Olha esse clipe https://youtu.be/dQw4w9WgXcQ?si=abc');

test.describe('what the browser needs to install the app', () => {
  test('the manifest, the icons and the service worker load without a session', async ({ request }) => {
    const manifestResponse = await request.get('/manifest.webmanifest', { maxRedirects: 0 });
    expect(manifestResponse.status()).toBe(200);
    expect(manifestResponse.headers()['content-type']).toContain('manifest+json');
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({
      name: 'Hookbop',
      short_name: 'Hookbop',
      start_url: '/',
      display: 'standalone',
      background_color: '#0E0E10',
      theme_color: '#0E0E10',
      share_target: { action: '/compartilhar', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
    });

    const icons: { src: string; sizes: string; purpose: string }[] = manifest.icons;
    expect(icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const src of [...icons.map((icon) => icon.src), '/icons/apple-touch-icon.png']) {
      const icon = await request.get(src, { maxRedirects: 0 });
      expect(icon.status(), src).toBe(200);
      expect(icon.headers()['content-type'], src).toBe('image/png');
    }

    const worker = await request.get('/sw.js', { maxRedirects: 0 });
    expect(worker.status()).toBe(200);
    expect(worker.headers()['content-type']).toContain('javascript');
  });

  test('every page links the manifest, the theme color and the iPhone icon', async ({ page }) => {
    await page.goto('/entrar');

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0E0E10');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  });
});

test.describe('sharing from the YouTube app', () => {
  test('somebody who is not signed in is sent to sign in', async ({ request }) => {
    const response = await request.get(`/compartilhar?text=${SHARED_TEXT}`, { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location, response.url()).pathname).toBe('/entrar');
  });

  test('a member lands on the shared song, or on the home page with the message when it was not a video', async ({
    page,
    seed,
  }) => {
    const maria = await seed.member({ name: `Maria ${uniqueSuffix()}` });
    await signIn(page, maria.email);
    await expect(page).toHaveURL(/\/$/);

    // The redirect itself: temporary, to a path on the same site, with the video id and nothing else.
    const redirect = await page.request.get(`/compartilhar?title=Rick&text=${SHARED_TEXT}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    const target = new URL(redirect.headers().location, redirect.url());
    expect(target.origin).toBe(new URL(page.url()).origin);
    expect(target.pathname + target.search).toBe('/jogar/dQw4w9WgXcQ');

    // A browser that follows it ends on the song.
    await page.goto(`/compartilhar?title=Rick&text=${SHARED_TEXT}`);
    await expect(page).toHaveURL(/\/jogar\/dQw4w9WgXcQ$/);

    // Something that is not a video link ends on the home page, which says so.
    await page.goto('/compartilhar?text=oi');
    await expect(page).toHaveURL(/\/\?erro=link$/);
    await expect(page.getByText('Esse link não parece do YouTube.')).toBeVisible();
    await expect(page.getByLabel('Link do YouTube')).toHaveAttribute('aria-invalid', 'true');

    // Typing anything takes the message away, like any other time.
    await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
    await expect(page.getByText('Esse link não parece do YouTube.')).toHaveCount(0);
  });
});

test.describe('the install prompt', () => {
  async function finishedAFirstSong(page: import('@playwright/test').Page) {
    await page.evaluate(() => localStorage.setItem('hb_first_finish', '1'));
    await page.goto('/');
  }

  test('on Android it waits for the first song, then offers the browser install and opens it on "Instalar"', async ({
    page,
    seed,
  }) => {
    const maria = await seed.member({ name: `Maria ${uniqueSuffix()}` });
    await signIn(page, maria.email);
    await expect(page.getByLabel('Link do YouTube')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Instalar' })).toHaveCount(0);

    await finishedAFirstSong(page);
    await expect(page.getByLabel('Link do YouTube')).toBeVisible();

    // Chrome sends the offer by itself on an installable page. Here it is sent by hand, until the page is listening.
    const instalar = page.getByRole('button', { name: 'Instalar' });
    await expect(async () => {
      await page.evaluate(() => {
        const offer = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(offer, {
          prompt: () => {
            (window as unknown as { installAsked: boolean }).installAsked = true;
            return Promise.resolve();
          },
          userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
        });
        window.dispatchEvent(offer);
      });
      await expect(instalar).toBeVisible({ timeout: 500 });
    }).toPass();

    await instalar.click();

    await expect.poll(() => page.evaluate(() => (window as unknown as { installAsked?: boolean }).installAsked)).toBe(true);
    await expect(instalar).toHaveCount(0);
  });

  test.describe('on an iPhone', () => {
    test.use({ userAgent: IPHONE_UA });

    test('it tells how to add the app to the home screen after the first song, until "Agora não"', async ({
      page,
      seed,
    }) => {
      const hint = page.getByText('Toque em Compartilhar e depois em Adicionar à Tela de Início');
      const maria = await seed.member({ name: `Maria ${uniqueSuffix()}` });
      await signIn(page, maria.email);
      await expect(page.getByLabel('Link do YouTube')).toBeVisible();
      await expect(hint).toHaveCount(0);

      await finishedAFirstSong(page);
      await expect(hint).toBeVisible();
      await expect(page.getByRole('button', { name: 'Instalar' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Agora não' }).click();
      await expect(hint).toHaveCount(0);

      await page.reload();
      await expect(page.getByLabel('Link do YouTube')).toBeVisible();
      await expect(hint).toHaveCount(0);
    });
  });
});
