import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacidadePage from './page';

/** Looks inside one topic of the policy, found by its heading. */
function topic(heading: string) {
  const section = screen.getByRole('heading', { level: 2, name: heading }).closest('section');
  if (!section) throw new Error(`No section for the heading "${heading}"`);
  return within(section);
}

describe('PrivacidadePage', () => {
  it('has one heading for the whole policy and says when it was updated', () => {
    render(<PrivacidadePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidade' })).toBeInTheDocument();
    expect(screen.getByText('Atualizada em 26 de outubro de 2026.')).toBeInTheDocument();
  });

  it('gives each topic its own heading, in order', () => {
    render(<PrivacidadePage />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Quem somos',
      'O que guardamos',
      'Para que usamos',
      'Quem mais recebe dados',
      'O que os outros membros veem',
      'Por quanto tempo',
      'Seus direitos',
      'Idade',
      'Mudanças nesta política',
    ]);
  });

  it('names every service that receives data, and says the AI gets only the lyrics, never the player', () => {
    render(<PrivacidadePage />);

    for (const service of ['Supabase', 'Vercel', 'Google', 'Anthropic', 'YouTube', 'LRCLIB']) {
      expect(screen.getAllByText(new RegExp(service)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/só o verso e a palavra destacada/)).toBeInTheDocument();
    expect(screen.getByText(/os versos dela que ainda não têm tradução guardada/)).toBeInTheDocument();
  });

  it('says the player and the covers of the songs on the home screen both come from YouTube, and the covers are asked for without saying which page', () => {
    render(<PrivacidadePage />);

    const youtube = screen.getByText(/^YouTube:/);
    expect(youtube).toHaveTextContent('os clipes tocam no player oficial do YouTube');
    expect(youtube).toHaveTextContent('As capinhas das músicas na tela inicial também vêm do YouTube.');
    expect(youtube).toHaveTextContent('O pedido das capinhas não diz ao YouTube de qual página ele vem.');
  });

  it('says how to reach the person responsible, with a mail link', () => {
    render(<PrivacidadePage />);

    const contact = screen.getByRole('link', { name: 'dottodeveloper@gmail.com' });
    expect(contact).toHaveAttribute('href', 'mailto:dottodeveloper@gmail.com');
  });

  it('leads back to the app', () => {
    render(<PrivacidadePage />);

    expect(screen.getByRole('link', { name: 'Voltar para o Hookbop' })).toHaveAttribute('href', '/');
  });
});

describe('PrivacidadePage: usage records', () => {
  it('lists the AI usage record among what is kept, with what each request leaves behind', () => {
    render(<PrivacidadePage />);

    const record = topic('O que guardamos').getByText(/^Registro de uso da IA:/);
    expect(record.tagName).toBe('LI');
    // Records are written when a song opens, for its translation, and not only when help is asked for.
    expect(record).toHaveTextContent('Registro de uso da IA: quando você abre uma música (para a tradução) e a cada pedido de ajuda');
    expect(record).not.toHaveTextContent('a cada pedido de ajuda com IA');
    for (const part of [
      'o código da sua conta',
      'o vídeo',
      'o número do verso (ou que foi a música inteira)',
      'explicação ou tradução',
      'veio da IA ou de uma resposta já guardada',
      'os tokens usados',
      'o custo estimado',
      'o tempo de resposta',
      'a data e a hora',
    ]) {
      expect(record).toHaveTextContent(part);
    }
  });

  it('lists the app action record among what is kept, with every action and the few details that go with them', () => {
    render(<PrivacidadePage />);

    const record = topic('O que guardamos').getByText(/^Registro de uso do app:/);
    expect(record.tagName).toBe('LI');
    for (const part of [
      'o código da sua conta',
      'um código aleatório da sessão',
      'o nome da ação e a data e a hora',
      'abrir o app',
      'abrir uma música',
      'escolher o modo',
      'sair no meio de uma partida',
      'pedir ajuda',
      'continuar depois de sair do app',
      'o aviso de instalação',
      'criar um convite',
      'ajustar o tempo da letra',
      'ao terminar uma partida, a porcentagem de acertos, a duração e o número de lacunas',
      'ao pedir ajuda, o número do verso',
    ]) {
      expect(record).toHaveTextContent(part);
    }
  });

  it('says why the records are kept, that no typed answer is in them and that no other service gets them', () => {
    render(<PrivacidadePage />);

    const uso = topic('Para que usamos');
    expect(
      uso.getByText('O criador do Hookbop usa os registros de uso para entender o que funciona no app e quanto a IA custa.'),
    ).toBeInTheDocument();
    expect(uso.getByText(/Neles não entra o que você digita nas respostas/)).toBeInTheDocument();
    expect(
      uso.getByText(/não vão para nenhum serviço além dos que aparecem em "Quem mais recebe dados"/),
    ).toBeInTheDocument();
    expect(uso.getByText('Não vendemos seus dados e, nesta fase, não mostramos anúncios.')).toBeInTheDocument();
  });

  it('says the creator may use an AI assistant on the records, which carry the account code and no name or e-mail', () => {
    render(<PrivacidadePage />);

    const analise = topic('Para que usamos').getByText(/assistente de IA/);
    expect(analise).toHaveTextContent('O criador pode usar um assistente de IA (o Claude, da Anthropic) para analisar esses registros');
    expect(analise).toHaveTextContent('só o código da sua conta, sem nome e sem e-mail');
  });

  it('does not contradict that in the line about Anthropic: the lyrics and the verse go, no data of the player, the analysis is named too', () => {
    render(<PrivacidadePage />);

    const anthropic = topic('Quem mais recebe dados').getByText(/^Anthropic \(Claude\):/);
    expect(anthropic).toHaveTextContent(
      'quando você abre uma música, enviamos para traduzir só os versos dela que ainda não têm tradução guardada',
    );
    expect(anthropic).toHaveTextContent('e um verso sozinho quando falta a tradução dele');
    expect(anthropic).toHaveTextContent('quando você toca em "Não entendi", enviamos só o verso e a palavra destacada');
    expect(anthropic).toHaveTextContent('Nenhum dado seu vai junto.');
    expect(anthropic).toHaveTextContent('O criador também pode usar o Claude para analisar os registros de uso');
    expect(anthropic).toHaveTextContent('entra o código da sua conta, sem nome e sem e-mail');
  });

  it('says no member sees the usage records and only the creator does', () => {
    render(<PrivacidadePage />);

    const membros = topic('O que os outros membros veem');
    expect(membros.getByText(/^Nenhum membro vê os registros de uso, nem os seus nem os dos outros\./)).toBeInTheDocument();
    expect(
      membros.getByText(/Só o criador do Hookbop vê, em um painel que só ele abre, e pode exportar os dados\./),
    ).toBeInTheDocument();
  });

  it('says that asking to delete your data deletes the usage records too', () => {
    render(<PrivacidadePage />);

    const direitos = topic('Seus direitos');
    expect(direitos.getByText(/pedir para ver, corrigir, apagar ou levar os seus dados/)).toBeInTheDocument();
    expect(
      direitos.getByText('Quando você pede para apagar seus dados, os registros de uso também são apagados.'),
    ).toBeInTheDocument();
  });

  it('keeps the usage records for 12 months and the game in progress on the device for 24 hours', () => {
    render(<PrivacidadePage />);

    const tempo = topic('Por quanto tempo');
    const registros = tempo.getByText(/registros de uso ficam guardados por 12 meses/);
    expect(registros).toHaveTextContent('um processo automático, que roda todo dia, apaga os mais antigos');
    const aparelho = tempo.getByText(/partida em andamento de uma música é oferecida por até 24 horas/);
    expect(aparelho).toHaveTextContent('para você continuar de onde parou');
    expect(aparelho).toHaveTextContent('e sai do aparelho na próxima vez que você abrir uma música depois disso');
  });

  it('lists, in the paragraph about the device, everything the app keeps there: cookies, settings, game, marks, session', () => {
    render(<PrivacidadePage />);

    const aparelho = topic('O que guardamos').getByText(/^No seu aparelho:/);
    // Cookies (login and invite) and the pages kept for offline use.
    expect(aparelho).toHaveTextContent('os cookies que mantêm você conectado e guardam o convite');
    expect(aparelho).toHaveTextContent('as páginas guardadas para o app abrir sem internet');
    // In the browser's storage: settings, the game in progress and the two marks of the install prompt.
    expect(aparelho).toHaveTextContent('as suas configurações do jogo');
    expect(aparelho).toHaveTextContent('a partida em andamento de cada música, para você continuar de onde parou');
    expect(aparelho).toHaveTextContent(
      'duas marcas do aviso para instalar o app (que você já terminou uma música e que tocou em "Agora não")',
    );
    // The notice of a change of this policy, once per change.
    expect(aparelho).toHaveTextContent('a marca de que você já viu o aviso da última mudança desta política');
    // In the tab only: the session code and the mark that the app was opened.
    expect(aparelho).toHaveTextContent(
      'um código aleatório da sessão e a marca de que o app já foi aberto, que somem quando você fecha a aba',
    );
  });

  it('has the doc that the AI assistant follows forbid joining the records to anything with names or e-mails', () => {
    const doc = readFileSync(join(process.cwd(), 'docs', 'analytics.md'), 'utf-8');

    expect(doc).toContain('**Nunca** cruze `ai_usage` nem `app_events` com `profiles`, com `auth.users`');
    expect(doc).toContain('qualquer outra tabela que tenha nomes ou e-mails');
    // The old rule let the creator ask for names, and the old example read the owner out of `profiles`.
    expect(doc).not.toContain('Só cruze');
    expect(doc).not.toContain('from profiles where is_owner');
  });

  it('never calls the creator "o dono"', () => {
    render(<PrivacidadePage />);

    expect(document.body.textContent ?? '').not.toMatch(/\bdono\b/i);
  });

  it('mentions the usage record, 12 months and 24 hours somewhere on the page', () => {
    render(<PrivacidadePage />);

    const text = document.body.textContent ?? '';
    expect(text).toMatch(/registro de uso/i);
    expect(text).toContain('12 meses');
    expect(text).toContain('24 horas');
  });
});
