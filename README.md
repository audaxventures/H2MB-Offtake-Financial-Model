# H2MB Project Finance Model

A full-featured, multi-year financial projection and modelling platform, purpose-built
for **H2MB Inc.**, a green hydrogen infrastructure company developing Manitoba's first
commercial-scale green hydrogen production and dispensing facility. All figures are in
Canadian dollars.

The app is a fully client-side React + TypeScript single-page application — there is no
backend. Every calculation runs in the browser via a pure, unit-tested financial engine,
and everything you build is saved to your browser's `localStorage` so it's there when
you come back.

## Tech stack

- **React 19 + TypeScript**, built with **Vite**
- **Tailwind CSS v4** for styling, with a custom H2MB colour system
- **shadcn/ui**-style component primitives (hand-authored under `src/components/ui`,
  built on Radix UI + `class-variance-authority`) for a polished component library
- **Recharts** for charts
- **Zustand** (with the `persist` middleware) for state management and
  `localStorage`-backed scenario persistence
- **xlsx-js-style** for formatted Excel export (a SheetJS fork with cell styling —
  fills, fonts, number formats — needed for the navy/gold/DSCR-conditional formatting)
- **jsPDF + html2canvas-pro** for one-page PDF executive summary export
  (`html2canvas-pro` is used instead of `html2canvas` because Tailwind v4's `oklch()`
  theme colors aren't parseable by the unmaintained original library)
- **Vitest** for unit testing the calculation engine

## Getting started

```bash
npm install
npm run dev       # starts the Vite dev server
npm run build     # type-checks and builds a static production bundle to dist/
npm run preview   # serves the production build locally
npm test          # runs the calculation engine unit tests once
npm run test:watch
npm run lint
```

The app is a static site — `npm run build` output in `dist/` can be deployed to any
static host (Netlify, Vercel, S3/CloudFront, GitHub Pages, etc.) with no server
component required.

## Project structure

```
src/
  engine/
    types.ts               — all TypeScript interfaces (Scenario, RevenueStream,
                              ExpenseLineItem, ModelPeriod, PeriodResult, etc.)
    calculations.ts         — pure financial calculation engine (no React/DOM dependency)
    calculations.test.ts    — unit tests covering every formula and edge case
    defaults.ts             — default scenario factory (the "Base Case")
    migration.ts            — converts pre-rewrite saved scenarios to the current shape
    migration.test.ts       — tests that migration preserves a legacy scenario's numbers
    formatters.ts           — currency / percent / DSCR formatting helpers

  store/
    scenarioStore.ts        — Zustand store: current scenario, saved scenarios,
                              dark mode, localStorage persistence
    useModelOutputs.ts       — memoized hook wrapping runModel(current)

  components/
    ui/          — shadcn/ui-style primitives (button, card, slider, tabs, dialog, ...)
    shared/      — SliderInput, KPICard, DataTable, Badge, AlertBanner, validation banners
    layout/      — AppShell, Sidebar, TopNav (incl. dark mode toggle, export menu)
    views/       — the 5 main views + the Scenario Manager dialog
    charts/      — RevenueEBITDAChart, DebtWaterfallChart, DSCRChart
    export/      — PDFExportLayout (off-screen layout captured for the PDF export)

  export/
    excelExport.ts — builds the 4-sheet formatted .xlsx workbook
    pdfExport.ts   — captures the PDF layout to canvas and emits a one-page PDF

  App.tsx — view routing, export wiring, global validation banners
```

## The financial model

### Model horizon

The model horizon is configurable per scenario (Assumptions Dashboard → Model
Settings), from 5 to 25 years, split into two granularities:

- **Quarterly years** (default: Years 1–5) — modeled at quarterly resolution, matching
  the original construction + ramp-up detail.
- **Annual years** (default: Years 6–15) — modeled as single yearly periods, so a
  15-year (or longer) projection stays editable instead of demanding 60+ quarterly
  inputs.

Internally, both granularities are just "periods" on one timeline (`ModelPeriod` /
`PeriodResult` in `calculations.ts`) — a quarterly period has `periodFraction = 0.25`,
an annual period has `periodFraction = 1`, and every formula (interest, principal,
expense allocation) scales by that fraction, so the two granularities produce
identical, consistent math.

**Construction** is derived from `constructionDurationMonths` (default 15 months = 5
quarter-equivalents = Y1Q1–Q4 + Y2Q1), not hardcoded — change the construction duration
and the model's revenue-free period grows or shrinks to match automatically.

### Revenue streams

A scenario can have **multiple concurrent revenue streams** (Revenue Streams view) —
e.g. a truck fleet off-take plus a separate fixed-volume supply agreement with a
datacentre — each with its own:

- **Name** and **start year** (streams can begin later than Year 2, e.g. an expansion
  or a second customer signed in Year 6).
- **Offtake mode**: `'trucks'` (volume = `trucksPerDay × kgPerTruckFill`) or `'direct'`
  (a directly-entered daily kg quantity, for a fixed-volume customer).
- **Production cost** (`h2ProductionCostPerKg`) — feeds that stream's COGS.
- **Per-period inputs** (quarterly for Years 1–N, annual beyond that): volume,
  operating days, and price per kg.

Total revenue and COGS for any period are the sum across all active streams. Plant
capacity (`maxDailyCapacityKg`, Model Settings) is a single shared input independent of
offtake mode or stream count, since it represents the physical electrolyzer, not any
one revenue arrangement.

### Expense line items

Instead of one lump "annual company expenses" number, operating expenses are built
from any number of named **line items** (Expense Items view), each with:

- A **category** — Payroll & Benefits, G&A, Sales & Marketing, R&D, Insurance, Repairs
  & Maintenance, Utilities, Professional & Legal Fees, Cost of Goods Sold (additional),
  or Other — which rolls up into the Annual Summary P&L the way a real chart of
  accounts would (COGS-tagged items reduce Gross Profit; everything else is an
  Operating Expense below it).
- A **start year**.
- An **escalation driver** — how the item's annual dollar amount is computed in any
  given year:
  - `flat` — the same amount every year.
  - `percentGrowth` — compounds annually from a base amount (e.g. 3%/yr).
  - `percentOfRevenue` — scales automatically with that year's total revenue across
    all streams (good for volume-linked costs like maintenance).
  - `manual` — you set each year's dollar amount directly; years without a value are
    $0, which is exactly what you want for a one-time or irregular cost.
- **Per-year overrides** — regardless of escalation type, any single year's computed
  value can be manually overridden (useful for a known step-change, e.g. a new hire),
  without having to switch the whole item to `manual`.

Construction-phase overhead (`constructionOpexPerMonth`, Assumptions Dashboard) is
tracked separately from these line items as `preRevenueOpex` — it's a fixed pre-revenue
cost, not a user-defined operating expense category, and the engine deliberately keeps
it out of `expensesByCategory` so it never gets silently folded into (and inflates) a
custom category like "Other."

### Per-period formulas

For every non-construction period (`dailyKg` resolved per each stream's offtake mode,
`periodFraction` = 0.25 for a quarter or 1 for a year):

```
Revenue           = Σ over active streams of (dailyKg × pricePerKg × operatingDays)
COGS              = Σ over active streams of (h2ProductionCostPerKg × dailyKg × operatingDays)
                    + any expense line items tagged category = 'cogs'
Gross Profit      = Revenue − COGS
Operating Expense = Σ over expense line items (annual amount × periodFraction)
EBITDA            = Gross Profit − Operating Expense  (− preRevenueOpex during construction)
Interest          = openingDebtBalance × interestRate × periodFraction
Principal         = totalDebt ÷ (loanTenor − gracePeriod) × periodFraction,
                    only once year ≥ gracePeriod + 2 (else $0), capped at the remaining balance
Net Cash          = EBITDA − Interest − Principal + ITC (only if not applied to debt)
Cumulative CF     = running sum of Net Cash
DSCR              = EBITDA ÷ (Interest + Principal), or N/A once debt is fully repaid
```

Construction periods have zero revenue/COGS; their only cost is `preRevenueOpex`
(`constructionOpexPerMonth × months in the period`).

The **ITC** is received as a lump sum in the first non-construction period of
`receivedInYear` (falling back to the last period of that year if the target year is
entirely construction). If `appliedTo === 'debt'`, the lump sum immediately reduces the
outstanding principal balance (and therefore all subsequent interest) instead of
flowing through Net Cash directly.

### Annual aggregation & other outputs

- Annual figures are the sum of that year's periods (4 quarters, or 1 annual period).
- **D&A**: straight-line over a 20-year asset life with 5% salvage value, starting the
  first operating (non-construction) year.
- **Equity IRR**: solved via Newton-Raphson (with a bisection fallback for robustness)
  on the annual cash flow stream `[-cashEquity, Year2 Net, Year3 Net, ..., YearN Net]`
  — N being the scenario's full model horizon.
- **Equity payback year**: first year the same cash flow stream's running total turns
  positive.
- **Minimum DSCR**: the lowest annual DSCR across the non-construction years; the
  construction year(s) are excluded since the DSCR covenant isn't meaningful pre-COD.
- **Interest saved from the ITC**: total interest paid across the full model horizon,
  compared against a counterfactual run with the ITC amount set to $0.
- **Debt payoff quarter**: the debt schedule (independent of revenue) is projected
  forward — well past the model window if needed — until the balance reaches zero,
  both with and without the ITC.

### Validated at default inputs

The default "Base Case" scenario (see `src/engine/defaults.ts`) is a 15-year model with
one truck-delivery revenue stream and 8 categorized expense line items. At default
inputs it computes to roughly: **$59.0M** total revenue, **30.2%** equity IRR, **1.31x**
minimum DSCR (Year 3), fully funded with a **~$5.85M** surplus, and the debt fully
amortized by Year 7 (vs. Year 11 without the ITC) thanks to the $4M ITC paydown.

All of the above (every formula, the debt roll-forward, ITC handling, multi-stream
revenue, all four escalation types, category roll-ups, the IRR solver, Sources & Uses
totals, and scenario validation) is covered in `src/engine/calculations.test.ts` (56
tests total, `npm test`), plus `src/engine/migration.test.ts` for the legacy-scenario
conversion described below.

## The 5 views

1. **Assumptions Dashboard** — Capital Structure, Construction Costs, ITC Settings
   (gold-accented), and Model Settings (horizon length, quarterly-vs-annual split,
   plant capacity) input cards on the left; a live KPI strip, funding status banner,
   and Sources & Uses mini-table on the right.
2. **Revenue Streams** — add/remove/name revenue streams, edit each stream's offtake
   mode and production economics, and edit its per-period volume/price inputs
   (quarterly cards for the quarterly years, one annual card per later year). Below
   that, the full period-by-period detail table (all streams combined) or an annual
   roll-up, with construction/ITC/DSCR row styling.
3. **Expense Items** — add/remove/edit expense line items (name, category, start year,
   escalation driver), a per-year amount grid with click-to-override any cell, and an
   "All Expenses by Year" summary table.
4. **Annual Summary** — a full-horizon P&L (Revenue → Gross Profit → each expense
   category → EBITDA → EBIT → Debt Service → Cash Flow, with the payback year
   highlighted) plus Revenue/EBITDA, Debt Balance, and DSCR charts. The category rows
   are generated dynamically from whichever categories your expense line items
   actually use.
5. **Sources & Uses / ITC Analysis** — the full Sources & Uses statement with a funding
   status banner, and an ITC "deep dive" comparing the scenario with vs. without the
   ITC (interest paid, payoff timing, net cash, and IRR).

Revenue-stream period inputs are stored in a flat array keyed by (year, quarter) — not
by which tab is currently selected — so switching year tabs or stream tabs **never**
resets other periods' inputs. Changing Model Settings (horizon length or the
quarterly/annual split) reconciles each stream's periods by carrying the last known
values forward into any newly-added years, rather than resetting them to blank.

## Scenario Manager

Accessible from the "Scenarios" button in the top nav. Supports saving up to 5 named
scenarios (e.g. "Bear Case", "Base Case", "Bull Case"), loading, duplicating, and
deleting them, and a side-by-side comparison table (color-tinted by name: scenarios
named "bear"/"base"/"bull" get red/green/blue tints respectively) across the key
metrics. Scenarios and the in-progress current scenario persist to `localStorage`
across page refreshes.

> **Persistence note:** all state lives in the browser's `localStorage`, scoped to the
> page's origin — it survives refreshes and closing/reopening the tab on that same
> URL, but a *different* URL (a new preview link, a different port, a new deploy
> domain) is a different origin with its own empty storage. `crypto.randomUUID()` also
> requires a secure context (HTTPS or `localhost`); scenario ID generation
> (`src/lib/id.ts`) falls back to a non-cryptographic UUID so plain-HTTP preview URLs
> (common for forwarded dev-container ports) don't throw during store initialization.

### Upgrading from an older version

If a scenario was saved before revenue streams / expense line items existed (the
single "quarters + production" shape), it's converted automatically and transparently
on load — see `src/engine/migration.ts`. The conversion is exact, not approximate: the
old per-quarter volume/price inputs become one revenue stream's periods, and the old
per-year `annualExpenses` figures become one `manual`-escalation expense line item with
year-by-year overrides reproducing the original numbers precisely, so a migrated
scenario computes identical results to what you saw before. Rehydration also never
throws or silently wipes your data — a corrupt or unrecognized entry falls back to a
fresh default while everything else in the store loads normally.

## Export

- **Excel (.xlsx)** — 4 sheets (Assumptions, Period Detail, Annual Summary, Sources &
  Uses) with navy headers, blue input values, currency/percent number formats,
  conditional DSCR fills, and gold ITC row highlighting. The Annual Summary sheet's
  expense rows are generated from whichever categories your line items use, same as
  the in-app view.
- **PDF** — a one-page landscape executive summary (KPI strip, Sources & Uses, full
  P&L, and the 3 key charts) rendered off-screen and captured to a single-page PDF;
  the page width scales with the model horizon so long projections stay legible.

Both are lazy-loaded on demand (dynamic `import()`) so the export libraries don't
bloat the initial page load.

## Validation & alerts

A global banner (visible on every view) surfaces, in priority order:

- **Overcapitalised** — total debt exceeds total uses (reduce debt or increase CapEx).
- **Funding gap** — total uses exceed total sources.
- **DSCR danger** — any non-construction year's DSCR falls below 0.8x.
- **DSCR warning** — any non-construction year's DSCR falls below the 1.25x covenant
  target.
- **IRR warning** — equity IRR falls below the 8% minimum investor threshold.
- **Construction/timeline mismatch** — construction duration extends beyond the
  quarterly modeling window (increase "Quarterly Detail Years" in Model Settings).

## Business context

- 2.5 MW PEM electrolyzer producing up to 1,000 kg/day of green hydrogen for Class 8
  fuel cell electric trucks (the plant's shared physical capacity — independent of how
  many revenue streams or offtake arrangements are modeled against it).
- Production cost ≈ $2.41/kg (competitive vs. industry $3–$8/kg).
- Revenue model: long-term off-take agreements — trucking, direct-supply, or a mix —
  with Manitoba customers.
- Construction: 15 months by default (Year 1 + Year 2 Q1); first revenue in Year 2 Q2.
- ITC: 40% refundable federal Clean Technology Investment Tax Credit ($1M–$6M
  eligible).
- DSCR covenant: 1.25x minimum (standard project finance covenant).
- Investor IRR hurdle: 15%.
