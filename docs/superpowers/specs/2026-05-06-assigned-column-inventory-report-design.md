# Assigned column in Inventory Report — Design

**Date:** 2026-05-06
**Status:** Approved (awaiting written-spec review)

## Background

The admin manually verifies physical truck stock against the system. Today this requires bouncing between two tabs:

- **Assign tab → Assignment History:** raw event list ("50 units of Product A assigned to Driver A on May 6 at 3pm").
- **Reports tab → Inventory Reports:** per-driver `Product | Remaining stock | Main Stock` table.

The admin has to mentally combine "what was assigned today" with "what's left now" to verify tally. The client has asked for the assigned figure to appear directly in the Inventory Report so they no longer need to switch tabs.

## Requirement

Add a new column **"Assigned"** to the Inventory Report tables, after the existing **Main Stock** column.

**Definition of "Assigned":** the quantity assigned to that driver for that product **on the date being viewed only** — *not* a cumulative all-time total.

| Viewing the report... | Date filter | Assigned column shows |
|---|---|---|
| Live mode | empty | sum of assignments to that driver/product made **today** |
| Historical mode | a date | sum of assignments to that driver/product made **on that date** |

Independent per day. Numbers do not accumulate across days. Multiple assignments on the same day for the same driver/product sum together.

## Data source

100% reuse of the existing `assignments` collection. Each record already has:

```
{ driverId, productId, quantity, assignedAt }
```

No new collections, no new fields, no migration.

## Design

### 1. New DB helper — `database.js`

```js
async getDailyAssignmentsByDriver(driverId, dateString)
```

- `dateString`: `YYYY-MM-DD` (matches the format already used by `inventory-date` input and `businessDayDate`).
- Queries `assignments` where `driverId == driverId` AND `assignedAt` falls between local-time start-of-day and end-of-day for `dateString`.
- Returns a `Map<productId, totalQuantity>` summing all qualifying assignments grouped by `productId`.
- Used by both live mode (pass today's date) and historical mode (pass the selected date).

Date-boundary handling matches existing local-time pattern used elsewhere in the codebase (e.g. business-day filtering).

### 2. UI changes — `reports.js`

**`generateInventoryReport()`** (live mode, no date selected):

- Single-driver table: add `<th>Assigned</th>` after `Main Stock`. Compute `dailyAssignments` for `today` once. For each product row render `dailyAssignments.get(item.id) ?? 0`.
- All-drivers view: same column added to each per-driver inner table. Compute `dailyAssignments` per driver in parallel alongside the existing `getDriverInventory` calls. The "Overall Inventory Status" header table at the top is **not** modified — it's main-warehouse only and Assigned doesn't apply.

**`generateHistoricalInventoryReport()`** (date selected):

- Single-driver and all-drivers historical tables: add `<th>Assigned</th>` after `Remaining stock` (historical mode has no `Main Stock` column). Compute `dailyAssignments` for the selected date for each rendered driver.

### 3. Resulting columns

| Mode | Columns |
|---|---|
| Live, single driver | `Product` `Remaining stock` `Main Stock` `Assigned` |
| Live, all drivers (per-driver table) | `Product` `Remaining stock` `Main Stock` `Assigned` |
| Historical, single driver | `Product` `Remaining stock` `Assigned` |
| Historical, all drivers (per-driver table) | `Product` `Remaining stock` `Assigned` |
| Live, "Overall Inventory Status" (warehouse) | unchanged |

### 4. Edge cases

- **Product assigned today but not currently in driver's inventory list:** `getDriverInventory` filters out products where the lifetime cumulative `assigned == 0`. If anything is assigned today, the cumulative is > 0, so the product will appear in the table — no missing row.
- **Same-day multiple assignments:** summed (e.g. 30 at 9am + 20 at 3pm → 50). Already the natural behavior of grouping by `productId`.
- **No assignments on that day:** column shows `0` for every product row.
- **Historical date with no business-day snapshot:** the "no snapshot available" empty-state message is unchanged. The Assigned column doesn't apply because no rows render.
- **Reorder-edit mode (single-driver live view):** the Assigned column should appear in display mode but does not need a sortable handle. Reorder logic only touches `Product` ordering — Assigned values follow the row.

### 5. Out of scope

- Any change to the Assign tab's "Assignment History" list.
- Any change to the underlying `assignments` data model.
- Cumulative or running-total view of assignments.
- Per-day Transferred or Sold columns (not requested).
- Service-worker cache version bump and deployment — handled at commit time, not part of design scope.

## Acceptance check

- [ ] Live mode (no date), single driver: Assigned column shows today's per-product totals; `0` where no assignment today.
- [ ] Live mode, all drivers: same, on every per-driver inner table.
- [ ] Historical mode, picking a past date: Assigned column shows that date's totals.
- [ ] Picking a date with assignments yesterday but none today: today's live mode shows 0; picking yesterday's date shows yesterday's totals.
- [ ] Multiple same-day assignments to same product sum correctly.
- [ ] Existing columns (Product, Remaining stock, Main Stock) unchanged in values and order.
- [ ] Driver's manual product reorder feature still works in live single-driver view.
