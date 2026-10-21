import { expect, test } from '@playwright/test';

// Until Task 8 the home page is public, so no sign-in is needed.
test('home page shows the hookbop logo', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('img', { name: 'hookbop' })).toBeVisible();
});
