'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { focusRing } from '@/components/game/styles';
import { t } from '@/i18n/t';
import { parseYouTubeId } from '@/lib/youtube/parseUrl';

/**
 * The box of the home page: paste a YouTube link, tap "Jogar", and the song screen opens. Anything that is not a link to
 * one video (a playlist, another site, plain text) gets a quiet message instead of a trip to a screen with nothing on it.
 * The field and the button are 48 px tall, and the text 16 px, which keeps a phone from zooming into the field.
 *
 * `initialInvalid` opens it with that message already there: the home page uses it when a share from the YouTube app
 * did not hold a video (`/?erro=link`, see src/app/compartilhar/route.ts).
 */
export function PasteLink({ initialInvalid = false }: { initialInvalid?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(initialInvalid);
  const id = useId();
  const errorId = `${id}-error`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const youtubeId = parseYouTubeId(text);
    if (!youtubeId) {
      setInvalid(true);
      return;
    }
    router.push(`/jogar/${youtubeId}`);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {t('home.pasteLabel')}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setInvalid(false);
          }}
          placeholder={t('home.pastePlaceholder')}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          className={`min-h-12 min-w-0 flex-1 rounded-button border-[1.5px] bg-card px-4 text-button text-text placeholder:text-muted ${focusRing} ${
            invalid ? 'border-error' : 'border-border'
          }`}
        />
        <button
          type="submit"
          className={`min-h-12 shrink-0 rounded-button bg-lime px-5 text-button font-bold text-bg ${focusRing}`}
        >
          {t('home.play')}
        </button>
      </div>
      {invalid && (
        <p id={errorId} role="alert" className="text-body text-error">
          {t('home.invalidLink')}
        </p>
      )}
    </form>
  );
}
