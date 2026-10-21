import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { t } from '@/i18n/t';
import { currentUserId } from '@/lib/auth/currentUser';
import { loginPath } from '@/lib/auth/paths';
import { appUrl } from '@/lib/env';
import { inviteUrl, listMyInvites, whatsappInviteUrl, type MyInvite } from '@/lib/supabase/invites';
import { createServerSupabase } from '@/lib/supabase/server';
import { inviteQrSvg } from '@/lib/qr';
import { CopyLinkButton } from './CopyLinkButton';
import { CreateInviteForm } from './CreateInviteForm';

// The newest invite nobody has used yet: the one to send now.
async function SharePanel({ code }: { code: string }) {
  const url = inviteUrl(code, appUrl());
  const qr = await inviteQrSvg(url);

  return (
    <section className="flex flex-col items-center gap-3 rounded-card border border-border bg-card p-4">
      <div
        role="img"
        aria-label={t('convidar.qrLabel')}
        className="w-48 overflow-hidden rounded-answer bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        // Markup made by the qrcode library from our own link; see inviteQrSvg.
        dangerouslySetInnerHTML={{ __html: qr }}
      />
      <a
        href={whatsappInviteUrl(code, appUrl())}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 w-full items-center justify-center rounded-button border border-lime px-4 text-button font-semibold text-lime focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
      >
        {t('convidar.whatsapp')}
      </a>
      {/* A new key per invite, so "Link copiado!" never lingers on the next one. */}
      <CopyLinkButton key={code} url={url} />
    </section>
  );
}

function InviteList({ invites }: { invites: MyInvite[] }) {
  return (
    <section aria-labelledby="meus-convites" className="flex flex-col gap-2">
      <h2 id="meus-convites" className="text-button font-semibold text-muted">
        {t('convidar.listTitle')}
      </h2>
      <ul className="flex flex-col gap-2">
        {invites.map((invite) => (
          <li
            key={invite.code}
            className="flex min-h-11 items-center justify-between gap-3 rounded-answer bg-card px-4 py-2"
          >
            <span className="font-mono text-body tracking-wider">{invite.code}</span>
            <span className={invite.usedByName ? 'text-body font-semibold text-lime' : 'text-body text-muted'}>
              {invite.usedByName ?? t('convidar.waiting')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Reads the signed-in member's invites, which is request-time work, so it streams in behind Suspense.
async function Invites() {
  const supabase = await createServerSupabase();
  const userId = await currentUserId(supabase);
  // src/proxy.ts already keeps the signed-out away; this only covers a session that ended in between.
  if (!userId) redirect(loginPath());

  const invites = await listMyInvites(supabase, userId);
  const next = invites.find((invite) => invite.usedByName === null);

  return (
    <>
      <CreateInviteForm />
      {next && <SharePanel code={next.code} />}
      {invites.length > 0 && <InviteList invites={invites} />}
    </>
  );
}

export default function ConvidarPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-6 p-6">
      <h1 className="font-heading text-title font-bold">{t('convidar.title')}</h1>
      <Suspense fallback={null}>
        <Invites />
      </Suspense>
    </main>
  );
}
