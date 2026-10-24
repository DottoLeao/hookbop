import { parsePeriodDays } from '@/lib/metrics/period';
import { exportFileName, readExport, type MetricsExport } from '@/lib/metrics/queries';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { askedByOwner } from '../owner';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** What anyone but the owner gets, whatever the method: a bare 404, with nothing that says the address is here. */
function notHere(): Response {
  return new Response(null, { status: 404, headers: NO_STORE });
}

/**
 * `GET /admin/metricas/exportar?dias=7|30` ("Exportar dados"): a JSON file with the summaries and every record of the
 * period (see `readExport` and docs/analytics.md), downloaded as an attachment that no cache keeps.
 *
 * The records hold user ids, so the file is personal data and only the owner gets it, checked on every request the
 * way the page checks it. Anyone else gets a 404, and the service client is made only after the check. The period is
 * 7 or 30 days; anything else is 30. A record that cannot be read is a 503 with no body: never part of the data, which
 * would look whole. The reason goes to the server log only.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await askedByOwner())) return notHere();

  const values = new URL(request.url).searchParams.getAll('dias');
  const days = parsePeriodDays(values.length === 1 ? values[0] : undefined);

  let exported: MetricsExport;
  try {
    exported = await readExport(createServiceSupabase(), { days, now: new Date() });
  } catch (error) {
    console.warn('Could not make the metrics export.', error);
    return new Response(null, { status: 503, headers: NO_STORE });
  }

  return new Response(JSON.stringify(exported), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(exported.period)}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// Next answers a method a route does not have with a 405, and OPTIONS with the list of the ones it has; either would
// tell anyone that this address exists. Every other method gets the same 404 instead. (HEAD runs GET, owner check
// included.)
export { notHere as DELETE, notHere as OPTIONS, notHere as PATCH, notHere as POST, notHere as PUT };
