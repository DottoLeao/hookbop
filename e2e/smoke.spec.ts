import { expect, test } from '@playwright/test';

// "/" is for members only, so the smoke test opens the public sign-in page.
test('sign-in page shows the hookbop logo', async ({ page }) => {
  await page.goto('/entrar');

  await expect(page.getByRole('img', { name: 'hookbop' })).toBeVisible();
});
