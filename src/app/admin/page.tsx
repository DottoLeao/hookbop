import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { t } from '@/i18n/t';
import { currentUserId } from '@/lib/auth/currentUser';
import { formatDate } from '@/lib/format';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { listActiveMembers, memberCap } from '@/lib/supabase/members';
import { createServerSupabase } from '@/lib/supabase/server';
import { RemoveMemberForm } from './RemoveMemberForm';

// The owner's page. Anyone else is sent to the home page before anything of it is read;
// src/proxy.ts has already kept out whoever is not a member at all.
async function Members() {
  const supabase = await createServerSupabase();
  const userId = await currentUserId(supabase);
  const members = await listActiveMembers(supabase);
  if (!members.some((member) => member.id === userId && member.isOwner)) redirect('/');

  // The cap is a server setting no member can read; only the number comes back.
  const cap = await memberCap(createServiceSupabase());

  return (
    <>
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-heading text-title font-bold">{t('admin.title')}</h1>
        <p className="text-button font-semibold text-muted">{t('admin.count', { n: members.length, max: cap })}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex min-h-14 items-center justify-between gap-3 rounded-answer bg-card px-4 py-2"
          >
            <div className="flex min-w-0 flex-col">
              <p className="flex items-center gap-2 text-button font-semibold">
                <span className="truncate">{member.displayName}</span>
                {member.isOwner && (
                  <span className="shrink-0 rounded-full bg-lime px-2 text-label font-semibold text-bg">
                    {t('admin.owner')}
                  </span>
                )}
              </p>
              <p className="text-label text-muted">{t('admin.joined', { data: formatDate(member.joinedAt) })}</p>
            </div>
            {/* The owner cannot be removed (remove_member refuses), so there is no button to press. */}
            {!member.isOwner && <RemoveMemberForm userId={member.id} name={member.displayName} />}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-6 p-6">
      <Suspense fallback={null}>
        <Members />
      </Suspense>
    </main>
  );
}
