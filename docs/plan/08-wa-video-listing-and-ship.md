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

Open items:
- Owner phone run after deploy (video, pin, details, link, publish); it also measures the real Graph download and Blob upload times against the ~105 s budget.
- Blob cleanup on expiry: expired or cancelled drafts keep their video and frames (`lib/blob` has no delete helper).
- QStash final retry: if analyze/listing fails on its last QStash retry, the owner is not told; only "status" finds the failed unit and expires the draft.

## 8.2 UI/UX and translation polish (before recording)

Do a full pass in EN (LTR) and AR (RTL), desktop and phone width (Playwright resize 390x844), on: home, unit page (demo + draft), edit page, upload (incl. sample walkthrough), login, chat (typing, 📍, mic, errors), booking + test-card checkout, booking page after payment, privacy/legal pages. Known items:
- Arabic replies from the agent sometimes include English words ("layout", "long-term", "meeting"): tighten `AGENT_PROMPT_V9` language rule (prompt bump to V10, rerun `pnpm chat-acceptance` fully once — paid, ask first).
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

## 8.4 Video prep (3 minutes, record Nov 3–4)

Story (depth over breadth): owner films an office -> AI survey, rubric "Suitable for", bilingual listing, AI listing review with one-click fixes, staging renders -> publish with WhatsApp -> renter asks "near me" in Egyptian Arabic (voice note on WhatsApp and web mic) -> books and pays in XPay test mode -> confirmation on WhatsApp. Mention: Meta models only (Muse Spark, Muse Image, Muse Voice Transcribe), PII routing, AR/EN RTL. No menus, no SAM. Keep a written shot list in this file before recording; use demo data and the owner's own phone/number only.

## Handoff

8.1 is built (2026-11-03, uncommitted). Next: the owner commits, deploys and runs the phone check (8.1 Open items), then 8.2 polish.
