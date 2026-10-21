import { expect } from '@playwright/test';
import { signIn } from './support/session';
import { randomInviteCode, test, uniqueSuffix } from './support/seed';

// These need the local Supabase stack (npx supabase start) and SUPABASE_SERVICE_ROLE_KEY in
// .env.local: the tests create members and invites with the service role key and delete them
// again when they finish.

test.describe('invite page, without a session', () => {
  test('says a code nobody could have been given does not exist', async ({ page }) => {
    await page.goto('/convite/NAOEXISTE1');

    await expect(page.getByText('Esse convite não existe.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
  });

  test('says the same of a well-formed code that nobody made', async ({ page }) => {
    await page.goto(`/convite/${randomInviteCode()}`);

    await expect(page.getByText('Esse convite não existe.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
  });

  test('welcomes someone with a valid code in the name of who sent it, and keeps the code for sign-in', async ({
    page,
    context,
    seed,
  }) => {
    const name = `Maria ${uniqueSuffix()}`;
    const inviter = await seed.member({ name });
    const code = await seed.invite({ createdBy: inviter.id });

    await page.goto(`/convite/${code}`);

    await expect(page.getByRole('img', { name: 'DJ Bop' })).toBeVisible();
    await expect(page.getByText(`O ${name} te chamou pro Hookbop`)).toBeVisible();

    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/entrar$/);
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === 'hb_invite')).toMatchObject({
      value: code,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
    });
  });

  test('sends someone with a used code to ask who sent it, and names no one', async ({ page, seed }) => {
    const name = `Maria ${uniqueSuffix()}`;
    const inviter = await seed.member({ name });
    const friend = await seed.member({ name: `Joana ${uniqueSuffix()}` });
    const code = await seed.invite({ createdBy: inviter.id, usedBy: friend.id });

    await page.goto(`/convite/${code}`);

    await expect(page.getByText('Pede um convite pra quem te mandou.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(name);
    await expect(page.locator('body')).not.toContainText(friend.name);
  });

  test('does not keep the code of an invite that was used, even when its button is posted by hand', async ({
    page,
    seed,
  }) => {
    const inviter = await seed.member({ name: `Maria ${uniqueSuffix()}` });
    const friend = await seed.member({ name: `Joana ${uniqueSuffix()}` });
    const used = await seed.invite({ createdBy: inviter.id, usedBy: friend.id });
    const open = await seed.invite({ createdBy: inviter.id });

    const refused = await page.request.post(`/convite/${used}/entrar`, { maxRedirects: 0 });
    expect(refused.status()).toBe(303);
    expect(refused.headers()['location']).toMatch(new RegExp(`/convite/${used}$`));
    expect(refused.headers()['set-cookie']).toBeUndefined();

    const accepted = await page.request.post(`/convite/${open}/entrar`, { maxRedirects: 0 });
    expect(accepted.status()).toBe(303);
    expect(accepted.headers()['location']).toMatch(/\/entrar$/);
    expect(accepted.headers()['set-cookie']).toContain(`hb_invite=${open}`);
  });
});

test.describe('/convidar', () => {
  test('a member makes invites, shares them, and sees who joined', async ({ page, browser, context, baseURL, seed }) => {
    const maria = await seed.member({ name: `Maria ${uniqueSuffix()}` });
    await signIn(page, maria.email);
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/convidar');
    const create = page.getByRole('button', { name: 'Criar convite' });
    const qr = page.getByRole('img', { name: 'QR code do convite' });
    const whatsapp = page.getByRole('link', { name: 'Mandar no WhatsApp' });
    const invites = page.getByRole('region', { name: 'Meus convites' }).getByRole('listitem');
    await expect(create).toBeVisible();
    await expect(qr).toHaveCount(0);
    await expect(invites).toHaveCount(0);

    // The code the WhatsApp button would send, read from the message it prepares.
    const sharedCode = async () => {
      const text = new URL((await whatsapp.getAttribute('href')) ?? '').searchParams.get('text');
      const match = text?.match(/^Bora jogar Hookbop comigo\? Aprende inglês com música\. Seu convite: (\S+)\/convite\/([A-Z2-9]{10})$/);
      expect(match, `unexpected WhatsApp text: ${text}`).not.toBeNull();
      expect(match?.[1]).toBe(baseURL);
      return match![2];
    };

    // One press, one invite, ready to send.
    await create.click();
    await expect(qr.locator('svg')).toBeVisible();
    await expect(whatsapp).toHaveAttribute('target', '_blank');
    await expect(invites).toHaveCount(1);
    const first = await sharedCode();
    await expect(invites.first()).toContainText(first);
    await expect(invites.first()).toContainText('esperando');

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copiar link' }).click();
    await expect(page.getByText('Link copiado!')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/convite/${first}`);

    // Another press, another invite, and the newest one comes first.
    await create.click();
    await expect(invites).toHaveCount(2);
    await expect.poll(sharedCode).not.toBe(first);
    const second = await sharedCode();
    await expect(invites.nth(0)).toContainText(second);
    await expect(invites.nth(1)).toContainText(first);
    await expect(page.getByText('Link copiado!')).toHaveCount(0);

    const stored = await seed.db.from('invites').select('code, created_by, used_by').eq('created_by', maria.id);
    expect(stored.data?.map((row) => row.code).sort()).toEqual([first, second].sort());
    expect(stored.data?.every((row) => row.used_by === null)).toBe(true);

    // A friend opens the first link, taps Entrar, signs in and is let in.
    const friendEmail = seed.newcomerEmail();
    const friendContext = await browser.newContext({ baseURL });
    const friend = await friendContext.newPage();
    await friend.goto(`/convite/${first}`);
    await expect(friend.getByText(`O ${maria.name} te chamou pro Hookbop`)).toBeVisible();
    await friend.getByRole('button', { name: 'Entrar' }).click();
    await expect(friend).toHaveURL(/\/entrar$/);
    await signIn(friend, friendEmail);
    await expect(friend).toHaveURL(/\/$/);
    await friendContext.close();

    // Back on Maria's screen: that invite now carries the friend's name, and the other one is offered.
    await page.reload();
    const used = invites.filter({ hasText: first });
    await expect(used).toContainText(friendEmail.split('@')[0]);
    await expect(used).not.toContainText('esperando');
    await expect(invites.filter({ hasText: second })).toContainText('esperando');
    expect(await sharedCode()).toBe(second);
  });
});

test.describe('/admin', () => {
  test('sends a member who is not the owner to the home page', async ({ page, seed }) => {
    const member = await seed.member({ name: `Joana ${uniqueSuffix()}` });
    await signIn(page, member.email);
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/admin');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Membros' })).toHaveCount(0);
    await expect(page.getByText(/^\d+ de \d+$/)).toHaveCount(0);
  });

  test('shows the owner who is in, how many of how many, and lets them remove someone', async ({
    page,
    browser,
    baseURL,
    seed,
  }) => {
    const suffix = uniqueSuffix();
    const owner = await seed.member({ name: `Chefe ${suffix}`, owner: true });
    const joana = await seed.member({ name: `Joana ${suffix}` });
    const caio = await seed.member({ name: `Caio ${suffix}` });
    const cap = Number((await seed.db.from('app_config').select('value').eq('key', 'member_cap').maybeSingle()).data?.value ?? 50);

    // Joana is signed in on her own phone while the owner is on this page.
    const joanaContext = await browser.newContext({ baseURL });
    const joanaPhone = await joanaContext.newPage();
    await signIn(joanaPhone, joana.email);
    await expect(joanaPhone).toHaveURL(/\/$/);

    await signIn(page, owner.email);
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Membros' })).toBeVisible();
    const rows = page.getByRole('main').getByRole('list').getByRole('listitem');
    // The count and the list are drawn together, so they always agree.
    const count = page.getByText(/^\d+ de \d+$/);
    await expect(count).toBeVisible();
    await expect(count).toHaveText(`${await rows.count()} de ${cap}`);

    const ownerRow = rows.filter({ hasText: owner.name });
    await expect(ownerRow).toContainText('Dono');
    await expect(ownerRow.getByRole('button')).toHaveCount(0);
    const joanaRow = rows.filter({ hasText: joana.name });
    await expect(joanaRow).toContainText(/Entrou em \d{2}\/\d{2}\/\d{4}/);

    await joanaRow.getByRole('button', { name: `Remover ${joana.name}` }).click();

    await expect(joanaRow).toHaveCount(0);
    await expect(rows.filter({ hasText: caio.name })).toHaveCount(1);
    await expect(rows.filter({ hasText: owner.name })).toHaveCount(1);
    const removed = await seed.db.from('profiles').select('removed_at').eq('id', joana.id).single();
    expect(removed.data?.removed_at).not.toBeNull();

    // Joana is out: her next page load bounces.
    await joanaPhone.goto('/');
    await expect(joanaPhone).toHaveURL(/\/entrar\?estado=sem-convite$/);
    await joanaContext.close();
  });
});
