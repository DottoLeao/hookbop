import { expect } from '@playwright/test';
import { signIn } from './support/session';
import { test, uniqueSuffix } from './support/seed';

// The service worker only exists in the production build (see src/components/pwa/RegisterSW.tsx), so this spec skips
// itself against `next dev`. To run it:
//
//   npx next build
//   npx next start            (port 3000, which is where Playwright looks and then does not start its own server)
//   $env:PW_PRODUCTION = '1'; npx playwright test e2e/offline.spec.ts
//
// It also needs the local Supabase stack and SUPABASE_SERVICE_ROLE_KEY in .env.local, like the other specs that sign in.
test.skip(process.env.PW_PRODUCTION !== '1', 'needs the production build, see the top of this file');

test('a member reopens the home page with no network, and the sign-in page is not kept', async ({ page, context, seed }) => {
  const maria = await seed.member({ name: `Maria ${uniqueSuffix()}` });
  await signIn(page, maria.email);
  await expect(page.getByLabel('Link do YouTube')).toBeVisible();

  // The worker takes over the open page, then a visit it handles is the one it keeps.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.reload();
  await expect(page.getByLabel('Link do YouTube')).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  // The page is the kept one, and its scripts are the kept ones too: the box still answers.
  const field = page.getByLabel('Link do YouTube');
  await expect(field).toBeVisible();
  await field.fill('olha essa');
  await page.getByRole('button', { name: 'Jogar', exact: true }).click();
  await expect(page.getByText('Esse link não parece do YouTube.')).toBeVisible();

  // Sign-in is never kept: offline it is the browser's own error page, not a copy.
  await expect(page.goto('/entrar')).rejects.toThrow();

  await context.setOffline(false);
});
