import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { focusRing } from '@/components/game/styles';
import { t, type MessageKey } from '@/i18n/t';

export const metadata: Metadata = {
  title: `${t('privacidade.title')} · Hookbop`,
};

// Each topic of the policy: its heading, then its paragraphs. `list` turns the paragraphs into a bulleted list, for
// the topics that enumerate things (what is kept, who else receives data).
interface Topic {
  title: MessageKey;
  intro?: MessageKey;
  paragraphs: MessageKey[];
  list?: boolean;
  contact?: boolean;
}

const TOPICS: Topic[] = [
  { title: 'privacidade.quem.title', paragraphs: ['privacidade.quem.p1', 'privacidade.quem.p2'], contact: true },
  {
    title: 'privacidade.guarda.title',
    paragraphs: [
      'privacidade.guarda.conta',
      'privacidade.guarda.convites',
      'privacidade.guarda.jogo',
      'privacidade.guarda.calibracao',
      'privacidade.guarda.ajuda',
      'privacidade.guarda.aparelho',
    ],
    list: true,
  },
  { title: 'privacidade.uso.title', paragraphs: ['privacidade.uso.p1', 'privacidade.uso.p2'] },
  {
    title: 'privacidade.terceiros.title',
    intro: 'privacidade.terceiros.p1',
    paragraphs: [
      'privacidade.terceiros.supabase',
      'privacidade.terceiros.vercel',
      'privacidade.terceiros.google',
      'privacidade.terceiros.anthropic',
      'privacidade.terceiros.youtube',
      'privacidade.terceiros.lrclib',
    ],
    list: true,
  },
  { title: 'privacidade.membros.title', paragraphs: ['privacidade.membros.p1'] },
  { title: 'privacidade.tempo.title', paragraphs: ['privacidade.tempo.p1'] },
  { title: 'privacidade.direitos.title', paragraphs: ['privacidade.direitos.p1'] },
  { title: 'privacidade.idade.title', paragraphs: ['privacidade.idade.p1'] },
  { title: 'privacidade.mudancas.title', paragraphs: ['privacidade.mudancas.p1'] },
];

function Paragraph({ children }: { children: ReactNode }) {
  return <p className="text-lyric leading-relaxed text-muted">{children}</p>;
}

function ContactLink() {
  const email = t('privacidade.contactEmail');
  return (
    <a href={`mailto:${email}`} className={`rounded-button font-semibold text-lime underline ${focusRing}`}>
      {email}
    </a>
  );
}

/**
 * The privacy policy. Public, with no session needed, because Google's sign-in screen links to it and anyone deciding
 * whether to accept an invite may want to read it first. It is a plain static page: no data is read to draw it.
 */
export default function PrivacidadePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-prose flex-col gap-8 p-6">
      <Link href="/" aria-label={t('home.title')} className={`self-start rounded-button ${focusRing}`}>
        <Logo size={40} />
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-title font-bold text-text">{t('privacidade.title')}</h1>
        <p className="text-label text-faint">{t('privacidade.updated')}</p>
      </header>

      {TOPICS.map((topic) => (
        <section key={topic.title} className="flex flex-col gap-3">
          <h2 className="font-heading text-verse font-bold text-text">{t(topic.title)}</h2>
          {topic.intro && <Paragraph>{t(topic.intro)}</Paragraph>}
          {topic.list ? (
            <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-lime">
              {topic.paragraphs.map((key) => (
                <li key={key} className="text-lyric leading-relaxed text-muted">
                  {t(key)}
                </li>
              ))}
            </ul>
          ) : (
            topic.paragraphs.map((key) => <Paragraph key={key}>{t(key)}</Paragraph>)
          )}
          {topic.contact && (
            <Paragraph>
              <ContactLink />
            </Paragraph>
          )}
        </section>
      ))}

      <Link
        href="/"
        className={`flex min-h-11 items-center self-start rounded-button px-2 text-button font-semibold text-lime underline ${focusRing}`}
      >
        {t('privacidade.back')}
      </Link>
    </main>
  );
}
