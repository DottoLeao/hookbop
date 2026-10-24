import Link from 'next/link';
import type { ReactNode } from 'react';
import { focusRing } from '@/components/game/styles';
import { t } from '@/i18n/t';

const pill = `flex min-h-11 items-center rounded-full border-[1.5px] border-border px-4 text-body font-semibold text-text ${focusRing}`;

function Pill({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={pill}>
      {children}
    </Link>
  );
}

const footLink = `flex min-h-11 items-center rounded-button px-2 text-label text-muted underline ${focusRing}`;

/**
 * The shortcuts at the foot of the home page: "Convidar" for every member, "Admin" and "Métricas" for the owner only,
 * the privacy policy and the third-party licences. For anyone else the owner's two links are not in the page at all,
 * so nothing in it names them. The licences are a plain text file, which opens in a new tab: an app installed on the
 * phone has no way back from a page that is not its own. The privacy policy is an app page with its own way back.
 */
export function HomeLinks({ showAdmin }: { showAdmin: boolean }) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <div className="flex flex-wrap gap-2">
        <Pill href="/convidar">{t('home.invite')}</Pill>
        {showAdmin && (
          <>
            <Pill href="/admin">{t('home.admin')}</Pill>
            <Pill href="/admin/metricas">{t('home.metrics')}</Pill>
          </>
        )}
      </div>
      <div className="flex">
        <Link href="/privacidade" className={footLink}>
          {t('privacidade.link')}
        </Link>
        <a href="/licencas.txt" target="_blank" rel="noopener noreferrer" className={footLink}>
          {t('home.licenses')}
        </a>
      </div>
    </nav>
  );
}
