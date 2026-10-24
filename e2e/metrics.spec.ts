import { expect } from '@playwright/test';
import { signIn } from './support/session';
import { test, uniqueSuffix } from './support/seed';

// These need the local Supabase stack (npx supabase start, with migration 0006 applied) and SUPABASE_SERVICE_ROLE_KEY in
// .env.local, like the other specs that sign in: they create a member and an owner, and delete them afterwards.

test.describe('the owner’s metrics panel', () => {
  test('does not exist for a member: the not-found page, and a bare 404 for the export', async ({ page, seed }) => {
    const suffix = uniqueSuffix();
    const maria = await seed.member({ name: `Maria ${suffix}` });

    await signIn(page, maria.email);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Convidar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Métricas' })).toHaveCount(0);

    // The page streams like /admin: its empty shell goes out before the owner check answers, so the status is already
    // 200 when notFound() runs (see node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md).
    // What a member gets is Next's not-found page, kept out of search engines, with nothing of the panel in it.
    await page.goto('/admin/metricas?dias=7');
    await expect(page.getByText('This page could not be found.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Métricas' })).toHaveCount(0);
    const html = await (await page.request.get('/admin/metricas?dias=7')).text();
    expect(html).toContain('noindex');
    for (const text of ['Gasto da IA', 'Exportar dados', 'Carregando as métricas', 'exportar?dias', 'Cotação']) {
      expect(html).not.toContain(text);
    }

    for (const query of ['', '?dias=7']) {
      const exported = await page.request.get(`/admin/metricas/exportar${query}`);
      expect(exported.status()).toBe(404);
      expect(await exported.text()).toBe('');
      expect(exported.headers()['content-disposition']).toBeUndefined();
    }
    // Not a 405, and no list of the methods the route has.
    const posted = await page.request.post('/admin/metricas/exportar');
    expect(posted.status()).toBe(404);
    const options = await page.request.fetch('/admin/metricas/exportar', { method: 'OPTIONS' });
    expect(options.status()).toBe(404);
    expect(options.headers().allow).toBeUndefined();
  });

  test('the owner opens it from the home page, changes the period and downloads the export', async ({ page, seed }) => {
    const owner = await seed.member({ name: `Dono ${uniqueSuffix()}`, owner: true });

    await signIn(page, owner.email);
    await page.getByRole('link', { name: 'Métricas' }).click();

    await expect(page).toHaveURL(/\/admin\/metricas$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Métricas' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Gasto da IA' })).toBeVisible();
    await expect(page.getByText('Últimos 30 dias, horário de Brasília', { exact: false }).first()).toBeVisible();

    await page.getByRole('link', { name: '7 dias' }).click();
    await expect(page).toHaveURL(/\/admin\/metricas\?dias=7$/);
    await expect(page.getByText('Últimos 7 dias, horário de Brasília', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Exportar dados' })).toHaveAttribute('href', '/admin/metricas/exportar?dias=7');

    const exported = await page.request.get('/admin/metricas/exportar?dias=7');
    expect(exported.status()).toBe(200);
    expect(exported.headers()['cache-control']).toBe('no-store');
    expect(exported.headers()['content-disposition']).toMatch(
      /^attachment; filename="hookbop-metricas-\d{4}-\d{2}-\d{2}-7dias\.json"$/,
    );
    const body = await exported.json();
    expect(body).toMatchObject({ schemaVersion: 1, timeZone: 'America/Sao_Paulo', period: { days: 7 } });
    expect(Array.isArray(body.records.ai_usage)).toBe(true);
    expect(Array.isArray(body.records.app_events)).toBe(true);
  });
});
