# UX Design — Screens, Flows, and Voice

**Status:** Draft for review

Design stance: **calm, confident, coaching.** One number, generous whitespace, no wall
of charts. The app should feel like a level-headed friend who's good with money, not a
trading terminal and not a guilt machine.

---

## 1. Information architecture

```
┌─ Today (default screen — THE number)
├─ Activity        (transactions, review queue)
├─ Plan            (budgets · goals · recurring/bills)
├─ Simulate        (purchase & savings what-ifs)
└─ Settings        (accounts/connections, floor, payday, profile)
```

Five destinations, bottom tab bar on mobile / left rail on desktop. Responsive PWA,
mobile-first layouts — the "can I afford this?" moment happens standing in a store.

---

## 2. Screen: Today (the product)

```
┌─────────────────────────────────────────┐
│  Tuesday, July 1        data as of 7:42a│
│                                         │
│         Safe to Spend Today             │
│                                         │
│              $47.20                     │  ← huge. the whole point.
│                                         │
│   ▁▁▂ spent $12.80 of $60 today ▂▁▁    │  ← subtle progress, not a gauge
│                                         │
│   ▾ Why this number?                    │
│   ┌───────────────────────────────────┐ │
│   │ Checking available      $2,310.00 │ │
│   │ Bills before Jul 15 ──── −$980.00 │ │
│   │ Visa payment due Jul 10  −$250.00 │ │
│   │ Vacation goal (July)     −$150.00 │ │
│   │ Emergency floor          −$500.00 │ │
│   │ ─────────────────────────────────  │ │
│   │ $430 left ÷ 9 days to payday      │ │
│   └───────────────────────────────────┘ │
│                                         │
│   Next 7 days ▂▃▂▅▂▂▇  (Fri: rent)     │
│                                         │
│   ◦ Restaurants at 70% with 12 days    │
│     left — pace: $6/day keeps you under.│
│                                    [✕]  │
└─────────────────────────────────────────┘
```

Rules for this screen:

- The number renders in **<1s** from the latest snapshot; recompute happens in the
  background and animates in if it changed.
- **Color = state, used sparingly.** Comfortable (default ink), tight (amber), $0/recovery
  (calm red — with a recovery plan, never just a red zero).
- "Why this number?" is one tap, always available, always matches the snapshot exactly.
- Max 2 insight cards. Dismissible. Forward-looking phrasing only.
- Data age always visible; tap to force refresh.
- If the pool is $0/negative: headline becomes **"Hold off today"** + "You're $86 short
  for the next 9 days. Skipping $10/day gets you back on track by Friday." Coach, not shame.

---

## 3. Screen: Activity

- Reverse-chronological transactions, grouped by day, with daily discretionary subtotal
  ("Mon · $38.20 of $60").
- Pending transactions shown ghosted with a `pending` chip — visibly already counted.
- Tap a transaction → detail sheet: change category (typeahead), toggle
  "always categorize [Merchant] like this" (writes a rule), exclude from engine
  (transfer/reimbursement), link to a bill/stream.
- **Review queue** pinned at top when non-empty: "3 transactions need a category."
  Clearing it is a 10-second daily ritual, and it's the engine's data-quality valve.

## 4. Screen: Plan

Three tabs:

- **Budgets** — per-category monthly limits with pace bars ("on pace" / "hot"), where
  the bar shows *time-adjusted* pace (70% spent at 60% of month = amber, not red).
- **Goals** — cards: name, progress ring, `$X/mo`, projected completion date. The
  projected date is live — it moves when spending behavior changes, which is the
  motivating feedback loop.
- **Recurring** — detected bills/subscriptions/income awaiting confirmation
  (`Looks like Netflix, $15.49 monthly — confirm?`), the confirmed list sorted by next
  due date, price-increase flags, and paycheck streams (which define the engine period,
  so confirming income is part of onboarding).

## 5. Screen: Simulate

Two modes, both powered by the same pure engine (no writes, instantly reversible):

- **"Can I buy this?"** — enter amount (+ optional category/date) →
  `Buying this drops your daily allowance from $47 → $35 until Jul 15.` +
  30-day mini-chart of with/without curves + goal-date deltas
  (`Vacation: Aug 12 → Aug 17`). Two buttons: **"I bought it"** (logs a planned
  transaction so the number updates *now*, reconciled when the real txn syncs) and
  **"Skipping it"** (positive reinforcement: "+5 days sooner to Vacation 🎉").
- **"What if I save more?"** — adjust a goal's monthly contribution with a slider →
  live-updated completion date and new daily allowance.

## 6. Screen: Settings

Connections (institution list, sync status, re-auth banner when `login_required`,
add via Plaid Link), account toggles (`include in cash pool`), emergency floor,
payday/period strategy, timezone, profile/security.

---

## 7. Key flows

### Onboarding (the trust-building 5 minutes)
1. Register → 2. Connect first institution (Plaid Link) → 3. Sync runs with progress
   ("found 4 accounts, 312 transactions") → 4. **Confirm income**: "This looks like your
   paycheck: $2,140 every other Friday — right?" → 5. Confirm top detected bills →
   6. Set emergency floor (default $500, explained) → 7. Optional first goal →
   8. **Reveal the number** with a one-time annotated walkthrough of the breakdown.

Order matters: income confirmation before the reveal, because the period boundary is
what makes the number credible.

### Daily loop (the habit)
Open app → see number → maybe expand "why" → maybe clear review queue → done in <30s.

### Correction loop (the learning)
Wrong category → fix in two taps → "apply to all Starbucks?" → rule created → future
transactions auto-correct → review queue shrinks over weeks. Trust compounds.

---

## 8. Voice & tone

| Situation | ❌ Not this | ✅ This |
|---|---|---|
| Over budget | "You blew your restaurant budget." | "Restaurants are done for the month — the number now leans on your other categories." |
| $0 day | "$-23.40" | "Hold off today — here's the 3-day path back to green." |
| Underspend | (silence) | "You spent $18 under yesterday. Today's number went up." |
| Big purchase | "Are you sure??" | "Doable — it costs $9.80/day until payday. Your call." |

Numbers are never hidden to spare feelings; framing is always *what to do next*.

---

## 9. Component & visual notes

- Tailwind + Radix (in repo). Typography-led: the number is the hero (tabular numerals,
  ~64px). Neutral palette, one accent; amber/red reserved for state meaning.
- Charts (sparklines, pace bars, simulate curves) via Recharts, per the dataviz skill's
  system when we build them: minimal axes, no chart junk.
- Dark mode from day one (evening check-ins are a core moment).
- Currency renders from decimal strings — never float math in the UI either.
