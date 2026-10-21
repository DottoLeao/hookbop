# AI for transcribing, time-aligning, correcting, translating and gap-filling song lyrics (state of the art as of Oct 2026)

Context: a free PWA where Brazilians learn English with music. The user picks any YouTube song, and the lyrics appear next to the embedded player for gap-fill games. Research date: 2026-10-21. Every finding below is dated. Results from before 2025 are flagged **[older]**. The notes keep three kinds of claims apart: "Cited Findings" (verified, with URL), "Inferences" (my reasoning) and "Gaps" (could not verify).

---

## Constraint: YouTube audio access, and approaches that do not need YouTube audio

### Takeaway
The YouTube API Services Developer Policies forbid downloading, caching or storing YouTube audiovisual content, and they also forbid separating or isolating its audio. So a pipeline that pulls a YouTube video's audio onto a server for ASR, alignment or vocal separation conflicts with those policies. A compliant design has to get timing from a source other than the YouTube stream. The options are text-only synced-lyrics sources, officially licensed audio, audio the user legally supplies, or human/community tap-to-sync over the embedded player.

### Cited Findings
- Section III.E.1.a: API clients must not "download, import, backup, cache, or store copies of YouTube audiovisual content without YouTube's prior written approval". Section III.E.1.b: must not "make content available for offline playback". — [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Section III.I.7: must not "separate, isolate, or modify the audio or video components of any YouTube audiovisual content". Section III.I.8: must not "promote separately the audio or video components". — [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Section III.I.6: must not "modify, build upon, or block any portion or functionality of a YouTube player". Section III.E.6: must not "scrape YouTube Applications". Section III.I.14: must not "use any technology other than YouTube API Services to access or retrieve API Data". — [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- LRCLIB is a free lyrics database that needs no API key. It stores plain lyrics and time-synced LRC lyrics indexed by title, artist, album and duration, holds "nearly 3,000,000" (not deduplicated) entries, and takes community contributions through a proof-of-work publish API. Its server code is MIT. The lyrics themselves stay copyrighted by their authors and publishers. — [AlternativeTo: LRCLIB](https://alternativeto.net/software/lrclib/about); [lrclib docs index](https://docsearch.algolia.com/mcp/docs/repo/tranxuanthang/lrclib); [lrcup on PyPI](https://pypi.org/project/lrcup)
- AudioShake's lyrics API has an alignment-only mode: "Use the `alignment` model and provide your existing transcript". It processes audio the operator supplies, not YouTube audio. — [AudioShake developer docs](https://developer.audioshake.ai/lyrics/overview)
- ElevenLabs Forced Alignment API takes audio plus a plain-text transcript. — [ElevenLabs Forced Alignment docs](https://elevenlabs.io/docs/overview/capabilities/forced-alignment)

### Inferences
- These three approaches avoid YouTube audio entirely:
  1. **Text-only timing.** Fetch an existing synced LRC from LRCLIB or from a licensed provider, matched by artist, title and duration. Then correct the global offset to the specific YouTube upload, since official videos often have intros or skits that the album track lacks. A one-tap "sync to this line" control or a stored per-video offset would cover this.
  2. **Licensed or user-provided audio.** Run ASR or forced alignment on an officially obtained copy of the track that the operator has rights to process, or on a file the user legally owns and uploads. Then reuse the timings for the YouTube video with an offset.
  3. **Human or community timing.** The user taps at each line start while the embedded player plays. The player's `getCurrentTime()` is read through the official IFrame API, so no audio is processed. Store the result for everyone, as LRCLIB and karaoke tools do.
- The YouTube IFrame player is a cross-origin iframe, so the page cannot route its audio into Web Audio for in-browser ASR. Capturing it by screen or tab capture, or recording it from the microphone, would arguably be "isolating" YouTube audio and is a policy and legal grey zone. On mobile it is also impractical. I did not verify browser behaviour on this point; it is reasoning.
- LLM steps that work on text only (cleaning, translation, explanations, blank selection) do not touch YouTube audio and are unaffected by these clauses. Lyrics copyright still applies to them; see the LLM section.

### Gaps
- I did not research whether YouTube's caption tracks (auto-generated or uploaded) can legally be fetched through the Data API for third-party videos. I recall that `captions.download` requires owner authorization, but I did not verify it.
- No legal review of "user records/uploads their own copy" flows was done. Brazilian and US law should be checked by counsel.

---

## 1. Speech recognition on singing: how accurate are current models, and does vocal separation help?

### Takeaway
Lyrics transcription is still far harder than speech. The best published full-song English word error rates (WER) are roughly 12–20%, so about one word in 6–8 is wrong even for the best systems. Plain Whisper large-v3 scored about 38% on Jam-ALT English in 2024. Modern speech-ASR leaderboards report 2–5% WER, but on speech, not songs, and I found no lyrics-benchmark numbers for the newest 2026 hosted models. Vocal separation fed directly to Whisper gives mixed results and can hurt with mediocre separators. Separation used only to segment the audio for Whisper gives a small, consistent gain.

### Cited Findings
**Jam-ALT (the revised JamendoLyrics benchmark, from AudioShake's research team; arXiv 2408.06370, July 2024) [older]**
- English WER: Whisper v2 43.8, Whisper v3 37.7, Whisper v3 + HTDemucs 43.0, Whisper v2 + HTDemucs 33.3, OWSM v3.1 68.6, LyricWhiz (Whisper + GPT-4) 24.6, AudioShake v3 (in-house, commercial) 17.3.
- All-language WER: Whisper v3 35.5, AudioShake v3 16.1.
- Supplying the language (+lang) helped non-English songs a lot, which implies Whisper's auto-detected language is often wrong.
- Source: [Lyrics Transcription for Humans: A Readability-Aware Benchmark, arXiv 2408.06370](https://arxiv.org/html/2408.06370v1)
- The paper reports that HTDemucs vocal isolation "tends to substantially degrade the results" for Whisper. The exception is v2 on English. Whisper often omits lyrics and outputs "generic or irrelevant text", more so on separated vocals, especially v3. — [arXiv 2408.06370](https://arxiv.org/html/2408.06370v1)
- Conflict of interest: the benchmark comes from AudioShake researchers and AudioShake's own system tops it. AudioShake's blog presents the same results. — [AudioShake blog](https://www.audioshake.ai/post/lyrics-transcription-for-humans-revisiting-audioshakes-transcription-benchmark)

**Syed, Meresman Higgs, Cífka, Sandler, "Exploiting Music Source Separation for ALT with Whisper" (arXiv 2506.15514, June 2025; ICME 2025 per secondary listing)**
- Uses Whisper large-v2 through faster-whisper.
- Long-form Jam-ALT WER: original mix with native segmentation 23.02; original mix with RMS-VAD (separated vocals used only to find segment boundaries) **20.35**, described as "a new open source SOTA"; separated vocals (Demucs mdx_extra) with RMS-VAD 20.72.
- MUSDB-ALT, a new dataset with true vocal stems: mix 25.82, separated 21.90, true vocal stem 17.51 (native) and 14.98 (RMS-VAD).
- So separation helps when it is good. Perfect stems cut WER by about a third, but real separator output on Jam-ALT gave almost no gain.
- Separation artifacts "can trigger hallucinations".
- Whisper deletes non-lexical vocables and backing vocals at high rates "regardless of source separation quality".
- Source: [arXiv 2506.15514](https://arxiv.org/html/2506.15514v1)
- The paper evaluated only Hybrid Demucs mdx and mdx_extra, not HTDemucs, Mel-RoFormer or BS-RoFormer. — [arXiv 2506.15514](https://arxiv.org/html/2506.15514v1)

**Qwen3-ASR Technical Report (Qwen Team, arXiv 2601.21337, Jan 2026)**
- Table 7, WER on full songs with background music, "EntireSongs-en":

  | System | WER (%) |
  |---|---|
  | Gemini-2.5-Pro | **12.18** |
  | Qwen3-ASR-1.7B | 14.60 |
  | GPT-4o-Transcribe | 30.71 |
  | Doubao-ASR-1.0 | 33.51 |
  | Whisper-large-v3 | N/A (marked as unable to handle long-form songs) |

- On singing-only sets, Qwen3-ASR-1.7B scored M4Singer 5.98, MIR-1k-vocal 6.25 and Popcs 8.52, versus Whisper-large-v3 at 13.58, 11.71 and 13.77.
- Open weights, Apache 2.0.
- Caveats: these are the vendor's own numbers, and the EntireSongs-en dataset is not described.
- Source: [Qwen3-ASR Technical Report](https://arxiv.org/html/2601.21337)
- A DEV Community claim of "rap WER below 8%" for Qwen3-ASR-Flash is unsourced, so I treat it as unreliable. — [DEV Community guide](https://dev.to/czmilo/qwen3-asr-complete-evaluation-guide-in-depth-analysis-of-the-latest-speech-recognition-technology-4i12)

**2026 hosted models: speech-only leaderboard, NOT lyrics (Artificial Analysis, accessed Oct 2026)**

| Model | AA-WER |
|---|---|
| MAI-Transcribe-2 (Microsoft) | 2.0% |
| Voxtral Small Transcribe 3 (Mistral) | 2.1% |
| ElevenLabs Scribe v2 | 2.2% |
| MAI-Transcribe-1.5 | 2.4% |
| Gemini 3.5 Transcribe (Google) | 2.6% |
| Gemini 3.1 Pro Preview | 2.8% |
| AssemblyAI Universal-3.5 Pro | 3.0% |
| OpenAI GPT Transcribe | 3.3% |
| Google Chirp 3 | 4.3% |
| Whisper large-v3 (fal.ai) | 4.1% |
| Whisper large-v3 turbo (Groq) | 4.6% |
| Deepgram Nova-3 | 5.2% |
| NVIDIA Parakeet TDT 0.6B v2 | 6.4% |

  Source: [Artificial Analysis STT leaderboard](https://artificialanalysis.ai/speech-to-text)
- OpenAI's current recommended model is `gpt-transcribe`. `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` and `gpt-4o-transcribe-diarize` are deprecated, with shutdown on Feb 26, 2027. — [OpenAI speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- gpt-transcribe launched in late July or early August 2026; sources disagree on the date (Jul 28, Jul 29, Aug 5). — [CometAPI](https://www.cometapi.com/gpt-transcribe-vs-gpt-live-transcribe/); [Spokenly](https://spokenly.app/blog/gpt-transcribe); [OpenRouter](https://openrouter.ai/openai/gpt-transcribe)
- The Decoder reports gpt-transcribe "can't catch ElevenLabs, Google or Mistral on error rates". — [The Decoder](https://the-decoder.com/gpt-transcribe-improves-on-its-predecessor-but-cant-catch-elevenlabs-google-or-mistral-on-error-rates/)
- Other 2026 entrants:
  - xAI Grok Voice Transcribe 2.0, Sept 18, 2026, batch $0.10/audio-hour; secondary source in Italian. — [Unite.ai](https://www.unite.ai/it/xai-releases-grok-voice-transcribe-2-0-speech-to-text-model/)
  - Microsoft MAI-Transcribe-2, public preview at $0.10/h through Dec 31, 2026. — [BuildFastWithAI](https://www.buildfastwithai.com/blogs/mai-transcribe-2-review)

**Separators**
- Demucs (MIT) is "the officially maintained Demucs", but the maintainer is "not actively working on Demucs anymore". The README mentions a v4.1.0 release dated "11/07/2026", most likely 11 July 2026. — [Demucs GitHub](https://github.com/adefossez/demucs)
- Mel-Band RoFormer improved vocal separation by about 0.43–0.58 dB over BS-RoFormer [older, 2023]. — [Mel-Band RoFormer paper](https://arxiv.org/pdf/2310.01809)
- Mel-RoFormer reports state-of-the-art vocal separation at ISMIR 2024 [older]. — [Mel-RoFormer for Vocal Separation](https://arxiv.org/html/2409.04702v1)
- MVSEP reports a newer BS-RoFormer vocal model at SDR 11.89 on its Multisong set. — [MVSEP news](https://mvsep.com/news/64)

**Unreliable source flagged**
- lyrics-bench.onrender.com presents a June 2026 "benchmark" that a search summary described as written by "Claude (Anthropic)". It claims about 22.1% WER for Demucs → Whisper large-v3 and about 15.9% after LLM reconciliation, on a 12-song subset. It is not peer-reviewed or independently reproduced, so do not rely on it. — [lyrics-bench research brief](https://lyrics-bench.onrender.com/papers/research_brief.html)

### Inferences
- A 12–20% WER means 6–10 wrong words in a typical 50-word chorus. That is unacceptable as the answer key of a gap-fill game, where a wrong "correct answer" destroys trust. Transcription from scratch should only be a fallback, or a timing scaffold matched against a known lyrics text.
- The 2–5% speech WERs of 2026 models (Scribe v2, Gemini 3.5 Transcribe, MAI-Transcribe-2, gpt-transcribe) should not be assumed to carry over to songs. The Qwen table shows gpt-4o-transcribe at about 31% on songs, versus a few percent on speech.
- If the operator does run separation, a modern RoFormer separator (for example through the UVR / python-audio-separator ecosystem) is likely better than the 2025 paper's mdx_extra, and so closer to the "true stem" gains. This is unverified for ASR.

### Gaps
- I found no published lyrics-benchmark WER (Jam-ALT, MUSDB-ALT or DALI) for gpt-transcribe, ElevenLabs Scribe v1/v2, Gemini 3.x or 3.5 Transcribe, Chirp 3, Deepgram Nova-3, AssemblyAI Universal-3.5, Voxtral 3, MAI-Transcribe or Meta models.
- No DALI-based 2025–26 results were found.
- No independent replication of Qwen3-ASR's song numbers was found.
- No direct test of Mel-RoFormer or BS-RoFormer vocals feeding Whisper was found.
- No rap-specific WER from a credible source was found.

---

## 2. Forced alignment of KNOWN lyrics to audio, and from-scratch transcription vs align-known-text

### Takeaway
Aligning a known, correct lyrics text to the audio is clearly the more reliable route for a learning app. The words are correct by construction, and lyrics-specific aligners reach a mean absolute word-timing error of about 0.2 s, with a median of about 0.04 s, on JamendoLyrics. General speech aligners have strong speech numbers: Qwen3-ForcedAligner beats WhisperX and the NeMo Forced Aligner by roughly 3x on speech. None of WhisperX, stable-ts, ctc-forced-aligner, NeMo, MFA, Qwen3-ForcedAligner or ElevenLabs Forced Alignment has published sung-vocal benchmarks I could find. Hosted alignment exists at ElevenLabs (priced as STT) and AudioShake (an alignment-only mode).

### Cited Findings
- **Lyrics-specific aligners on JamendoLyrics:**
  - Contrastive multilingual aligner, the first system to reach mean absolute error below 0.2 s [older, 2023]. — [arXiv 2306.07744](https://arxiv.org/html/2306.07744v1)
  - DAFx 2025 (Cheng, Nakano, Goto; frame-wise phoneme labels with masked cross-entropy): MAE 0.216 s, MedAE 0.041 s. — [DAFx 2025 paper](https://staff.aist.go.jp/m.goto/PAPER/DAFX2025cheng.pdf)
  - A 2021 table lists mean absolute error of 0.22–0.82 s across systems [older]. — [arXiv 2102.09202](https://arxiv.org/pdf/2102.09202)
- **Qwen3-ForcedAligner-0.6B (Jan 2026, Apache 2.0):**
  - Covers 11 languages including English and Portuguese.
  - Max 300 s of audio. A third-party guide says the reliable range is about 270 s at 80 ms resolution. — [Qwen3-ASR Tech Report](https://arxiv.org/html/2601.21337); [soniqo.audio guide](https://soniqo.audio/ja/guides/align)
  - Accumulated average shift (AAS) on speech, MFA-labelled raw: 42.9 ms, versus WhisperX 133.2 and NFA 129.8.
  - On 300 s concatenated audio: 52.9 ms, versus WhisperX 2708.4 and NFA 246.7.
  - Human-labelled: 32.4 ms, versus NFA 101.2.
  - These are speech results, not singing. — [Qwen3-ASR Tech Report](https://arxiv.org/html/2601.21337)
- **WhisperX:**
  - Combines voice activity detection (VAD), Whisper and wav2vec2 phoneme forced alignment for word timestamps, with a 12x batched speedup. Evaluated only on speech [older, 2023]. — [WhisperX paper](https://arxiv.org/html/2303.00747v2)
  - On long concatenated audio it drifts badly: AAS 2708 ms in Qwen's test. — [Qwen3-ASR Tech Report](https://arxiv.org/html/2601.21337)
- **stable-ts:** provides `align()` to fit known plain text to audio at word level, with silence-based adjustment. — [stable-ts on PyPI](https://pypi.org/project/stable-ts/2.11.3)
  - A Replicate wrapper built on stable-ts alignment warns that a little background noise can throw it off, and that its MMS-based mode suits only very clean audio. — [Replicate force-align-wordstamps](https://replicate.com/cureau/force-align-wordstamps)
- **ctc-forced-aligner:**
  - Code BSD-2. The default model `mms-300m-1130-forced-aligner` is **CC-BY-NC 4.0 (non-commercial)**; the README recommends another model for commercial use.
  - Claims 1,100+ languages and at least 5x less memory than TorchAudio alignment.
  - `<star>` tokens absorb unmatched audio.
  - About 571 stars.
  - Source: [ctc-forced-aligner GitHub](https://github.com/MahmoudAshraf97/ctc-forced-aligner)
- **ElevenLabs Forced Alignment API:**
  - Input is audio plus plain text, up to 3 GB, 10 h of audio and 675k characters.
  - Billed at the "same rate as the Speech to Text API".
  - The docs do not mention music or lyrics.
  - Source: [ElevenLabs docs](https://elevenlabs.io/docs/overview/capabilities/forced-alignment)
  - The fal.ai reseller charges $0.22 per audio hour, rounded up to the hour. — [fal.ai listing](https://fal.ai/models/fal-ai/elevenlabs/forced-alignment/llms.txt)
- **AudioShake:**
  - Lyric transcription and alignment, up to 45 min input, with an alignment-only mode for your own transcript. — [AudioShake developer docs](https://developer.audioshake.ai/lyrics/overview); [AudioShake LyricSync announcement](https://www.audioshake.ai/post/introducing-lyricsync-for-lyric-transcription-alignment)
  - AWS Marketplace lists Lyric Transcription at $1/processed min and Alignment at $0.10/processed min. — [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-ftko37es5f4vw)
- **Hybrid approach (ASR words matched to known lyrics):**
  - syncalong aligns plain-text lyrics to audio and exports LRC. It runs Whisper, then a dynamic-programming sequence aligner maps the recognized words onto the given lyrics. — [syncalong docs](https://syncalong.readthedocs.io/)
  - nomadkaraoke's lyrics-transcriber does the same with Genius and Spotify lyrics. — [lyrics-transcriber on PyPI](https://pypi.org/project/lyrics-transcriber)
- **Gemini timestamps are unreliable:**
  - Forum reports of progressive timestamp drift with Gemini 3 Flash (about -157 s at the end of an 11:49 file) and Gemini 3.1 Pro (-16 s). A user reports Gemini 3 timestamps for song subtitles as "nonsensical". — [Google AI forum: drift bug](https://discuss.ai.google.dev/t/bug-gemini-3-flash-and-3-1-pro-progressive-timestamp-drift-in-audio-transcription/129501); [Google AI forum: Gemini 3 audio timing](https://discuss.ai.google.dev/t/it-seems-gemini-3-has-lost-its-audio-data-interpretation-capabilities-especially-regarding-time/110751)
  - Brown University's docs say a multimodal LLM "generally cannot produce very accurate timestamps". — [Brown CCV docs](https://docs.ccv.brown.edu/ai-tools/services/transcribe/getting-better-transcriptions)
  - Gemini 3.5 Transcribe (dedicated STT, docs updated Sept 2026) offers word-level timestamps on the file endpoint. They "can degrade transcription accuracy" and are incompatible with custom vocabulary. The Cloud docs mark them Experimental. Max 30 min with timestamps. Supports pt-BR and en-US. No mention of music. — [Gemini 3.5 Transcribe docs](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe); [Google Cloud docs](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-transcribe?authuser=1)
- **OpenAI:** `timestamp_granularities` (word/segment) is documented only for `whisper-1`, which is deprecated with shutdown Feb 26, 2027. The page does not document word timestamps for `gpt-transcribe`. — [OpenAI STT guide](https://developers.openai.com/api/docs/guides/speech-to-text)

### Inferences
- **Recommended reliability ranking for this app:**
  1. A licensed or community synced LRC, with an offset fix.
  2. Known lyrics plus forced alignment on legally obtained audio. Try Qwen3-ForcedAligner (Apache 2.0, supports English) or ElevenLabs/AudioShake hosted alignment. Optionally run on separated vocals.
  3. ASR word timings matched to known lyrics with a DP or Needleman-Wunsch alignment, the syncalong/karaoke approach. This is robust when the acoustic aligner fails on singing, because only some words need to be recognized.
  4. Pure transcription, with no answer key you can trust.
- Line-level timing, which is enough for a highlighted current line and gap-fill prompts, tolerates errors of a few hundred ms. Lyrics aligners at about 0.2 s mean error are good enough. Word-level karaoke needs better.
- Forced aligners trained on speech, such as wav2vec2 in WhisperX and MMS, can be expected to degrade on sustained vowels, melisma and loud accompaniment. Aligning on separated vocals is likely to help alignment more than it helps ASR, since the text is fixed. Not verified on a benchmark.
- Songs longer than about 4.5 min exceed Qwen3-ForcedAligner's reliable window and must be chunked, for example at VAD or silence boundaries.

### Gaps
- No benchmark found of WhisperX, stable-ts, ctc-forced-aligner, NFA, MFA, Qwen3-ForcedAligner or ElevenLabs FA on sung audio (JamendoLyrics/DALI alignment metrics).
- No head-to-head WhisperX vs stable-ts on lyrics.
- No confirmed output schema or confidence score for ElevenLabs Forced Alignment; the fetched page did not show it.
- ElevenLabs' direct per-minute rate was not confirmed on its own pricing page.
- AudioShake's direct (non-AWS) price was not retrieved.
- Montreal Forced Aligner and NeMo on singing were not researched in depth.

---

## 3. Open-source end-to-end repos that generate synced LRC (and translations)

### Takeaway
OpenLRC (MIT) is the best-known "audio → Whisper → LLM translation → .lrc" tool, but it is speech/subtitle-oriented. It has no vocal separation or lyrics-specific logic, and its recommended LLMs are 2024-era. The karaoke tools (nomadkaraoke lyrics-transcriber / karaoke-gen, syncalong) are closer to this app's needs because they correct or align against known lyrics, and karaoke-gen adds human review.

### Cited Findings
- **OpenLRC (zh-plus/openlrc):**
  - "Transcribe and translate voice into LRC file using Whisper and LLMs (GPT, Claude, et al)".
  - Pipeline: faster-whisper, loudness normalization, optional noise suppression and configurable VAD, then LLM translation and polishing via OpenAI, Anthropic, Google, OpenRouter or LiteLLM.
  - MIT license. About 682 stars, 475 commits, no tagged releases.
  - Vocal/music separation is listed as an unimplemented Todo, and song examples are also a Todo.
  - Recommended models still name gpt-4o-mini, gemini-1.5-flash and claude-3-5-sonnet-20240620.
  - Needs CUDA, cuDNN and cuBLAS for GPU.
  - Source: [OpenLRC GitHub](https://github.com/zh-plus/openlrc)
- **lyrics-transcriber (nomadkaraoke, PyPI):**
  - Creates synchronized ASS and MidiCo LRC files with word-level timestamps using Whisper.
  - Optional correction against Genius and Spotify lyrics, optional OpenAI LLM correction, and optional paid AudioShake transcription ("much higher quality").
  - Source: [lyrics-transcriber on PyPI](https://pypi.org/project/lyrics-transcriber)
- **karaoke-gen (nomadkaraoke):** word-level timestamps via the AudioShake API; matches the transcription against Genius, Spotify and Musixmatch lyrics; human review step before rendering. — [karaoke-gen GitHub](https://github.com/nomadkaraoke/karaoke-gen)
- **syncalong:** forced alignment of plain-text lyrics to an audio file, exported as LRC, via Whisper and a DP sequence aligner. — [syncalong docs](https://syncalong.readthedocs.io/)
- **Supporting libraries:**
  - faster-whisper: MIT, `word_timestamps=True`, Silero VAD (`vad_filter`). — [faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper)
  - ctc-forced-aligner: BSD-2 code, non-commercial default model. — [ctc-forced-aligner](https://github.com/MahmoudAshraf97/ctc-forced-aligner)
  - Demucs: MIT, maintainer inactive. — [Demucs](https://github.com/adefossez/demucs)
- **Commercial/no-code lyric-sync tools** (paste lyrics, then AI timing, then manual refine): Youka, VideoBolt, LyricTime (exports LRC/SRT/VTT), MyKaraoke Video (needs a vocal-isolated file). — [Youka docs](https://docs.youka.io/en/web/provide-lyrics); [VideoBolt](https://support.videobolt.net/how-to-sync-lyrics-with-ai)

### Inferences
- For a production pipeline, the sensible build is a thin custom service that:
  1. Expands the known lyrics (repeats, sections).
  2. Optionally separates vocals with a RoFormer/Demucs model.
  3. Aligns the text with Qwen3-ForcedAligner or a hosted API, falling back to ASR plus DP matching.
  4. Emits LRC or enhanced word-level LRC.
  5. Runs an LLM text pass.
- This is better than adopting OpenLRC wholesale. OpenLRC's translation-prompt infrastructure (context-aware, "lean" token mode) is a useful reference.

### Gaps
- Licenses and maintenance dates for lyrics-transcriber, karaoke-gen and syncalong were not confirmed.
- No recent commit date for OpenLRC or ctc-forced-aligner appeared on the fetched pages.
- No quality evaluation of any end-to-end repo on songs was found.

---

## 4. Cost and latency per 3–4 minute song: hosted APIs, self-hosted, and in-browser

### Takeaway
Hosted ASR or alignment costs roughly $0.003–$0.02 per 4-minute song and takes about 1–5 s of processing, plus upload. AudioShake's lyrics-specialized service is far pricier on AWS, at about $4 per song to transcribe and $0.40 to align. Self-hosting faster-whisper on a consumer GPU handles a 4-min song in about 5–20 s. CPU vocal separation with Demucs takes about 1.5x the song length, which is too slow for interactive use. In-browser Whisper via Transformers.js and WebGPU is now technically possible on iPhone (Safari 26) and on desktop Chromium. No phone benchmarks exist, and the small models that fit are much less accurate on singing. The browser also cannot get at the YouTube player's audio.

### Cited Findings
- **Hosted prices and speed factors** (Artificial Analysis, Oct 2026; speed factor = seconds of audio per second of processing):

  | Model | Price per 1,000 min | Speed factor |
  |---|---|---|
  | OpenAI GPT Transcribe | $4.50 | 56.1 |
  | ElevenLabs Scribe v2 | $3.67 | 63.4 |
  | Whisper large-v3 turbo (Groq) | $0.67 | 200.8 |
  | Whisper large-v3 (fal.ai) | $1.15 | 95.5 |
  | Gemini 3.5 Transcribe | $5.00 | 89.5 |
  | Chirp 3 | $16.00 | 28.4 |
  | Deepgram Nova-3 | $4.30 | 586.6 |
  | AssemblyAI Universal-3.5 Pro | $3.50 | 105.5 |
  | Voxtral Mini Transcribe 3 | $3.50 | 72.4 |
  | MAI-Transcribe-2 | $1.67 | 311.9 |

  Source: [Artificial Analysis](https://artificialanalysis.ai/speech-to-text)
- gpt-transcribe costs $0.0045/min, versus $0.006 for gpt-4o-transcribe. — [The Decoder](https://the-decoder.com/gpt-transcribe-improves-on-its-predecessor-but-cant-catch-elevenlabs-google-or-mistral-on-error-rates/)
- OpenAI file limit: 25 MB. — [OpenAI STT guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- **Gemini as a general multimodal model:** audio = 25 tokens per second. Paid audio input per 1M tokens: Gemini 3 Flash Preview $1.00, Gemini 3.1 Flash-Lite $0.50, Gemini 2.5 Flash $1.00, Gemini 2.5 Flash-Lite $0.30. Free tiers exist for the Flash models. — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- **AudioShake (AWS Marketplace):** transcription $1/min, alignment $0.10/min. — [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-ftko37es5f4vw)
- **ElevenLabs Forced Alignment:** same rate as STT. — [ElevenLabs](https://elevenlabs.io/docs/overview/capabilities/forced-alignment)
- **faster-whisper, self-hosted:**
  - 13 min of audio, large-v2, RTX 3070 Ti 8 GB: 1m03s fp16 (4.5 GB VRAM); 17 s with batch_size=8 (6.1 GB); 16 s int8 batched.
  - CPU (i7-12700K, 8 threads), "small" model: 51 s to 2m37s depending on settings.
  - Source: [faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper)
- **Qwen3-ASR self-hosted throughput:**
  - Qwen3-ASR-0.6B RTF 0.064 at concurrency 128; TTFT 92 ms at concurrency 1.
  - The aligner's RTF is reported as "close to 0.001" in the text but 0.197 in Table 2; the report contradicts itself.
  - Source: [Qwen3-ASR Tech Report](https://arxiv.org/html/2601.21337)
- **Demucs:** CPU separation takes about 1.5x the track duration. GPU needs at least 3 GB (about 7 GB at defaults). htdemucs_ft is about 4x slower. — [Demucs GitHub](https://github.com/adefossez/demucs)
- **Browser:**
  - Transformers.js v3 added WebGPU via ONNX Runtime Web (`device: 'webgpu'`). — [HF blog: Transformers.js v3](https://www.huggingface.co/blog/transformersjs-v3)
  - Safari 26 ships WebGPU on iOS and iPadOS, per the WWDC25 announcement and secondary reports. — [Privacy Guides repost of WebKit post](https://discuss.privacyguides.net/t/news-from-wwdc25-webkit-in-safari-26-beta/28226); [AppDeveloperMagazine](https://appdevelopermagazine.com/webgpu-in-ios-26/)
  - No phone benchmarks were found. An unverified third-party table gives WebGPU RTF of 10–15x for Whisper tiny, 5–8x for base and 2–4x for small, on an unspecified device. — [offlinetts.com](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
  - The whisper-base browser demo downloads about 200 MB, cached after the first visit. — [LogRocket](https://blog.logrocket.com/voice-ai-agent-browser/)
  - A third-party repack of large-v3-turbo in f16 for WebGPU exists, but not for Transformers.js. — [HF model](https://huggingface.co/benderrodriguez/whisper-large-v3-turbo-webgpu)

### Inferences (calculations from the cited prices; 4-min song = 240 s)
- **ASR per song:**

  | Service | Cost per song | Approx. processing time |
  |---|---|---|
  | Groq Whisper turbo | about $0.0027 | about 1.2 s |
  | MAI-Transcribe-2 | about $0.0067 | about 0.8 s |
  | AssemblyAI Universal-3.5 Pro | about $0.014 | about 2.3 s |
  | ElevenLabs Scribe v2 | about $0.015 | about 3.8 s |
  | Deepgram Nova-3 | about $0.017 | about 0.4 s |
  | gpt-transcribe | about $0.018 | about 4.3 s |
  | Gemini 3.5 Transcribe | about $0.020 | about 2.7 s |

- **Gemini general model as ASR:** 6,000 audio tokens is about $0.002–0.006 input, plus about $0.002 output. But its timestamps are unreliable (section 2).
- **Hosted forced alignment:** ElevenLabs at about $0.015/song if the Scribe rate applies. Via fal.ai, hour-rounding makes each call $0.22. AudioShake on AWS: about $0.40/song to align, $4/song to transcribe.
- **Self-hosted:** batched faster-whisper large on a mid-range GPU is about 5 s per song (17 s / 13 min × 4 min), unbatched about 20 s. Add separation (GPU, seconds; CPU, about 6 min) and alignment.
- **Overall:** within seconds to a minute and at low cost is achievable for the alignment pipeline when the audio is legitimately available and the lyrics text is known. Results should be computed once per song and cached for all users, so cost per user is near zero.
- **In-browser on phones:** the models that fit (tiny, base, small, roughly 40–250 MB) are much weaker than large-v3, which itself scored about 38% WER on lyrics. So in-browser transcription is not viable for an answer key. In-browser alignment of known text with a small CTC model is conceivable for user-provided audio but unproven. It would also mean a large model download on mobile data, a real cost for Brazilian users.

### Gaps
- No measured Transformers.js Whisper speed or accuracy on any phone.
- No GPU timing for Demucs or RoFormer separation per song from a primary source.
- No current direct price pages for ElevenLabs, Deepgram or AssemblyAI; the Artificial Analysis figures were used.
- Artificial Analysis speeds exclude upload and queueing and are measured on speech.

---

## 5. Hallucination and coherence problems specific to lyrics, and mitigations

### Takeaway
Whisper-family models on songs omit lines, delete backing vocals and vocables ("oh", "yeah"), sometimes emit generic or irrelevant text (worse on separated vocals), and hallucinate during instrumental passages. Effective mitigations:
- VAD or separation-based segmentation to cut hallucinations.
- LLM post-correction: LyricWhiz cut English WER from 37.7 to 24.6 on Jam-ALT.
- Aligning to, or correcting against, a known lyrics text.
- Human or community review.

### Cited Findings
- Whisper "often omits parts of the lyrics" and produces "generic or irrelevant text", more often with separated vocals and in v3. Line-break detection is decent, but section breaks are poor [older, 2024]. — [arXiv 2408.06370](https://arxiv.org/html/2408.06370v1)
- Long-form hallucination rate (IR10) on the Jam-ALT mix dropped from 1.31 to 0.35 when separated vocals were used only for VAD segmentation. Separation artifacts "can trigger hallucinations". Whisper deletes non-lexical vocables and backing vocals "regardless of source separation quality" (2025). — [arXiv 2506.15514](https://arxiv.org/html/2506.15514v1)
- On speech, about 1% of Whisper transcriptions contained entirely hallucinated phrases or sentences (Fall 2023 test) [older]. — [Careless Whisper, arXiv 2402.08021](https://arxiv.org/html/2402.08021v1)
- LyricWhiz (ISMIR 2023) [older] uses Whisper as the "ear" and GPT-4 to select and correct candidates. It is training-free. On Jam-ALT English it scored 24.6 vs Whisper v3 at 37.7 (2024 eval), and 23.70 on long-form per Syed 2025. — [LyricWhiz ISMIR 2023](https://archives.ismir.net/ismir2023/paper/000040.pdf); [arXiv 2408.06370](https://arxiv.org/html/2408.06370v1); [arXiv 2506.15514](https://arxiv.org/html/2506.15514v1)
- Gemini's multimodal timestamps drift progressively over long audio. Mitigation: chunk with VAD and transcribe segments separately. — [pyvideotrans Gemini notes](https://pyvideotrans.com/gemini); [Google AI forum](https://discuss.ai.google.dev/t/bug-gemini-3-flash-and-3-1-pro-progressive-timestamp-drift-in-audio-transcription/129501)
- Karaoke tools correct ASR against reference lyrics (Genius, Spotify, Musixmatch) and include human review. — [karaoke-gen](https://github.com/nomadkaraoke/karaoke-gen); [lyrics-transcriber](https://pypi.org/project/lyrics-transcriber)
- Youka says alignment "works best with correct lyrics" and lets users refine timing manually. — [Youka docs](https://docs.youka.io/en/web/provide-lyrics)
- Jam-ALT's annotation guide covers background vocals and non-word sounds, so a benchmark exists to measure ad-lib handling. — [arXiv 2408.06370](https://arxiv.org/html/2408.06370v1)
- gpt-transcribe supports `prompt`, `keywords` and `languages` parameters, which can bias recognition toward known lyrics vocabulary. — [OpenAI STT guide](https://developers.openai.com/api/docs/guides/speech-to-text)

### Inferences
- **Repeated choruses:** plain-text lyrics from databases often collapse repeats ("[Chorus x2]") or omit ad-libs. Before alignment, an LLM or rule pass should expand repeats into the full sung sequence. Otherwise the aligner is forced to stretch or skip.
- **ASR-plus-DP matching handles repeats naturally**, because each sung chorus is matched to its own text instance.
- **Ad-libs and backing vocals:** keep them in parentheses, as Jam-ALT does, and never pick them as blanks. ASR deletes them, so their timings are unreliable.
- **Rap speed and mumbling:** expect the highest error. Fall back to line-level timing only, and choose blanks from clearly enunciated words.
- **Confidence gating:** flag lines where the alignment cost is high or the ASR-to-lyrics match is poor (for example, fewer than X% of words matched), and send them to a "help us fix this line" community queue. Show only high-confidence lines as gap-fill items.
- **LLM post-correction should be constrained** to choosing between the reference lyrics and the ASR output. It must not freely rewrite, or it introduces its own hallucinations.

### Gaps
- No quantitative studies on rap or fast-delivery lyrics.
- No data on confidence-score calibration for any API on singing.
- No published hallucination rates for 2026 hosted models on music.

---

## 6. The "new AI called 'Jeff'"

### Takeaway
I found no transcription, lyrics or music AI model or tool named "Jeff" (or Jef/Geoff) as of Oct 2026. It is most likely voice dictation mangling a better-known name.

### Cited Findings
- Searches for a "Jeff" speech-transcription model and a "Jeff" lyrics-sync app returned nothing by that name. — [search: 2026 STT landscape](https://futureagi.com/blog/best-voice-ai-july-2026/); [search: lyrics sync apps](https://www.freebeatfit.com/blogs/brand-story/top-ai-generators-for-perfectly-synced-lyrics-videos)
- New 2026 transcription models a founder might have heard about:
  - OpenAI **GPT Transcribe** (Jul/Aug 2026). — [OpenRouter](https://openrouter.ai/openai/gpt-transcribe)
  - Google **Gemini 3.5 Transcribe** (docs updated Aug/Sep 2026). — [Google AI docs](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe)
  - xAI **Grok Voice Transcribe 2.0** (Sep 18, 2026). — [Unite.ai](https://www.unite.ai/it/xai-releases-grok-voice-transcribe-2-0-speech-to-text-model/)
  - Microsoft **MAI-Transcribe-2**. — [BuildFastWithAI](https://www.buildfastwithai.com/blogs/mai-transcribe-2-review)
  - ElevenLabs **Scribe v2**, Mistral **Voxtral Transcribe 3**, Google **Chirp 3**. — [Artificial Analysis](https://artificialanalysis.ai/speech-to-text)
  - Alibaba **Qwen3-ASR**, open weights, explicitly targets singing and songs. — [Qwen3-ASR Tech Report](https://arxiv.org/html/2601.21337)

### Inferences
- In Brazilian Portuguese, "GPT" is pronounced roughly "jê-pê-tê" and "Gemini" roughly "jê-mi-ni". Dictation turning either into "Jeff" is plausible.
- The most likely intended names are therefore **GPT (gpt-transcribe)** or **Gemini (Gemini 3.5 Transcribe)**. Less likely: Chirp, Grok or Qwen.
- Gemini is the more likely match if the founder heard that "Gemini transcribes songs well". Gemini-2.5-Pro posted the best English full-song WER (12.18%) in Qwen's comparison. Its timestamps are unreliable, though.
- Worth asking the founder directly.

### Gaps
- Could not confirm with the founder what was meant.

---

## 7. Using an LLM to clean/correct lyrics, translate line by line into PT-BR, explain slang and phrasal verbs, and choose blanks: cost, quality, copyright

### Takeaway
The text-side LLM work costs fractions of a cent to a few cents per song, done once and cached:
- About $0.002 with Claude Haiku 5.5 or Gemini 2.5 Flash-Lite.
- About $0.035 with Claude Sonnet 5.5.
- 50% less with batch APIs.

Translation quality for lyrics has no 2025–26 benchmark I could find. Plan for human spot-checks. The bigger issue is legal. Under Brazilian law (Lei 9.610/98, art. 29, IV), translating a work requires the author's prior express authorization, and a lyric translation is generally treated as a derivative work. Publishing AI translations of full copyrighted lyrics, and showing the lyrics themselves, needs licensing.

### Cited Findings
- **Claude API prices** (per 1M tokens, Oct 2026):

  | Model | Input | Output |
  |---|---|---|
  | Claude Haiku 5.5 (prompts ≤100k) | $0.10 | $0.50 |
  | Claude Haiku 4.5 | $1 | $5 |
  | Claude Sonnet 5.5 | $2 | $10 |

  The Batch API gives 50% off input and output. Cache reads cost 0.1x base (0.05x on Sonnet 5.5). Claude 4.7+ models use a tokenizer that produces about 30% more tokens for the same text. — [Claude pricing docs](https://platform.claude.com/docs/en/about-claude/pricing)
- **Gemini API prices** (per 1M tokens, Oct 2026):

  | Model | Input (text) | Output |
  |---|---|---|
  | Gemini 3.1 Flash-Lite | $0.25 | $1.50 |
  | Gemini 2.5 Flash-Lite | $0.10 | $0.40 |
  | Gemini 3 Flash Preview | $0.50 | $3.00 |
  | Gemini 3.6 / 3.8 Flash | $0.75 | $3.75 (rising Jan 1, 2027) |

  Free tiers exist for the Flash models. — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- **LLMs correcting lyrics:** LLM post-processing of ASR lyrics measurably reduces WER (LyricWhiz with GPT-4) [older, 2023]. — [LyricWhiz](https://archives.ismir.net/ismir2023/paper/000040.pdf)
- **OpenLRC** implements context-aware LLM translation of transcribed lines into LRC. Its docs note that costs vary with language and audio speed. — [OpenLRC](https://github.com/zh-plus/openlrc)
- **Automatic gap selection:**
  - Holmes et al. (AIME-Con, Oct 2026) found that conditioning masked-LM gap predictions on the source text gave higher-quality, more source-dependent gaps. The study is on textbook summaries, not language learners. — [ACL Anthology 2026.aimecon-main.59](https://aclanthology.org/2026.aimecon-main.59.pdf)
  - Donati et al. (CLiC-it 2024) found existing cloze datasets had diversity and correctness problems, and proposed an automatic quality metric validated against experts [older]. — [ACL Anthology 2024.clicit-1.39](https://aclanthology.org/2024.clicit-1.39.pdf)
  - Wang et al. (2024) generated vocabulary cloze items with GPT-3.5, with expert review of well-formedness [older]. — [arXiv 2403.02078](https://arxiv.org/html/2403.02078v1)
- **Copyright, Brazil:** Lei 9.610/98, art. 29: "A utilização da obra, por quaisquer modalidades, depende de autorização prévia e expressa do autor", including "IV – a tradução para qualquer idioma". Exceptions are listed in art. 46. — [LegJur art. 29](https://www.legjur.com/legislacao/art/lei_00096101998-29); [Senado: Lei 9.610](https://legis.senado.leg.br/norma/551486)
- **Copyright, general:** a lyric translation is considered a derivative work requiring the rights holder's permission. These are informal, non-legal sources. — [TuneCore / George Howard](https://www.tunecore.ca/?p=40291); [La Vista Q&A](https://www.lavistachurchofchrist.org/cms/how-does-copyright-work-with-translated-songs/)
- A translator owns copyright only in the translation, not in the original, and only within the licence granted. — [Arts Law Centre of Australia](https://www.artslaw.com.au/article/translations/)
- Lyrics in free databases such as LRCLIB stay copyrighted by authors and publishers. — [AlternativeTo: LRCLIB](https://alternativeto.net/software/lrclib/about)

### Inferences (cost calculations from cited prices)
- **Assumed workload per song:** about 2,500 input tokens (instructions plus about 500–700 tokens of lyrics) and about 3,000 output tokens (40–60 lines × PT-BR translation, about 5–10 slang or phrasal-verb notes, and blank-candidate JSON). Portuguese output and the newer Claude tokenizer can add 20–30%.

  | Model | Approx. cost per song |
  |---|---|
  | Gemini 2.5 Flash-Lite | $0.0015 |
  | Claude Haiku 5.5 | $0.0018 |
  | Gemini 3.1 Flash-Lite | $0.005 |
  | Gemini 3 Flash Preview | $0.010 |
  | Claude Haiku 4.5 | $0.018 |
  | Claude Sonnet 5.5 | $0.035 |

  Batch processing halves these figures. Done once per song and cached, a catalogue of 10,000 songs costs roughly $20–$350 in total.
- **End-to-end per new song** (alignment or ASR plus LLM): about $0.005–$0.06, with latency dominated by the LLM generation. A small model writing 3,000 output tokens takes several seconds to tens of seconds, which can be streamed line by line.
- **Quality:**
  - Use a stronger model (Sonnet-class) for the translation and explanations, where nuance, double meanings and slang matter.
  - Use a cheap model for mechanical tasks: expanding repeats, normalizing punctuation, splitting lines.
  - Ask for "natural PT-BR, not literal", plus a literal gloss for phrasal verbs and idioms. Flag sexual, drug or violent content for age-appropriate filtering.
- **Blank selection:** use the LLM to propose candidates with a rationale and a CEFR level, then filter deterministically. Keep words that:
  - appear verbatim in the canonical lyrics,
  - have a confident aligned timestamp,
  - are not ad-libs, parentheticals or proper nouns,
  - are not function words, unless the drill targets them,
  - and have priority if they are phrasal-verb particles, collocations or target vocabulary.

  Evaluate a sample with a teacher, following the expert-validation approach of the cloze-generation papers.
- **Legal framing (inference, not legal advice):**
  - Displaying full lyrics already needs a lyrics licence; licensed lyrics providers exist and are covered by other research.
  - Publishing a full PT-BR translation adds a translation right that the same licence may not include.
  - Lower-risk patterns:
    - (a) a provider whose licence covers translations;
    - (b) translating and explaining only short excerpts (key lines, expressions), which may fit art. 46 quotation-for-study exceptions; needs a lawyer's review;
    - (c) on-demand, per-user generation that is not stored or published. This reduces exposure but does not clearly eliminate the derivative-work issue.

### Gaps
- No 2025–26 evaluation of LLM (Claude, GPT, Gemini) English-to-PT-BR lyric translation quality or slang-explanation accuracy was found.
- No study specifically on LLM blank selection for song-based language learning.
- Not confirmed whether major lyrics licensors (Musixmatch, LyricFind) license translations or permit AI-generated translations; this belongs to the lyrics-licensing research thread.
- The text of art. 46 (educational and quotation exceptions) was not retrieved. Its applicability to an app needs legal counsel.
