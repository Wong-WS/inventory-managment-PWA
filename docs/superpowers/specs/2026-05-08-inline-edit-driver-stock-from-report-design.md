# Inline edit driver stock from Inventory Report — Design

**Date:** 2026-05-08
**Status:** Approved (awaiting written-spec review)

## Background

The admin currently moves stock between main inventory and drivers via the **Assign tab** (assignments) and **Stock Transfer** flows (driver-to-driver, collect-to-main). The Inventory Report is read-only, so admin has to switch tabs to act on what they see.

Per client feedback, admin will now use the Inventory Report as the primary tally surface. The report should let admin add stock from main → driver and return stock from driver → main inline, without leaving the Reports tab.

## Requirement

In the **single-driver, live-mode** Inventory Report:

1. Each row gets an inline editor in the `Assigned` column with a `−` button, a quantity input, and a `+` button.
2. `+` adds typed quantity from main inventory to the selected driver. Underlying operation: existing `DB.addAssignment(driverId, productId, qty)`.
3. `−` returns typed quantity from the driver back to main inventory (collect). Underlying operation: existing `DB.transferStock(driverId, 'main-inventory', productId, qty)`.
4. Both actions appear in their respective histories (Assignment History for `+`, Transfer History for `−`).
5. The row list shows **all products in the catalog**, even those the driver has none of, so admin can assign newly-added products on the spot.

Out of scope: driver-to-driver transfers from this surface (still handled in Assign tab); bulk add/remove; editing historical snapshots.

## Where the controls appear (and don't)

| View | Controls? |
|---|---|
| Single-driver, no date (live) | **YES** |
| Single-driver, date selected (historical) | NO |
| All Drivers, no date | NO |
| All Drivers, date selected (historical) | NO |
| Overall Inventory Status (warehouse table) | NO |

Historical mode stays read-only — the past doesn't change.

## Cell layout

Each row's `Assigned` cell renders:

```
[ today_qty ]  [ − ]  [ qty input ]  [ + ]
```

- `today_qty` — current per-day net (display only, existing behavior unchanged).
- `−` button — red, returns typed quantity to main.
- `qty input` — number input, default `1`, integer ≥ 1.
- `+` button — green, adds typed quantity to driver.

Both buttons trigger a `confirm()` popup describing the action ("Add 3 of Ak 3.5 to hao?") before executing.

## Disabled and blocked states

| Condition | Behavior |
|---|---|
| Main Stock = 0 | `+` button is `disabled` |
| qty > Main Stock at click time | Block at confirm; `alert("Only N available in main inventory")` |
| Driver's Remaining stock = 0 | `−` button is `disabled` |
| qty > Driver's Remaining at click time | Block at confirm; `alert("Driver only has N remaining")` |
| qty < 1, non-integer, or empty | Block at click; `alert("Enter a valid quantity")` |

After validation passes, `confirm()` is shown. On Cancel: no-op. On OK: action runs.

## Row list change

The single-driver, live-mode row list becomes the **full product catalog**, not just products the driver has touched.

Today's behavior: `getDriverInventory` filters out products where lifetime `assigned == 0`. For the inline-edit feature, this filter would hide brand-new products the admin wants to assign for the first time.

Implementation: the report code (not `getDriverInventory` itself) builds the row list as the union of `getDriverInventory(driverId)` results and any products in `products` that aren't in that result. Missing-from-driver products render with `Remaining = 0`, `Assigned = 0`, and the regular `Main Stock` value. Visual hint for these rows: product-name cell uses a muted grey color and appends `(no inventory yet)` after the name, so admin can distinguish products the driver has never had from products with a current zero balance.

`getDriverInventory` itself is **not** changed — other callers (driver's "My Inventory" view, low-stock alerts) keep their existing semantics.

Sort order: existing per-driver `productOrder` is honored; products not in that order fall to the bottom alphabetically (current fallback). Newly-added catalog products that the driver has never touched will sort alphabetically at the bottom until the admin reorders.

## Refresh after action

After a successful `+` or `−`, the report re-runs the same path as clicking "Generate Report" so all four columns (`Remaining`, `Main`, `Assigned`) reflect the new state. The driver dropdown selection is preserved.

## Edit Order mode coexistence

The existing "Edit Order" reorder mode and the new inline stepper are independent — both can be visible at the same time. The stepper continues to function while reordering. No special interaction handling is required between them.

## Database operations (no new helpers)

- **`+` click** → `DB.addAssignment(driverId, productId, qty)`. Already creates an `assignments` row (Assignment History) and decrements `products.totalQuantity` (Main Stock).
- **`−` click** → `DB.transferStock(driverId, 'main-inventory', productId, qty)`. Already creates a `stock_transfers` row with `transferType: 'collect'` (Transfer History) and increments `products.totalQuantity` (Main Stock).

The session user is already recorded by these helpers via `getCurrentSession()`.

The new "Assigned" column we shipped earlier already nets transfer-OUT against assignments, so a `−` click immediately reduces today's Assigned display alongside Remaining. No change needed in `getDailyAssignmentsByDriver`.

## Permissions

Reports tab is already admin-only. No new permission logic required.

## Acceptance check

- [ ] Single-driver live report shows every product in the catalog (not only those the driver has touched).
- [ ] Each row displays a working `−`, qty input, and `+` in the `Assigned` cell.
- [ ] Tapping `+` with qty 3 on Ak 3.5 → confirm popup → OK → driver's Remaining/Assigned/Main stock update; an entry appears in Assignment History; Main Stock decreases by 3.
- [ ] Tapping `−` with qty 3 on Ak 3.5 → confirm popup → OK → opposite effect; an entry appears in Transfer History as `Driver → Main`; Main Stock increases by 3.
- [ ] `+` button is disabled when Main Stock is 0; clicking with qty > Main alerts and blocks.
- [ ] `−` button is disabled when Remaining is 0; clicking with qty > Remaining alerts and blocks.
- [ ] qty < 1 or non-integer is rejected with an alert.
- [ ] Switching to a date filter (historical) hides the buttons.
- [ ] All Drivers view has no buttons.
- [ ] Overall Inventory Status warehouse table is unchanged.
- [ ] Edit Order reorder mode and the inline stepper coexist without breaking each other.
- [ ] Driver's existing "My Inventory" view is unchanged (no new products appear there until they're actually assigned).
