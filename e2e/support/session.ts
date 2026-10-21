import { expect, type Page } from '@playwright/test';
import { waitForSignInMail } from './mailpit';

/**
 * Signs `email` in the way a person does: asks for the e-mail on /entrar and types the six-digit
 * code from it. Ends on whatever page the app sends that person to.
 */
export async function signIn(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('Seu e-mail').fill(email);
  await page.getByRole('button', { name: 'Receber link por e-mail' }).click();
  await expect(page.getByText('Link enviado! Confere seu e-mail.')).toBeVisible();

  const { code } = await waitForSignInMail(email);
  await page.getByLabel('Ou digite o código do e-mail').fill(code);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
