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
    expect(screen.getByText('Atualizada em 25 de outubro de 2026.')).toBeInTheDocument();
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

  it('names every service that receives data, and says the AI gets only the verse', () => {
    render(<PrivacidadePage />);

    for (const service of ['Supabase', 'Vercel', 'Google', 'Anthropic', 'YouTube', 'LRCLIB']) {
      expect(screen.getAllByText(new RegExp(service)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/só o verso da música e a palavra destacada/)).toBeInTheDocument();
  });

  it('says the player and the covers of the songs on the home screen both come from YouTube', () => {
    render(<PrivacidadePage />);

    const youtube = screen.getByText(/^YouTube:/);
    expect(youtube).toHaveTextContent('os clipes tocam no player oficial do YouTube');
    expect(youtube).toHaveTextContent('As capinhas das músicas na tela inicial também vêm do YouTube.');
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
    for (const part of [
      'sua conta',
      'o vídeo',
      'o número do verso',
      'explicação ou tradução',
      'veio da IA ou de uma resposta já guardada',
      'os tokens usados',
      'o custo estimado',
      'o tempo de resposta',
    ]) {
      expect(record).toHaveTextContent(part);
    }
  });

  it('lists the app action record among what is kept, with every action and the few details that go with them', () => {
    render(<PrivacidadePage />);

    const record = topic('O que guardamos').getByText(/^Registro de uso do app:/);
    expect(record.tagName).toBe('LI');
    for (const part of [
      'sua conta',
      'um código aleatório da sessão',
      'abrir o app',
      'abrir uma música',
      'escolher o modo',
      'sair no meio de uma partida',
      'pedir ajuda',
      'continuar depois de sair do app',
      'o aviso de instalação',
      'criar um convite',
      'ajustar o tempo da letra',
      'a porcentagem de acertos',
      'a duração',
      'o número de lacunas',
      'o número do verso ao pedir ajuda',
    ]) {
      expect(record).toHaveTextContent(part);
    }
  });

  it('says why the records are kept, that no typed answer is in them and that no other service gets them', () => {
    render(<PrivacidadePage />);

    const uso = topic('Para que usamos');
    expect(uso.getByText(/registros de uso para entender o que funciona no app e quanto a IA custa/)).toBeInTheDocument();
    expect(uso.getByText(/Neles não entra o que você digita nas respostas/)).toBeInTheDocument();
    expect(
      uso.getByText(/não vão para nenhum serviço além dos que aparecem em "Quem mais recebe dados"/),
    ).toBeInTheDocument();
    expect(uso.getByText('Não vendemos seus dados e, nesta fase, não mostramos anúncios.')).toBeInTheDocument();
  });

  it('says no member sees the usage records and only the owner does', () => {
    render(<PrivacidadePage />);

    const membros = topic('O que os outros membros veem');
    expect(membros.getByText(/^Nenhum membro vê os registros de uso, nem os seus nem os dos outros\./)).toBeInTheDocument();
    expect(membros.getByText(/Só o dono vê, em um painel que só ele abre, e pode exportar os dados\./)).toBeInTheDocument();
  });

  it('keeps the usage records for 12 months and the game in progress on the device for 24 hours', () => {
    render(<PrivacidadePage />);

    const tempo = topic('Por quanto tempo');
    const registros = tempo.getByText(/registros de uso ficam guardados por 12 meses/);
    expect(registros).toHaveTextContent('um processo automático, que roda todo dia, apaga os mais antigos');
    expect(tempo.getByText(/partida em andamento de uma música fica guardada por até 24 horas/)).toBeInTheDocument();
  });

  it('tells, in the paragraph about the device, of the game in progress and the session code that goes with the tab', () => {
    render(<PrivacidadePage />);

    const aparelho = topic('O que guardamos').getByText(/^No seu aparelho:/);
    expect(aparelho).toHaveTextContent('a partida em andamento de cada música');
    expect(aparelho).toHaveTextContent('para você continuar de onde parou');
    expect(aparelho).toHaveTextContent('um código aleatório da sessão (que some quando você fecha a aba)');
    expect(aparelho).toHaveTextContent('os cookies que mantêm você conectado');
  });

  it('mentions the usage record, 12 months and 24 hours somewhere on the page', () => {
    render(<PrivacidadePage />);

    const text = document.body.textContent ?? '';
    expect(text).toMatch(/registro de uso/i);
    expect(text).toContain('12 meses');
    expect(text).toContain('24 horas');
  });
});
