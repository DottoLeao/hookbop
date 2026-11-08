<div align="center">

<img src="public/icons/icon-192.png" alt="Hookbop logo" width="96"/>

# Hookbop

**Learn English with any song on YouTube: paste a link and play with the synced lyrics.**

[![Live demo](https://img.shields.io/badge/Live_demo-hookbop.vercel.app-2dbd82?style=flat-square&labelColor=0c0d0b)](https://hookbop.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![GSAP](https://img.shields.io/badge/GSAP-88CE02?style=flat-square&logo=greensock&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white)

</div>

## About

Music apps for learning English tend to cap free play at a few games a day, and their fill-in-the-lyrics games rarely explain anything to the learner. Hookbop is a free, invite-only PWA (first phase) where you paste any YouTube music link, the official player plays the video, and you complete, type, sing or rebuild the lyrics line by line in short games, with an explanation or a Portuguese translation of any line one tap away. The interface is in Brazilian Portuguese.

## Features

- Paste a YouTube link and play in seconds; synced lyrics come from LRCLIB behind a swappable source interface
- Four game modes: **Escolha** (multiple choice), **Digitação** (typing, with typo tolerance), **Karaokê** and **Monte o verso** (rebuild the line from tiles)
- Smooth pause with volume fade before each blank, sliding line transitions and a per-song lyric offset calibration
- "Não entendi" (explain this line) and line or whole-song translation, generated on the server with a per-user help budget
- XP and a streak at the end of each song; progress is saved so a song can be resumed
- Sign-in with an email magic link or Google; invite codes with shareable links and QR codes
- Owner-only metrics panel (`/admin/metricas`): API cost per person, per game and per song, usage summaries and a JSON export
- Installable PWA with a service worker and an install prompt
- Row Level Security on every table, covered by database tests

## Tech stack

| Area | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript |
| Styling and motion | Tailwind CSS 4, GSAP |
| Data and auth | Supabase (Postgres, Auth, Row Level Security), SQL migrations |
| Lyrics and video | LRCLIB, YouTube IFrame player and oEmbed |
| Language data | `wordlist-english`, `double-metaphone` (distractors and typo checks) |
| Tests | Vitest, Testing Library, Playwright, pgTAP (`supabase test db`) |
| Deploy | Vercel |

## Getting started

Requires Node.js and Docker (for the local Supabase stack).

```bash
npm ci
cp .env.example .env.local   # fill in the variables below
npm run db:start             # local Supabase; `npx supabase status` prints the local keys
npm run dev                  # http://localhost:3000
```

Environment variables (see `.env.example` for what each one does):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `ANTHROPIC_API_KEY` (server only, used by the explain and translate features)
- `NEXT_PUBLIC_APP_PHASE`

## Project structure

```
src/
  app/          routes: home, sign-in, /jogar/[youtubeId], invites, admin metrics, API routes
  components/   game screens and modes, home, brand, PWA, admin
  lib/          game logic, lyrics, help and translation, metrics, auth, Supabase, YouTube player
  i18n/         interface text (pt-BR)
supabase/       migrations, seed, pgTAP tests, email template
e2e/            Playwright end-to-end tests
docs/           design specs, plans, deploy and analytics guides (Portuguese)
```

## Tests

```bash
npm test             # 2,858 unit and component tests in 143 files (Vitest)
npm run db:test      # 5 pgTAP files for migrations and access rules (needs `npm run db:start`)
npm run test:e2e     # 8 Playwright spec files
```

## Roadmap

From the design spec in [`docs/superpowers/specs`](docs/superpowers/specs):

- More modes: Refrão de memória, Caça ao erro and "O que ele quis dizer?"
- Duels against a friend's recorded run, weekly friends ranking and per-song records
- Public launch with licensed lyrics

## Author

**Lorenzo Leão Dotto**, full-stack developer.

[![Portfolio](https://img.shields.io/badge/Portfolio-lorenzodotto.com.br-2dbd82?style=flat-square&labelColor=0c0d0b)](https://lorenzodotto.com.br)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-lorenzodotto-2dbd82?style=flat-square&logo=linkedin&logoColor=white&labelColor=0c0d0b)](https://www.linkedin.com/in/lorenzodotto)
[![GitHub](https://img.shields.io/badge/GitHub-DottoLeao-2dbd82?style=flat-square&logo=github&logoColor=white&labelColor=0c0d0b)](https://github.com/DottoLeao)
