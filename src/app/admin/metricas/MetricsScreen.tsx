import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { focusRing } from '@/components/game/styles';
import { t } from '@/i18n/t';
import { parsePeriodDays, type PeriodDays } from '@/lib/metrics/period';
import { MetricsPanel } from './MetricsPanel';
import { askedByOwner } from './owner';

const PERIODS: readonly PeriodDays[] = [7, 30];

const pill = `flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-body font-semibold ${focusRing}`;

function PeriodSwitch({ days }: { days: PeriodDays }) {
  return (
    <nav aria-label={t('metricas.period')} className="flex gap-2">
      {PERIODS.map((option) => {
        const current = option === days;
        return (
          <Link
            key={option}
            href={`/admin/metricas?dias=${option}`}
            replace
            aria-current={current ? 'page' : undefined}
            className={`${pill} ${current ? 'border-lime bg-lime text-bg' : 'border-border text-text'}`}
          >
            {t('metricas.days', { n: option })}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Everything of the metrics page, for the owner only. Who is asking is checked first, the way /admin checks it; for
 * anyone else this calls notFound() before any of it is drawn and before the service client is made (MetricsPanel
 * makes it). The period comes from `?dias=7` or `?dias=30`; anything else is 30.
 */
export async function MetricsScreen({ searchParams }: { searchParams: Promise<{ dias?: string | string[] }> }) {
  if (!(await askedByOwner())) notFound();
  const days = parsePeriodDays((await searchParams).dias);

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-heading text-title font-bold">{t('metricas.title')}</h1>
          <Link href="/" className={`flex min-h-11 items-center rounded-button px-2 text-body text-muted underline ${focusRing}`}>
            {t('metricas.back')}
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PeriodSwitch days={days} />
          {/* A file, not a page: a plain link, which the browser downloads. */}
          <a
            href={`/admin/metricas/exportar?dias=${days}`}
            download
            className={`flex min-h-11 items-center rounded-button border-[1.5px] border-lime px-4 text-body font-semibold text-lime ${focusRing}`}
          >
            {t('metricas.export')}
          </a>
        </div>
      </header>
      {/* The numbers stream in once read; the header is already there. */}
      <Suspense fallback={<p className="text-body text-muted">{t('metricas.loading')}</p>}>
        <MetricsPanel days={days} />
      </Suspense>
    </>
  );
}
