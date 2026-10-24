'use client';

import { useId, useState } from 'react';
import { focusRing } from '@/components/game/styles';
import { t, tCount } from '@/i18n/t';
import { formatBrl, formatCount, formatUsd } from '@/lib/metrics/format';

/** The people a month the projection starts at. */
export const DEFAULT_PROJECTION_PEOPLE = 50;

/** A whole number of people, up to 7 digits, or null. */
function peopleCount(text: string): number | null {
  return /^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/**
 * "With N people a month, the AI would cost X": N, which the owner types, times the cost per active person over the
 * last 30 days in Brasília time (`perPersonUsd`, worked out on the server). It runs in the browser so the number follows
 * the field as it is typed; nothing is sent anywhere.
 */
export function Projection({ perPersonUsd, people, brlRate }: { perPersonUsd: number | null; people: number; brlRate: number }) {
  const [text, setText] = useState(String(DEFAULT_PROJECTION_PEOPLE));
  const id = useId();
  const errorId = `${id}-error`;

  if (perPersonUsd === null) return <p className="text-body text-muted">{t('metricas.projection.noData')}</p>;

  const count = peopleCount(text);
  const costUsd = count === null ? null : count * perPersonUsd;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-label text-muted">
          {t('metricas.projection.people')}
        </label>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={count === null}
          aria-describedby={count === null ? errorId : undefined}
          className={`min-h-11 w-32 rounded-button border-[1.5px] bg-bg px-4 text-button text-text tabular-nums ${focusRing} ${
            count === null ? 'border-error' : 'border-border'
          }`}
        />
      </div>
      {/* Read out again as the number changes. */}
      <div aria-live="polite">
        {costUsd === null || count === null ? (
          <p id={errorId} className="text-body text-error">
            {t('metricas.projection.invalid')}
          </p>
        ) : (
          <div className="flex flex-col">
            <p className="text-body text-muted">
              {t('metricas.projection.result', { pessoas: tCount('metricas.n.people', count, formatCount(count)) })}
            </p>
            <p className="font-heading text-title font-bold tabular-nums">{formatUsd(costUsd)}</p>
            <p className="text-body text-muted tabular-nums">{t('metricas.inBrl', { valor: formatBrl(costUsd * brlRate) })}</p>
          </div>
        )}
      </div>
      <p className="text-label text-muted">
        {t('metricas.projection.basis', {
          valor: formatUsd(perPersonUsd),
          pessoas: tCount('metricas.n.people', people, formatCount(people)),
        })}
      </p>
    </div>
  );
}
