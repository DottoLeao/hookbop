const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  // Fixed, so the same moment reads the same on a server in UTC and on a phone in Brazil.
  timeZone: 'America/Sao_Paulo',
});

/** A date as 22/10/2026, for a timestamp such as the ones Postgres returns. */
export function formatDate(timestamp: string): string {
  return dateFormat.format(new Date(timestamp));
}
