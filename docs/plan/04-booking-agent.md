# Segment 4 — Booking agent + chat

Status: stub · Depends on: Segment 2

Goal: Renter chats in Egyptian Arabic → agent searches, checks availability, books atomically, confirms. Voice note is stretch, only after text chat passes.

Scope: `lib/agent` (prompt, 4 tools, loop) from [DESIGN.md §5](../DESIGN.md), `/chat` UI (generic messaging style, AR RTL default), availability seeding, booking race test. Voice (`muse-voice-transcribe-1.0`) only if U5 passes.
Not in scope: payments, discounts, WhatsApp integration.

Tasks: _detailed at Checkpoint 2._
Acceptance: 10 scripted Arabic conversations incl. slot-taken and no-results cases pass; double-book attempt fails atomically.

Decisions: —
Handoff: —
