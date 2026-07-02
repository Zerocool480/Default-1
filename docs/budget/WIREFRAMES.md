# Wireframes — Main Screens

**Status:** Draft v0.2 · Low-fi ASCII; layout & hierarchy only. Mobile-first (≈390px);
desktop is the same hierarchy in a two-column arrangement.

---

## 1. Today (default screen)

```
┌─────────────────────────────────────┐
│ Good morning, Alex      ⛁ 91 ▲2    │ ← health chip, tap → score screen
│ Tuesday, July 1 · data as of 6:42a  │
│                                     │
│        Safe to Spend Today          │
│                                     │
│            $47.83                   │ ← hero, tabular numerals
│                                     │
│   ▁▁▂ spent $12 of $60 today ▂▁▁   │
│                                     │
│ ▾ Why this number?                  │
│ ┌─────────────────────────────────┐ │
│ │ Checking available    $2,138.00 │ │
│ │ Bills before Jul 15 ─── −782.00 │ │
│ │ Visa min due Jul 10 ─── −250.00 │ │
│ │ Vacation goal (July) ── −150.00 │ │
│ │ Emergency floor ─────── −500.00 │ │
│ │ $456 ÷ 9 days − $12 spent today │ │
│ └─────────────────────────────────┘ │
│                                     │
│ TODAY'S BRIEFING                    │
│ ┌─────────────────────────────────┐ │
│ │ ✓ Spend freely within today's   │ │
│ │   limit.                        │ │
│ │ Bills covered · Goals on track  │ │
│ │ Emergency fund 74%      ▾ why   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Next 7 days  ▂▃▂▅▂▂▇  Fri: rent    │ ← tap → Calendar
│                                     │
│ ◦ Restaurants at 70% with 12 days   │
│   left — $6/day keeps you under. ✕  │ ← max 2 insight cards
│                                     │
│          ( Can I afford this? )     │ ← FAB, always visible
├─────────────────────────────────────┤
│  Today  Copilot  Plan  Activity  ⚙ │
└─────────────────────────────────────┘
```

Tight day variant: recommendation card turns amber — "Hold off on extra spending:
electric ($84), insurance ($112), and Visa ($250) hit before Friday's paycheck." $0
day: hero shows **"Hold off today"** + 3-day recovery plan, calm red, never a bare
negative.

## 2. Purchase Intelligence (modal, from FAB)

```
┌─────────────────────────────────────┐
│  Can I afford this?              ✕  │
│                                     │
│  What is it?   [ Nintendo Switch 2 ]│
│  Price         [ $449            ]  │
│  Category      [ Fun ▾ ] (optional) │
│                                     │
│              ( Check )              │
│  ─────────────────────────────────  │
│  ✓ Yes, you can afford this.        │
│    Risk: LOW                        │
│                                     │
│  What happens if you buy it:        │
│  ✓ All bills stay fully covered     │
│  ✓ Emergency fund stays above target│
│  → Vacation goal: Sep 12 → Sep 20   │
│  → Daily allowance: $52 → $36/day   │
│    until payday (Jul 15)            │
│                                     │
│  ▾ See 30-day impact chart          │
│                                     │
│  ( I bought it )   ( Skipping it )  │
└─────────────────────────────────────┘
```

Verdict states: **Yes** (green check) / **Tight** ("doable, but…" amber, shows what it
squeezes) / **Not now** (calm red, shows the earliest "yes" date and what changes it).

## 3. Copilot

```
┌─────────────────────────────────────┐
│  Copilot                            │
│ ┌─────────────────────────────────┐ │
│ │ Why did my number change today? │ │ ← suggested prompts
│ │ What should I do with my next   │ │   (from live context:
│ │ paycheck?                       │ │   changed number → offer diff)
│ │ How much can I spend this       │ │
│ │ weekend?                        │ │
│ └─────────────────────────────────┘ │
│                                     │
│  You: Should I pay off debt or      │
│       save more?                    │
│                                     │
│  ◆ Looking at your Visa (22.9% APR, │
│    $1,830 balance) and your         │
│    emergency fund (74% of target):  │
│    the math favors the card — it    │
│    costs ~$35/mo in interest, while │
│    your fund already covers 2.2     │
│    months of essentials.            │
│    Suggestion: keep the $150/mo     │
│    fund contribution, put your      │
│    ~$210/mo surplus on the Visa →   │
│    paid off by November.            │
│    [snapshot Jul 1] [forecast 90d]  │ ← tappable citations,
│                                     │   deep-link to source
│  Decision support, not licensed     │
│  financial advice.                  │ ← persistent, small
│ ┌─────────────────────────────────┐ │
│ │ Ask about your money…       ➤  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 4. Plan → Goals (Financial GPS)

```
┌─────────────────────────────────────┐
│  Goals                        + New │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Emergency Fund            ⛨     │ │
│ │ ██████████████░░░░  78%         │ │
│ │ $3,900 of $5,000                │ │
│ │ ETA: Oct 4   ▁▂▂▃▄▄▅ (moving up)│ │ ← ETA sparkline
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Vacation                  ✈     │ │
│ │ █████████████░░░░░  65%         │ │
│ │ $1,300 of $2,000                │ │
│ │ ETA: Sep 12  (▲5 days this week)│ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ House Down Payment        ⌂     │ │
│ │ ████████░░░░░░░░░░  41%         │ │
│ │ $24,600 of $60,000              │ │
│ │ ETA: Mar 2029 · $100/wk more →  │ │
│ │ Nov 2027   [ simulate ]         │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Goal detail: contribution schedule, ETA history chart, "what moves this date" list.

## 5. Plan → Calendar (cash flow made visual)

```
┌─────────────────────────────────────┐
│  July ◂ ▸        [7d] [30d] [90d]  │
│                                     │
│  M    T    W    T    F    S    S    │
│           1    2    3    4    5     │
│                          +2,350 ⬤  │ ← paycheck
│  6    7    8    9   10   11   12    │
│      −98       −420 −250 −84        │
│      net       mtg  visa elec       │
│ 13   14   15   16   17   18   19    │
│      ⚠︎    +2,350                    │
│      low: $312                      │ ← minimum-balance day
│                                     │
│  Projected balance ────────────     │
│  $2,138 ────╲___╱▔▔╲_____╱▔▔▔      │ ← running line under grid
│                                     │
│  Jul 14 · lowest point: $312        │
│  after mortgage, before payday.     │
│  Safe-to-Spend already accounts     │
│  for this.                          │
└─────────────────────────────────────┘
```

## 6. Plan → Recurring & Subscriptions

```
┌─────────────────────────────────────┐
│  Recurring          [Bills][Subs]   │
│                                     │
│  NEEDS CONFIRMATION (2)             │
│  ◦ Looks like a paycheck:           │
│    $2,350 every other Fri  (✓)(✎)(✕)│
│  ◦ Spotify $11.99 monthly  (✓)(✕)   │
│                                     │
│  SUBSCRIPTIONS         mo/yr        │
│  Netflix     $15.49 · $186/yr       │
│  last charged Jun 28 ·  KEEP        │
│  ─────────────────────────────      │
│  Hulu        $17.99 · $216/yr       │
│  ⚠ price up from $14.99 · REVIEW    │
│  ─────────────────────────────      │
│  VPN Pro     $12.99 · $156/yr       │
│  last charged Jun 2 ·   CANCEL?     │
│  "No charges in 29 days — still     │
│   using it?"                        │
│                                     │
│  Total: $58.46/mo · $701/yr         │
└─────────────────────────────────────┘
```

## 7. Financial Health Score (from the Today chip)

```
┌─────────────────────────────────────┐
│  Financial Health         91 ▲2     │
│  ▁▂▂▃▅▆▇ 90-day trend               │
│                                     │
│  Why it changed:                    │
│  ▲ Emergency fund crossed 70%  (+2) │
│                                     │
│  Cash Flow          94  ▬▬▬▬▬▬▬▬▬░  │
│  Emergency Fund     74  ▬▬▬▬▬▬▬░░░  │
│  Debt               82  ▬▬▬▬▬▬▬▬░░  │
│  Bills             100  ▬▬▬▬▬▬▬▬▬▬  │
│  Discipline         88  ▬▬▬▬▬▬▬▬▬░  │
│  Savings Rate       85  ▬▬▬▬▬▬▬▬▬░  │
│  Goal Progress      95  ▬▬▬▬▬▬▬▬▬▬  │
│  Net Worth Trend    79  ▬▬▬▬▬▬▬▬░░  │
│                                     │
│  ▾ tap any row for its reasons      │
└─────────────────────────────────────┘
```

## 8. Activity

```
┌─────────────────────────────────────┐
│  Activity            [search] [⌄]   │
│                                     │
│  ⚠ 3 transactions need a category → │ ← review queue, pinned
│                                     │
│  TODAY · $12.80 of $60 discretionary│
│  ◦ Blue Bottle Coffee   −$6.40  ☕  │
│  ◦ Lyft (pending)       −$6.40  🚗 │ ← ghosted, "pending" chip
│                                     │
│  MON JUN 30 · $38.20 of $60         │
│  ◦ Trader Joe's        −$31.80  🛒 │
│  ◦ Steam                −$6.40  🎮 │
│                                     │
│  [txn tap → sheet: category ▾,      │
│   "always categorize like this" ☐,  │
│   exclude from engine ☐, link bill] │
└─────────────────────────────────────┘
```

## 9. Morning briefing notification (email/push, opt-in)

```
SafeSpend · Good morning ☀
Health 91 ▲ · Safe to spend today: $47.83
Bills covered · Goals on track · EF 74%
Recommendation: spend freely within limit.
→ open for the full picture
```

One notification per day, ever. All other communication is in-app.
