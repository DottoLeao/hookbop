# YouTube captions, auto-captions and YouTube Music lyrics as a lyrics source for a third-party PWA (research date: 2026-10-21)

Context: a free PWA for Brazilians learning English with music. The user picks any song on YouTube, the video plays in the official embedded IFrame player, and lyrics appear beside it for gap-fill games. The question is whether YouTube's captions, auto-captions or YouTube Music lyrics can legitimately be the lyrics source, and what the policy-compliant options are.

Bottom line (inference, explained below): no official, policy-compliant way exists for a third-party web app to get caption text or YouTube Music lyrics for videos it does not own. The Data API's caption download requires edit permission on the video. The IFrame API exposes no caption text or audio. Unofficial routes (timedtext, youtube-transcript-api, yt-dlp, ytmusicapi) breach the Developer Policies' scraping and "only through YouTube API Services" clauses, and YouTube is technically blocking them more and more. The realistic compliant design: the official IFrame player for video and sync timing (getCurrentTime), plus lyrics from a separately licensed lyrics provider, or from user-made or rights-cleared synced lyrics, shown in the app's own UI next to the player, never on top of it.

---

## 1. How common are captions on official music videos, and are auto-captions on songs accurate enough?

### Takeaway
No reliable data source was found on how many official or VEVO/label music videos carry uploaded lyric captions versus auto-captions. YouTube's own help page does not mention music. The only accuracy figures for sung lyrics come from vendor blogs (30–60%), which are unreliable. For a gap-fill game that needs word-exact lyrics, auto-captions on songs should be treated as unfit.

### Cited Findings
- YouTube's help page says automatic captions "might misrepresent the spoken content due to mispronunciations, accents, dialects, or background noise," and tells creators to "always review automatic captions." — [YouTube Help: Use automatic captioning](https://support.google.com/youtube/answer/6373554)
- The same page lists cases where auto-captions may not be generated. Two are especially relevant to music: "The video has poor sound quality or YouTube doesn't recognize the speech" and "The captions aren't available yet due to processing complex audio in the video." It also lists "multiple speakers whose speech overlaps or multiple languages at the same time." The page does not mention music at all. — [YouTube Help: Use automatic captioning](https://support.google.com/youtube/answer/6373554)
- In the Data API, caption tracks carry `snippet.trackKind` = `ASR` ("generated using automatic speech recognition"), `forced`, or `standard` (the default, a regular track). There is also `snippet.isAutoSynced`, which "indicates whether YouTube synchronized the caption track to the audio track." So the API can tell uploaded tracks from auto tracks in metadata, but only an authorized caller can read that metadata (see Q2). — [YouTube Data API: Captions resource](https://developers.google.com/youtube/v3/docs/captions) (last updated 2026-10-15)
- A vendor blog claims YouTube auto-captions reach "30-60% accuracy for sung lyrics." No study is cited and the figure could not be checked. — [NoteLM blog (vendor)](https://www.notelm.ai/blog/youtube-transcript-music-video), found via search summary; treat as low reliability.
- A university accessibility page notes that automatic captioning works best with clear audio, and that background music or certain accents can affect accuracy. — [Swarthmore KB: Auto-Captioning Videos in YouTube](https://kb.swarthmore.edu/wiki/Auto-Captioning_Video_in_YouTube)
- An anecdotal forum post says OpenAI's Whisper produces better transcripts than YouTube auto-captions and works "incredibly well" on songs, rap and rock included, in most languages. This is user opinion, not a benchmark. — [Streamlit forum post](https://discuss.streamlit.io/t/open-source-song-transcript-and-video-caption-generator-with-whisper/35252)
- Language-learning guides say YouTube auto-generated captions "often include misinterpreted words, cut-off phrases, or just skip over critical parts." This is one reason tools like Language Reactor steer users to videos with human-made subtitles. — [Refold blog: Language Reactor for YouTube](https://www.refold.la/blog/language-reactor-for-language-learning-with-youtube)

### Inferences
- Speech recognition on sung vocals over instruments is known to be much harder than on speech. Combined with YouTube's own caveats about "complex audio", this suggests many auto tracks on songs will be partial, will contain `[Music]`/♪ placeholder segments, or will mis-hear words. Those errors are fatal for a gap-fill game, where the "correct" word must actually be correct.
- Uploaded (`standard`) lyric captions do exist on some label/VEVO uploads, from YouTube usage experience, but the share is unknown. Since the app lets users pick ANY song, coverage would be patchy even if access were allowed.
- Even where a human-made lyric caption exists, it is the uploader's or label's copyrighted transcription of copyrighted lyrics. Being able to see it in YouTube's player does not license an app to copy it.

### Gaps
- No dataset, academic study or sample was found measuring (a) the share of official music videos with uploaded lyric captions, (b) the share with ASR tracks, or (c) word error rate of YouTube ASR on sung lyrics. An empirical sample would need authorized access or manual inspection in the YouTube UI. Scraping is ruled out on policy grounds.
- Not verified: whether YouTube suppresses ASR on videos flagged as music, or replaces vocals with `[Music]` tokens as a rule. It is commonly observed, but no official source was found.

---

## 2. Can the YouTube Data API v3 captions resource (captions.list / captions.download) be used for videos the developer does not own?

### Takeaway
No, not for downloading the text. `captions.download` requires OAuth with the `youtube.force-ssl` or `youtubepartner` scope, and "requires the user to have permission to edit the video." Its quota cost is 200 units per call. `captions.list` (50 units) also requires OAuth and returns track metadata only, never the caption text. For arbitrary songs chosen by a learner, who is not the video's editor, the official caption API cannot supply lyrics.

### Cited Findings
- `captions.download`: "This request requires authorization with at least one of the following scopes": `https://www.googleapis.com/auth/youtube.force-ssl`, `https://www.googleapis.com/auth/youtubepartner`. — [captions.download](https://developers.google.com/youtube/v3/docs/captions/download) (last updated 2026-10-15)
- `captions.download`: "This method requires the user to have permission to edit the video." — [captions.download](https://developers.google.com/youtube/v3/docs/captions/download)
- `captions.download` quota: "A call to this method has a quota cost of 200 units." — [captions.download](https://developers.google.com/youtube/v3/docs/captions/download)
- `captions.download` error `forbidden (403)`: "The permissions associated with the request are not sufficient to download the caption track." — [captions.download](https://developers.google.com/youtube/v3/docs/captions/download)
- `captions.list` needs the same two OAuth scopes and "has a quota cost of 50 units." Its response "does not contain the actual captions." Its 403 error reads "the permissions associated with the request are not sufficient to retrieve the requested resources." — [captions.list](https://developers.google.com/youtube/v3/docs/captions/list) (last updated 2026-10-15)
- `captions.list` takes the parameter `onBehalfOfContentOwner`, which is limited to YouTube content partners acting for a content owner (CMS partners). — [captions.list](https://developers.google.com/youtube/v3/docs/captions/list)
- Quota extensions require an "API Compliance Audit," and extra quota may be used "only for the approved use case." — [YouTube API Services Developer Policies §III.D.3](https://developers.google.com/youtube/terms/developer-policies) (last updated 2026-10-15)
- A secondary vendor source describes the official captions endpoint as returning caption tracks only "for videos you own (or have OAuth access to)," and therefore unusable for third-party transcripts. — [OutlierKit (vendor marketing, low reliability)](https://outlierkit.com/resources/youtube-scraper-api/), consistent with the primary docs above.

### Inferences
- The only official path to caption text for a label's video is to act as, or for, the content owner: an OAuth user with edit rights on that channel, or a CMS partner using `onBehalfOfContentOwner`. That needs a business deal with each label or channel, which does not fit "any song on YouTube."
- At 200 units per download, the Data API's commonly cited default daily quota (10,000 units, not re-verified this session) would allow about 50 downloads a day before an audit, even if permission were not an issue.
- Caption text obtained through the API would itself be "API Data" (see Q6). Storing it would fall under the 30-day delete-or-refresh rule, which is awkward for a lyrics cache.

### Gaps
- The docs do not say outright whether "permission to edit the video" covers channel managers or editors added via YouTube Studio permissions. Presumably yes, but this is not verified.
- The default daily quota figure (10,000 units/day) was not re-fetched in this session.

---

## 3. Does the IFrame Player API expose caption text, caption events or audio to the embedding page?

### Takeaway
No. The documented IFrame API lets the page change the caption display only: show captions by default via `cc_load_policy`, set the default language via `cc_lang_pref`, and set `fontSize` and `reload` on the `captions` module. It documents no getter for caption text, no caption-cue event, and no access to audio or video streams. The player is a cross-origin iframe, so the page cannot read its DOM or audio. Splitting or isolating audio is also expressly prohibited by policy.

### Cited Findings
- "Currently, the only module that you can set options for is the `captions` module." Two options are documented: `fontSize` ("adjusts the font size of the captions displayed in the player", values -1 to 3) and `reload` ("reloads the closed caption data for the video that is playing"). — [IFrame Player API reference](https://developers.google.com/youtube/iframe_api_reference) (last updated 2026-10-15)
- The `onApiChange` event "is fired to indicate that the player has loaded (or unloaded) a module with exposed API methods." — [IFrame Player API reference](https://developers.google.com/youtube/iframe_api_reference)
- Documented events: `onReady`, `onStateChange`, `onPlaybackQualityChange`, `onPlaybackRateChange`, `onError`, `onApiChange`, `onAutoplayBlocked`. Documented getters include `getPlayerState`, `getCurrentTime`, `getDuration`, `getVideoLoadedFraction`, `getVideoUrl`, `getVideoEmbedCode`, playlist/volume/rate getters, `getSphericalProperties`, `getIframe`, and `getOption`/`getOptions`. None returns caption text or audio data. — [IFrame Player API reference](https://developers.google.com/youtube/iframe_api_reference)
- `cc_load_policy` "causes closed captions to be shown by default, even if the user has turned captions off." `cc_lang_pref` sets the default caption language, and with `cc_load_policy=1` "the player will show captions in the specified language when the player loads." — [Player parameters](https://developers.google.com/youtube/player_parameters) (last updated 2026-10-15)
- `hl` affects the default caption track, and "YouTube might select a different caption track language for a particular user." — [Player parameters](https://developers.google.com/youtube/player_parameters)
- `getOption('captions','tracklist')` and `setOption('captions','track',{})` appear only in third-party bug trackers and blogs, for example a Fluid Project issue on disabling captions by setting an empty track. They are not in the official reference. — [Fluid Project FLUID-6317](https://issues.fluidproject.org/browse/FLUID-6317/) (secondary)
- Policy: clients must not "separate, isolate, or modify the audio or video components of any YouTube audiovisual content" (§III.I.7), nor "modify, build upon, or block any portion or functionality of a YouTube player" (§III.I.6). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- RMF: "You must not make changes to the YouTube player that are not explicitly described by the API documentation." — [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality) (last updated 2026-10-15)

### Inferences
- `player.getCurrentTime()`, polled for example every 100–250 ms, plus `onStateChange` is the official, permitted way to sync an external lyrics panel to the video. That is enough for line-level karaoke and gap-fill timing, as long as the lyrics come from somewhere else.
- The undocumented `tracklist` option seems to return at most track metadata (language code, name), not cue text. Relying on undocumented behaviour risks breaking under "changes ... not explicitly described by the API documentation."
- Reading the player's audio (for client-side speech recognition or alignment) is blocked technically, since the iframe is cross-origin from youtube.com and the Web Audio API cannot tap cross-origin media without CORS. It is also barred by policy (§III.I.7). A legal alignment route would only work on audio the app is licensed to process, not the YouTube stream.

### Gaps
- No official statement was found on the semantics of `getOption('captions','tracklist')` or `track`. Its behaviour was not verified, since that would need running the player.
- The cross-origin audio restriction rests on general browser same-origin/CORS behaviour, not on a YouTube doc fetched in this session.

---

## 4. Unofficial methods (timedtext endpoint, youtube-transcript-api, yt-dlp subtitles, ytmusicapi get_lyrics): existence, adoption, policy status

### Takeaway
All four tools exist and are widely used: youtube-transcript-api has about 8.5k GitHub stars, and ytmusicapi offers lyrics with timestamps sourced from LyricFind. All of them use undocumented web-client endpoints. That runs straight into the Developer Policies: §III.E.6 bans scraping, §III.I.14 bans accessing API Data by "any technology other than YouTube API Services", and §III.E.1.a bans caching or downloading without written approval. The YouTube ToS separately bans automated access. YouTube also enforces this technically: cloud IPs are blocked, and since 2025 the timedtext requests from the web client need proof-of-origin (PO) tokens. They are not a legitimate foundation for a product.

### Cited Findings
- youtube-transcript-api: "This code uses an undocumented part of the YouTube API, which is called by the YouTube web-client," with "no guarantee that it won't stop working tomorrow." About 8.5k stars and 854 forks on GitHub. — [jdepoix/youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) (viewed 2026-10-21)
- The same README: "YouTube has started blocking most IPs that are known to belong to cloud providers" (AWS, GCP, Azure). Deployments will "most likely" hit `RequestBlocked`/`IpBlocked`, and "Same can happen to the IP of your self-hosted solution, if you are doing too many requests." The author recommends rotating residential proxies via referral links, which signals an evasion arms race. No project ToS or legal disclaimer is given. — [jdepoix/youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api)
- yt-dlp added PO-token support for subtitles in release 2025.05.22 (issue #13075). Its PO Token Guide says subtitle requests are one of the cases that currently require PO tokens for some clients, including the web client. — [yt-dlp commit](https://git.myzel394.app/Myzel394/yt-dlp/commit/32ed5f107c6c641958d1cd2752e130de4db55a13); [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
- A 2026 developer post reports timedtext requests returning HTTP 200 with an empty body, which it attributes to YouTube requiring a BotGuard-generated PO token. — [DEV Community (secondary)](https://dev.to/jamhimself/why-your-youtube-transcript-scraper-started-returning-empty-strings-and-how-to-fix-it-in-2026-20ed)
- ytmusicapi `get_lyrics`: "Returns lyrics of a song or video. When timestamps is set, lyrics are returned with timestamps, if available." With timestamps, it returns line objects with `text`, `start_time`, `end_time` and `id`, plus `hasTimestamps`. The example output shows `"source": "Source: LyricFind"`. — [ytmusicapi docs: Browsing](https://ytmusicapi.readthedocs.io/en/stable/reference/browsing.html)
- Developer Policies §III.E.6: clients must not "scrape YouTube Applications or Google Applications, or obtain scraped YouTube data or content." Only public search engines may scrape, and only per robots.txt. — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) (last updated 2026-10-15)
- §III.I.14: clients must not "use any technology other than YouTube API Services to access or retrieve API Data." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- §III.E.1.a: clients must not "download, import, backup, cache, or store copies of YouTube audiovisual content without YouTube's prior written approval." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- §III.H: YouTube may "survey, monitor, and/or audit," and "may use any technical means to overcome non-compliance." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- The YouTube ToS (effective November 6, 2023) bars users from: "access the Service using any automated means (such as robots, botnets or scrapers)" (with exceptions); "circumvent, disable, fraudulently engage with, or otherwise interfere with any part of the Service"; and "access, reproduce, download, distribute, transmit, broadcast, display, sell, license, alter, modify" the Service or Content except as permitted. — [YouTube Terms of Service](https://www.youtube.com/static?template=terms)
- API Services ToS: "API Data" means "data, content (including audiovisual content) and information provided to API Clients." YouTube may "suspend or terminate access to, or use of, any aspects of the YouTube API Services" (§24.2). On termination you must "immediately stop accessing and using all YouTube Property" and "delete all ... API Data" (§24.3). — [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service) (last updated 2026-09-14)

### Inferences
- An app that uses the official IFrame embed, and is therefore an API Client bound by the API ToS and Developer Policies, while also pulling captions or lyrics through timedtext or ytmusicapi would be openly non-compliant. If audited, that would risk both the embed/API project and the app.
- Running these tools client-side in the learner's browser does not change the policy analysis: the app would still be "obtaining scraped YouTube data." It would also break technically because of PO tokens and BotGuard. The trend from 2024 to 2026 is tighter technical enforcement.
- ytmusicapi lyrics are LyricFind's licensed content, served to YouTube under YouTube's licence. A third party re-displaying them has no licence from LyricFind or the publishers, so beyond the YouTube ToS problem there is a separate lyrics-copyright problem.

### Gaps
- No public case was found of YouTube revoking an API project or sending a takedown specifically for transcript or lyrics scraping in 2025–2026. Enforcement examples found are against unofficial clients and music bots (Q7).
- The current release and status of youtube-transcript-api and ytmusicapi as of Oct 2026 was not pinned down. The GitHub page fetch did not show release data.

---

## 5. YouTube Music lyrics: where they come from, and is there any official API?

### Takeaway
YouTube Music lyrics are licensed from third-party providers: LyricFind and Musixmatch, with reporting from 2024 pointing to LyricFind as primary. Time-synced lyrics appear on mobile. No official YouTube or Google API exposes YouTube Music lyrics. The Data API has no lyrics resource, and YouTube Music has no public developer API. The only programmatic access is the unofficial ytmusicapi (Q4).

### Cited Findings
- Google partnered with Musixmatch in October 2022 to expand lyrics coverage. Reports in April 2023 said real-time lyrics on mobile appeared to be powered by Musixmatch. LyricFind was also reported as a YouTube Music partner for the real-time feature. — [9to5Google, 2023-04-07](https://9to5google.com/2023/04/07/youtube-music-real-time-lyrics/); [Music Business Worldwide](https://www.musicbusinessworldwide.com/youtube-music-rolls-out-spotify-like-real-time-lyrics-on-mobile/)
- In 2024, Android Authority reported that time-synced lyrics vanished from many songs after "the lyrics provider for impacted songs has switched from Musixmatch to LyricFind." LyricFind said it had offered time-syncing since 2010 and that YouTube decides which lyric features it shows. 9to5Google saw the same missing-sync behaviour with both providers, which points to a cause on YouTube's side. — [Android Authority](https://androidauthority.com/youtube-music-lost-time-synced-lyrics-3478527) (fetch returned 403; claims taken from search summaries)
- 2020 coverage: YouTube "receives lyrics from LyricFind on a daily basis," with no fixed time frame for a song getting lyrics. — [Digital Music News, 2020-03-28](https://www.digitalmusicnews.com/2020/03/28/youtube-music-app-lyrics-update/); [9to5Google, 2020-03-24](https://9to5google.com/2020/03/24/youtube-music-lyrics/)
- ytmusicapi's sample output labels lyrics `"Source: LyricFind"`, which confirms the provider attribution is carried in YouTube Music's internal responses. — [ytmusicapi docs](https://ytmusicapi.readthedocs.io/en/stable/reference/browsing.html)
- LyricFind describes itself as partnered with Google/YouTube, Amazon, TikTok, Pandora and Deezer, with licences from "over 55,000 lyric catalogues" including the three majors. It also runs a lyric-video generator for rights holders. — [RouteNote](https://routenote.com/blog/lyricfind-creates-free-auto-lyric-video-maker-tool/); [Billboard Canada](https://ca.billboard.com/fyi/new-lyricfind-service-automates-lyric-videos-rights-holders) (via search summaries)
- The YouTube Data API reference lists no lyrics resource. Its caption resource covers caption tracks only. — [Captions resource](https://developers.google.com/youtube/v3/docs/captions)

### Inferences
- The legitimate way to get the same data YouTube Music shows is to license it directly from LyricFind or Musixmatch, both of which sell B2B lyric and synced-lyric APIs, often with display rules and per-territory restrictions. That is outside YouTube entirely. Licensing terms, costs and Brazil coverage are covered elsewhere in this research set, not here.
- Lyric licensing is territorial, so availability for users in Brazil is a separate question from availability in the US.

### Gaps
- The official YouTube Music Help page on lyrics could not be retrieved (support.google.com/youtubemusic/answer/9894047 returned 404). No current (2025–2026) official statement was found on which provider YouTube Music uses today.
- No evidence was found of any YouTube program that sublicenses YouTube Music lyrics to third-party developers.

---

## 6. Policy points relevant to the app: embed rules, RMF, data storage, content beside the player, education and gamification

### Takeaway
Showing lyrics or a game in the app's own UI beside a compliant embedded player is not prohibited. The rules restrict what goes on top of or into the player, not what sits next to it. The binding constraints: viewport at least 200×200 px (480×270 recommended for 16:9); no overlays, frames or elements in front of any part of the player; no modifying, blocking, or separating audio from video; no background playback; no autoplay until the player is visible; no hiding links or attribution; no rewards for engaging with YouTube; ad limits on pages with API Data; 30-day delete-or-refresh for stored API Data. The Developer Policies even use a language-learning app as an example of an acceptable focused client.

### Cited Findings
- Size: "Embedded players must have a viewport that is at least 200px by 200px." "We recommend 16:9 players be at least 480 pixels wide and 270 pixels tall." — [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality); also [IFrame API reference](https://developers.google.com/youtube/iframe_api_reference) and [Player parameters](https://developers.google.com/youtube/player_parameters) (all last updated 2026-10-15)
- Overlays: "You must not display overlays, frames, or other visual elements in front of any part of a YouTube embedded player," nor use them "to obscure any part of an embedded player, including player controls." — [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)
- Autoplay and visibility: clients "must not initiate an automatic playback until the player is visible" (more than half visible). Only one autoplaying player per page. A thumbnail that starts playback must be at least 120×70 px. — [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)
- Interaction: "You must not use mouseovers or touch events on a YouTube player to initiate any action on the user's behalf." — [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)
- Modifications: "You must not make changes to the YouTube player that are not explicitly described by the API documentation." — [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)
- Players: no "modify, build upon, or block any portion or functionality of a YouTube player" (§III.I.6). No separating or isolating audio/video (§III.I.7). No promoting audio or video separately (§III.I.8). No "features that play content, including audio or video components, from a background player" (§III.I.9). No "remove, obscure, alter, or disable any links that appear in YouTube players" (§III.I.4). No interfering with or obscuring YouTube attribution (§III.F.2.c). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Ads: no altering or blocking YouTube ads (§III.I.5). Ads on or in the player need prior written approval (§III.G.1.c). Selling ads on a page with YouTube API Data is allowed only where the page "offers enough independent value to justify such sales if the YouTube API Data were removed" (§III.G.1.d). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Gating and incentives: clients "must not charge users to watch content in an embedded YouTube player" (§III.F.3.a), must not require subscribing or liking to keep watching (§III.F.3.b), and "must not offer or provide incentives, rewards, or other compensation to users for engaging with YouTube Applications" (§III.F.3.c). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Storage: for authorized data, "After 30 calendar days, the API Client must either delete or refresh the stored data" (§III.E.4.c). Stored data must be kept "consistent with the current data" (§III.E.4.e). Data must be deleted on user request "within 7 calendar days" (§III.E.4.g). Non-authorized statistics may not be stored for more than 30 days (§III.E.4.b). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Derived data: clients must not "access or use API Data to create new or derived data or metrics" (§III.E.4.h). Non-YouTube metrics shown alongside API Data need "a clear and prominent disclosure." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Privacy and embeds: clients should "limit the data shared with YouTube before a user interacts with the YouTube embedded player," for example by not autoplaying (§III.E.4.i). For Made-for-Kids videos, "API Clients must turn off tracking" (§III.E.4.j). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Children: child-directed clients must comply with "COPPA, GDPR, and any other applicable laws," must not use personalized ads or remarketing, and must not perform write actions (§III.J). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Education example: §III.C.6 cites "an API Client that is specifically designed to teach users to speak French" as an example of a permitted, focused feature set. — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Look and feel: clients "must not change or interfere with user interfaces in YouTube Applications" (§III.F.1). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- `modestbranding` has been deprecated since August 15, 2023. `rel=0` only limits related videos to the same channel, and `showinfo` is gone. Branding and related videos cannot be fully hidden. — [Player parameters: revision history](https://developers.google.com/youtube/player_parameters)

### Inferences
- A layout with the player in its own unobstructed box (≥480×270 on desktop, ≥200×200 on mobile) and the lyrics/gap-fill panel below or beside it in the PWA's own DOM appears compliant. Lyrics must never sit over the video, for example as karaoke text on the frame, and the game must not cover the controls.
- Pausing and resuming via the documented `pauseVideo`/`playVideo`/`seekTo`, for example "pause at a gap until the user answers", is use of documented API functions, not modification. Covering the player or muting it to separate the audio would be a problem.
- PWA background audio (screen off, app backgrounded) would breach §III.I.9 and the PWA must not encourage it.
- Gamification: points and streaks for learning (correct gaps) should be fine. Rewards explicitly for watching, liking or subscribing on YouTube would breach §III.F.3.c. Wording and mechanics should reward answers, not views.
- Stored video IDs, titles or thumbnails from `search.list`/`videos.list` are API Data subject to 30-day refresh. Lyrics licensed from LyricFind/Musixmatch are not YouTube API Data, so YouTube's 30-day rule does not cover them, though the lyrics licence's own caching terms will apply. If the app ever stored YouTube caption text, the 30-day rule and the "derived data" clause would bite.
- If the free app later runs ads, §III.G.1.d means the lyrics game must provide independent value, which it plausibly does.
- If the app may be used by under-13s, which is likely in a Brazilian school context, the §III.J and Made-for-Kids tracking rules apply, plus LGPD in Brazil (inference; LGPD not researched here).

### Gaps
- No official guidance was found that explicitly addresses showing third-party synced text next to an embed. The rules are silent on adjacent content, and the RMF page "does not address adjacent content."
- No YouTube policy specific to educational or gamified apps was found beyond the §III.C.6 example and the incentive clause.

---

## 7. How existing tools handle it (Language Reactor, LyricsTraining, Fill the Song, Sounter, karaoke sites), and any takedowns or revocations

### Takeaway
LyricsTraining, the closest analogue, states that its operator Elasthink holds licences from major music publishers to display lyrics. Its videos appear to be YouTube-hosted (thumbnails from img.youtube.com). In short, lyrics are licensed separately and video comes from YouTube embeds, the compliant pattern. Language Reactor is a browser extension working on youtube.com itself. It favours videos with human subtitles, but this session could not confirm its exact mechanism. No takedowns of language-learning lyric tools were found. YouTube's documented enforcement targets music bots and alternative clients: Groovy and Rythm (2021), Invidious, Grayjay.

### Cited Findings
- LyricsTraining Terms (last updated May 14, 2025): Elasthink holds licences from major music publishers to display lyrics on the platform (paraphrase; publishers are named in the original). "However, these licenses do not allow Users to use this content outside the service." Rights holders can request removal by email, with review "within a maximum of 30 business days." Users may "modify (including synchronization with other content)" User Content, and "must be authorized to share the User Content." The terms do not mention YouTube or its API. — [LyricsTraining Terms](https://lyricstraining.com/terms)
- LyricsTraining homepage: "This site is only for personal use and for educational purposes". Thumbnails load from `img.youtube.com`. No lyrics provider attribution is shown. — [LyricsTraining](https://lyricstraining.com/)
- Language Reactor's main use on YouTube is described as helping users find videos with human-made subtitles, plus pop-up dictionary, dual subtitles, auto-pause and vocabulary export. — [Refold blog](https://www.refold.la/blog/language-reactor-for-language-learning-with-youtube); [JALT Publications article](https://jalt-publications.org/articles/28605-enhancing-functionality-youtube-and-netflix-language-reactor)
- Groovy (Discord music bot, reportedly on more than 16 million servers) got a cease-and-desist from YouTube and shut down on Aug 30, 2021. Rythm got a similar letter and shut down in mid-September 2021, with sources disagreeing between Sept 13 and Sept 15. Google cited ToS violations "including modifying the service and using it for commercial purposes." — [Tubefilter, 2021-09-13](https://tubefilter.com/2021/09/13/youtube-groovy-bot-rythm-discord-letters/); [9to5Google, 2021-09-13](https://9to5google.com/2021/09/13/youtube-nukes-popular-groovy-bot-discord-music-service-for-breaking-platforms-tos/); [PC Gamer](https://pcgamer.com/google-has-killed-discords-best-music-bot); [Gigazine, 2021-08-27](https://gigazine.net/gsc_news/en/20210827-discord-music-bot-groovy-shutdown)
- YouTube's legal team asked the Invidious developers to take the service down within 7 days on API-terms grounds, and sent FUTO a similar demand over Grayjay. FUTO disputes this, arguing it never agreed to the API ToS. — [Vivaldi forum on Invidious](https://forum.vivaldi.net/topic/87936/youtube-legal-team-asked-invidious-developers-to-take-down-the-service-within-7-days); [FUTO Grayjay response (PDF)](https://www.futo.org/legal/Grayjay-Response.pdf)
- Subtitles from 173,536 YouTube videos across more than 48,000 channels were found in an AI training dataset (Proof News, July 2024), which shows scraped captions are a live controversy. — via search summary of [ppc.land](https://ppc.land/youtube-data-api/) (secondary)

### Inferences
- The LyricsTraining model is the clear precedent for this PWA: separately licensed lyrics, its own sync data (theirs is user- or editor-produced), and YouTube embeds for playback. It has run for years without reported YouTube enforcement.
- Language Reactor sits in a different category: an extension that augments youtube.com in the user's own browser. Its compliance stance does not transfer to a standalone PWA built on the IFrame API, which binds the developer to the API ToS.
- YouTube enforcement has targeted tools that re-serve or separate audio and video (music bots) or replace the client. A lyrics app that only embeds the official player and fetches nothing else from YouTube is in the lowest-risk category.

### Gaps
- Fill the Song and Sounter were not researched in this session, for lack of tool budget. Their lyrics sources and YouTube usage are unknown.
- Karaoke sites (for example ones built on YouTube lyric videos) were not examined.
- Language Reactor's exact subtitle source (YouTube's own tracks read client-side versus its own ASR) was not confirmed. Its help page returned no usable content.
- No case was found of YouTube revoking API access from a language-learning or lyrics app.

---

## 8. Official or partner programs that could allow lyrics or captions use

### Takeaway
No YouTube program was found that grants third-party developers access to other channels' caption text or to YouTube Music lyrics. The only official mechanisms are content-owner authority (edit permission or CMS `onBehalfOfContentOwner` with the `youtubepartner` scope) and quota extensions via audit, which are limited to the approved use case. The realistic route to lyrics is licensing from lyrics aggregators (LyricFind, Musixmatch) or directly from publishers, as LyricsTraining does, not through YouTube.

### Cited Findings
- `captions.list`/`download` accept the `youtubepartner` scope, and `onBehalfOfContentOwner` is limited to YouTube content partners acting for a content owner. — [captions.list](https://developers.google.com/youtube/v3/docs/captions/list); [captions.download](https://developers.google.com/youtube/v3/docs/captions/download)
- Quota extensions require an API Compliance Audit, with use "only for the approved use case" (§III.D.3). Inactive projects (90 days) may be curtailed (§III.D.4). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Downloading or caching audiovisual content is allowed only with "YouTube's prior written approval" (§III.E.1.a). Changing YouTube UIs also requires prior written approval (§III.F.1). — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- §III.L, "derived metrics and storage" allowances, applies only to "audited developers with analytics use cases" starting June 1, 2026, which is not relevant to lyrics. — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- LyricFind licenses lyrics from "over 55,000 lyric catalogues" including Sony, Universal and Warner publishing, and partners with Google/YouTube. — [RouteNote](https://routenote.com/blog/lyricfind-creates-free-auto-lyric-video-maker-tool/) (via search summary)
- LyricsTraining's operator relies on publisher licences for lyrics display. — [LyricsTraining Terms](https://lyricstraining.com/terms)

### Inferences
- A "prior written approval" from YouTube to reuse caption text is theoretically possible, but no public application process exists. Approval for a small free PWA is unrealistic (inference).
- For user-picked songs, the compliant architecture is: (1) the YouTube IFrame player for video, timed via `getCurrentTime`; (2) lyrics from a licensed lyrics API, or from publisher-licensed or public-domain content, or user-contributed lyrics under a takedown process like LyricsTraining's; (3) the app's own alignment data, produced by editors, users, or forced alignment on licensed audio rather than the YouTube stream, linked by video ID; (4) no YouTube caption text stored or displayed.

### Gaps
- "YouTube for Education" programs and the 2025–2026 education features were not researched in depth. Nothing found suggests they give developers caption or lyrics access.
- Not verified whether any YouTube–label partnership (for example official lyric video programs) offers lyrics data to third parties.
