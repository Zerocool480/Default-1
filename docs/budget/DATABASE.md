# Database Schema

**Status:** Draft for review · PostgreSQL via Drizzle ORM

Conventions: `uuid` PKs (`gen_random_uuid()`), `numeric(14,2)` for money (never float),
`timestamptz` timestamps, `user_id` on every user-owned table (multi-user-ready),
soft external IDs (`plaid_*`) kept alongside our IDs, raw provider payloads stashed in
`jsonb` for reprocessing.

---

## Entity relationship overview

```
users ─┬─ plaid_items ──── accounts ──── transactions ──── (category)
       ├─ categories (per-user taxonomy, seeded from defaults)
       ├─ category_rules            ← learned from user corrections
       ├─ recurring_streams         ← detected bills/subscriptions/income
       ├─ budgets (category limits, monthly)
       ├─ goals ─┬─ goal_contributions
       │         └─ goal_eta_history        ← Goal GPS arrival-date trail
       ├─ engine_snapshots          ← every Safe-to-Spend computation
       ├─ score_snapshots           ← daily Financial Health Score + reasons
       ├─ briefings                 ← each morning's briefing, as delivered
       ├─ forecast_checks           ← forecast-vs-actual accuracy telemetry
       ├─ copilot_conversations ── copilot_messages
       ├─ insights                  ← active nudges
       └─ user_settings             ← emergency floor, payday, timezone
plaid_webhook_events                ← raw webhook audit log

(The cash-flow forecast itself is NOT stored as rows — it is recomputed on demand
from streams/liabilities/balances (pure function, ADR-1/ADR-7); only its accuracy
checks and the artifacts derived from it (ETAs, briefing warnings) persist.)
```

---

## Tables

### users
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| email | text unique not null | |
| password_hash | text not null | bcrypt |
| created_at | timestamptz default now() | |

### user_settings  (1:1 with users)
| column | type | notes |
|---|---|---|
| user_id | uuid PK → users | |
| timezone | text default 'America/New_York' | midnight rollover boundary |
| emergency_floor | numeric(14,2) default 500.00 | cash never counted as spendable |
| period_strategy | text default 'next_income' | `next_income` \| `calendar_month` |
| currency | text default 'USD' | future-proofing |

### plaid_items  (one connected institution login)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| provider | text default 'plaid' | BankProvider key (`plaid`, `manual`, …) |
| plaid_item_id | text unique | |
| access_token_enc | text | AES-256-GCM ciphertext; never selected by API queries |
| institution_id / institution_name | text | |
| status | text default 'active' | `active` \| `login_required` \| `error` \| `disconnected` |
| sync_cursor | text | /transactions/sync cursor |
| last_synced_at | timestamptz | drives "data as of…" UI |
| created_at | timestamptz | |

### accounts
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | denormalized for cheap scoping |
| item_id | uuid → plaid_items | |
| plaid_account_id | text unique | |
| name / official_name | text | |
| type | text | `depository` \| `credit` \| `loan` \| `investment` |
| subtype | text | `checking`, `savings`, `credit card`, `mortgage`… |
| mask | text | last 4 |
| current_balance | numeric(14,2) | |
| available_balance | numeric(14,2) | **engine uses this for cash accounts** |
| credit_limit | numeric(14,2) | credit accounts |
| include_in_cash_pool | boolean | default: true for checking, false otherwise |
| is_hidden | boolean default false | |
| balances_updated_at | timestamptz | |

### transactions
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| account_id | uuid → accounts | |
| plaid_transaction_id | text unique | idempotent upsert key |
| pending_plaid_id | text | links posted txn to its pending predecessor |
| amount | numeric(14,2) | signed; positive = outflow (Plaid convention) |
| date | date | posted date |
| authorized_date | date | |
| merchant_name / name | text | |
| category_id | uuid → categories | resolved category |
| category_source | text | `rule` \| `plaid` \| `ai` \| `user` \| `none` |
| plaid_pfc_primary / plaid_pfc_detailed | text | Plaid's own categorization, kept |
| is_pending | boolean | pending counts against Safe-to-Spend immediately |
| source | text default 'plaid' | `plaid` \| `manual` \| `planned` — "I bought it" simulator entries are `planned` and reconciled (merged) when the matching synced txn arrives |
| is_recurring | boolean + recurring_stream_id uuid → recurring_streams | |
| exclude_from_engine | boolean default false | transfers, reimbursements |
| raw | jsonb | full Plaid payload for reprocessing |
| created_at / updated_at | timestamptz | |

Indexes: `(user_id, date desc)`, `(account_id, date desc)`, `(user_id, category_id, date)`,
unique `(plaid_transaction_id)`.

### categories  (seeded per user from a default taxonomy; editable)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| name | text | "Restaurants", "Groceries"… |
| parent_id | uuid → categories | one level of nesting max |
| kind | text | `spending` \| `income` \| `transfer` \| `savings` |
| is_discretionary | boolean | **drives `spentToday` in the engine** |
| icon / color | text | UI |

### category_rules  (the learning loop)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| matcher_type | text | `merchant_exact` \| `merchant_contains` \| `plaid_detailed` |
| matcher_value | text | normalized merchant string or PFC code |
| category_id | uuid → categories | |
| priority | int default 100 | user-created corrections get lower number = higher priority |
| hit_count | int default 0 | telemetry: prune dead rules later |
| created_from_transaction_id | uuid | provenance |

### recurring_streams  (bills, subscriptions, income)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| account_id | uuid → accounts | |
| plaid_stream_id | text | if sourced from Plaid recurring API |
| direction | text | `inflow` (paycheck) \| `outflow` (bill) |
| merchant_name / description | text | |
| category_id | uuid → categories | |
| frequency | text | `weekly` \| `biweekly` \| `semi_monthly` \| `monthly` \| `annual` \| `irregular` |
| average_amount / last_amount | numeric(14,2) | price-change detection = last vs. average |
| next_expected_date | date | **paycheck streams define the engine period; bill streams feed obligations** |
| status | text | `detected` \| `confirmed` \| `dismissed` \| `ended` |
| is_essential | boolean | rent=true, Netflix=false; future "crunch mode" lever |
| updated_at | timestamptz | |

### liabilities  (credit card / loan detail from Plaid Liabilities)
| column | type | notes |
|---|---|---|
| account_id | uuid PK → accounts | 1:1 extension of credit/loan accounts |
| min_payment | numeric(14,2) | feeds obligations |
| next_due_date | date | |
| last_statement_balance | numeric(14,2) | |
| apr | numeric(6,3) | future: debt payoff optimizer |
| updated_at | timestamptz | |

### budgets  (monthly category limits)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| category_id | uuid → categories | unique `(user_id, category_id)` |
| monthly_limit | numeric(14,2) | |
| rollover | boolean default false | unused budget carries to next month (v1.x) |

### goals
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| name | text | "Vacation", "Emergency fund", "House down payment" |
| target_amount | numeric(14,2) | |
| target_date | date | nullable (open-ended) |
| funded_amount | numeric(14,2) default 0 | |
| monthly_contribution | numeric(14,2) | scheduled amount → engine `goalReserve` |
| linked_account_id | uuid → accounts | optional: a real savings account tracks it |
| priority | int | ordering when pool can't cover all goals |
| status | text | `active` \| `paused` \| `completed` |

### goal_contributions
| id uuid PK · goal_id → goals · amount numeric(14,2) · date date · transaction_id uuid nullable |

### engine_snapshots  (ADR-2: every computation persisted)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| computed_at | timestamptz | |
| for_date | date | user-local day this number applies to |
| safe_to_spend | numeric(14,2) | **the number** |
| daily_allowance | numeric(14,2) | before today's spending subtracted |
| discretionary_pool | numeric(14,2) | |
| days_left | int | |
| period_end | date | next paycheck / month end |
| line_items | jsonb | ordered `{label, amount, kind, refs}` — renders the "why" |
| inputs_hash | text | skip persisting no-op recomputes |
| trigger | text | `sync` \| `webhook` \| `rollover` \| `manual` \| `settings` \| `txn_edit` |

Index: `(user_id, for_date desc, computed_at desc)` — dashboard reads latest row.

### score_snapshots  (Financial Health Score, PRD §8)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| for_date | date | one per day (+ material-change recomputes) |
| total | int | 0–100 composite |
| sub_scores | jsonb | `{cash_flow: {score, weight, reasons[]}, emergency_fund: …}` — 8 pillars, each with its reasons list |
| delta_reasons | jsonb | attribution vs. previous snapshot ("Visa utilization crossed 30%") |
| computed_at | timestamptz | |

Index: `(user_id, for_date desc)`.

### goal_eta_history  (Goal GPS trail, PRD §6)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| goal_id | uuid → goals | |
| computed_at | timestamptz | |
| eta_date | date | estimated arrival date at this moment |
| percent_complete | numeric(5,2) | |
| trigger | text | what moved it (`sync` \| `txn` \| `contribution` \| `settings`) |

The ETA-over-time sparkline (the most motivating chart in the app) reads this table.
Material moves (>2 days) also emit an `insights` row.

### briefings  (Daily Briefing, PRD §5 — stored exactly as delivered)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users | |
| for_date | date | unique `(user_id, for_date)` |
| health_score | int | denormalized from that morning's snapshot |
| safe_to_spend | numeric(14,2) | |
| checking_total / upcoming_bills_total | numeric(14,2) | |
| goals_status | text | `on_track` \| `attention` \| `off_track` |
| recommendation_code | text | rule-tree leaf id (`spend_freely`, `tight_before_payday`, …) |
| recommendation_text | text | as shown (template or AI-phrased) |
| recommendation_reasons | jsonb | the facts behind it |
| delivered_via | text[] | `in_app`, `email`, `push` |
| read_at | timestamptz | briefing read-rate is the north-star metric |

### copilot_conversations / copilot_messages
| copilot_conversations | id uuid PK · user_id · title text · created_at / updated_at |
|---|---|

| column (copilot_messages) | type | notes |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid → copilot_conversations | |
| role | text | `user` \| `assistant` |
| content | text | rendered text |
| tool_calls | jsonb | tools invoked + their results — the grounding audit trail (ADR-6): every figure in `content` must trace to a row here |
| model / tokens_in / tokens_out | text / int / int | cost telemetry |
| created_at | timestamptz | |

### forecast_checks  (honesty telemetry, PRD §11)
| id uuid PK · user_id · made_on date · horizon_days int (1 \| 7 \| 30) · predicted_balance numeric(14,2) · actual_balance numeric(14,2) · abs_error_pct numeric(6,2) · checked_at timestamptz |

Nightly job compares past projections against reality; the accuracy chart in Settings
keeps the forecast (and everything built on it) honest.

### insights
| id uuid PK · user_id · type text (`budget_pace` \| `price_increase` \| `duplicate_charge` \| `goal_tradeoff` …) · title text · body text · severity text · data jsonb · status text (`active`\|`dismissed`\|`expired`) · created_at / expires_at |

### plaid_webhook_events  (audit log)
| id uuid PK · item_id uuid nullable · webhook_type / webhook_code text · payload jsonb · processed_at timestamptz nullable · received_at timestamptz |

---

## How the engine reads this schema

```
availableCash   = Σ accounts.available_balance  WHERE include_in_cash_pool
                  − Σ pending discretionary txns not yet reflected in balance
obligations     = recurring_streams (outflow, confirmed, next_expected_date ≤ period_end)
                  + liabilities.min_payment WHERE next_due_date ≤ period_end
                  − matching txns already paid this period (don't double-count!)
goalReserve     = Σ goals.monthly_contribution prorated to period
emergencyFloor  = user_settings.emergency_floor
period_end      = MIN(next_expected_date) of confirmed inflow streams, else month end
spentToday      = Σ today's txns in discretionary categories (incl. pending, incl. credit)
```

Other intelligence services read the same tables — no private copies of the data:

- **Forecast:** confirmed `recurring_streams` (both directions) + `liabilities` due
  dates + `planned` transactions + trailing-90-day discretionary median from
  `transactions` → daily series (computed on demand, not stored).
- **Score:** aggregates over `transactions`, `accounts`, `liabilities`, `goals`,
  `engine_snapshots` (allowance adherence), and `budgets`.
- **Goal GPS:** `goals` + forecast surplus → `goal_eta_history`.
- **Subscription manager:** `recurring_streams` (outflow, non-essential) with monthly/
  annual cost derived from `average_amount` × `frequency`, last-charged date from the
  newest linked transaction, and price-change flags from `last_amount` vs.
  `average_amount` — a view over existing tables, no new ones.

The trickiest correctness problem in the whole system is the **"already paid" join**:
a rent bill due the 1st and the rent transaction that posted on the 1st must not both
count. Solution: `transactions.recurring_stream_id` links payments to streams; an
obligation only counts if no linked transaction exists in the current period. This is
why recurring matching gets its own service and heavy tests.

---

## Migration plan

Drizzle Kit (`drizzle-kit push` in dev, generated SQL migrations for prod).
Schema lives in `db/schema/budget/*.ts` — separate namespace from the existing app's
tables so both can coexist in this repo during development.
