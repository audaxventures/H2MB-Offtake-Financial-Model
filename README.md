# H2MB Project Finance Model

A professional-grade green hydrogen project finance scenario tool for **H2MB Inc.**, a
green hydrogen infrastructure company developing Manitoba's first commercial-scale
green hydrogen production and dispensing facility. All figures are in Canadian dollars.

The app is a fully client-side React + TypeScript single-page application — there is no
backend. Every calculation runs in the browser via a pure, unit-tested financial engine.

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
    types.ts             — all TypeScript interfaces (CapitalStructure, Scenario, etc.)
    calculations.ts       — pure financial calculation engine (no React/DOM dependency)
    calculations.test.ts  — unit tests covering every formula and edge case
    defaults.ts           — default scenario factory (the "Base Case")
    formatters.ts         — currency / percent / DSCR formatting helpers

  store/
    scenarioStore.ts       — Zustand store: current scenario, saved scenarios,
                              dark mode, localStorage persistence
    useModelOutputs.ts      — memoized hook wrapping runModel(current)

  components/
    ui/          — shadcn/ui-style primitives (button, card, slider, tabs, dialog, ...)
    shared/      — SliderInput, KPICard, DataTable, Badge, AlertBanner, validation banners
    layout/      — AppShell, Sidebar, TopNav (incl. dark mode toggle, export menu)
    views/       — the 4 main views + the Scenario Manager dialog
    charts/      — RevenueEBITDAChart, DebtWaterfallChart, DSCRChart
    export/      — PDFExportLayout (off-screen layout captured for the PDF export)

  export/
    excelExport.ts — builds the 4-sheet formatted .xlsx workbook
    pdfExport.ts   — captures the PDF layout to canvas and emits a one-page PDF

  App.tsx — view routing, export wiring, global validation banners
```

## The financial model

### Model horizon

The model spans 5 years (20 quarters):

- **Construction** — Y1Q1 through Y2Q1 (5 quarters), no revenue. Matches the business
  assumption of a 15-month construction period (Year 1's 12 months + Year 2 Q1's 3
  months).
- **Revenue** — Y2Q2 through Y5Q4 (the remaining 15 quarters).

> **Note on the "14 quarters" figure in early planning notes:** a flat "5 years = 20
> quarters" model with "5 construction quarters" is only internally consistent with
> **15** revenue quarters (20 − 5 = 15), not 14. The engine (`REVENUE_QUARTERS` in
> `calculations.ts`) implements the arithmetically consistent 15-quarter revenue phase
> so that every one of the 5 years always aggregates a full 4 quarters in the Annual
> Summary.

### Offtake modes

Production settings include an `offtakeMode` toggle (Assumptions Dashboard → Production
& Steady-State → "Offtake Type") that controls how each quarter's daily H2 volume is
resolved:

- **Truck Delivery** (`'trucks'`, the original H2MB use case) — volume is derived from
  `trucksPerDay × kgPerTruckFill`. The Quarterly Model shows a Trucks/Day slider per
  quarter.
- **Direct Daily Volume** (`'direct'`) — for a fixed-volume offtake agreement with a
  stationary customer (e.g. a datacentre buying a flat daily kg quantity at a
  negotiated $/kg). The Quarterly Model shows a Daily Quantity (kg) slider per
  quarter instead, and `kgPerTruckFill` no longer applies.

Both modes share the same `operatingDays`, `pricePerKg`, and `annualExpenses` inputs,
and resolve to a single `dailyQuantityKg` figure per quarter (see `quarterDailyKg()` in
`calculations.ts`) that feeds the same Revenue/COGS math either way. Switching modes on
an existing scenario doesn't lose data — the direct-volume field is kept in sync with
the truck-derived volume until you edit it directly. Plant capacity
(`maxDailyCapacityKg`) is a direct input independent of offtake mode.

### Per-quarter formulas

For every revenue quarter (`dailyKg` resolved per the offtake mode above):

```
Revenue          = dailyKg × pricePerKg × operatingDays
COGS             = h2ProductionCostPerKg × dailyKg × operatingDays
Gross Profit     = Revenue − COGS
Quarterly Exp.   = annualExpenses ÷ 4          (expenses are set at the year level)
EBITDA           = Gross Profit − Quarterly Expenses
Interest         = openingDebtBalance × interestRate × 0.25
Principal        = totalDebt ÷ (loanTenor − gracePeriod) × 0.25,
                   only once year ≥ gracePeriod + 2 (else $0)
Net Cash         = EBITDA − Interest − Principal + ITC (only if not applied to debt)
Cumulative CF    = running sum of Net Cash
DSCR             = EBITDA ÷ (Interest + Principal)
```

Construction quarters have no revenue/COGS; their only expense is
`constructionOpexPerMonth × 3`.

The **ITC** is received as a lump sum in the first *revenue* quarter of
`receivedInYear` (falling back to the last quarter of that year if the target year is
entirely construction, e.g. Year 1). If `appliedTo === 'debt'`, the lump sum
immediately reduces the outstanding principal balance (and therefore all subsequent
interest) instead of flowing through Net Cash directly.

### Annual aggregation & other outputs

- Annual figures are the sum of that year's 4 quarters.
- **D&A**: straight-line over a 20-year asset life with 5% salvage value, starting
  Year 2 (when the asset is placed in service).
- **Equity IRR**: solved via Newton-Raphson (with a bisection fallback for
  robustness) on the annual cash flow stream `[-cashEquity, Year2 Net, Year3 Net,
  Year4 Net, Year5 Net]`.
- **Equity payback year**: first year the same cash flow stream's running total turns
  positive.
- **Minimum DSCR**: the lowest annual DSCR across the revenue years (Years 2–5);
  Year 1 is excluded since it has no revenue and the DSCR covenant isn't meaningful
  pre-COD.
- **Interest saved from the ITC**: total interest paid across all 20 quarters,
  compared against a counterfactual run with the ITC amount set to $0.
- **Debt payoff quarter**: the debt schedule (independent of revenue) is projected
  forward — well past the 5-year model window if needed — until the balance reaches
  zero, both with and without the ITC.

### Validated at default inputs

The default "Base Case" scenario (see `src/engine/defaults.ts`) is calibrated so that,
per the original spec's target ranges:

| Metric | Target | Actual |
|---|---|---|
| 5-year revenue | $17M–$19M | ~$18.09M |
| Min DSCR (Year 3) | 1.1x–1.3x | ~1.25x |
| Interest saved from a $4M ITC applied to debt in Year 2 | $800K–$1.2M | ~$980K |

All of the above (plus every formula, the debt roll-forward, ITC handling, IRR solver,
Sources & Uses totals, and scenario validation) are covered in
`src/engine/calculations.test.ts` (`npm test`).

## The 4 views

1. **Assumptions Dashboard** — Capital Structure, Construction Costs, ITC Settings
   (gold-accented), and Production & Steady-State input cards on the left; a live KPI
   strip, funding status banner, and Sources & Uses mini-table on the right.
2. **Quarterly Model** — Year 2–5 tabs with per-quarter Trucks/Day, Operating Days,
   and $/kg sliders, a year-level Annual Expenses slider, and the full 20-row
   quarterly table (or an annual roll-up) with construction/ITC/DSCR row styling.
3. **Annual Summary** — a 5-column P&L (Revenue → EBITDA → EBIT → Debt Service →
   Cash Flow, with the payback year highlighted) plus Revenue/EBITDA, Debt Balance,
   and DSCR charts.
4. **Sources & Uses / ITC Analysis** — the full Sources & Uses statement with a
   funding status banner, and an ITC "deep dive" comparing the scenario with vs.
   without the ITC (interest paid, payoff timing, net cash, and IRR).

A persistent quarter-input array (indexed by year/quarter, not by which tab is
selected) means switching year tabs in the Quarterly Model **never** resets other
years' inputs.

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

## Export

- **Excel (.xlsx)** — 4 sheets (Assumptions, Quarterly Model, Annual Summary, Sources
  & Uses) with navy headers, blue input values, currency/percent number formats,
  conditional DSCR fills, and gold ITC row highlighting.
- **PDF** — a one-page landscape executive summary (KPI strip, Sources & Uses,
  annual P&L, and the 3 key charts) rendered off-screen and captured to a single-page
  PDF.

Both are lazy-loaded on demand (dynamic `import()`) so the export libraries don't
bloat the initial page load.

## Validation & alerts

A global banner (visible on every view) surfaces, in priority order:

- **Overcapitalised** — total debt exceeds total uses (reduce debt or increase CapEx).
- **Funding gap** — total uses exceed total sources.
- **DSCR danger** — any revenue year's DSCR falls below 0.8x.
- **DSCR warning** — any revenue year's DSCR falls below the 1.25x covenant target.
- **IRR warning** — equity IRR falls below the 8% minimum investor threshold.

## Business context

- 2.5 MW PEM electrolyzer producing up to 1,000 kg/day of green hydrogen for Class 8
  fuel cell electric trucks.
- Production cost ≈ $2.41/kg (competitive vs. industry $3–$8/kg).
- Revenue model: long-term (5–10 year) off-take agreements with Manitoba heavy-duty
  FCET fleets.
- Construction: 15 months (Year 1 + Year 2 Q1); first revenue in Year 2 Q2.
- ITC: 40% refundable federal Clean Technology Investment Tax Credit ($1M–$6M
  eligible).
- DSCR covenant: 1.25x minimum (standard project finance covenant).
- Investor IRR hurdle: 15%.
