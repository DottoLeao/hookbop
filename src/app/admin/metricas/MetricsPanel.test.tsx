import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMetricsDb } from '@/lib/metrics/fakeMetricsDb';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { MetricsPanel } from './MetricsPanel';

// The panel reads the metrics through the service key; here that client is a database in memory with invented rows,
// and the reads, the sums and the cards are the real ones. The page has already checked that the owner is asking.
vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(async () => {}),
}));
vi.mock('./actions', () => ({ saveBrlRateAction: vi.fn() }));

// 14:00 in Brasília on 25/10/2026: the last 30 days run from 26/09, the month from 01/10.
const NOW = new Date('2026-10-25T17:00:00Z');
// Intl writes money with a no-break space, which Testing Library reads as a plain space.
const SESSION = '4f0c2a9e-7b1d-4c35-9a6e-0d2b8f5e1c77';

function event(id: number, userId: string, name: string, at = '2026-10-20T15:00:00Z') {
  return { id, created_at: at, user_id: userId, session_id: SESSION, name, youtube_id: null, mode: null, props: {} };
}

function usage(id: number, latencyMs: number) {
  return {
    id,
    created_at: '2026-10-20T15:00:00Z',
    user_id: 'user-a',
    youtube_id: 'aaaaaaaaaaa',
    line_index: 3,
    kind: 'translate',
    source: 'model',
    model: 'claude-haiku-5-5',
    input_tokens: 300,
    output_tokens: 100,
    cost_usd: 0.00008,
    latency_ms: latencyMs,
    outcome: 'ok',
  };
}

function song(youtubeId: string, title: string | null, opens: number, started: number, finished: number, abandoned = 0) {
  return {
    day: '2026-10-21',
    youtube_id: youtubeId,
    title,
    song_opens: opens,
    games_started: started,
    games_finished: finished,
    games_abandoned: abandoned,
    players: 1,
  };
}

function seeded() {
  const db = new FakeMetricsDb();
  db.tables.app_config = [{ key: 'brl_rate', value: '5.00' }];
  db.tables.metrics_ai_daily = [
    { day: '2026-09-28', calls: 10, calls_model: 10, calls_cache: 0, calls_reuse: 0, calls_declined: 0, calls_error: 0, input_tokens: 3000, output_tokens: 1000, cost_usd: 1 },
    { day: '2026-10-20', calls: 30, calls_model: 8, calls_cache: 18, calls_reuse: 4, calls_declined: 1, calls_error: 2, input_tokens: 1800, output_tokens: 600, cost_usd: 1 },
  ];
  db.tables.metrics_modes = [
    { day: '2026-10-20', mode: 'escolha', mode_selections: 6, games_started: 5, games_finished: 3, games_abandoned: 2, avg_pct: 75, avg_duration_ms: 200_000 },
    { day: '2026-10-21', mode: 'karaoke', mode_selections: 3, games_started: 3, games_finished: 2, games_abandoned: 1, avg_pct: null, avg_duration_ms: 150_000 },
  ];
  db.tables.metrics_songs = [
    song('aaaaaaaaaaa', 'Invented Artist - Paper Lanterns', 4, 3, 2, 1),
    song('bbbbbbbbbbb', 'Invented Artist - Neon Tide', 2, 2, 1),
    song('ccccccccccc', 'Invented Band - Quiet Harbor', 1, 1, 1),
    song('ddddddddddd', 'Invented Band - Glass Rivers', 1, 1, 1),
    song('eeeeeeeeeee', null, 1, 1, 0),
    song('fffffffffff', 'Invented Duo - Open Window', 3, 0, 0),
  ];
  db.tables.metrics_help = [
    { day: '2026-10-20', mode: 'karaoke', kind: 'translate', requests: 7, users: 2, songs: 1, avg_line_index: 11 },
    { day: '2026-10-20', mode: 'escolha', kind: 'explain', requests: 3, users: 1, songs: 1, avg_line_index: 4 },
    { day: '2026-10-21', mode: 'escolha', kind: 'translate', requests: 1, users: 1, songs: 1, avg_line_index: 2 },
  ];
  // Four people in the period; eight games started, five finished.
  db.tables.app_events = [
    ...['user-a', 'user-b', 'user-c', 'user-d'].map((user, index) => event(index + 1, user, 'app_opened')),
    ...Array.from({ length: 8 }, (_, index) => event(10 + index, index < 4 ? 'user-a' : 'user-b', 'game_started')),
    ...Array.from({ length: 5 }, (_, index) => event(20 + index, 'user-a', 'game_finished')),
  ];
  db.tables.ai_usage = [usage(1, 1000), usage(2, 1200), usage(3, 1400)];
  return db;
}

async function renderPanel(db: FakeMetricsDb, days: 7 | 30 = 30) {
  vi.mocked(createServiceSupabase).mockReturnValue(db.asClient());
  render(await MetricsPanel({ days }));
}

function card(name: string) {
  return within(screen.getByRole('region', { name }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('MetricsPanel', () => {
  it('reads the metrics with the service key', async () => {
    await renderPanel(seeded());

    expect(createServiceSupabase).toHaveBeenCalledOnce();
  });

  it('shows the AI spend of the period and of the month, in dollars and in reais at the owner’s rate', async () => {
    await renderPanel(seeded());

    const spend = card('Gasto da IA');
    expect(spend.getByText('Últimos 30 dias, horário de Brasília (26/09 a 25/10)')).toBeInTheDocument();
    expect(spend.getByText(`US$ 2,00`)).toBeInTheDocument();
    expect(spend.getByText(`≈ R$ 10,00`)).toBeInTheDocument();
    expect(spend.getByText('Em outubro, horário de Brasília (01/10 a 25/10)')).toBeInTheDocument();
    expect(spend.getByText(`US$ 1,00`)).toBeInTheDocument();
    expect(spend.getByText(`≈ R$ 5,00`)).toBeInTheDocument();
  });

  it('shows the cost per active person, per game and per song played', async () => {
    await renderPanel(seeded());

    const averages = card('Custo médio');
    expect(averages.getByText('Por pessoa ativa').nextElementSibling).toHaveTextContent(`US$ 0,50`);
    expect(averages.getByText('Por partida').nextElementSibling).toHaveTextContent(`US$ 0,25`);
    expect(averages.getByText('Por música').nextElementSibling).toHaveTextContent(`US$ 0,40`);
    expect(averages.getByText('4 pessoas ativas · 8 partidas começadas · 5 músicas jogadas')).toBeInTheDocument();
  });

  it('projects the month from 50 people at the cost per person of the last 30 days', async () => {
    await renderPanel(seeded(), 7);

    const projection = card('Projeção');
    expect(projection.getByLabelText('Pessoas por mês')).toHaveValue('50');
    // The period on screen is 7 days, but the projection always takes the last 30: 2,00 / 4 people.
    expect(projection.getByText(`US$ 25,00`)).toBeInTheDocument();
    expect(projection.getByText(`≈ R$ 125,00`)).toBeInTheDocument();
    expect(
      projection.getByText(`Pela média de US$ 0,50 por pessoa ativa nos últimos 30 dias, horário de Brasília (4 pessoas).`),
    ).toBeInTheDocument();
  });

  it('shows the calls, the tokens, the share from memory and the latency of the model', async () => {
    await renderPanel(seeded());

    const ai = card('Tokens e memória');
    expect(ai.getByText('Pedidos de ajuda à IA').nextElementSibling).toHaveTextContent('40');
    expect(ai.getByText('Da memória').nextElementSibling).toHaveTextContent('55%');
    expect(ai.getByText('18 do cache por verso · 4 reaproveitados do refrão · 18 do modelo')).toBeInTheDocument();
    expect(ai.getByText('Tokens de entrada').nextElementSibling).toHaveTextContent('4.800');
    expect(ai.getByText('Tokens de saída').nextElementSibling).toHaveTextContent('1.600');
    expect(ai.getByText('Tempo médio de resposta').nextElementSibling).toHaveTextContent(`1,2 s`);
    expect(ai.getByText('Recusados: 1 · Com erro: 2')).toBeInTheDocument();
  });

  it('ranks the modes by games started', async () => {
    await renderPanel(seeded());

    const items = card('Modos mais jogados').getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('h3')?.textContent)).toEqual(['Escolha', 'Karaokê']);
    expect(items[0]).toHaveTextContent('5 partidas começadas · 6 escolhas do modo');
  });

  it('shows the games of each mode, with completion as finished over started and the saídas apart', async () => {
    await renderPanel(seeded());

    const games = card('Partidas por modo');
    const [escolha, karaoke] = games.getAllByRole('listitem');
    const stat = (item: HTMLElement, label: string) => within(item).getByText(label).nextElementSibling;
    expect(stat(escolha, 'Começadas')).toHaveTextContent('5');
    expect(stat(escolha, 'Terminadas')).toHaveTextContent('3');
    expect(stat(escolha, 'Saídas')).toHaveTextContent('2');
    expect(stat(escolha, 'Conclusão')).toHaveTextContent('60%');
    expect(stat(escolha, 'Acerto médio')).toHaveTextContent('75%');
    expect(stat(escolha, 'Duração média')).toHaveTextContent('3:20');
    expect(stat(karaoke, 'Conclusão')).toHaveTextContent('66,7%');
    expect(stat(karaoke, 'Acerto médio')).toHaveTextContent('—');
    expect(stat(karaoke, 'Duração média')).toHaveTextContent('2:30');
    expect(games.getByText(/Conclusão: terminadas ÷ começadas/)).toBeInTheDocument();
  });

  it('lists the most played songs, naming a song the app does not know by its id', async () => {
    await renderPanel(seeded());

    const items = card('Músicas mais jogadas').getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('h3')?.textContent)).toEqual([
      'Invented Artist - Paper Lanterns',
      'Invented Artist - Neon Tide',
      // One game each and one opening each: in the order of their ids.
      'Invented Band - Quiet Harbor',
      'Invented Band - Glass Rivers',
      'Música eeeeeeeeeee',
      'Invented Duo - Open Window',
    ]);
    expect(items[0]).toHaveTextContent('3 partidas · 2 terminadas · 4 aberturas');
  });

  it('shows the help asked for in each mode, and around which line', async () => {
    await renderPanel(seeded());

    const [karaoke, escolha] = card('Pedidos de ajuda por modo').getAllByRole('listitem');
    expect(karaoke).toHaveTextContent('Karaokê');
    expect(karaoke).toHaveTextContent('0 "Não entendi" · 7 "Traduzir verso"');
    // lineIndex counts from 0; the panel counts lines from 1.
    expect(karaoke).toHaveTextContent('Em média no verso 12');
    expect(escolha).toHaveTextContent('3 "Não entendi" · 1 "Traduzir verso"');
    expect(escolha).toHaveTextContent('Em média no verso 5');
  });

  it('shows the rate it used, in a form the owner can change it with', async () => {
    await renderPanel(seeded());

    const rate = card('Cotação do dólar');
    expect(rate.getByText(`US$ 1 = R$ 5,00`)).toBeInTheDocument();
    expect(rate.getByLabelText('Reais por dólar')).toHaveValue('5,00');
  });

  it('says how the cost is estimated, with the date of the price', async () => {
    await renderPanel(seeded());

    expect(
      screen.getByText(
        `Custos estimados pelos tokens e pelo preço do claude-haiku-5-5: US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída (preço de 10/2026).`,
      ),
    ).toBeInTheDocument();
  });

  it('labels every period with Brasília time', async () => {
    await renderPanel(seeded(), 7);

    for (const label of screen.getAllByText(/^(Últimos|Em) .*\(\d\d\/\d\d a \d\d\/\d\d\)$/)) {
      expect(label).toHaveTextContent('horário de Brasília');
    }
    expect(screen.getAllByText('Últimos 7 dias, horário de Brasília (19/10 a 25/10)').length).toBeGreaterThan(1);
  });

  it('says there is nothing yet, and shows no average it cannot make, when the period is empty', async () => {
    await renderPanel(new FakeMetricsDb());

    expect(card('Custo médio').getByText('Por pessoa ativa').nextElementSibling).toHaveTextContent('—');
    expect(card('Tokens e memória').getByText('Da memória').nextElementSibling).toHaveTextContent('—');
    expect(card('Projeção').getByText('Ainda não há pessoas ativas nos últimos 30 dias para projetar.')).toBeInTheDocument();
    for (const name of ['Modos mais jogados', 'Partidas por modo', 'Músicas mais jogadas', 'Pedidos de ajuda por modo']) {
      expect(card(name).getByText('Nada no período ainda.')).toBeInTheDocument();
    }
    // No rate stored: the default.
    expect(card('Cotação do dólar').getByText(`US$ 1 = R$ 5,50`)).toBeInTheDocument();
  });

  it('fails as a whole when a read fails, rather than show part of the numbers as if they were all', async () => {
    const db = seeded();
    db.failures.set('metrics_modes', 'statement timeout');
    vi.mocked(createServiceSupabase).mockReturnValue(db.asClient());

    await expect(MetricsPanel({ days: 30 })).rejects.toThrow('statement timeout');
  });
});
