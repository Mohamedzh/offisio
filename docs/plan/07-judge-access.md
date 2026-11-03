# 07 — Judge access: run from repo, guest drafts, voice

Status: **7.1–7.3 built, 7.4 docs done (2026-11-03); uncommitted, owner commits.** Opened 2026-11-02. Owner approved: `units.guest_owner` migration, `docker-compose.yml`, web mic button + endpoint. Parked: `/judges` page, renter sign-in.

Why: organizer guidance (Discord, 2026-11-02): "Judges need a project that runs from the public repo's setup instructions … If you keep a hosted or login-gated version, give judges a way to check the features without credentials, such as an open demo mode or a clearly labeled mock-data path." Judging is likely AI-assisted at least at first, so every feature must be testable without WhatsApp and from a fresh clone with only `META_API_KEY` (plus a Postgres).

No "judges" wording in the product UI. Guidance lives in README "Testing" and `public/llms*.txt`; in-product hints are normal UX (sample video, test-mode card, draft banner).

## 7.1 Run from the repo

- `data/seed/demo-snapshot.json`: the 13 `DEMO_UNIT_SLUGS` units with their specs, listings, media rows (public Blob URLs), places, add-ons and availability. Our own data and Meta output only; no bookings, no PII. Exported by `scripts/export-snapshot.ts` (reads the DB), loaded by `pnpm seed` (`scripts/seed.ts`, idempotent, any Postgres).
- `docker-compose.yml`: Postgres 16 only. Local Postgres without SSL must work (`lib/db/pg.ts` decides SSL from the URL).
- Graceful degradation: without XPay, WhatsApp, Places, QStash or Blob keys the app runs and labels the missing piece ("not configured"); nothing crashes.
- Local media fallback (after 7.2): with no `BLOB_READ_WRITE_TOKEN` and not on Vercel, uploads and renders are written to gitignored `public/uploads/`.
- README "Run locally": `docker compose up -d`, copy `.env.example`, set `META_API_KEY`, `pnpm migrate && pnpm seed && pnpm dev`.

**Built.** As-built notes:
- `docker-compose.yml`: Postgres 16 on 127.0.0.1:5432, user/password/db `offisio`. `lib/db/pg.ts` `sslFor()`: SSL off for localhost or `?sslmode=disable`; `scripts/migrate.ts` uses it too.
- `pnpm seed` (`scripts/seed.ts` + `scripts/seed-snapshot.ts`, one transaction, idempotent) loads 13 units, specs, listings, media (public Blob URLs) and place ids; owner fields cleared; open availability regenerated from today through the later of 2026-12-15 or today + 60 days (the same window now applies to uploads: `availabilityUntil()`). A non-localhost DB needs `--remote`. `pnpm export-snapshot` writes the file.
- Places ids only: Google terms allow caching only `place_id`, so the snapshot keeps `place_id` + our distance; the Maps link is rebuilt from the id. With `GOOGLE_PLACES_API_KEY`, seed refetches names (13 Nearby Search calls; `--no-places` skips). Without it the unit page shows "Place nearby" + Maps link.
- Migration `alter table unit_places alter column name drop not null`: run on Neon 2026-11-03 with owner approval.
- Minimum env `META_API_KEY` + `DATABASE_URL`; missing integrations return `XPAY_NOT_CONFIGURED`, `WHATSAPP_NOT_CONFIGURED`, `PLACES_NOT_CONFIGURED`, translated in the UI.
- Local media: `localMediaMode()` (no Blob token, not on Vercel) -> browser PUTs to `/api/blob/local` (same path, type, size and limit rules as `/api/blob/upload`; 404 when off); files and renders in `public/uploads/<slug>/`.
- Docker was **not** run on the dev machine; the seed was tested in a rolled-back temp schema.

## 7.2 Guest drafts, Publish with WhatsApp

- Migration: `alter table units add column if not exists guest_owner text` (random id, not PII).
- `offisio_guest` cookie: HMAC-signed random id (same signing scheme as `lib/owner.ts`), 7 days. Issued on first guest upload.
- Upload without sign-in creates a **draft**: `guest_owner` set, `owner_wa_id` null. Same limits and spend breaker.
- `editMode()` returns `owner` when the viewer's guest id matches `guest_owner` (or wa_id matches `owner_wa_id`). Demo units stay preview.
- Drafts are excluded from `listUnits()` (home, `/api/units` list, agent `search_units`), cannot be booked (booking API + `create_booking` + `get_unit` for the agent), and the unit page shows a "Draft, not listed yet" banner + `noindex`. Reachable by direct link only.
- Publish: "Publish with WhatsApp" -> sign-in -> `POST /api/units/[slug]/publish` moves `guest_owner` to `owner_wa_id` when the guest cookie matches. If WhatsApp is not configured and not on Vercel, the button is "Publish (local demo, WhatsApp not configured)" and publishes without an owner number (clearly labelled mock path).
- Login page copy: sign-in is needed only to publish; you can upload as a guest.

**Built.** As-built notes:
- Migration `alter table units add column if not exists guest_owner text`: run 2026-11-02.
- Guest cookie issued by `/api/blob/upload`, `/api/blob/local` or `/api/units/upload` (`issueGuest()`); guest tokens carry `typ: "guest"` and are never accepted as owner sessions.
- Publish errors: 401 `SIGN_IN_REQUIRED`, 403 `NOT_DRAFT_OWNER`, 404 `NOT_FOUND`, 409 `NOT_DRAFT` (published or demo unit), 415 (not JSON). Success `{ok, slug, mock, ready}`.
- Mock publish sentinel: with no `WHATSAPP_TOKEN` and not on Vercel, publish sets `owner_wa_id = 'local-demo'` (non-numeric, can never match a signed-in owner) and keeps `guest_owner`, so the uploading browser keeps editing. On Vercel without WhatsApp the banner says publishing is unavailable.
- `/login?next=` accepts only `/(ar|en)/...` paths (`safeNext`).
- New limit `blob_video`: 3 per IP, 20 global per day (video upload tokens).
- `GET /api/units?slug=` still returns a draft (with `draft: true`); only the list excludes it. Matches "direct link only".

## 7.3 Sample upload + voice

- `/upload`: "Try it with a sample walkthrough" uses one of our own filmed videos on Blob (no file needed), real pipeline.
- Web mic button in chat: MediaRecorder (webm/opus or mp4) -> `POST /api/chat/voice` -> ffmpeg -> `muse-voice-transcribe-1.0` on `meta.product` -> same agent turn as `/api/chat`. Limits before any paid call; size/duration caps; audio and transcript never logged.
- Voice hints: home WhatsApp block and chat input mention voice notes.
- Docs: voice validated 2026-11-02 on a real Egyptian-Arabic note (transcribed exactly, correct unit, prompt reply).

**Built.** As-built notes:
- Sample walkthrough: our own filmed `full` video (20 s, on Blob; override `NEXT_PUBLIC_SAMPLE_VIDEO_URL`), real pipeline, pre-filled editable fields.
- `POST /api/chat/voice` (multipart `audio`, `session_id`, `locale`): spend breaker + chat gate + `voice` limit (15 per IP, 300 global per day), then ffmpeg (protocol whitelist `file,pipe`, demuxer whitelist), then `meta.product.transcribe`, then `webTurn` (shared with `/api/chat` in `lib/web-chat.ts`); returns the chat shape plus `transcript`. Caps 1 MB, 60 s. Codes: `VOICE_EMPTY` 400, `VOICE_TOO_BIG` 413, `VOICE_FORMAT` 415, `VOICE_TOO_LONG` 413, `VOICE_UNCLEAR` 422, `VOICE_LIMIT` 429, `VOICE_FAILED` 502.
- Validation 2026-11-02: a real 6 s Egyptian-Arabic WhatsApp voice note was transcribed exactly ("عايزة احجز مكتب النهاردة في العاصمة الادارية لشخص واحد شوف لي كده ايه المتاح واعمل لي الحجز"); the reply was prompt and correct (an available unit in the New Administrative Capital, house add-ons offered, email-only ask, photo card). The web mic was verified with a synthetic TTS clip.

## 7.4 Docs

README, `public/llms.txt`, `public/llms-full.txt` (curl walkthrough: units -> chat AR/EN -> booking -> guest upload -> preview edit -> voice), ARCHITECTURE, DESIGN, AGENTS scope line, PLAN.md.

**Done 2026-11-03** (no code changed): README (Run locally, Testing flows 5 and 8, What we built, Data & rights), `public/llms.txt`, `public/llms-full.txt` (new section 15 "Agent testing with curl", shapes read from the route handlers), ARCHITECTURE (voice built and validated, guest drafts, local media, new routes), AGENTS scope, `.env.example` (sample video and `BLOB_VIDEO` / `VOICE` limit overrides, commented), PLAN.md, 06 O8 closed. DESIGN not edited in this pass.

## 7.5 AI listing review (owner request 2026-11-03)

**Built.** AI listing review: after the listing step, a `review` step (`muse-spark-1.3` via `meta.nonPii`, `LISTING_REVIEW_PROMPT_V2`, validated JSON, cached in `ai_cache` by text) proofreads the bilingual title and description: typos, natural Egyptian Arabic, English mixed into Arabic, claims the specs don't back (wrong numbers are corrected to the spec value), Arabic/English disagreement, contact details, pushy tone. The owner sees the issues on the draft and edit pages and can apply the fixes in one click (`POST /api/units/<slug>/review/apply`, owner only, writes only the cached corrected text) or run it again after a specs edit (`POST /api/units/<slug>/review`). Advisory only: publishing is never blocked. Upload also refuses contact details typed into district or floor (`CONTACT_INFO_NOT_ALLOWED`).
- Checked locally 2026-11-03: sample upload -> survey -> listing -> review "Looks good"; after a specs edit (area 40 m2 vs 12 in the text) "Review again" found 5 issues; "Use the fixes" changed only the flagged text; EN and AR panels. V2 prompt corrects wrong numbers to the spec value and writes plain-language notes (synthetic check: area 60 -> 90, rent 15,000 -> 12,000, phone removed, "2nd" -> "التاني"). About 50-90 s per review.
- Same session: Arabic floor and district labels (`floorLabel`, `districtLabel`), localized validation message on the specs form, one shared distance rounding for page and agent, photo tabs hidden when there is only one view, local limits x10 when not on Vercel, `.vercelignore`.

## 7.6 Near me (owner request 2026-11-03)

**Built.** Near me: tap 📍 in web chat (browser location) or share a location pin on WhatsApp, then ask for an office near you. The server validates and rounds the location (about 100 m, coarse Egypt box, fixed codes `LOCATION_BAD` / `LOCATION_OUTSIDE_EGYPT`), keeps it in the chat session only (`loc` on user messages in `chat_sessions.messages`, no migration), never logs it and never sends coordinates to the model. `search_units` gains `near_me` + `radius_km` (default 10 km, 1-50): results nearest first with approximate straight-line distances; if nothing is in range the agent says so and offers the 3 nearest. With no location yet, the agent asks for a pin (WhatsApp) or the 📍 button (web). Booking agent prompt `AGENT_PROMPT_V9`. Acceptance scenarios 14-18 pass.
- Reviewed (approve after fixes, all applied): UUID-only web session ids, WhatsApp texts mention location pins (Android 📎 / iPhone +), no `no_units_match_filters` when empty, rapid-tap guard, 📍 hidden on insecure origins.
- Checked locally 2026-11-03: AR web pin near Zamalek -> Zamalek "في منطقتك" then Downtown "حوالي ٢٫٤ كيلو"; EN two-turn session near Downtown; timeout message; acceptance 14-18 pass 5/5. WhatsApp pin still to test on a phone.

## Log

- 2026-11-02: segment opened; 7.1 (seed/compose), 7.2 and 7.3 voice endpoint run as parallel subagents with a reviewer each.
- 2026-11-02: `guest_owner` migration run; voice validated on a real WhatsApp note.
- 2026-11-03: `unit_places.name` nullable migration run on Neon (owner approved); docs pass (7.4).

## Handoff

Continued in [08](08-wa-video-listing-and-ship.md) (2026-11-03): near me (7.6) and the listing review (7.5) are built; the next session starts at 08.

State on 2026-11-03: 7.1–7.4 built, **all uncommitted**. Next:
1. Owner commits (suggested split: seed + compose + local media / guest drafts + publish / sample walkthrough + web mic / docs).
2. Browser QA in EN (LTR) and AR (RTL): guest upload and sample walkthrough -> draft banner -> Publish with WhatsApp (and the local mock path); web mic in Chrome, Firefox and Safari; error texts for the `VOICE_*` and `*_NOT_CONFIGURED` codes.
3. Run `docker compose up -d && pnpm migrate && pnpm seed && pnpm dev` once on a machine with Docker, from a fresh clone with only `META_API_KEY` set.
4. Deploy (Vercel remote build) and check prod: upload as a guest, publish after sign-in, web mic turn (`[meta] /asr/transcribe 200`), the seeded data unchanged, `/api/blob/local` returns 404.
