# UX Design — Navigation, Flows, and Voice

**Status:** Draft v0.2 (financial-OS scope) · Wireframes in `WIREFRAMES.md`

Design stance: **calm, confident, coaching.** The interface surfaces the most important
thing first and explains why — never a wall of charts. It should feel like a
level-headed friend who's good with money: not a trading terminal, not a guilt machine.

---

## 1. Navigation

```
┌─ Today        — Daily Briefing + Safe to Spend (default screen)
├─ Copilot      — chat: ask anything about your money
├─ Plan         — Goals (GPS) · Budgets · Recurring & Subscriptions · Calendar/Forecast
├─ Activity     — transactions, review queue
└─ Settings     — connections, floor, payday, AI & notifications, profile
```

Five tabs (bottom bar on mobile, left rail on desktop). Two cross-cutting entry points
float above the tabs:

- **"Can I afford this?"** — a prominent action button (FAB on mobile) available from
  anywhere; opens Purchase Intelligence. This is the standing-in-a-store moment and
  must never be more than one tap away.
- **Simulate** — reachable from Copilot ("what if…"), from Plan (goal sliders), and
  from Purchase Intelligence ("see full impact").

Responsive PWA, mobile-first, dark mode from day one.

## 2. Screen inventory (wireframes in WIREFRAMES.md)

| Screen | Job | Leads with |
|---|---|---|
| **Today** | The daily answer + briefing | Safe to Spend number; briefing card; health score chip; "why?" expanders |
| **Copilot** | Answer any money question | Chat with suggested prompts; every figure cited to a snapshot/forecast/scenario |
| **Purchase Intelligence** (modal) | Verdict on a specific purchase | Yes / Tight / Not now + impact list + risk level |
| **Plan → Goals** | Goal GPS | % complete + ETA date per goal; ETA sparkline |
| **Plan → Budgets** | Category limits | Time-adjusted pace bars ("on pace"/"hot") |
| **Plan → Recurring** | Bills, subscriptions, income | Confirm queue; subscriptions table with Keep/Review/Cancel |
| **Plan → Calendar** | Future cash flow | Month grid of dated events + projected running balance; minimum-balance day highlighted |
| **Activity** | Transactions + corrections | Day groups with discretionary subtotals; review queue pinned |
| **Settings** | Trust & control | Connections w/ sync status; floor; payday; AI toggle; forecast-accuracy chart |

## 3. Key flows

### Onboarding (the trust-building 5 minutes)
1. Register → 2. Connect first institution (Plaid Link) → 3. Sync with progress
("found 4 accounts, 312 transactions") → 4. **Confirm income** ("Looks like your
paycheck: $2,140 every other Friday — right?") → 5. Confirm top bills → 6. Set
emergency floor (default $500, explained) → 7. Optional first goal → 8. **Reveal**:
annotated walkthrough of the number, then the first briefing.
Income confirmation precedes the reveal — the period boundary is what makes the number
credible.

### Daily loop (the habit, <30s)
Morning notification → open Today → read briefing + number → maybe expand a "why" →
maybe clear review queue → done. Everything else is pull, not push.

### Purchase decision (the differentiator, <10s)
Anywhere → "Can I afford this?" → amount (+optional category) → verdict + impact +
risk → **"I bought it"** (logs planned transaction; number updates now; reconciled on
sync) or **"Skipping it"** (positive reinforcement: "+5 days sooner to Vacation").

### Correction loop (the learning)
Wrong category → two-tap fix → "always categorize [Merchant] like this?" → rule →
review queue shrinks over weeks → trust compounds.

### Copilot session
Open Copilot → suggested prompts ("Why did my number change today?", "What should I do
with my next paycheck?") → streamed answer with tappable citations that deep-link to
the underlying screen (snapshot breakdown, forecast day, goal). Copilot proposes
actions but only deep-links — it never mutates data in v1.

## 4. Explainability as a UI pattern

One consistent affordance everywhere: **any number or verdict can be tapped to expand
its "why"** — engine line items, score reasons, ETA math, recommendation facts,
copilot citations. Same component, same interaction, learned once. This is the
product's personality in UI form.

## 5. Voice & tone

| Situation | ❌ Not this | ✅ This |
|---|---|---|
| Over budget | "You blew your restaurant budget." | "Restaurants are done for the month — the number now leans on other categories." |
| $0 day | "$-23.40" | "Hold off today — here's the 3-day path back to green." |
| Underspend | (silence) | "You spent $18 under yesterday. Today's number went up." |
| Big purchase | "Are you sure??" | "Doable — it costs $9.80/day until payday. Your call." |
| Trend warning | "You keep overspending on Fridays." | "Fridays run ~$22 hotter than average. Planning for it keeps the rest of the week steady." |
| Goal slipping | "You'll miss your goal." | "At this pace, Christmas fund lands Jan 9. An extra $35/mo brings it back to Dec 20." |

Rules: forward-looking, quantified, dismissible, max 2–3 active nudges, numbers never
hidden to spare feelings — framing is always *what to do next*. The copilot inherits
this voice via system prompt; the briefing via templates.

## 6. Visual system

- Typography-led; the number is the hero (tabular numerals, ~64px). Neutral palette,
  one accent; amber/red reserved for state meaning (tight / hold-off).
- Health score shown as a small chip (91) with trend arrow — deliberately not a big
  gauge; the score explains, it doesn't dominate.
- Charts (ETA sparklines, pace bars, forecast curves, calendar balance line) via
  Recharts, built per the dataviz skill's system: minimal axes, no chart junk.
- Currency renders from decimal strings — no float math in the UI either.
