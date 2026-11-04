# 08 — WhatsApp video listing, then ship polish

Status: **8.1 built (2026-11-03)**: `wa_listing_drafts` migration approved by the owner and run on Neon; reviewed once and the fixes applied. Uncommitted at handoff (owner commits). 8.2-8.4 not started (opened 2026-11-03). Deadline: submit **Wed Nov 4, 9:00 PM ET**; the 3-minute demo video is recorded before that. Start a fresh session with this file, `AGENTS.md` and `docs/PLAN.md` only (plus files named below).

Order of work: **8.1 build (time-boxed)** -> 8.2 polish -> 8.3 reviews -> 8.4 video prep. If 8.1 is not working end to end by **Nov 4, 12:00 Cairo**, stop it, leave it uncommitted or behind a flag, and move to 8.2; the video then shows web upload as the owner path and names WhatsApp listing as "next".

Working rules (owner): never commit (owner commits); ask before any new dependency, migration or paid batch; lint + typecheck before handing back; verify UI in EN (LTR) and AR (RTL); spawn an implementor per task and a reviewer after each (Opus subagents, roles in `docs/agents/`); no "judges" wording in the product UI.

## State at handoff (2026-11-03)

Committed and deployed by the owner up to the near-me work; check `git status` first (near me 7.6 and its docs may still be uncommitted: commit list in the 07 handoff / last session). Built and working: guest drafts + Publish with WhatsApp, sample walkthrough, local media, run from repo (Docker not yet run), web mic, WhatsApp voice notes, AI listing review (pipeline step `review`, `LISTING_REVIEW_PROMPT_V2`), near me (web 📍 + WhatsApp pin, `AGENT_PROMPT_V9`), Arabic floor/district labels, local limits x10. Details: [07](07-judge-access.md) sections 7.1–7.6.

Owner phone checks still open: WhatsApp location pin then "عايز مكتب بكرة"; web 📍 on a phone; one prod sample upload (all pipeline steps finish, incl. `review`; earlier a local->prod QStash delivery stayed `queued`, now QStash is Vercel-only and stuck steps show Retry).

## 8.1 List an office by sending a video on WhatsApp (owner request)

Goal: an owner sends a walkthrough video to the Offisio WhatsApp number; the bot collects the few missing details by chat (text or voice), runs the same pipeline, sends a link to the ready draft, and publishes it under their number on confirmation.

**Needs owner approval before building:** migration for a `wa_listing_drafts` table (proposed below). Do not start code until the owner says yes; if refused, store nothing between messages and require video + details in one message caption (fallback design at the end).

Flow:
1. Owner sends a video (WhatsApp `type: "video"`, mp4, up to 16 MB). Webhook (`app/api/whatsapp/webhook/route.ts`, after `firstSeen` dedupe and before the renter agent path): limits first (new kind `wa_video`, 3 per sender per day, plus spend breaker), download with a video-sized cap (today `MAX_MEDIA_BYTES` in `lib/whatsapp.ts` is 1 MB for voice: add a separate cap, about 16 MB, and a longer timeout), upload the video to Blob under `uploads/<slug>/source.mp4`, extract up to 20 JPEG keyframes server-side with ffmpeg-static (same binary as `lib/audio.ts`; input whitelist and protocol whitelist like `audioToWav`; e.g. `fps` so ~20 frames over <=45 s, scaled to the browser path's frame size; cap output bytes; 30 s timeout), store frames as `uploads/<slug>/frame-<n>.jpg` (allowlist in `lib/upload-names.ts`). Reject videos over 45 s (same as web).
2. Bot replies (AR + EN by language of recent messages): "Got your video ✅ Send the location pin 📍 and tell me the monthly rent, the floor, and the daily price if any — text or a voice note is fine."
3. Details by chat: location from a WhatsApp location pin (parser exists: `IncomingMessage.location`, validate with `renterLocation`-style checks but for owners: Egypt box) or a Google Maps link / "lat, lng" text (`resolveLocation` in `lib/geo.ts`); rent / daily / floor / kind (furnished|semifinished) / available_from extracted from text or a transcribed voice note with a small structured call on **`meta.product`** (owner contact context = PII path), JSON schema validated, `hasContactInfo` rejected in district/floor (`lib/pipeline/review.ts`). Bot confirms what it understood and asks only for what is missing. Kind default: from the survey if the owner does not say. District: reverse from the pin is not available (no reverse geocoding API in scope) — ask the owner for the district name in the same message.
4. When complete: create the unit as a **guest draft** owned by a fresh random `guest_owner` id (reuse `createUploadedUnit` + `replaceKeyframes` + `addMedia` + `enqueue(["analyze","places"])`, exactly as `app/api/units/upload/route.ts`), remember `{wa_id, slug, guest_id}` in the draft row. Reply "Analyzing your office, about 2 minutes…".
5. When the listing (and review) step finishes: send "Your listing is ready 👉 <link>" — a **single-use magic link** (`/api/auth/wa-link?t=…`), HMAC-signed `{slug, gid, wa, exp}` with 30 min expiry and single use via `firstSeen("wa_link_token", jti)`, that sets the `offisio_guest` cookie (gid) and the owner session cookie for that wa_id (same signing as `lib/owner.ts`), then redirects to `/<lang>/units/<slug>`. The page is the existing draft page: AI review panel, specs edit, Publish. Hook point: end of the `review` step (or `listing` if review fails) in `lib/pipeline/jobs.ts` — look up the draft row by unit and send via `sendText`.
6. Publish either on the page (existing `POST /api/units/[slug]/publish`, works because the link set both cookies) or by replying "publish" / "انشر" on WhatsApp (server-side: same `publishDraft(slug, gid, wa)`). Confirm: "✅ Listed under your number" + unit link.
7. "Offisio logout" already signs the owner out everywhere (epochs).

Proposed migration (ask first):
```sql
create table if not exists wa_listing_drafts (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,            -- PII, never logged
  slug text not null unique,
  guest_id text not null,
  video_url text, frame_urls text[] not null default '{}',
  fields jsonb not null default '{}', -- rent_egp, daily_egp, floor_text, kind, available_from, district, lat, lng
  status text not null default 'collecting' check (status in ('collecting','processing','ready','published','expired')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_wa_listing_drafts_wa on wa_listing_drafts(wa_id, status);
```
Expire `collecting` rows after 24 h (one cheap `update … where updated_at < now() - interval '24 hours'` on each new video).

Rules: PII routing (wa_id, owner messages, voice -> `meta.product` / `muse-voice-transcribe-1.0`; never contributor); never log phone numbers, coordinates, transcripts; fixed error codes only; Meta needs a fast 200, so all work runs in `after()` within `maxDuration` (video download + ffmpeg may need the full 120 s: measure; if too slow, enqueue a pipeline step for frame extraction instead); `outputFileTracingIncludes` for ffmpeg-static already covers the webhook route.

Acceptance (synthetic data only; do not message real numbers except the owner's own phone at the end):
- Unit checks in `.scratch/`: frame extraction on our own `public/demo/full.mp4` (20 frames, size caps, >45 s rejected, non-video rejected), detail extraction JSON validation, magic-link token sign/verify/expiry/single use.
- Route-level: synthetic signed webhook payloads (HMAC with `WHATSAPP_APP_SECRET` from env, never printed) for video, location, details text; stub the Graph send/download (do not hit real Graph in tests).
- One real end-to-end run from the owner's phone after deploy.
Stop conditions: any need for a second migration, a new dependency, or reverse geocoding -> stop and ask.

Fallback (no migration): owner sends the video with a caption containing all details ("Zamalek, 2nd floor, 15000/month, 800/day, furnished, pin: <maps link>"); one structured extraction; missing details -> reply with an example caption and ask to resend. Nothing stored between messages.

Docs when done: README "What we built" + Testing flow, `public/llms*.txt`, ARCHITECTURE (route, table, flow), AGENTS scope line, this file's status, PLAN.md row. (Done 2026-11-03.)

### 8.1 result (2026-11-03)

Built as planned, with the migration (no fallback). As built: the `collecting` draft is created as soon as the video passes the limits, so a pin or details sent while the video is still processing land in it; details come by text, caption, voice note, location pin, Maps link or "lat, lng", extracted on `meta.product` (`OWNER_DETAILS_PROMPT_V1`, `meta.product.chatOnce`: one try, 20 s timeout; a caption skips the validation retry). Keywords: publish/انشر, cancel/إلغاء/الغاء (only while collecting), link/رابط, status/حالة. Magic link: 30 min, single use, the token carries no phone number (the route takes the owner from the draft), sets the guest and owner cookies, sent without a link preview. Limit `wa_video` 3 per sender per day. Drafts: collecting/processing stop after 24 h, ready after 7 days. Frames: up to 20 from a video of at most 45 s and 16 MB. Worst-case video turn: about 105 s within `maxDuration` 120 (Graph lookup 8 s, download 20 s, ffmpeg 5 + 25 s, storage 15 s, caption extraction 20 s with no short-link hops, reply 10 s, plus DB and enqueue; budget in `lib/wa-listing.ts`); a draft still without video 3 min after the video arrived is treated as dead (expired, owner asked to resend). "status"/"link" expire a processing draft only after its unit has been failed for 10 min (past QStash retries); own limit `wa_listing_link` 10 per sender per day. Kind defaults to furnished (the survey runs after the unit is created), editable on the draft page.

Files:
- New: `lib/wa-listing.ts` (flow, texts, keywords, details validation, pipeline notify), `lib/wa-link.ts` (token sign/verify), `app/api/auth/wa-link/route.ts` (single-use link), `lib/db/wa-drafts.ts` (draft queries, compare-and-set status), `lib/video-frames.ts` (ffmpeg keyframes), `lib/upload-unit.ts` (create path shared with the web upload).
- Changed: `app/api/whatsapp/webhook/route.ts` (routing before the renter agent), `app/api/units/upload/route.ts` (uses `lib/upload-unit.ts`), `lib/whatsapp.ts` (video parsing, `VIDEO_MEDIA` cap, `preview` option), `lib/guard.ts` (`wa_video`), `lib/geo.ts` (`ownerLocation`), `lib/meta/client.ts` (`meta.product.chatOnce`), `lib/meta/prompts.ts` (`OWNER_DETAILS_PROMPT_V1`), `lib/owner.ts` (`purposeKey`), `lib/pipeline/specs-listing.ts` (`chatJson` client and attempts), `lib/pipeline/jobs.ts` (notify after `review`, or on a final analyze/listing failure), `lib/db/schema.sql` (`wa_listing_drafts`).

Tests (gitignored `.scratch/wa-video/`, synthetic data and our own footage only), one test file per area:
- `npx tsx .scratch/wa-video/frames.test.ts` (repo root): frame extraction on our own footage: 20 frames, size caps, over 45 s rejected, non-video rejected.
- `npx tsx .scratch/wa-video/units.test.ts` (repo root): details validation, missing fields, keywords, link sign/verify/expiry/tamper, token domain separation, single use via `firstSeen` (DB).
- `cd .scratch/wa-video/run && npx tsx ../flow.test.ts`: route-level flow with HMAC-signed synthetic webhook payloads; Graph, the Meta API and pipeline model calls are stubbed. Must run from `.scratch/wa-video/run` (create it if missing) so `.env.local` is not auto-loaded and media lands in `run/public/uploads`. `KEEP=1` keeps one unit and writes `run/link.txt`; `npx tsx .scratch/wa-video/cleanup.ts` (repo root) removes it.
- Helpers (repo root): `sign.ts` (fresh link for the kept unit; `expire` checks a cancelled draft's link fails), `count.ts` (draft counts, stray units), `frames-time.ts` (ffmpeg timing), `live-extract.ts` (one real paid `meta.product` call on a synthetic message).

Owner phone test fixes (2026-11-04):
- Test runs had used up the shared daily `wa_video` limit (the flow test runs on the real DB): today's counters reset (owner-approved); `flow.test.ts` now gives back its synthetic senders' usage.
- Videos: an oversized video is rejected from the free Graph size lookup before it counts toward the daily limit; the too-big text says "without HD"; a video sent as a document is accepted with the same caps (over 16 MB: "send it as a video").
- Shared Google Maps links that name a place but carry no coordinates (`/maps/place/<name>/data=!4m2…`, e.g. O1 New Cairo) are resolved with Places Text Search (Egypt only, one call, 5 s) and the place is named back ("📍 O1 New Cairo ✓"); a link with no readable location gets a "send the pin" text instead of "must be in Egypt". Also used by the web upload's location field.
- Progress: the start message names the survey, bilingual listing and staged photos (3 to 5 min); the link goes out when every step has finished (renders included), or on "status"/"link" 10 min after the listing went live if a render is stuck.
- Expired collecting drafts delete their `uploads/<slug>/` files (`deleteUploads` in `lib/blob.ts`).

Open items:
- Owner phone run after deploy (video, pin, details, link, publish); it also measures the real Graph download and Blob upload times against the ~105 s budget.
- Blob cleanup on expiry: done 2026-11-04 (`deleteUploads(slug)` in `lib/blob.ts`: Blob `list` + `del` by prefix `uploads/<slug>/`, or `rm` under `public/uploads` locally). Runs when a collecting draft expires (no unit exists yet); best effort, logs slug + code only. Local test `.scratch/wa-video/del.test.ts` (run from `.scratch/wa-video/run`, 7 checks); Blob mode is typechecked but not run against the real store. Uploads still in flight at expiry can stay orphaned.
- QStash final retry: if analyze/listing fails on its last QStash retry, the owner is not told; only "status" finds the failed unit and expires the draft.

## 8.2 UI/UX and translation polish (before recording)

Do a full pass in EN (LTR) and AR (RTL), desktop and phone width (Playwright resize 390x844), on: home, unit page (demo + draft), edit page, upload (incl. sample walkthrough), login, chat (typing, 📍, mic, errors), booking + test-card checkout, booking page after payment, privacy/legal pages. Known items:
- Arabic replies from the agent sometimes include English words ("layout", "long-term", "meeting"): tighten `AGENT_PROMPT_V9` language rule (prompt bump to V10, rerun `pnpm chat-acceptance` fully once — paid, ask first).
  **Done 2026-11-04:** `AGENT_PROMPT_V10` (owner-approved) adds an Arabic-words-only rule and an "Owners" rule (someone listing their own office gets the WhatsApp video / "List your office" path instead of "I can't list offices here", seen on the owner's phone). `pnpm chat-acceptance` 21/21 (new 19-21: owner AR on WhatsApp, owner EN on web, "عايز أأجر مكتب" stays a renter search with Arabic-only text).
- Unit cards in chat show Western digits while replies use Arabic-Indic: pick one per locale.
- Any remaining English in AR pages (search with a script: lines matching `[A-Za-z]{3,}` in `/ar/*` page text, excluding brand names and the language toggle).
- Button states: check every `.btn-paper` with `aria-pressed` for the hover-contrast trap (fixed for the mic; the 📍 uses `btn-chalk` while locating).
- Copy consistency: "listing" vs "office" vs "unit"; error texts all translated (grep `errorText` codes vs `error.*` keys).
- Lighthouse/accessibility quick pass (chrome-devtools MCP): contrast, labels, focus order.
Translations: `lib/i18n/en.json` / `ar.json` identical keys (check with a node one-liner); Arabic is natural Egyptian, short; no "judges" wording.

## 8.3 Reviews

- One reviewer per change set (implementor -> reviewer -> fixes), as in 07.
- Final head review over the full uncommitted diff before the last commit: secrets, PII routing, logs, line endings (`git diff --stat` vs `--ignore-cr-at-eol`), lint 0 errors, typecheck, `pnpm build`.
- Prod smoke after deploy: home EN/AR, unit page, chat AR + EN (+ 📍), web mic, sample upload -> draft -> review -> publish (owner phone), test-card payment, WhatsApp text + voice + pin, `/llms.txt`, `/api/blob/local` 404 on prod.

### 8.2 + 8.3 result (2026-11-04, uncommitted)

End-to-end review (security, flow, wording/translations, live UI on prod), then 6 implementor + reviewer pairs (Opus). Final check: typecheck clean, lint 0 errors, `pnpm build` OK, en/ar 400 keys each, no secrets in the diff, reviewers saw 0 CSP violations on a local `next start`.
- Security: uploads pinned to our Blob store (host from `BLOB_READ_WRITE_TOKEN`, demo store fallback), `mediaBytes` capped at 16 MB, upload path regex; agent `create_booking` 1 per turn + `booking` limit; `spendBlocked()` on web chat and WhatsApp turns; fixed error codes only (`safeErrorCode`), pipeline `last_error` owner-only (GET + edit page); new `checkout` limit kind; CSP + X-Frame-Options/Referrer/Permissions-Policy in `next.config.ts` (static, no nonce; `camera=()` does not affect the native camera from the file input).
- Booking: polls after the XPay return (stops on a failed payment), not-found state, no same-day booking from 16:00 Cairo (`firstBookableDay`), all booking codes translated, form labels/dates/hints, add-on qty integer, `status = 'ready'` required.
- WhatsApp: `activeDraft` collecting first; final QStash failure tells the owner (attempts vs `QSTASH_MAX_DELIVERIES`; `queueJobs` resets attempts; failed-with-retries-left is not settled); publish/cancel while processing answered; readable summary/captions; Western digits.
- UI: chat overflow at 390 px, no repeated cards, slow-reply hints; AR Western digits + "{amount} جنيه", area/seats line; Book CTA + phone sticky bar; fit tab hover; branded 404/error (`[...missing]` catch-all); 2-row phone header; WhatsApp float lifted/faded.
- Copy: privacy/terms rewritten (cookies, voice, location, owner number, demo wording), "Last updated" fixed to 2026-11-04 (constant in components/LegalPage.tsx, bump when the copy changes; owner decision); terminology office/listing/fit concepts/المحادثة/المساعد.
Open: `lib/meta/prompts.ts` still asks for Arabic-Indic distances (prompt bump + paid acceptance run needs owner OK); a decline with no failed webhook still waits ~60 s; 404s return HTTP 200 (PPR shell); `lib/blob.ts` whole-project tracing warning in build; no flow test yet for the new WhatsApp keyword routing.

## 8.4 Video prep (3 minutes, record Nov 3–4)

Story (depth over breadth): owner films an office -> AI survey, rubric "Suitable for", bilingual listing, AI listing review with one-click fixes, staging renders -> publish with WhatsApp -> renter asks "near me" in Egyptian Arabic (voice note on WhatsApp and web mic) -> books and pays in XPay test mode -> confirmation on WhatsApp. Mention: Meta models only (Muse Spark, Muse Image, Muse Voice Transcribe), PII routing, AR/EN RTL. No menus, no SAM. Keep a written shot list in this file before recording; use demo data and the owner's own phone/number only.

### Production plan — 2026-11-04

Status: **planning, rehearsal and main upload-to-confirmed-booking recording complete; narration generation and final render pending**. Owner confirmed **English narration + Egyptian Arabic demo**; this take uses typed Arabic. Target a **2:55** film, leaving five seconds below the requested three-minute ceiling. Proposed output: 1920x1080, 16:9, 30 fps, H.264 MP4 with AAC audio, English captions and a separate SRT. Silent 1080p capture/export/browser playback verified in the rehearsal below; narration/audio sync remains untested. The production result below supersedes planned shots where the actual run differed.

Direction: **one office, from phone walkthrough to a bookable workspace**. Let the app occupy most of the screen. Use its cream, black and red visual identity for simple titles and captions. No stock footage, invented interface, simulated AI answers or generated presenter required. The audience should understand the problem in the first 12 seconds and see the product immediately.

#### Checks completed

- Live browser: home `/en`, `/en/upload`, `/en/units/full`, `/ar/units/full`. The Arabic unit has `dir="rtl"`. These were read-only checks, not a fresh end-to-end test.
- Hero example: filmed Pioneer Plaza office, slug `full`, about 12 square metres, 3 seats, EGP 800/day. The live page exposes Real today / Emptied by AI / Fit: Startup office, estimated specs, suitability reasons and booking. The first image was visually inspected; the other media states still need a successful click and visual check.
- Upload page exposes the owner's 20-second sample walkthrough, private-draft explanation, location, rent, floor and availability fields. No upload was submitted during planning.
- Own local footage exists: `public/demo/full.mp4` and WhatsApp-sized `public/demo/full-wa.mp4` (about 6.8 MB), plus `empty1` and `empty2` variants. Use these only within this project.
- ElevenLabs connector responds and lists speech capabilities and voices. The user's premium plan is user-reported; this connector does not expose a billing/balance check. Candidate: **Moaz - Clear Tech Explainer**, `InZiH3ygdb9YToEicEjR`, English with a light Arabic accent. Candidate metadata was checked; its pronunciation/audio has not been auditioned. No synthesis or other paid generation was started.
- HeyGen connector confirms **Free**; remaining credits are returned as null, not a known usable quota. Its current [pricing page](https://www.heygen.com/pricing) advertises three watermarked videos/month, up to one minute each. Do not make the three-minute master depend on HeyGen. Optional: a short presenter insert only if the owner chooses one and its eligibility is checked; do not choose or clone an avatar automatically.
- Unified computer-use native pipe/browser host was unavailable. The separate **Browser Use** connector successfully opened the deployed app and read its UI. One wheel action timed out; navigation and subsequent reads still worked. Continuous interaction reliability is not yet established.
- Browser Use `start_recording` / `stop_recording` succeeded and saved **two frames**, not a finished screen video, at `C:\Users\moham\.config\browser-harness\agent-workspace\recordings\offisio-video-preflight`. Treat this as a capture check, not submission footage. Preserve the exact path for any inspection.
- Existing `ffmpeg-static` runs (6.1.1) and lists `gdigrab` and DirectShow capture. Smooth capture, audio sync and MP4 export have not been tested. No dependency was installed.
- Git status was clean at the start of this planning session. Earlier "uncommitted" notes above are historical; this check does not prove which revision is deployed.

#### Timed shot list

| Time | Picture / action | What it proves |
|---|---|---|
| 00:00–00:12 | Open on our real furnished-room footage; quick cut to the listing and its AI fit concept, then Offisio title. | The transformation and the two-sided problem. |
| 00:12–00:36 | Web upload: select our sample walkthrough, show location/rent fields, Create listing, then actual processing. Cut to the resulting draft with a small "Processing shortened" caption. | Real owner input through the pipeline; no sign-in needed to start. |
| 00:36–01:01 | Same draft: specs, one Fits and one Not suitable reason, bilingual listing, brief AR/EN toggle. Show the review panel if it has a genuine actionable finding. | Structured understanding, useful limits, bilingual output and owner review. |
| 01:01–01:24 | Same room: Real today -> Emptied by AI -> Fit: Startup office. Hold each for 3–5 seconds; keep the concept label visible. | Muse Image transformation grounded in the input room. |
| 01:24–01:40 | Draft badge -> Publish with WhatsApp -> successful owner confirmation -> published page. Use the owner's own phone. | The owner controls publishing. If phone access fails, show the draft and publishing entry point and say "ready for the owner to publish"; never imply publication occurred. |
| 01:40–02:12 | Renter in Arabic web chat, or WhatsApp if access is ready: short real Egyptian Arabic voice note, visible transcription, search result, office selection and availability. English subtitle translates the utterance. | Muse Voice Transcribe + Muse Spark acting on the same office/booking intent. |
| 02:12–02:36 | Actual quote/payment link -> XPay TEST MODE checkout -> returned booking with confirmed status. Show the WhatsApp paid notice only if actually received. | A completed test booking, not merely a checkout link. |
| 02:36–02:55 | Simple three-model diagram over relevant captured frames, then live URL and "Built solo for the Meta Global AI Developer Hackathon." | Clear Meta contribution and a memorable close. |

The target durations total 175 seconds. Measure the accepted narration before final timing. Keep a few seconds of room tone/quiet for the Arabic note and image reveal. Omit extra cafes, add-ons, login mechanics and failure cases unless they naturally fit; they dilute this story.

#### English narration draft

These lines are a draft for the planned shots, not claims that those shots have already been recorded. Keep or revise each line against the actual results captured.

**00:00–00:12**

> A phone walkthrough shows a room. It doesn't tell you how that room could work for your business. Offisio connects that walkthrough to a bookable office.

**00:12–00:36**

> An owner starts with a short video and a few facts: location, rent, and availability. Here I'm using a walkthrough we filmed ourselves. Offisio extracts frames and analyzes the space. The result starts as a private draft, so the owner can review it before anyone books.

**00:36–01:01**

> Muse Spark identifies the space and estimates its features, then writes a listing in English and Arabic. The owner reviews those estimates before publishing. Here, the survey missed air conditioning, so we correct that field. Suitability still reflects the original survey: refreshing it after an owner edit is a remaining limitation.

**01:01–01:24**

> For staging, this is an earlier completed example from the same filmed office. Muse Image removes the furniture and creates a possible startup layout. Here is the original, the emptied view, and the concept. The app labels AI views separately so renters can distinguish possibilities from the space as it is today.

**01:24–01:40**

> The owner stays in control. They review the draft and sign in through WhatsApp to publish it. Once published, the office becomes available to the renter's booking assistant.

Fallback if publishing is not captured: "The owner stays in control. This is a private draft, ready for review. Publishing requires WhatsApp sign-in; until then, the office stays out of public search and booking."

**01:40–02:12**

> Now the renter can ask naturally in Egyptian Arabic.

Show the actual typed request with its English translation, then:

> Here, the renter types a request for a furnished office in the New Capital, for November sixth, around eight hundred pounds. We select the newly published office. Muse Spark checks availability, confirms the price and creates a booking with a payment link.

**02:12–02:36**

> The renter sees the price and follows the payment link. This demonstration uses XPay's test mode. A booking is confirmed only after the server verifies the payment webhook. Now the confirmation is visible: the conversation has become a booking.

**02:36–02:55**

> Offisio uses Meta models: Muse Spark for understanding and conversation, Muse Image for room concepts, and Muse Voice Transcribe for its voice feature. This recording demonstrated text chat. Personal conversations stay off contributor models. Film the space, explore its possibilities, and book in your own words.

#### Egyptian Arabic demo and continuity

Suggested voice note for the filmed Pioneer Plaza listing:

> عايز مكتب مفروش لثلاثة في العاصمة الإدارية، يوم واحد، في حدود تمنمية جنيه.

English subtitle: "I need a furnished office for three in the New Capital, for one day, around 800 pounds."

Follow up with the **actual future date selected during the rehearsal**, for example "يوم ٦ نوفمبر لو متاح" only if recording on November 4–5 and November 6 is free. Recheck availability; don't reuse a past date or claim the agent found an option it did not return. Use the owner's phone for any real WhatsApp interaction and demo contact data elsewhere.

Prefer one new upload/draft throughout. If the established `full` listing is used instead for the renter or visual beat, introduce it explicitly as "a completed example from the same filmed office". Never cut an upload into a different pre-existing listing while implying it was that run's output.

WhatsApp video listing is an alternate owner opening, not another full sequence to squeeze in: substitute the video + details + draft-link exchange for 00:12–00:36 only after its real phone flow passes. Near-me is optional; use the district request above if location permissions or nearest-office results interrupt the main story.

#### Recording and edit execution

1. **Capture rehearsal first:** one dedicated browser window, no unrelated tabs/notifications in frame. Verify a 10-second scroll/tab-change clip with Browser Use driving the UI. Use its event capture for evidence; test a continuous window capture with the existing FFmpeg if smooth motion is needed. Verify duration, playback and readable text before the main run. Do not treat the two-frame planning trace as smooth recording proof.
2. **Preflight one journey:** choose one office and available future day, verify all three room views, draft/review path, owner's publishing access, Arabic voice/text, checkout and webhook confirmation. No paid batch tests. Record one successful production run with the raw waits preserved, then shorten waits in the edit. Production model use and test bookings are separate from this read-only planning pass.
3. **Capture separate takes:** upload; draft/specs/suitability; before/after; publishing; Arabic conversation; payment/confirmation. Start recording before actions. Preserve source clips and exact capture paths. Do not reconstruct missing successful outcomes with fake UI.
4. **Narration:** audition a short ElevenLabs opening including "Offisio" and "Muse" before synthesizing the full draft. Generate by scene so one wording correction doesn't regenerate everything. Aim for calm, clear delivery around 125–140 words/minute while leaving time for the Arabic note. Use ElevenLabs only in video post-production; the product's AI remains Meta-only. No music needed.
5. **Assembly:** compose the clips, narration, simple labels and captions locally; HyperFrames is the proposed composition workflow, with FFmpeg for capture/encoding. Keep video tooling outside the app's runtime dependencies. No production composition has been scaffolded in this planning session. HeyGen remains optional and is not required for the final file.
6. **QA:** 175 seconds target and never over 180; captions match the actual audio; Arabic spelling/translation and RTL are correct; important text stays readable; input and output room match; estimate/concept/test-mode labels remain visible; payment confirmation is real; redact contact details, tokens and any private WhatsApp sidebar before export. Inspect the exported MP4 at every scene boundary and watch it end to end with sound.
7. **Deliver:** final MP4, SRT, narration audio, source edit/project and a compact shot/source ledger. Upload/submission is a later explicit action; this session only prepares the plan.

#### Sources and outstanding checks

- [Meta event page](https://dev.meta.ai/events/global-hackathon) and [organizer page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) confirm submission November 4 at 9 PM Eastern: **November 5 at 4 AM Cairo**. Public pages inspected do not specify the video upload format or confirm a three-minute formal limit; three minutes is the owner's brief. Recheck the authenticated submission form before final delivery.
- [HeyGen pricing](https://www.heygen.com/pricing), checked 2026-11-04: Free plan is unsuitable as the sole three-minute master renderer; web-plan limits do not prove connector generation entitlement.
- [Browser Use recording guidance](https://github.com/browser-use/browser-harness/blob/main/interaction-skills/make-video.md): preserve actual captured actions/results, exact recording directory and review final frames for private information.
- Still open: continuous recording/export rehearsal, narration audition and credit availability, fresh pipeline/phone/payment success, final generation/edit/render and submission-form requirements. No final video was generated by this planning pass.

### Recording rehearsal result — 2026-11-04

**Passed for browser capture and export.** Delivered `.scratch/video/rehearsal/offisio-rehearsal-10s.mp4`: actual duration **9.4 seconds**, 1920x1080, H.264, 30 fps, 282 frames, silent. The filename describes the intended ten-second rehearsal; Chrome's variable-frame capture produced 9.4 seconds, and the export preserves that timing without padding. The native source was `.scratch/video/rehearsal/capture-02.mp4` (AV1 in MP4). `capture-01.mp4` is the earlier 16.1-second discovery take; preserve both.

- Recorded actual UI interactions on the deployed `/en/units/full`: Real today -> Emptied by AI -> Fit: Startup office, followed by a 420 px scroll. Selected states verified after each click. Both AI views were visually inspected in the recording.
- Chrome 156 supports **`Page.startScreenRecording`** with `captureArea: "target"`, `audio: false`, `maxWidth: 1920`, `maxHeight: 1080`, `frameRate: 30`. Stop with `Page.stopScreenRecording`, drain its returned stream with `IO.read` and close with `IO.close`. This captures only the target tab, including changes between tool calls; no desktop or unrelated tabs enter the footage. Returned bytes are MP4 despite the original discovery filename being `.webm`.
- Set the target viewport with `Emulation.setDeviceMetricsOverride` (1920x1080, scale factor 1, mobile false). **Temporarily enable `Emulation.setFocusEmulationEnabled`** for background interaction and local video playback, then disable it. This resolved the earlier wheel/input issue. Re-read the accessibility tree and actual button geometry before each click. A wheel operation can return before its visual scroll completes; verify the resulting state.
- Export using the existing `ffmpeg-static`: `-vf fps=30 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -an -movflags +faststart`. Native capture is variable frame rate; the 30 fps export duplicates unchanged frames and does not imply 30 unique rendered frames every second.
- Verification: full FFmpeg decode exit 0; ten-position contact sheet inspected (last tile blank because duration is 9.4 s, not a black video frame); full-resolution frames at 2 s and 6 s inspected. Chrome playback reached `currentTime = duration = 9.4`, `readyState = 4`, 1920x1080, 282 total frames and 3 reported dropped playback frames. Capture/navigation passed; this is not an audio or full-demo acceptance test.
- Evidence: `.scratch/video/rehearsal/capture-02-actions.json`, `contact-02.jpg`, and `.scratch/video-review/frame-{2,6,8}.png`. These are ignored local artifacts. The preview tab for the MP4 remains available for review; the original Offisio tab remains available for the next recording.
- Image quality: main title, room, price and state buttons are readable at full size. The main edit should crop closer for smaller explanations and reserve caption space; the rehearsal uses the complete page viewport. No product UI or source images were altered.
- Sandbox writes under `.scratch` required the owner's shell approvals. Future capture/export work should account for those permissions rather than repeatedly trying alternate write routes.
- No model calls, upload, publishing, test booking, payment or message sending occurred. No ElevenLabs/HeyGen credits were spent. Next: verify and capture the complete journey; audition narration after the actual footage/script is settled.

### Production recording result — 2026-11-04

**Completed on the deployed app:** own 20-second sample walkthrough -> 20 frames -> private draft -> owner WhatsApp sign-in -> owner correction -> publish -> Egyptian Arabic web text chat -> booking hold -> XPay TEST MODE checkout -> confirmed booking -> paid WhatsApp notice. This was one real new upload and booking journey, with ordinary product model calls; no ElevenLabs or HeyGen generation was started.

- New unit: `d2CgRyvyx91A5sAh`, [published listing](https://offisio.vercel.app/en/units/d2CgRyvyx91A5sAh). Title: Furnished 1-Room Office on 2nd Floor in New Administrative Capital. Listing/survey/review steps finished. Both English and Arabic listing pages were checked; Arabic uses RTL.
- Booking: `0f71a8d1-c8fa-4823-a1e9-128deeded2f3`, Friday **6 November 2026**, **EGP 800**, no extras. Hosted test checkout returned to a confirmed booking; matching bilingual paid notice arrived on the owner's linked WhatsApp. Synthetic contact details and the documented test card were used. No live payment. The published unit and confirmed test booking remain in place.
- **AC limitation:** the owner explicitly confirmed AC. Saved `Has AC` from false to true. The edit handler (`app/api/units/specs/route.ts` -> `mergeUnitSpecs` in `lib/db/store.ts`) merges top-level specs but does not recompute survey/suitability or queue staging. The new run therefore retained unsuitable reasons and produced no fit concepts. No code was changed. Show `full` as an explicitly identified earlier completed example from the same footage; never imply its renders came from this new run.
- **Chat continuity:** the assistant initially offered the existing `full` listing. The next actual message selected the newly published unit by URL; availability and booking then used that unit. Keep that selection in the edit. This take is typed Arabic, not a voice transcription demonstration. Initial request: “عايز مكتب مفروش في العاصمة الإدارية ليوم ٦ نوفمبر، في حدود ٨٠٠ جنيه.” Subtitle: “I need a furnished office in the New Capital for November 6, around 800 pounds.”
- **Privacy:** target-tab recordings exclude other tabs. The edit page contains a masked owner number; crop/redact it in the final film. WhatsApp evidence is cropped to the paid-confirmation bubble, excluding the private chat sidebar. Do not include sign-in codes, linking codes or full contact details in the edit.

Source ledger (local, ignored directory `.scratch/video/production/`; native AV1 in MP4, silent, 1920x1080; durations rounded):

| File | Seconds | Content |
|---|---:|---|
| `01-upload-to-draft.mp4` | 86.22 | Sample selection, frames, create, processing and draft |
| `02-new-draft-initial-result.mp4` | 47.15 | Initial survey/listing result |
| `03-owner-ac-correction-publish.mp4` | 47.92 | Owner correction, save and successful publish |
| `04-published-listing-ar-rtl.mp4` | 3.09 | Published page / locale transition |
| `04b-ar-listing-details.mp4` | 2.23 | Arabic listing details |
| `05-arabic-chat-new-office-booking.mp4` | 109.66 | Actual typed conversation, unit selection and booking link |
| `06-booking-awaiting-test-payment.mp4` | 34.12 | Booking before payment |
| `07-xpay-test-checkout-confirmation.mp4` | 130.57 | Test checkout, test 3DS, return and confirmation |
| `08-whatsapp-paid-confirmation.png` | — | Cropped actual paid notice |
| `booking-confirmed-proof.mp4` | 15.67 | H.264 / 30 fps confirmation excerpt; silent |

QA: all eight source contact sheets generated successfully under `review/`. Upload, correction/publish, Arabic chat and checkout contact sheets visually inspected; paid-notice crop inspected and matches unit/date/amount/reference. Confirmation proof fully decoded with FFmpeg exit 0, 470 frames, 1920x1080 H.264 at 30 fps. The proof has a 0.9-second container start offset; normalize timestamps during final assembly. These checks do not establish narration sync or final-film quality. Use close crops for chat and confirmation text; the full desktop view is too small at contact-sheet scale. Preserve raw waits and mark shortened processing in the edit.

Next: audition the revised opening in ElevenLabs, generate scene narration, assemble a 175-second edit with the corrected continuity above, add English captions, then inspect every scene boundary and watch the exported film with sound. HeyGen remains optional. Final MP4/SRT/source project and submission-form verification are still pending.

### Post-production result — 2026-11-04

**Local master delivered: 175.000 seconds (2:55), 1920x1080, 30 fps, H.264 High/yuv420p/BT.709, stereo AAC at 48 kHz.** English narration uses ElevenLabs Moaz – Clear Tech Explainer (`InZiH3ygdb9YToEicEjR`, `eleven_v4`); the demo remains the actual Egyptian Arabic typed conversation. A short Offisio/Muse audition and eight scene narrations were generated. The provider returned two takes per generation; selected take IDs, exact prompts and word timestamps are retained locally. The audition was transcribed, but could not be assessed by ear because this session has no audio perception. No HeyGen dependency.

Deliverables in the ignored local `.scratch/video/edit/` folder:

| File | Purpose |
|---|---|
| `offisio-hackathon-175s.mp4` | Captioned master, 9,236,395 bytes |
| `offisio-en.srt` | Separate matching English captions, including translation of the typed Arabic request |
| `narration-master.wav`, `audio/*.mp3` | Normalized full narration mix and eight selected scene stems |
| `render.py`, `narration.json`, `narration-timeline.json`, `timeline.json`, `assets/` | Editable source, scene text, provider alignment, final timing, graphics and staging stills |
| `README.md`, `SHOT-LEDGER.md`, `asset-manifest.json` | Rebuild instructions, all 36 cut/source ranges and source checksums |
| `QA.md`, `verify.py`, `verification.json`, `review/boundaries-*.jpg` | Review limits, measurements and 108 exported boundary-review frames |

- **Continuity:** the film states that the owner-confirmed AC correction did not refresh suitability/staging. The original/empty/fit views come from the verified deployed rehearsal, labelled “Earlier completed example from the same filmed office.” The different local seed JPGs were not substituted. Actual selection of `d2CgRyvyx91A5sAh` by URL remains visible. Payment/confirmation use the existing recorded November 6 / EGP 800 test booking. All retained motion and speech run at 1x; omitted waits are disclosed.
- **Privacy:** owner contact row masked when visible; sign-in/linking codes excluded; only the pre-cropped WhatsApp paid bubble appears. Main checkout contact/card fields are masked. The documented synthetic test card briefly appears after test authentication; TEST MODE stays labelled. Raw captures remain private working files; do not share the source directory as if it were the redacted master.
- **Technical QA:** full encoded audio/video decode passed. All 36 cuts reviewed in 108 first/middle/last frames, with important crops inspected full-size. Captions use provider word timing and exactly match the scene scripts. Measured encoded audio is -16.26 LUFS integrated, -1.34 dBTP, 6.10 LU LRA. Master SHA-256: `736fd68682260a8858e5bc458c9b4128c1a03984d07897d5d43f5196706658ce`.
- **Playback:** reused the local preview task tab. Chrome reached `currentTime=duration=175`, `ended=true`, `readyState=4`, at 1x with `muted=false`, volume 0.7; 5,250 total frames, 18 dropped playback frames, zero corrupted frames, no media error. Focus emulation disabled afterward. This establishes playback, not listening acceptance.
- **Still required:** owner listens through the complete export, particularly Offisio/Muse pronunciation, pacing, sound quality and scene sync. This session cannot hear audio and does not claim full audiovisual/listening QA. Submission-form verification and any later upload remain owner actions outside this task.
- **Scope:** reused existing footage and installed `ffmpeg-static`, Python/Pillow/NumPy; no new dependencies, product code edits, repeat upload/payment, or product model calls. ElevenLabs is post-production only; product AI remains Meta-only. No upload, submission or commit. Only the two plan docs are tracked modifications from this session; media/edit artifacts are ignored.

## Handoff

8.1 is built (2026-11-03). 8.2 polish and 8.3 reviews were recorded done 2026-11-04 (see historical result above). **8.4 recorded, narrated, captioned and rendered locally on 2026-11-04.** The 175-second master, SRT, narration stems and editable source/ledger are in `.scratch/video/edit/`. Visual boundary, decode, duration and browser playback checks passed. **Next: owner performs the full listening review; audio perception was unavailable to this session.** Preserve the disclosed AC-refresh limitation, labelled earlier staging example, actual new-unit selection and typed-Arabic/test-payment continuity in any revisions. No product changes, external upload/submission or commit. Owner handles commits and later submission.

### Owner review and v2 capture checkpoint — 2026-11-04

The owner rejected the first master as too technical and fast, with no meaningful intro/outro, no soundtrack, and too little WhatsApp/voice coverage. The v2 direction is a product showcase: a short animated Offisio logo opening/close; warm female commercial narration; CC-licensed music; longer stable holds and slow transitions for room/listing images; benefit-led copy; no AC limitation beat; a substantial WhatsApp owner-listing plus renter-booking/voice section. The earlier staging example still needs an accurate label, but the limitation explanation is removed.

- Captured a new real WhatsApp renter flow after the owner cleared prior bookings/messages: Egyptian-Arabic voice request -> location prompt/pin -> nearby Pioneer Plaza office with photo -> voice booking request -> coffee/add-on prompt -> voice details -> 30-minute XPay test reservation for EGP 840. It is a reservation, not a paid confirmation.
- Saved six full working frames, then produced eight reusable panels excluding the WhatsApp sidebar, chat header/phone, profile photo and renter location map. They are under `.scratch/video/v2/reusable-assets/screenshots/whatsapp-reservation/` and were visually inspected.
- Preserved original Offisio SVGs and video PNGs in the reusable pack. Generated two Christina (`BuaKXS4Sv1Mccaw3flfU`) female commercial auditions containing “Offisio” and “Muse”, plus two Moaz English renter-request inputs for an optional real web-mic trial. These are external post-production/input assets only; product AI remains Meta-only.
- Downloaded `Cipher` by Kevin MacLeod from its official Incompetech path for the music bed. The local pack includes CC BY 4.0 attribution and source evidence. Do not distribute without the included credit.
- Next user action: send `إلغاء` if WhatsApp has any pending listing state; send the existing <=45-second office walkthrough to Offisio; answer the details request with an Egyptian-Arabic voice note (district, floor, monthly rent and daily price), send the office location pin, and continue through draft-link/publish. Then capture and privacy-crop that real owner-listing exchange before writing the final v2 narration/timeline.
- The first master stays intact for rollback. No new product upload/payment was repeated by the editor, no code or dependency changes, and nothing was uploaded/submitted/committed.

### Product-showcase v2 result - 2026-11-04

**Completed locally:** `.scratch/video/v2/offisio-hackathon-showcase-v2-175s.mp4` is a revised 175.000-second showcase master at 1920x1080/30 fps, H.264 High/yuv420p/BT.709 with AAC LC stereo at 48 kHz. It uses the owner-approved Christina female voice, a CC BY 4.0 music bed, an animated Offisio intro/outro, longer room-image holds, benefit-led copy, burned-in English captions, and a separate SRT.

- The owner sent the WhatsApp listing video and details voice note. The real run reached video receipt, details understood, and listing preparation, but no draft link returned. The film shows only those first states and makes no completion or publish claim for that attempt.
- The WhatsApp renter section uses the new real Egyptian-Arabic voice flow through location-aware office match, office photo, coffee/add-on prompt, follow-up voice details and a held EGP 840 XPay test reservation. It is kept separate from the earlier EGP 800 paid booking used for the checkout/confirmation proof.
- The staging sequence remains explicitly labelled as an earlier completed example from the same filmed office. The rejected AC limitation explanation is not included.
- The full selected-source pack is `.scratch/video/v2/reusable-assets/`: 14 used scene MP4s, designed 1920x1080 PNGs, 13 privacy-safe WhatsApp panels, eight narration stems, auditions, logos, soundtrack, licence and source ledger. Raw full WhatsApp captures are not approved for public reuse.
- Technical QA passed: full encoded audio/video decode; 61 first/middle/last and key-state frames; four contact sheets plus full-size privacy/readability inspection; corrected alpha fades; exact 175-second duration; browser playback at 1x reached `ended=true` with no media error or stall. SHA-256: `8ec8d4ebef915cd9f9c45284a8b8e4b7ba2a11df0ecee70568a50c0c92eadbc8`.
- Audio measures -16.03 LUFS integrated and -1.39 dBTP. This session cannot hear audio, so the owner must still listen to the complete master for voice pronunciation, subjective music balance and final sync. The QA checklist is `.scratch/video/v2/QA.md`.
- Editable deliverables: `render_v2.py`, `timeline.json`, caption sources, narration mix/stems, `SHOT-LEDGER.md`, `README.md`, `verification.json`, SRT and the reusable source pack. The first master in `.scratch/video/edit/` remains preserved for rollback.
- No product code or dependency changed. No upload, external submission, or commit was made. Owner handles the listening decision, repository commits and any later submission.

## Final handoff

8.4 is complete locally. Start with the v2 master and SRT, then use `.scratch/video/v2/reusable-assets/used-segments/` for a manual recut if needed. The only mandatory remaining video action is the owner's full listening review; do not present technical playback as a substitute for hearing the narration and soundtrack. Preserve the truthful WhatsApp processing-state disclosure and all privacy crops in any revision.
