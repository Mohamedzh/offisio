---
target: "live homepage https://offisio.vercel.app/en"
total_score: 15
max_score: 28
na_heuristics: 5,7,9
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Projects\\Meta Hackathon\\offisio\\app\\[lang]\\page.tsx"
target_fingerprint: "sha256:3c009f707933bd6864ca0bcb4fa0d602b9c6f2d74fdbfe7d647f190c781b2313"
target_path: "C:\\Projects\\Meta Hackathon\\offisio\\app\\[lang]\\page.tsx"
timestamp: 2026-10-28T14-43-23Z
slug: app-lang-page-tsx
---
# Critique — live homepage https://offisio.vercel.app/en (app/[lang]/page.tsx)

Method: dual-agent (A: design review 01a182f1-e2a7-7980-ba6c-216e3ad0d192 · B: detector/browser 01a182f1-e4d2-7e72-bbb7-20a96e67588b), plus parent live screenshots (desktop + 390px mobile).

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No feedback/status cues on landing |
| 2 | Match system / real world | 3 | Plain bilingual copy, Egyptian dialect |
| 3 | User control & freedom | 2 | Browse/chat/list compete; no single path |
| 4 | Consistency & standards | 2 | Price/district swap positions featured vs grid |
| 5 | Error prevention | n/a | No input on surface |
| 6 | Recognition rather than recall | 1 | Cards lack specs; comparison needs memorising |
| 7 | Flexibility & efficiency | n/a | Persuade surface |
| 8 | Aesthetic & minimalist design | 3 | Coherent Torn Layers system |
| 9 | Error recovery | n/a | No input on surface |
| 10 | Help & documentation | 2 | How-it-works present but owner-first order |
| **Total** | | **15/28** | Fair — strong skin, weak decision data |

## Design specificity verdict

Ownable torn-paper/board system (dotted board, ink-offset sheets, brick/chalk/mustard, Cairo black), but inventory reads generic: 3 units, all "Cairo", all EGP 10,000/mo. Detector (live /en): 4 findings — all-caps-body (warning, real: 106-char sentence in 11px uppercase at page.tsx realNote badge), unbalanced-heading (advisory, confirmed on mobile screenshot), em-dash-overuse (advisory), organic-clip-path (warning, false positive: intentional .torn-b divider). Source scan of page.tsx: [] (regex-only, undercount).

## What's working

- Honesty as design: decorative art badged in both locales; fit concepts labelled not-current-state.
- Coherent bilingual RTL/LTR system, reduced-motion respected.
- Live provenance: 5/5 pages 200, 16/16 Blob media HEAD 200, zero local listing image sources.

## Priority issues

- [P1] Fake-looking inventory: all Cairo / EGP 10,000 contradicts "real offices". Fix: varied districts/prices in seed or present as demo set explicitly.
- [P1] Undecidable cards: no area/desks/floor/availability on cards. Fix: one spec line per card from existing specs fields.
- [P1] Mixed audiences above the fold: Browse + Chat + List compete. Fix: Browse sole hero CTA; demote List to link; owner block at bottom.
- [P2] Featured tear-stack unexplained; listing images alt="". Fix: Real/Emptied labels on featured card; factual localised alt text.
- [P2] Mobile headline breaks mid-phrase ("See / how it could fit"); header nav wraps awkwardly at 390px. Fix: balance heading, tighten mobile header.

## Persona red flags

- Egyptian renter (mobile): owner-process explainer before any office; "Cairo" too coarse; exits at second identical card.
- Office owner: no fees/process/privacy answers despite List CTAs.
- Hackathon judge: identical seed pricing invites "is any of this real?"; no Meta-AI attribution above fold.

## Minor observations

- Decorative disclaimer repeated 3x (hero badge, realNote, footer); realNote set in 11px all-caps.
- Hero + featured both priority images — competing LCP; demote featured.
- Console errors unverified (no JS console capture in B's environment).
