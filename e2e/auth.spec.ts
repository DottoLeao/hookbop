import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { waitForSignInLink } from './support/mailpit';

test.describe('without a session', () => {
  test('opening the home page lands on the sign-in page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/entrar$/);
    await expect(page.getByRole('img', { name: 'hookbop' })).toBeVisible();
  });

  for (const path of ['/jogar/dQw4w9WgXcQ', '/convidar', '/admin', '/api/help']) {
    test(`${path} is members only`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/entrar$/);
    });
  }
});

test.describe('sign-in page', () => {
  test('offers Google and an e-mail link, with no message by default', async ({ page }) => {
    await page.goto('/entrar');

    await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
    await expect(page.getByLabel('Seu e-mail')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Receber link por e-mail' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  const reasons = {
    'sem-convite': 'Pede um convite pra quem te mandou.',
    used: 'Pede um convite pra quem te mandou.',
    full: 'A galera tá cheia por enquanto.',
    removed: 'Seu acesso foi pausado.',
    not_found: 'Esse convite não existe.',
  };
  for (const [estado, message] of Object.entries(reasons)) {
    test(`?estado=${estado} says "${message}"`, async ({ page }) => {
      await page.goto(`/entrar?estado=${estado}`);

      await expect(page.getByRole('status')).toHaveText(message);
    });
  }

  test('?estado with an unknown value shows no message', async ({ page }) => {
    await page.goto('/entrar?estado=qualquer-coisa');

    await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('the Google button starts sign-in and asks to come back to the callback route', async ({ page }) => {
    // Google is not configured on the local Supabase, so stop the request there.
    let authorizeUrl = '';
    await page.route('**/auth/v1/authorize**', (route) => {
      authorizeUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
    });
    await page.goto('/entrar');

    await page.getByRole('button', { name: 'Entrar com Google' }).click();

    await expect.poll(() => authorizeUrl).not.toBe('');
    const url = new URL(authorizeUrl);
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe('http://localhost:3000/auth/callback');
  });
});

// These need the local Supabase stack (npx supabase start), which also runs Mailpit.
test.describe('e-mail link', () => {
  test('someone with no invite gets in the door but not into the app', async ({ page }) => {
    const email = `sem-convite-${randomUUID()}@example.com`;
    await page.goto('/entrar');
    await page.getByLabel('Seu e-mail').fill(email);
    await page.getByRole('button', { name: 'Receber link por e-mail' }).click();
    await expect(page.getByText('Link enviado! Confere seu e-mail.')).toBeVisible();

    await page.goto(await waitForSignInLink(email));

    await expect(page).toHaveURL(/\/entrar\?estado=sem-convite$/);
    await expect(page.getByText('Pede um convite pra quem te mandou.')).toBeVisible();

    // The session is real, yet every member page still bounces.
    await page.goto('/');
    await expect(page).toHaveURL(/\/entrar\?estado=sem-convite$/);
  });

  test('a link opened without the browser that asked for it goes back to sign-in', async ({
    page,
    browser,
  }) => {
    const email = `outro-navegador-${randomUUID()}@example.com`;
    await page.goto('/entrar');
    await page.getByLabel('Seu e-mail').fill(email);
    await page.getByRole('button', { name: 'Receber link por e-mail' }).click();
    await expect(page.getByText('Link enviado! Confere seu e-mail.')).toBeVisible();
    const link = await waitForSignInLink(email);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(link);

    await expect(otherPage).toHaveURL(/\/entrar$/);
    await expect(otherPage.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
    await other.close();
  });
});
