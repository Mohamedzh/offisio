# Demo video script (3:00 max)

English narration (TTS). Arabic stays on screen with English subtitles. ~390 words total.
Record each segment as a separate clip; speed up or cut every wait.

Prep: browser zoom 125%, clean Chrome profile, WhatsApp Desktop logged in, a free day on
`gen-alex-chatby`, one pre-processed draft ready in case the live run is slow, the friend's
5 s Egyptian-Arabic voice notes recorded in advance.

---

## 1. Hook (0:00-0:12)

**Narration**
> In Egypt, listing an office means photos, measurements, and ads in two languages. Booking one means endless phone calls. Offisio fixes both, with Meta's Muse models.

**On screen**: homepage, slow scroll over listings -> title card "Offisio - Film it. List it. Book it."

## 2. Owner, web upload (0:12-0:50)

**Narration**
> An owner films a short walkthrough on their phone and uploads it. No account needed. Muse Spark watches the video, surveys every room, notes windows and plumbing, and decides what the space fits: office, coworking, clinic, or law firm. It writes the specs and a listing in English and Egyptian Arabic, then proofreads its own copy. Muse Image empties the rooms and restages them for each use. And the whole site works in Arabic, right to left.

**On screen**
1. `/upload` -> drop the walkthrough (or "Try it with a sample walkthrough") -> Submit.
2. Pipeline progress at 8x speed.
3. Draft page: specs, use rubric (passing uses with reasons), bilingual listing.
4. AI review issues -> click "apply fixes".
5. Before / empty / fit-out renders side by side (hold 2-3 s each).
6. Toggle عربي -> page mirrors RTL (2 s) -> back to English.

## 3. Owner, WhatsApp listing + sign-in (0:50-1:22)

**Narration**
> Owners can also do all of this from WhatsApp. Send the video, drop a location pin, and say the rent in a voice note. The bot only asks for what's missing, runs the same pipeline, and sends a one-time link to the draft. Reply "publish", and it's live. Sign-in is WhatsApp too: a one-time code, confirmed with YES. No passwords.

**On screen** (WhatsApp Desktop)
1. Send the video -> send a location pin.
2. Voice note (Arabic) -> bot reply shows what it heard.
   Subtitle: *"Rent is 15,000 a month, third floor, Smouha."* (match what is actually said)
3. Bot sends the link -> click it -> draft opens signed in.
4. Type `انشر` -> bot confirms -> listing visible on the site.
5. Quick cut: `/login` code -> `Offisio login XXXX-XXXX` -> `YES` -> page signs in.

## 4. Renter, web chat (1:22-2:05)

**Narration**
> Renters just chat, in English or in Egyptian Arabic. Tap the mic and speak. Muse Voice transcribes it, and the agent searches real availability. Share your location, and it finds offices near you, without ever sending your coordinates to the model. It suggests nearby cafés from Google Maps, adds house coffee to a day booking, quotes the total, and sends a payment link. The booking confirms only when the signed payment webhook arrives.

**On screen**
1. Chat -> tap mic -> Arabic voice note -> transcript appears.
   Subtitle: *"I want an office tomorrow for one day."*
2. Tap 📍 -> "near me" results with distances.
3. Agent mentions nearby cafés; renter adds coffee.
   Subtitle every Arabic bubble in English.
4. Payment link -> XPay checkout (TEST MODE banner visible) -> card `5123 4500 0000 0008`, expiry `01/39` -> 3DS Submit.
5. Booking page: `awaiting_payment` -> flips to **confirmed** (cut the wait).

## 5. Renter, WhatsApp booking (2:05-2:30)

**Narration**
> The same agent books over WhatsApp. Send a voice note, get an office, pay, and get a confirmation. Ask "what are my bookings", and it lists them, with payment links for anything unpaid.

**On screen**
1. Voice note `عايز مكتب بكرة في مدينة نصر` -> "what we heard" -> unit offered.
   Subtitle: *"I want an office tomorrow in Nasr City."*
2. Email -> payment link -> (cut) paid notice arrives.
3. "what are my bookings" -> list with statuses.

## 6. Under the hood (2:30-2:50)

**Narration**
> Every AI call in Offisio goes to Meta models. Anything personal, like names, phones, chats and voice notes, is routed only to Muse Spark, never to a training model. Model output is validated JSON before any code uses it.

**On screen**: simple diagram card:

```
Video / frames / specs  ->  muse-spark-1.3 + muse-image-1.0
Chat, names, phones     ->  muse-spark-1.3 only (never contributor)
Voice notes             ->  muse-voice-transcribe-1.0 -> muse-spark-1.3
All outputs             ->  JSON schema validation
```

Optional 2 s flash: `lib/meta/` code with `meta.product` / `meta.nonPii`.

## 7. Outro (2:50-3:00)

**Narration**
> Offisio. Film it, list it, book it. Try it at offisio dot vercel dot app.

**On screen**: logo, `offisio.vercel.app`, GitHub repo URL, "Built solo for the Meta Global AI Developer Hackathon".
