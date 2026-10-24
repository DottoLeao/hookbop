'use server';

import { refresh } from 'next/cache';
import { notFound } from 'next/navigation';
import { parseBrlRate } from '@/lib/metrics/summary';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { askedByOwner } from './owner';

export interface BrlRateState {
  status: 'idle' | 'saved' | 'invalid' | 'failed';
}

/**
 * Saves the rate the panel turns dollars into reais with (`brl_rate` in app_config, which no member may read or
 * write). A Server Action can be posted to directly, so it checks the owner first, the way the page does, and for
 * anyone else it does not exist either. Then the rate: a decimal from 1 to 20, with a dot or a comma (5,50); anything
 * else is refused with a message. Only then is the service client made.
 */
export async function saveBrlRateAction(_previous: BrlRateState, formData: FormData): Promise<BrlRateState> {
  if (!(await askedByOwner())) notFound();

  const rate = parseBrlRate(formData.get('brlRate'));
  if (rate === null) return { status: 'invalid' };

  const { error } = await createServiceSupabase()
    .from('app_config')
    .upsert({ key: 'brl_rate', value: String(rate) }, { onConflict: 'key' });
  if (error) {
    console.warn('Could not save the exchange rate.', error.message);
    return { status: 'failed' };
  }

  refresh();
  return { status: 'saved' };
}
