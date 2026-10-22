import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { waitForSignInMail } from './support/mailpit';

test.describe('without a session', () => {
  test('opening the home page lands on the sign-in page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/entrar$/);
    await expect(page.getByRole('img', { name: 'hookbop' })).toBeVisible();
  });

  for (const path of ['/jogar/dQw4w9WgXcQ', '/convidar', '/admin', '/api/help', '/api/song']) {
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

  const errors = {
    link: 'Esse link não rolou. Pede um novo aqui.',
    servico: 'Não rolou conferir seu acesso. Tenta de novo?',
  };
  for (const [erro, message] of Object.entries(errors)) {
    test(`?erro=${erro} says "${message}"`, async ({ page }) => {
      await page.goto(`/entrar?erro=${erro}`);

      await expect(page.getByRole('status')).toHaveText(message);
      await expect(page.getByRole('button', { name: 'Receber link por e-mail' })).toBeVisible();
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

async function requestLink(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('Seu e-mail').fill(email);
  await page.getByRole('button', { name: 'Receber link por e-mail' }).click();
  await expect(page.getByText('Link enviado! Confere seu e-mail.')).toBeVisible();
}

async function enterCode(page: Page, code: string) {
  await page.getByLabel('Ou digite o código do e-mail').fill(code);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

// These need the local Supabase stack (npx supabase start), which also runs Mailpit.
test.describe('e-mail link', () => {
  test('someone with no invite gets in the door but not into the app', async ({ page }) => {
    const email = `sem-convite-${randomUUID()}@example.com`;
    await requestLink(page, email);

    await page.goto((await waitForSignInMail(email)).link);

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
    await requestLink(page, email);
    const { link } = await waitForSignInMail(email);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(link);

    await expect(otherPage).toHaveURL(/\/entrar\?erro=link$/);
    await expect(otherPage.getByText('Esse link não rolou. Pede um novo aqui.')).toBeVisible();
    await expect(otherPage.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
    await other.close();
  });
});

// The installed iOS app cannot take the link: Mail opens it in Safari, which has no
// access to the app's session. The six-digit code is typed where it was asked for.
test.describe('six-digit code', () => {
  test('is not asked for before a link has been sent', async ({ page }) => {
    await page.goto('/entrar');

    await expect(page.getByLabel('Ou digite o código do e-mail')).toHaveCount(0);
  });

  test('signs in someone new, who still has no invite', async ({ page }) => {
    const email = `codigo-${randomUUID()}@example.com`;
    await requestLink(page, email);
    const { code } = await waitForSignInMail(email);

    await enterCode(page, code);

    await expect(page).toHaveURL(/\/entrar\?estado=sem-convite$/);
    await expect(page.getByText('Pede um convite pra quem te mandou.')).toBeVisible();

    // The session is real, yet every member page still bounces.
    await page.goto('/jogar/dQw4w9WgXcQ');
    await expect(page).toHaveURL(/\/entrar\?estado=sem-convite$/);
  });

  test('signs in someone who already has an account, from the second e-mail', async ({ page, browser }) => {
    const email = `volta-${randomUUID()}@example.com`;
    await requestLink(page, email);
    await enterCode(page, (await waitForSignInMail(email)).code);
    await expect(page).toHaveURL(/\/entrar\?estado=sem-convite$/);

    // A later visit, from a device with no session: same address, a new e-mail.
    const later = await browser.newContext();
    const laterPage = await later.newPage();
    await requestLink(laterPage, email);
    await enterCode(laterPage, (await waitForSignInMail(email, { nth: 2 })).code);

    await expect(laterPage).toHaveURL(/\/entrar\?estado=sem-convite$/);
    await later.close();
  });

  test('refuses a wrong code and lets it be typed again', async ({ page }) => {
    const email = `errado-${randomUUID()}@example.com`;
    await requestLink(page, email);
    const { code } = await waitForSignInMail(email);

    await enterCode(page, code === '000000' ? '111111' : '000000');

    // Next.js has its own role=alert (the route announcer), so find the message by its text.
    await expect(page.getByText('Código inválido. Confere e tenta de novo.')).toBeVisible();
    await expect(page).toHaveURL(/\/entrar$/);

    await enterCode(page, code);
    await expect(page).toHaveURL(/\/entrar\?estado=sem-convite$/);
  });
});
