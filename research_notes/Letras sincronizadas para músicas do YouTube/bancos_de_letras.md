# Synced-lyrics databases/APIs and matching an arbitrary YouTube video to correctly timed lyrics

Research date: 2026-10-21. Scope: sources of line/word-synced lyrics, coverage, cost, licensing, YouTube-to-track matching, and the audio-vs-video offset problem, for a free PWA (Brazilians learning English with music, gap-fill games next to an embedded YouTube player).

Method note: in addition to web sources, I queried the live LRCLIB API on 2026-10-21 from Brazil (Windows, Python urllib, identified `User-Agent`, 0.3–0.5 s between requests) with a 42-song sample (14 hits 2024–2026, 6 K-pop, 5 gospel/worship, 7 classics, 10 English songs popular in Brazil). Scripts: `scratchpad/lrclib_coverage.py`, `lrclib_offsets.py`, `lrclib_wordsync.py` (session scratchpad). Only metadata was recorded (counts, durations, first timestamp, flags). No lyric text was stored or reproduced. I also pulled the LRCLIB API docs and the Musixmatch pricing table out of their sites' JS bundles, because both pages are client-rendered SPAs that normal fetchers return empty.

---

## 1. LRCLIB (lrclib.net): API, data model, coverage, limits, license, operator, sustainability, word-level support

### Takeaway
LRCLIB is a free, keyless, CORS-enabled, community-built synced-lyrics DB run by one developer (Tran Xuan Thang). In my 42-song test, 42/42 songs had at least one line-synced record, across current hits, K-pop, gospel and classics. Word-level sync now exists in the data model (`hasWordSync` plus a YAML "Lyricsfile" format), but none of the sampled popular songs had it: 0 of 42 songs, 0 of ~840 records checked. The real weak points are: no published data license (the lyrics are third-party copyrighted text), messy crowd metadata, server latency/overload (1–24 s, some 503s), and the fact that a record's duration doesn't prove which audio cut its timestamps fit.

### Cited Findings
**What it is / who runs it**
- The server is an open-source Rust (Axum + SQLite3) rewrite of lrclib.net. The README calls it "a completely free service for finding and contributing synchronized lyrics". Code license is MIT, ~2.1k GitHub stars. Donations go to an individual, tranxuanthang (GitHub Sponsors, Buy Me a Coffee, PayPal, Monero/Litecoin). No company is named. — [GitHub tranxuanthang/lrclib](https://github.com/tranxuanthang/lrclib)
- The site's footer prompt reads "Help keep this free lyrics library running" (donation appeal). Sustainability rests on donations to a single maintainer. — [lrclib.net site bundle](https://lrclib.net/) (text extracted from the site JS on 2026-10-21)
- The default SQLite tuning in the README is `LRCLIB_MMAP_SIZE` 30 GB and `LRCLIB_CACHE_SIZE` 1 GB, which implies a DB of tens of GB. — [GitHub README](https://github.com/tranxuanthang/lrclib)
- Database dumps are listed on lrclib.net/db-dumps and served from `db-dumps.lrclib.net` (the dumps page code fetches a list of objects with size and upload date). — [lrclib.net/db-dumps](https://lrclib.net/db-dumps) (from site JS)
- A secondhand mention puts the dump at "~19GB of sqlite3 database" for self-hosting. It's undated, so treat it as approximate. — [osdlyrics issue #146](https://github.com/osdlyrics/osdlyrics/issues/146)

**API (from the official docs page, lrclib.net/docs, extracted 2026-10-21)** — [LRCLIB API Documentation](https://lrclib.net/docs)
- Base URL `https://lrclib.net`. "No API key is required, and anonymous API access remains available." The API is "CORS-enabled (`Access-Control-Allow-Origin: *`), so it can be called directly from browser JavaScript without a proxy."
- Clients must identify themselves with `User-Agent` (app name, version, homepage/email). If browser JS can't set it, "you can use `X-User-Agent` or `Lrclib-Client` as alternatives."
- New in the docs: optional registration in a developer portal (`/developers`) gives higher limits and "a shareable API authorization document (useful when submitting to app review)". Client-side apps send a public `Lrclib-App-Id`. Server-side apps send a secret `Lrclib-Api-Key`.
- Rate limits are "approximations… may change at any time":
  - generic client (no UA, browser, curl): ~45 req/min per IP
  - identified UA: ~90 req/min per IP
  - registered client-side app: ~180 req/min per IP plus ~6,000 req/min app-wide
  - registered server-side app: ~6,000 req/min app-wide

  429 responses carry `Retry-After`, which must be honored (with jitter), or the client "may result in a temporary ban". Requests should be sequential with 200–500 ms delay for batches.
- Record fields: `id, trackName, artistName, albumName, duration (s), instrumental, hasWordSync, plainLyrics, syncedLyrics (LRC with line timestamps), lyricsfile (raw Lyricsfile YAML, every record includes one)`.
- `GET /api/get?track_name&artist_name[&album_name][&duration]` finds the best match. "The provided `duration` is crucial. LRCLIB will attempt to provide the lyrics only when the duration matches the record… or at least with a difference of ±2 seconds." Duration must be 1–3600. A 404 can trigger "the background lyrics fetching service", so the track "may become available in a later request".
- `GET /api/get/{id}` and `GET /api/search?q=|track_name=[&artist_name][&album_name]`. Search "returns a maximum of 20 results and does not support pagination."
- `POST /api/publish` (experimental, anonymous) needs an `X-Publish-Token` obtained by solving a proof-of-work challenge from `POST /api/request-challenge` (challenge expires in 5 min). Previous revisions are kept.
- `POST /api/flag` reports wrong lyrics, wrong metadata, "or a copyright violation" for a record (same PoW token).
- Errors include `503 ServerOverloaded` ("retry after the `Retry-After` header (usually 1 second)").

**Word-level ("enhanced") support**
- `hasWordSync` is true "when `lyricsfile` contains word-level timings (`lines[].words`)". "Records published with only `plainLyrics` or `syncedLyrics` are never word-synced." — [LRCLIB API Documentation](https://lrclib.net/docs)
- Lyricsfile is described as "An open, YAML-based lyrics format with word-sync support" (repo github.com/tranxuanthang/lyricsfile, with Minimal, Line-synced, Word-synced and Instrumental examples). — [lrclib.net Lyricsfile page](https://lrclib.net/) (site JS); [lyricsfile LICENSE](https://github.com/tranxuanthang/lyricsfile/blob/main/LICENSE)

**License / legal**
- The docs and README publish no license for the lyrics data, no DMCA policy and no terms of use. The only legal mechanism found is the `/api/flag` "copyright violation" reason. — [LRCLIB API Documentation](https://lrclib.net/docs); [GitHub README](https://github.com/tranxuanthang/lrclib)
- A search for a dump or data license found nothing saying the lyrics are public domain. — [web search, 2026-10-21](https://github.com/osdlyrics/osdlyrics/issues/146)

**Coverage measured (2026-10-21, `/api/search?artist_name=&track_name=`)** — [LRCLIB API](https://lrclib.net/api/search)
- 42/42 songs returned results with at least one `syncedLyrics` record. Elevation Worship needed a retry after a 503. Per category, songs with synced lyrics: hits 14/14, K-pop 6/6, gospel 5/5, classics 7/7, BR favorites 10/10.
  - Hits: Espresso, Die With A Smile, BIRDS OF A FEATHER, APT., Good Luck Babe!, Not Like Us, Beautiful Things, Lose Control, Ordinary, Manchild, Sports car, The Fate of Ophelia, HUNTR/X "Golden", Olivia Dean "Man I Need".
  - K-pop: Dynamite, Butter, How You Like That, Super Shy, like JENNIE, S-Class.
  - Gospel: Oceans, Graves Into Gardens, You Say, Jireh, Gratitude.
  - Classics: Bohemian Rhapsody, Let It Be, Billie Jean, I Will Always Love You, Livin' On A Prayer, Sweet Child O' Mine, Listen To Your Heart.
  - BR favorites: Westlife My Love, Talking to the Moon, Perfect, Someone Like You, Yellow, Young And Beautiful, I Wanna Be Yours, Blinding Lights, Someone You Loved, Believer.
- Almost every song hit the 20-result cap. Records per song span very different durations: Espresso has records at 0, 3, 6, 128, 172–178 s; "Manchild" even has 3303–3367 s records (full-album or livestream uploads); "Die With A Smile" ranges 4–369 s.
- Zero records in the top-20 of every song contained inline enhanced-LRC word tags (`<mm:ss.xx>`) in `syncedLyrics`.
- In a second full pass checking the official `hasWordSync` field, 0 of 42 songs had any word-synced record in their top-20 (0 of ~840 records). For every one of the 42 songs, the top synced record's artist matched the queried artist (simple normalized-substring check).
- Latency varied a lot between runs:
  - first run (afternoon): 0.76–23.67 s per search, typically 1–7 s. Some requests got HTTP 503 (ServerOverloaded) or connection timeouts, and a few needed 1–2 retries. A DNS failure near the end was on my side.
  - second run (same day): median 1.50 s, p90 3.24 s, max 5.99 s, min 0.60 s, 0 failures, 0 retries.
- Crowd metadata is messy. "Die With A Smile" records carry album names like "Baldur's Gate 3 (Original Game Soundtrack)" and "The Fame". A cleaned `q=Queen - Bohemian Rhapsody` free-text search returned a top record whose artistName is "Bohemian Rhapsody - Queen".

### Inferences
- Line-synced coverage for mainstream English pop/rock/K-pop/worship looks close to complete. A "pick any song" experience is realistic for popular catalog. The long tail (indie, regional, very new releases) was not tested.
- LRCLIB is CORS-open and limits per IP, so a PWA can call it directly from each user's browser (sending `Lrclib-Client` / `X-User-Agent`, or a registered `Lrclib-App-Id`). Each student's IP then has its own allowance, which spreads the load. A server proxy with caching would cut latency and protect against outages, but caching or redistributing lyrics raises the copyright question (see Gaps).
- With 1–24 s latency and occasional 503s, "within seconds" needs: query `/api/get` (exact signature) in parallel with `/api/search`, a short timeout with retry/backoff, and a local cache of resolved IDs per YouTube video ID (`/api/get/{id}` afterwards).
- Legally, LRCLIB doesn't license anything. It's a free index of user-contributed copyrighted lyrics. For a free, non-commercial educational PWA in Brazil, the risk resembles that of the many open-source players that use it, but it isn't "licensed". If the app ever monetizes, it would need a licensed source (Musixmatch/LyricFind).

### Gaps
- No official LRCLIB statement on data license, takedown policy or terms of use was found. Whether DMCA requests have hit LRCLIB is unknown.
- No official total record count, or synced-vs-plain share, was found. The dump size (~19 GB) is secondhand and undated.
- I didn't verify that every sampled synced record is complete and correctly timed against the official audio. I only confirmed presence and metadata.

---

## 2. Musixmatch API (Musixmatch Pro API): plans and prices, free tier, subtitles/richsync, display/attribution, education/games

### Takeaway
Musixmatch now sells self-serve "Pro API" plans with public prices. Basic is $49/mo (static lyrics only). Grow is $199/mo or $1,910/yr and is the cheapest plan with time-synced lyrics, described as "line-by-line and word-by-word timing". Scale is $499/mo. Enterprise is custom, "from $2k/mo", and is the only tier that allows lyrics caching. Display needs a tracking script or pixel, the copyright line, a "Lyrics powered by" logo plus backlink, and country restrictions. Musixmatch actively markets "singing games" and sing-along use, so an education/game product is in scope, but it's a paid license.

### Cited Findings
- Self-serve plans in the Pro API pricing page code (read 2026-10-21) — [Musixmatch Pro API pricing](https://www.musixmatch.com/pro/api/pricing):

  | Plan | Price | Total calls | Lyrics calls | Translations calls | Time-synced lyrics | Lyrics caching |
  |---|---|---|---|---|---|---|
  | Basic | $49/mo ($470/yr), "Ideal for prototyping and small applications" | 5k/day | 500/day | 500/day | not included | not included |
  | Grow | $199/mo ($1,910/yr), "For growing apps generating revenue" | 20k/day | 2k/day | 2k/day | included, plus "App Store certificate" | not included |
  | Scale | $499/mo ($4,790/yr) | 100k/day | 10k/day | 10k/day | included | not included |
  | Enterprise | "Custom agreements, starting from $2,000/mo" | custom | custom | custom | included | included, plus advanced dashboard and custom contracts |

- The comparison table defines the "Time-synced lyrics" row as "Line-by-line and word-by-word timing": false for Basic, true for Grow, Scale and Enterprise. The "Lyrics caching" row says "Cache lyrics (licensed only)" and is true only for Enterprise. — [Musixmatch Pro API pricing](https://www.musixmatch.com/pro/api/pricing)
- Endpoints (official docs):
  - `track.subtitle.get` (line sync)
  - `matcher.subtitle.get`: "Get the syncs for a song given its title, artist and duration", with `f_subtitle_length` and `f_subtitle_length_max_deviation`
  - `track.richsync.get`: "an enhanced version of the standard sync, allowing position offsets by a single characther", needs commontrack_id, track_id or ISRC, and supports multiple concurrent voices
  - `track.subtitle.translation.get`: translated syncs
  - `track.lyrics.translation.get`
  - `track.search` with `f_has_rich_sync=1` lists songs that have richsync

  — [docs.musixmatch.com index](https://docs.musixmatch.com/llms.txt); [track.richsync.get](https://docs.musixmatch.com/api-reference/lyrics-catalog/track-richsync-get); [matcher.subtitle.get](https://docs.musixmatch.com/api-reference/lyrics-catalog/matcher-subtitle-get)
- Track objects carry `track_isrc`, `track_spotify_id`, `track_length`, `has_subtitles`, `has_richsync` and `restricted`. Restricted content (by artist, track worldwide or track per country) is returned without the lyrics/subtitle body. — [Content Restrictions (self-serve)](https://docs.musixmatch.com/content-restrictions)
- Matching guidance: match by ISRC first, else artist+title ranked by popularity. "There may be multiple versions of the lyrics, each associated with a specific duration. Choose the one that most closely matches your track's duration." — [Implementation guidelines](https://docs.musixmatch.com/implementation-guidelines)
- Display obligations — [Lyrics views tracking](https://docs.musixmatch.com/lyrics-views-tracking); [Implementation guidelines](https://docs.musixmatch.com/implementation-guidelines):
  - include the `script_tracking_url` JS or the `pixel_tracking_url` image whenever lyrics are shown
  - keep `lyrics_copyright` "clearly visible"
  - add the "Lyrics powered by" image and a link to `backlink_url`
  - apply country restrictions
- "Our team may contact you to review your implementation and ensure it complies with our content policy." Separate non-commercial API Terms exist: "THESE TERMS AND CONDITIONS APPLY TO NON-COMMERCIAL USE… IF YOU INTEND TO USE OUR SERVICES FOR COMMERCIAL/BUSINESS USE, PLEASE SEND AN EMAIL TO sales@musixmatch.com". — [Getting started](https://docs.musixmatch.com/getting-started); [docs llms-full](https://docs.musixmatch.com/llms-full.txt)
- Marketing copy on the Pro API site mentions "word-level synchronization… you can build engaging features like singing games", and "Sing-along… with word-level highlighting and scoring". It claims "Time-Synced Tracks 10M+" for its word-by-word dataset. Its hackathon (Musicathon) terms forbid commercial use and caching. — [Musixmatch Pro API site](https://www.musixmatch.com/pro/api/pricing) (site JS)
- Older free-tier claims: aggregators say ~2,000 calls/day with lyrics cut to ~30%, and that full lyrics need a commercial license. These are third-party claims, and the current official pricing table lists no free plan (lowest is Basic $49). — [freeapihub](https://freeapihub.com/apis/musixmatch); [plans.apis.io (placeholder prices)](https://plans.apis.io/plans/musixmatch/musixmatch-plans-pricing/)
- Unofficial Musixmatch clients (used by Spotify-lyrics hacks and syncedlyrics-type tools) are described by their own authors as against Musixmatch ToS. — [ThetaDev musixmatch-inofficial](https://code.thetadev.de/ThetaDev/musixmatch-inofficial/compare/main..musixmatch-cli/v0.3.1); [MusixmatchClientLib (NuGet)](https://www-0.nuget.org/packages/MusixmatchClientLib)
- Musixmatch is the synced-lyrics provider behind Spotify, Apple Music, Amazon, Tidal, Instagram and others. Artists and contributors sync line-by-line or word-by-word. — [sounds.co tutorial](https://sounds.co/en/post/your-lyrics-on-spotify-tutorial-musixmatch); [Musixmatch help](https://musixmatch.helpscoutdocs.com/article/190-how-can-artists-add-and-synchronize-lyrics-on-musixmatch-pro)

### Inferences
- The minimum legal path to synced (and word-level) licensed lyrics is about US$199/mo, or ~US$1,910/yr on annual billing. With 2k lyrics calls/day and no caching, a viral free PWA would quickly need Scale ($499/mo) or Enterprise. That's a real cost for a free app unless it's funded.
- No-caching on self-serve plans means every play must hit Musixmatch live. That fits a "fetch on song pick" design but forbids building your own lyrics DB or offline mode.
- The pricing table doesn't say whether word-level richsync is part of "Time-synced lyrics" on Grow for all tracks. The row text says "Line-by-line and word-by-word", which suggests yes, but confirm with sales.

### Gaps
- No official confirmation that a free or non-commercial developer key still exists in 2026, or what it returns. The 30% truncation and 2,000/day figures come from aggregators only.
- No public statement on whether Musixmatch licenses "gap-fill" games (modified or blanked lyrics). The API terms' clauses on altering lyrics were not extracted. Also unknown: whether Brazil has territorial restrictions for specific catalogs.
- Musixmatch's synced-track count is a marketing figure ("10M+"), not independently verified.

---

## 3. Other sources: LyricFind, Genius, Spotify, Apple Music, NetEase/QQ, open-source aggregators

### Takeaway
None of the big platforms offers an official, legal, free synced-lyrics API for third-party apps:
- **Genius**: plain lyrics only, via scraping that violates its ToS.
- **Spotify and Apple Music**: synced and syllable data exist, but only through undocumented or privileged endpoints.
- **LyricFind**: licensed, ~1.3M word-synced songs, quote-only commercial pricing.
- **Aggregators** (syncedlyrics, Better Lyrics): useful as references for provider fallbacks, but they lean on unofficial endpoints.

### Cited Findings
**LyricFind**
- Free for development under an evaluation license. Commercial use is referred to LyricFind's ToS and sales. — [Music Story partner page](https://developers.music-story.com/partners/lyricfind)
- "As of January 2025… over 12 million songs… including over 1.3 million word-by-word synced songs" (secondary source). — [Wikipedia: LyricFind](https://en.wikipedia.org/wiki/LyricFind)
- No public price found.

**Genius**
- The API returns song metadata, not lyrics text. Libraries scrape song pages (LyricsGenius uses Beautiful Soup), and the LyricsGenius docs state this scraping "violates Genius' terms of service". The same docs note Genius sued Google over lyrics. — [LyricsGenius docs](https://lyricsgenius.readthedocs.io/en/stable/how_it_works.html); [bigishdata 2016](https://bigishdata.com/2016/09/27/getting-song-lyrics-from-geniuss-api-scraping/)
- Genius is plain-format only in syncedlyrics. — [syncedlyrics README](https://github.com/moehmeni/syncedlyrics)

**Spotify**
- No public lyrics endpoint. A Spotify Community answer says it "isn't possible with the API", that Spotify uses Musixmatch, and suggests the Musixmatch API instead. — [Spotify Community](https://community.spotify.com/t5/Spotify-for-Developers/Get-lyrics/m-p/5429414/highlight/true)
- The internal lyrics service (line- or word-synced) is reverse-engineered from network traffic, and a client library warns it "can be disabled or removed at any time to ensure compliance with the Spotify Developer Terms". — [minim docs](https://minim.readthedocs.io/en/latest/api/minim.spotify.PrivateLyricsService.html)

**Apple Music**
- Syllable/TTML lyrics need a "privileged developer token". Shipping such calls in production "is likely to violate Apple's terms". Community tools (MusanovaKit, LyricaAME-py) export TTML to LRC/ELRC. — [MusanovaKit](https://github.com/rryam/MusanovaKit); [LyricaAME-py](https://codeberg.org/willooper/LyricaAME-py)
- Apple's public developer-token docs cover tokens and 429 rate limits, not lyrics. — [Apple: Generating developer tokens](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens)

**NetEase / QQ and aggregators**
- **syncedlyrics** (Python, MIT) providers: Musixmatch, Lrclib, NetEase, Megalobiz, Genius (plain only). Deezer is "Currently not working anymore" and Lyricsify is broken by Cloudflare. `--enhanced` requests word-level timing with fallback to line sync, plus `--synced-only`, `-p` provider list and `-l` translation. — [syncedlyrics README](https://github.com/moehmeni/syncedlyrics)
- **Better Lyrics**, a YouTube Music browser extension (GPL-3.0, ~3.2k commits), has 16 providers in its default priority list, including its own, Unison, BiniLyrics, Musixmatch, YouTube captions and unsynced, and LRCLib. Providers are tagged Syllable, Word, Line or Unsynced. Desktop only. — [GitHub better-lyrics](https://github.com/better-lyrics/better-lyrics)
- **Liner** (Firefox/Chrome extension) supports YouTube, YouTube Music, Spotify and others. Its permissions include lrclib.net. — [Liner on AMO](https://addons.mozilla.org/firefox/addon/liner/)

### Inferences
- For a public PWA, the defensible stack is LRCLIB (free, community, unlicensed) now, with Musixmatch Grow or LyricFind as the licensed upgrade. Scraping Genius, or calling Spotify/Apple/unofficial Musixmatch endpoints from a public app, carries ToS risk and fragility. Avoid them.
- NetEase (via syncedlyrics) is mainly a fallback for Asian catalog. Its legal status for a Brazilian public app is unclear and it is unofficial.

### Gaps
- No official NetEase or QQ Music developer lyrics API terms were checked. Their coverage of Western or K-pop catalog wasn't measured.
- LyricFind pricing and its terms for education/games are not public.
- The syncedlyrics release date wasn't shown on GitHub (197 commits). Its current health per provider wasn't tested.

---

## 4. Matching: from a YouTube video ID/title to artist/track/duration

### Takeaway
The practical pipeline is:
1. Get title, channel and duration (IFrame player client-side, or YouTube Data API `videos.list` at 1 quota unit).
2. Parse "Artist - Title (Official Video)" with a title parser, falling back to the channel name (or the "- Topic" channel).
3. Query LRCLIB structured search (artist and track) and rank candidates by fuzzy name similarity plus closeness to the video duration.
4. Optionally use MusicBrainz or ISRC for canonical names.

My test showed raw YouTube titles sent to LRCLIB `q=` often fail or return junk, while cleaned titles work.

### Cited Findings
- **YouTube IFrame API**: `getDuration()` "will return `0` until the video's metadata is loaded". `getCurrentTime()` returns elapsed seconds. `seekTo(seconds, allowSeekAhead)` and `onStateChange` events are available. The minimum embed viewport is 200×200 px. — [YouTube IFrame Player API reference](https://developers.google.com/youtube/iframe_api_reference)
- **YouTube Data API quota**: `videos.list` costs 1 unit. The default quota is 10,000 units/day. The current quota page says `search.list` has "its own default limit of 100 calls per day" (separate bucket). — [YouTube Data API quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
- **get-artist-title** (npm, v1.3.1) extracts `[artist, title]` from a YouTube-style title, strips suffixes like "(Music Video)", and supports `defaultArtist` (e.g., `video.snippet.channelTitle`). Ports exist in Python (`youtube-title-parse`) and C# (YouTubeTitleParse). — [npm get-artist-title](https://npmjs.com/package/get-artist-title); [PyPI youtube-title-parse](https://pypi.org/project/youtube-title-parse/); [YouTubeTitleParse](https://github.com/PedroCavaleiro/YouTubeTitleParse/blob/main/README.md)
- **MusicBrainz API**: ~1 request/second per source IP on average, with a mandatory descriptive User-Agent ("Application name/<version> ( contact )"). Over the limit returns 503. — [MusicBrainz Rate Limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- **Musixmatch** recommends ISRC matching first, then artist+title. — [Musixmatch implementation guidelines](https://docs.musixmatch.com/implementation-guidelines)
- **Measured LRCLIB behavior with raw YouTube titles (2026-10-21)** — [LRCLIB search API](https://lrclib.net/api/search):
  - `q="Bruno Mars - Talking To The Moon (Official Audio)"` returned 0 results. With the suffix stripped, it returned 20 results (17 synced).
  - `q="Queen – Bohemian Rhapsody (Official Video Remastered)"` returned 2 junk results (artistName "Video").
  - `q="ROSÉ & Bruno Mars - APT. (Official Music Video)"` returned 2 records whose trackName is the literal YouTube title (duration 173 s).
  - With suffixes stripped, all 8 test titles returned 20 results with mostly synced lyrics.
- Some LRCLIB records carry YouTube video titles as trackName or albumName (e.g., "Sabrina Carpenter - Espresso (Official Video)" at 201 s, versus ~175–176 s for album records; "Billie Eilish - BIRDS OF A FEATHER (Official Music Video)" at 230 s). Contributors evidently publish against YouTube video cuts. — [LRCLIB search API](https://lrclib.net/api/search) (measured)

### Inferences
Recommended matching algorithm (inference, not a cited spec):
1. On load, read the title (oEmbed or Data API `snippet.title`, `channelTitle`) and the duration (`player.getDuration()` once >0, or `contentDetails.duration`).
2. Strip suffixes ("Official Music Video", "Official Audio", "Lyric Video", "Visualizer", "Remastered", "ft./feat.", "MV", "[Color Coded Lyrics]"), parse artist and title, and drop " - Topic" from channel names.
3. Fire LRCLIB `/api/get` with (artist, title, duration rounded) and `/api/search?artist_name=&track_name=` in parallel.
4. Score candidates by normalized title/artist similarity, with a big bonus for |duration − video duration| ≤ 2–3 s (`/api/get` already enforces ±2 s). Prefer records whose own trackName equals the YouTube title, since they may have been timed to that cut.
5. Cache videoId → lyricsId (and the offset) in your own small DB, so the next user gets an instant, community-validated match.

Other points:
- Data API quota (10k units/day, 1 unit per `videos.list`) is plenty if you call it once per new video ID and cache. Avoid `search.list`, which now has only 100 calls/day.
- Topic channels ("Artist - Topic", auto-generated "Provided to YouTube by…") host the album audio, whose duration matches LRC timing best. Offering an "official audio version" switch is a strong default.

### Gaps
- `player.getVideoData()` (which exposes the title client-side) is undocumented in the official IFrame reference, so relying on it is unsupported.
- No cited source documents how YouTube "Topic" auto-generated uploads map to ISRCs. That mapping would come from YouTube Music's (unofficial) APIs, which I didn't research.
- MusicBrainz/ISRC lookups from YouTube metadata weren't tested end-to-end.

---

## 5. The offset problem (studio-audio timing vs. music videos with intros, skits, edits)

### Takeaway
Synced lyrics are timed to a specific audio cut. Official music videos often add intros, outros or skits. In my sample the duration gap was ~26 s for Espresso (video record 201 s vs ~175 s album). LRCLIB often reuses the same timing across records of very different durations, so the record's duration alone doesn't guarantee the timing fits. The proven fixes: prefer official audio/Topic uploads, match by duration, apply a per-video global offset (manual nudge, saved and shared), and optionally auto-align with ASR (Whisper-based tools).

### Cited Findings
- **Measured on LRCLIB (2026-10-21)** — [LRCLIB search API](https://lrclib.net/api/search):
  - The first lyric timestamp was identical across all 20 synced records of a song, whatever the record's duration:
    - APT.: 0.29 s for records lasting 63–293 s
    - Billie Jean: 29.57 s for records lasting 1–432 s, including live and 12-inch versions
    - Bohemian Rhapsody: 0.15 s for records lasting 263–415 s, including live bootlegs
    - Die With A Smile: 3.34 s for records lasting 4–369 s
    - Westlife "My Love": 9.24 s in 19 of 20 records, with one at 9.09 s
- **Musixmatch** keeps multiple sync versions per song tied to durations and tells integrators to pick the one closest to the track duration. `matcher.subtitle.get` supports `f_subtitle_length_max_deviation`. — [Musixmatch implementation guidelines](https://docs.musixmatch.com/implementation-guidelines); [matcher.subtitle.get](https://docs.musixmatch.com/api-reference/lyrics-catalog/matcher-subtitle-get)
- **LRCLIB** only returns `/api/get` matches within ±2 s of the provided duration. — [LRCLIB API Documentation](https://lrclib.net/docs)
- **Liner** (browser extension for YouTube/YouTube Music) has a per-track sync offset that users adjust until lyrics line up. It's described as especially useful for YouTube videos with long intros, talk sections or extended outros, and the offset is remembered per track. — [Liner on AMO](https://addons.mozilla.org/firefox/addon/liner/)
- **Automatic alignment tools**:
  - syncalong uses Whisper word timestamps plus a sequence aligner to map known lyrics onto audio and write LRC. It notes `condition_on_previous_text=False` avoids repetition loops on choruses.
  - lyric-align matches known lyric lines to ASR word timings (faster-whisper, optional Demucs vocal separation) and outputs LRC/SRT/ASS/JSON.

  — [syncalong docs](https://syncalong.readthedocs.io/en/latest/how-it-works/); [lyric-align on PyPI](https://pypi.org/project/lyric-align/)

### Inferences
- The identical first timestamps suggest LRCLIB shares one lyrics body across many track records, or contributors copy the same LRC. Either way, an LRCLIB record's `duration` is weak evidence that its timestamps fit that cut. Inference: the lyric text is probably tied to the album/studio version.
- For music videos, the most common error is a constant shift (an intro adds N seconds). A single global offset per video ID fixes most cases. Mid-song skits or edits (e.g., cinematic videos with dialogue breaks) need piecewise offsets or a fallback to the official audio upload.
- Recommended UX: default to the matched record; show "sync ±0.5 s" nudge buttons plus a "tap when the first line starts" calibration. Persist the offset per videoId server-side and use the median of community submissions, a community-correction loop. For gap-fill games, also check that the last lyric timestamp is less than the video duration, and flag a mismatch when the video is much longer than the record (>10 s).
- Auto-detecting the offset client-side (cross-correlating audio) isn't possible with the YouTube iframe, which gives no raw audio access. Server-side ASR alignment of YouTube audio would require downloading YouTube audio, which conflicts with YouTube ToS. So manual or community offsets plus duration matching are the realistic options for a PWA built on embeds.

### Gaps
- I didn't measure actual intro offsets of official music videos against album LRC timings. That would need watching or playing videos. The ~26 s Espresso gap is from record durations, not from verified timestamps.
- No source found describing how Musixmatch, Spotify or YouTube Music handle music-video (not audio) syncs in their own players.

---

## 6. How existing lyrics-learning/karaoke apps source and time their lyrics

### Takeaway
Little is public. LyricsTraining discloses nothing about its lyrics source or timing beyond being for "personal use and for educational purposes". Musixmatch, the industry sync source, uses a crowd of contributors and artists syncing line-by-line or word-by-word against audio. Open-source YouTube-lyrics extensions (Better Lyrics, Liner) combine several providers (LRCLIB, Musixmatch, YouTube captions) and let users fix the offset. Nothing specific on Fill the Song or Sounter turned up.

### Cited Findings
- LyricsTraining's About page says it works "through the music videos and the lyrics of your favorite songs" and is "only for personal use and for educational purposes" (© 2025). It doesn't mention Musixmatch, community sync or licensing. — [LyricsTraining About](https://lyricstraining.com/about)
- Musixmatch syncing is collaborative: users and artists add, edit and sync lyrics, line-by-line or word-by-word, against Spotify Premium playback or the audio file. — [Musixmatch help: add & sync lyrics](https://musixmatch.helpscoutdocs.com/article/190-how-can-artists-add-and-synchronize-lyrics-on-musixmatch-pro); [sounds.co tutorial](https://sounds.co/en/post/your-lyrics-on-spotify-tutorial-musixmatch)
- Better Lyrics (YouTube Music) uses a 16-provider fallback chain, including LRCLib, Musixmatch and YouTube captions, plus its own community providers (Unison accepts "rich-sync" submissions). — [GitHub better-lyrics](https://github.com/better-lyrics/better-lyrics)
- Liner uses lrclib.net and offers per-track offsets for YouTube videos. — [Liner on AMO](https://addons.mozilla.org/firefox/addon/liner/)
- The Musixmatch Pro API site lists customer and partner logos including names like "esl-tools" and "gameville-studio", and pitches singing games and sing-along scoring. Only asset filenames were seen, which is weak evidence of education/game customers. — [Musixmatch Pro API site](https://www.musixmatch.com/pro/api/pricing) (site JS)

### Inferences
- LyricsTraining-style products likely rely on in-house or community timing per YouTube video, because their games are keyed to specific music videos. That's unverified. If true, it supports building your own videoId → (lyricsId, offset) table, seeded from LRCLIB and corrected by users.
- YouTube's own captions (when the uploader provides timed lyrics) are another source Better Lyrics uses. Fetching them programmatically for third-party videos via the Data API `captions.download` requires the video owner's authorization. This is inference from general API knowledge, not verified in this session.

### Gaps
- Nothing reliable was found on how LyricsTraining, LingoClip, Fill the Song or Sounter license or time lyrics. Their help/FAQ pages either don't exist or weren't found. Contacting them or reviewing their network traffic would be needed.
- No open-source karaoke web app built on YouTube embeds with a documented community-offset system was found in this session.
