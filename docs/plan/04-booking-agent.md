# Segment 4 — Booking agent + chat (+ payments, add-ons)

Status: **done for demo scope** (2026-10-27). Depends on: Segment 2.

Goal: renter chats in Egyptian Arabic → agent searches, checks availability, books atomically, confirms.

Done:
- Booking service `lib/booking.ts`: Egyptian mobile validation, hourly slots flipped atomically per day (double-book → `SLOT_TAKEN`, verified live against Neon), failed payment releases slots.
- Chat agent `lib/agent/agent.ts` + `/chat`: `muse-spark-1.3` via `meta.product` only (PII rule), structured JSON actions validated in code, history in `chat_sessions`. Live test: offered furnished unit for tomorrow, excluded bare units from daily, noted cappuccinos, asked name/phone.
- **3-track catalog (adopted):** furnished = daily (EGP 800/day demo) + monthly; semifinished = long-term only. Hourly 4–6h min is Phase 2 (hourly slots exist underneath, priced daily in v1).
- **Paymob test mode (scope change, owner-approved):** `lib/paymob.ts` real auth→order→payment-key→iframe flow; booking confirms ONLY on HMAC-verified webhook (`app/api/payments/webhook`). Verified: bad HMAC 401, good HMAC confirmed. Needs owner's `PAYMOB_*` test keys in `.env.local` (checkout otherwise returns an honest 503 setup message).
- **Add-ons Option A:** curated cafe menu (public Elmenus prices) in `lib/addons/catalog.ts`; on confirmation a prefilled WhatsApp order goes to `CAFE_WHATSAPP_NUMBER` (owner's own line). No marketplace search/order API exists for Egypt (MealMe is US/CA only; Talabat is vendor-side). Apify menu scraper = future menu-refresh tool, not ordering.
- Voice (U5): not started; stretch only.

Acceptance evidence: production build passes; E2E on Neon — units API, booking create (EGP 930 = 800 + 2×65), `SLOT_TAKEN`, webhook confirm, WhatsApp URL present, all pages 200.

Next:
- Owner to add Paymob test keys + real `CAFE_WHATSAPP_NUMBER`, then one real test-card checkout.
- 10 scripted Arabic conversations incl. slot-taken/no-results (segment acceptance) — only ad-hoc turns tested so far.
Handoff: fresh session starts at `docs/PLAN.md`; server runs `pnpm build && pnpm start` (or `pnpm dev`).
