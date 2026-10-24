import { connection } from 'next/server';
import { EmptyNote, MetricCard, Stat, Stats } from '@/components/admin/MetricCard';
import { Projection } from '@/components/admin/Projection';
import { t, type MessageKey } from '@/i18n/t';
import { HELP_MODEL, PRICES } from '@/lib/help/pricing';
import {
  formatBrl,
  formatCount,
  formatGameLength,
  formatLatency,
  formatMonthName,
  formatPercent,
  formatShortDay,
  formatUsd,
} from '@/lib/metrics/format';
import type { Period, PeriodDays } from '@/lib/metrics/period';
import { readPanelData } from '@/lib/metrics/queries';
import type { PanelData } from '@/lib/metrics/summary';
import { createServiceSupabase } from '@/lib/supabase/admin';
import type { Mode } from '@/lib/types';
import { BrlRateForm } from './BrlRateForm';

const MODE_NAMES: Record<Mode, MessageKey> = {
  escolha: 'modo.escolha',
  digitacao: 'modo.digitacao',
  karaoke: 'modo.karaoke',
  montar: 'modo.montar',
};

function modeName(mode: string | null): string {
  if (mode === null) return t('metricas.help.noMode');
  return Object.hasOwn(MODE_NAMES, mode) ? t(MODE_NAMES[mode as Mode]) : mode;
}

const NONE = t('metricas.none');

function usdOrNone(value: number | null): string {
  return value === null ? NONE : formatUsd(value);
}

function percentOrNone(share: number | null): string {
  return share === null ? NONE : formatPercent(share);
}

function periodLabel(days: PeriodDays, period: Period): string {
  return t('metricas.periodRange', { n: days, de: formatShortDay(period.firstDay), ate: formatShortDay(period.lastDay) });
}

function monthLabel(month: Period): string {
  return t('metricas.monthRange', {
    mes: formatMonthName(month.firstDay),
    de: formatShortDay(month.firstDay),
    ate: formatShortDay(month.lastDay),
  });
}

/** Dollars, with reais under them. */
function MoneyStat({ label, usd, rate }: { label: string; usd: number | null; rate: number }) {
  return (
    <Stat
      label={label}
      value={usdOrNone(usd)}
      detail={usd === null ? undefined : t('metricas.inBrl', { valor: formatBrl(usd * rate) })}
    />
  );
}

function Spend({ panel }: { panel: PanelData }) {
  return (
    <MetricCard id="gasto" title={t('metricas.spend.title')}>
      <Stats columns={1}>
        <MoneyStat label={periodLabel(panel.days, panel.period)} usd={panel.spend.periodUsd} rate={panel.brlRate} />
        <MoneyStat label={monthLabel(panel.month)} usd={panel.spend.monthUsd} rate={panel.brlRate} />
      </Stats>
    </MetricCard>
  );
}

function Averages({ panel, caption }: { panel: PanelData; caption: string }) {
  const { averages, brlRate } = panel;
  return (
    <MetricCard id="custo-medio" title={t('metricas.average.title')} caption={caption}>
      <Stats>
        <MoneyStat label={t('metricas.average.perPerson')} usd={averages.perPersonUsd} rate={brlRate} />
        <MoneyStat label={t('metricas.average.perGame')} usd={averages.perGameUsd} rate={brlRate} />
        <MoneyStat label={t('metricas.average.perSong')} usd={averages.perSongUsd} rate={brlRate} />
      </Stats>
      <p className="text-label text-muted">
        {t('metricas.average.basis', {
          pessoas: formatCount(averages.people),
          partidas: formatCount(averages.gamesStarted),
          musicas: formatCount(averages.songsPlayed),
        })}
      </p>
    </MetricCard>
  );
}

function Ai({ panel, caption }: { panel: PanelData; caption: string }) {
  const { ai } = panel;
  return (
    <MetricCard id="tokens" title={t('metricas.ai.title')} caption={caption}>
      <Stats>
        <Stat label={t('metricas.ai.calls')} value={formatCount(ai.calls)} />
        <Stat
          label={t('metricas.ai.memory')}
          value={percentOrNone(ai.memoryShare)}
          detail={t('metricas.ai.memoryDetail', {
            cache: formatCount(ai.cache),
            reuse: formatCount(ai.reuse),
            model: formatCount(ai.model),
          })}
        />
        <Stat label={t('metricas.ai.inputTokens')} value={formatCount(ai.inputTokens)} size="small" />
        <Stat label={t('metricas.ai.outputTokens')} value={formatCount(ai.outputTokens)} size="small" />
        <Stat
          label={t('metricas.ai.latency')}
          value={ai.avgLatencyMs === null ? NONE : formatLatency(ai.avgLatencyMs)}
          detail={t('metricas.ai.latencyNote')}
          size="small"
        />
      </Stats>
      <p className="text-label text-muted">
        {t('metricas.ai.failures', { recusados: formatCount(ai.declined), erros: formatCount(ai.errors) })}
      </p>
    </MetricCard>
  );
}

function TopModes({ panel, caption }: { panel: PanelData; caption: string }) {
  return (
    <MetricCard id="modos" title={t('metricas.modes.title')} caption={caption}>
      {panel.modes.length === 0 ? (
        <EmptyNote>{t('metricas.empty')}</EmptyNote>
      ) : (
        <ol className="flex flex-col gap-2">
          {panel.modes.map((mode) => (
            <li key={mode.mode} className="flex flex-col rounded-answer bg-elevated px-3 py-2">
              <h3 className="text-button font-semibold">{modeName(mode.mode)}</h3>
              <p className="text-body text-muted tabular-nums">
                {t('metricas.modes.line', { partidas: formatCount(mode.started), escolhas: formatCount(mode.selections) })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </MetricCard>
  );
}

function GamesByMode({ panel, caption }: { panel: PanelData; caption: string }) {
  return (
    <MetricCard id="partidas" title={t('metricas.games.title')} caption={caption}>
      {panel.modes.length === 0 ? (
        <EmptyNote>{t('metricas.empty')}</EmptyNote>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {panel.modes.map((mode) => (
              <li key={mode.mode} className="flex flex-col gap-2 rounded-answer bg-elevated px-3 py-2">
                <h3 className="text-button font-semibold">{modeName(mode.mode)}</h3>
                <Stats columns={3}>
                  <Stat size="small" label={t('metricas.games.started')} value={formatCount(mode.started)} />
                  <Stat size="small" label={t('metricas.games.finished')} value={formatCount(mode.finished)} />
                  <Stat size="small" label={t('metricas.games.exits')} value={formatCount(mode.abandoned)} />
                  <Stat size="small" label={t('metricas.games.completion')} value={percentOrNone(mode.completion)} />
                  <Stat
                    size="small"
                    label={t('metricas.games.avgPct')}
                    value={mode.avgPct === null ? NONE : formatPercent(mode.avgPct / 100)}
                  />
                  <Stat
                    size="small"
                    label={t('metricas.games.avgLength')}
                    value={mode.avgDurationMs === null ? NONE : formatGameLength(mode.avgDurationMs)}
                  />
                </Stats>
              </li>
            ))}
          </ul>
          <p className="text-label text-muted">{t('metricas.games.note')}</p>
        </>
      )}
    </MetricCard>
  );
}

function TopSongs({ panel, caption }: { panel: PanelData; caption: string }) {
  return (
    <MetricCard id="musicas" title={t('metricas.songs.title')} caption={caption}>
      {panel.songs.length === 0 ? (
        <EmptyNote>{t('metricas.empty')}</EmptyNote>
      ) : (
        <ol className="flex flex-col gap-2">
          {panel.songs.map((song) => (
            <li key={song.youtubeId} className="flex min-w-0 flex-col rounded-answer bg-elevated px-3 py-2">
              <h3 className="text-button font-semibold break-words">
                {song.title ?? t('metricas.songs.untitled', { id: song.youtubeId })}
              </h3>
              <p className="text-body text-muted tabular-nums">
                {t('metricas.songs.line', {
                  partidas: formatCount(song.started),
                  terminadas: formatCount(song.finished),
                  aberturas: formatCount(song.opens),
                })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </MetricCard>
  );
}

function HelpByMode({ panel, caption }: { panel: PanelData; caption: string }) {
  return (
    <MetricCard id="ajuda" title={t('metricas.help.title')} caption={caption}>
      {panel.help.length === 0 ? (
        <EmptyNote>{t('metricas.empty')}</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-2">
          {panel.help.map((row) => (
            <li key={row.mode ?? ''} className="flex flex-col rounded-answer bg-elevated px-3 py-2">
              <h3 className="flex items-baseline justify-between gap-3 text-button font-semibold">
                <span>{modeName(row.mode)}</span>
                <span className="tabular-nums">{formatCount(row.total)}</span>
              </h3>
              <p className="text-body text-muted tabular-nums">
                {t('metricas.help.line', { explicar: formatCount(row.explain), traduzir: formatCount(row.translate) })}
              </p>
              {row.avgLineIndex !== null && (
                // lineIndex counts lines from 0; people count them from 1.
                <p className="text-body text-muted tabular-nums">
                  {t('metricas.help.avgLine', { n: formatCount(Math.round(row.avgLineIndex + 1)) })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}

function Rate({ rate }: { rate: number }) {
  return (
    <MetricCard id="cotacao" title={t('metricas.rate.title')}>
      <p className="font-heading text-verse font-bold tabular-nums">{t('metricas.rate.current', { valor: formatBrl(rate) })}</p>
      <BrlRateForm rate={rate} />
    </MetricCard>
  );
}

function PriceNote() {
  const price = PRICES[HELP_MODEL];
  const [year, month] = price.asOf.split('-');
  return (
    <p className="text-label text-muted">
      {t('metricas.priceNote', {
        modelo: HELP_MODEL,
        entrada: formatUsd(price.inputPerMTok),
        saida: formatUsd(price.outputPerMTok),
        data: `${month}/${year}`,
      })}
    </p>
  );
}

/**
 * The cards of the owner's panel for the last `days` days, in Brasília time. Only the page renders it, and only once
 * it has checked that the owner is asking: the service client is made here, after that check.
 */
export async function MetricsPanel({ days }: { days: PeriodDays }) {
  // Request time only: "today" is read from the clock.
  await connection();
  const panel = await readPanelData(createServiceSupabase(), { days, now: new Date() });
  const caption = periodLabel(panel.days, panel.period);

  return (
    <>
      <Spend panel={panel} />
      <Averages panel={panel} caption={caption} />
      <MetricCard id="projecao" title={t('metricas.projection.title')}>
        <Projection perPersonUsd={panel.projection.perPersonUsd} people={panel.projection.people} brlRate={panel.brlRate} />
      </MetricCard>
      <Ai panel={panel} caption={caption} />
      <TopModes panel={panel} caption={caption} />
      <GamesByMode panel={panel} caption={caption} />
      <TopSongs panel={panel} caption={caption} />
      <HelpByMode panel={panel} caption={caption} />
      <Rate rate={panel.brlRate} />
      <PriceNote />
    </>
  );
}
