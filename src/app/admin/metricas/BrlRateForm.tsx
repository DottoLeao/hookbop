'use client';

import { useActionState, useId } from 'react';
import { focusRing } from '@/components/game/styles';
import { t } from '@/i18n/t';
import { formatRateInput } from '@/lib/metrics/format';
import { saveBrlRateAction, type BrlRateState } from './actions';

const IDLE: BrlRateState = { status: 'idle' };

/**
 * Changes the rate the panel turns dollars into reais with. The field takes a comma or a dot (5,50 or 5.50); the action
 * checks the owner and the rate again, so nothing here is trusted. The text is 16 px, which keeps a phone from zooming
 * into the field.
 */
export function BrlRateForm({ rate }: { rate: number }) {
  const [state, formAction, pending] = useActionState(saveBrlRateAction, IDLE);
  const id = useId();
  const messageId = `${id}-message`;
  const invalid = state.status === 'invalid';

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label text-muted">
        {t('metricas.rate.label')}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name="brlRate"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={formatRateInput(rate)}
          aria-invalid={invalid}
          aria-describedby={state.status === 'idle' ? undefined : messageId}
          className={`min-h-11 min-w-0 flex-1 rounded-button border-[1.5px] bg-bg px-4 text-button text-text tabular-nums ${focusRing} ${
            invalid ? 'border-error' : 'border-border'
          }`}
        />
        <button
          type="submit"
          disabled={pending}
          className={`min-h-11 shrink-0 rounded-button bg-lime px-5 text-button font-bold text-bg disabled:opacity-60 ${focusRing}`}
        >
          {t('metricas.rate.save')}
        </button>
      </div>
      {state.status === 'saved' && (
        <p id={messageId} role="status" className="text-body text-lime">
          {t('metricas.rate.saved')}
        </p>
      )}
      {(state.status === 'invalid' || state.status === 'failed') && (
        <p id={messageId} role="alert" className="text-body text-error">
          {t(state.status === 'invalid' ? 'metricas.rate.invalid' : 'metricas.rate.failed')}
        </p>
      )}
    </form>
  );
}
