# Assigned column in Inventory Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-day "Assigned" column to the Inventory Report, after Main Stock, so the admin can see how many units were assigned to each driver per product on the date being viewed — without bouncing to the Assign tab.

**Architecture:** Reuses the existing `assignments` collection (no schema change). One new DB helper sums per-product assignments for a driver on a given date. The two render functions in `js/reports.js` (`generateInventoryReport`, `generateHistoricalInventoryReport`) gain a new column wired to that helper. Live mode uses today's date; historical mode uses the picked date.

**Tech Stack:** Vanilla JS PWA. Firestore via `DB` module. No build step. Manual browser verification (no automated test framework).

**Spec:** `docs/superpowers/specs/2026-05-06-assigned-column-inventory-report-design.md`

**Project rule on commits:** This project's `CLAUDE.md` requires explicit user request before committing/pushing/deploying. Tasks below end at commit-ready checkpoints, but the final commit + service-worker bump + push + `firebase deploy` is consolidated into Task 5 and runs only when the user requests it.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `js/database.js` | Modify (add new method) | New helper `getDailyAssignmentsByDriver` returning a `Map<productId, totalQuantity>` for one driver on one date |
| `js/reports.js` | Modify (`generateInventoryReport`) | Render new `Assigned` column in live mode (single driver + all-drivers per-driver tables) |
| `js/reports.js` | Modify (`generateHistoricalInventoryReport`) | Render new `Assigned` column in historical mode (single driver + all-drivers per-driver tables) |
| `service-worker.js` | Modify (cache version bump) | Force PWA clients to pick up the new JS on next load |

No new files. No HTML changes (column header is rendered inline by `reports.js`).

---

## Task 1: Add `getDailyAssignmentsByDriver` helper in `database.js`

**Files:**
- Modify: `js/database.js` (add new method, place it directly after `getAssignmentsByDriver` which currently ends at ~line 1594)

**Context the engineer needs:**
- Each `assignments` doc has `{driverId, productId, quantity, assignedAt}` — `assignedAt` is a Firestore Timestamp.
- The codebase already converts Firestore Timestamps with `ts?.toDate ? ts.toDate() : new Date(ts)` (e.g. `database.js:506-507`).
- Date inputs in this project are `YYYY-MM-DD` strings in local time. Constructing `new Date('2026-05-06T00:00:00')` (no `Z` suffix) produces the local-time start of that day, which matches how the rest of the codebase parses date inputs.
- We deliberately reuse the existing `getAssignmentsByDriver(driverId)` rather than writing a date-bounded Firestore query — the assignments collection is small per driver, and the JS-side filter mirrors how `getDriverInventory` already operates on the same data.

- [ ] **Step 1.1: Read the surrounding code to confirm placement**

Open `js/database.js` and confirm `getAssignmentsByDriver` is around line 1582–1594. The new method goes immediately after it, before `getAssignmentsByProduct`.

- [ ] **Step 1.2: Add the new method**

Insert this method between `getAssignmentsByDriver` (ends ~line 1594) and `getAssignmentsByProduct` (starts ~line 1596):

```javascript
  /**
   * Sum assignments made to a driver on a specific local-time date,
   * grouped by productId.
   * @param {string} driverId - Driver ID
   * @param {string} dateString - Local date in YYYY-MM-DD format
   * @returns {Promise<Map<string, number>>} productId → total quantity assigned that day
   */
  async getDailyAssignmentsByDriver(driverId, dateString) {
    const result = new Map();
    if (!driverId || !dateString) return result;

    const startOfDay = new Date(`${dateString}T00:00:00`);
    const endOfDay = new Date(`${dateString}T23:59:59.999`);

    const assignments = await this.getAssignmentsByDriver(driverId);

    assignments.forEach(assignment => {
      const ts = assignment.assignedAt;
      const assignedDate = ts?.toDate ? ts.toDate() : new Date(ts);
      if (assignedDate >= startOfDay && assignedDate <= endOfDay) {
        const prev = result.get(assignment.productId) || 0;
        result.set(assignment.productId, prev + (assignment.quantity || 0));
      }
    });

    return result;
  },
```

- [ ] **Step 1.3: Manually verify the helper from the browser console**

1. Reload the app at `https://chong-918f9.web.app` (or `index.html` locally) and log in as admin.
2. Open DevTools console.
3. Run (substitute a real `driverId` from `await DB.getAllDrivers()`):
   ```js
   const drivers = await DB.getAllDrivers();
   const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
   const map = await DB.getDailyAssignmentsByDriver(drivers[0].id, today);
   console.log('today entries:', [...map.entries()]);
   ```
4. Expected: a `Map` (printed as array of `[productId, qty]` pairs) reflecting only assignments made today for that driver. If you assigned a product today, it appears with the right total. If nothing was assigned today, the map is empty.
5. Optional: pick a known past date with no assignments and confirm the map is empty.

- [ ] **Step 1.4: Checkpoint — work is commit-ready**

Confirm:
- `getDailyAssignmentsByDriver` is the only change in `js/database.js`.
- No syntax errors (DevTools console didn't throw on reload).

Do NOT commit yet — Task 5 batches the commit/deploy.

---

## Task 2: Render the Assigned column in live mode (`generateInventoryReport`)

**Files:**
- Modify: `js/reports.js` — function `generateInventoryReport` (~line 1132 onward). Two branches inside it: single-driver (lines ~1154–1227) and all-drivers (lines ~1228–1318).

**Context:**
- Single-driver branch already builds a table with columns `Product | Remaining stock | Main Stock`. It exposes a per-driver "Edit Order" reorder mode whose hidden first column (`reorder-controls`) is unaffected by this change.
- All-drivers branch first renders an "Overall Inventory Status" warehouse table (NOT modified — it's not per-driver) and then loops over `driverInventories` to render one inner table per driver. Driver inventories are pre-fetched in parallel via `Promise.all` (~line 1271–1277).

- [ ] **Step 2.1: Compute today's date string at the top of the function**

In `generateInventoryReport`, immediately after the early `if (selectedDate) { await this.generateHistoricalInventoryReport(...); return; }` block (~line 1146–1149), add a `today` variable used by both branches:

```javascript
    // Local-time today as YYYY-MM-DD (matches how getDailyAssignmentsByDriver expects dates)
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
```

- [ ] **Step 2.2: Single-driver branch — fetch today's daily assignments**

Inside `if (driverId) { ... }` branch, after `inventoryData = await DB.getDriverInventory(driverId);` and before the `if (inventoryData.length === 0)` early return (~line 1156), add:

```javascript
      const dailyAssignments = await DB.getDailyAssignmentsByDriver(driverId, today);
```

- [ ] **Step 2.3: Single-driver branch — add the column header**

Find the table header in the single-driver branch (~line 1191–1199). Replace the `<thead>` block:

**Before:**
```javascript
      let reportHTML = `
        <div class="report-summary" style="display: flex; justify-content: space-between; align-items: center;">
          <h4>${driver.name} Stock List</h4>
          <div id="edit-order-controls">
            <button id="toggle-edit-order" class="btn-edit-order">
              <i class="fas fa-edit"></i> Edit Order
            </button>
            <button id="save-order" class="btn-save-order" style="display: none;">
              <i class="fas fa-save"></i> Save Order
            </button>
            <button id="cancel-order" class="btn-cancel-order" style="display: none;">
              <i class="fas fa-times"></i> Cancel
            </button>
          </div>
        </div>
        <table class="report-table inventory-table" id="inventory-order-table">
          <thead>
            <tr>
              <th class="reorder-controls-col" style="display: none;"></th>
              <th>Product</th>
              <th>Remaining stock</th>
              <th>Main Stock</th>
            </tr>
          </thead>
          <tbody>
      `;
```

**After (only the `<tr>` inside `<thead>` changes — added `<th>Assigned</th>`):**
```javascript
      let reportHTML = `
        <div class="report-summary" style="display: flex; justify-content: space-between; align-items: center;">
          <h4>${driver.name} Stock List</h4>
          <div id="edit-order-controls">
            <button id="toggle-edit-order" class="btn-edit-order">
              <i class="fas fa-edit"></i> Edit Order
            </button>
            <button id="save-order" class="btn-save-order" style="display: none;">
              <i class="fas fa-save"></i> Save Order
            </button>
            <button id="cancel-order" class="btn-cancel-order" style="display: none;">
              <i class="fas fa-times"></i> Cancel
            </button>
          </div>
        </div>
        <table class="report-table inventory-table" id="inventory-order-table">
          <thead>
            <tr>
              <th class="reorder-controls-col" style="display: none;"></th>
              <th>Product</th>
              <th>Remaining stock</th>
              <th>Main Stock</th>
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
      `;
```

- [ ] **Step 2.4: Single-driver branch — add the data cell**

Find the `inventoryData.forEach((item, index) => { ... })` block (~line 1203–1220). Replace the row template:

**Before:**
```javascript
      inventoryData.forEach((item, index) => {
        const mainQty = mainStockMap.has(item.id) ? mainStockMap.get(item.id) : 0;
        reportHTML += `
          <tr data-product-id="${item.id}" data-index="${index}">
            <td class="reorder-controls" style="display: none;">
              <button class="btn-move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>
                <i class="fas fa-arrow-up"></i>
              </button>
              <button class="btn-move-down" data-index="${index}" ${index === inventoryData.length - 1 ? 'disabled' : ''}>
                <i class="fas fa-arrow-down"></i>
              </button>
            </td>
            <td data-label="Product">${item.name}</td>
            <td data-label="Remaining stock">${item.remaining}</td>
            <td data-label="Main Stock">${mainQty}</td>
          </tr>
        `;
      });
```

**After (added `<td data-label="Assigned">` line):**
```javascript
      inventoryData.forEach((item, index) => {
        const mainQty = mainStockMap.has(item.id) ? mainStockMap.get(item.id) : 0;
        const assignedToday = dailyAssignments.get(item.id) ?? 0;
        reportHTML += `
          <tr data-product-id="${item.id}" data-index="${index}">
            <td class="reorder-controls" style="display: none;">
              <button class="btn-move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>
                <i class="fas fa-arrow-up"></i>
              </button>
              <button class="btn-move-down" data-index="${index}" ${index === inventoryData.length - 1 ? 'disabled' : ''}>
                <i class="fas fa-arrow-down"></i>
              </button>
            </td>
            <td data-label="Product">${item.name}</td>
            <td data-label="Remaining stock">${item.remaining}</td>
            <td data-label="Main Stock">${mainQty}</td>
            <td data-label="Assigned">${assignedToday}</td>
          </tr>
        `;
      });
```

- [ ] **Step 2.5: All-drivers branch — fetch daily assignments per driver in parallel**

Find the parallel pre-fetch block in the `else` branch (~line 1271–1277):

**Before:**
```javascript
      // Pre-fetch all driver inventories in parallel (much faster!)
      const driverInventories = await Promise.all(
        drivers.map(async (driver) => ({
          driver,
          inventory: await DB.getDriverInventory(driver.id)
        }))
      );
```

**After (also fetch daily assignments in parallel):**
```javascript
      // Pre-fetch all driver inventories AND today's daily assignments in parallel
      const driverInventories = await Promise.all(
        drivers.map(async (driver) => ({
          driver,
          inventory: await DB.getDriverInventory(driver.id),
          dailyAssignments: await DB.getDailyAssignmentsByDriver(driver.id, today)
        }))
      );
```

- [ ] **Step 2.6: All-drivers branch — destructure and render the column**

Find the loop `for (const { driver, inventory: driverInventory } of driverInventories) { ... }` (~line 1280–1314). Replace it:

**Before:**
```javascript
      // Per driver inventory
      for (const { driver, inventory: driverInventory } of driverInventories) {

        if (driverInventory.length > 0) {
          reportHTML += `
            <h4>${driver.name} Stock List</h4>
            <table class="report-table inventory-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Remaining stock</th>
                  <th>Main Stock</th>
                </tr>
              </thead>
              <tbody>
          `;

          // Sorting is already handled in getDriverInventory()
          driverInventory.forEach(item => {
            const mainQty = mainStockMap.has(item.id) ? mainStockMap.get(item.id) : 0;
            reportHTML += `
              <tr>
                <td data-label="Product">${item.name}</td>
                <td data-label="Remaining stock">${item.remaining}</td>
                <td data-label="Main Stock">${mainQty}</td>
              </tr>
            `;
          });

          reportHTML += '</tbody></table>';
        } else {
          reportHTML += `
            <h4>${driver.name} Stock List</h4>
            <p class="no-data">No inventory assigned to this driver.</p>
          `;
        }
      }
```

**After (destructure `dailyAssignments`, add header `<th>` and row `<td>`):**
```javascript
      // Per driver inventory
      for (const { driver, inventory: driverInventory, dailyAssignments } of driverInventories) {

        if (driverInventory.length > 0) {
          reportHTML += `
            <h4>${driver.name} Stock List</h4>
            <table class="report-table inventory-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Remaining stock</th>
                  <th>Main Stock</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody>
          `;

          // Sorting is already handled in getDriverInventory()
          driverInventory.forEach(item => {
            const mainQty = mainStockMap.has(item.id) ? mainStockMap.get(item.id) : 0;
            const assignedToday = dailyAssignments.get(item.id) ?? 0;
            reportHTML += `
              <tr>
                <td data-label="Product">${item.name}</td>
                <td data-label="Remaining stock">${item.remaining}</td>
                <td data-label="Main Stock">${mainQty}</td>
                <td data-label="Assigned">${assignedToday}</td>
              </tr>
            `;
          });

          reportHTML += '</tbody></table>';
        } else {
          reportHTML += `
            <h4>${driver.name} Stock List</h4>
            <p class="no-data">No inventory assigned to this driver.</p>
          `;
        }
      }
```

- [ ] **Step 2.7: Manually verify in the browser**

1. Reload the app, log in as admin, go to Reports → Inventory Reports.
2. Leave the **Date** filter empty.
3. **Single driver scenario:**
   - Pick a driver who already has inventory.
   - Generate Report. Expected: 4 columns — Product / Remaining stock / Main Stock / **Assigned**. Most rows show `0` unless something was assigned today.
   - Go to Assign tab → assign 5 of some product to that driver.
   - Return to Reports tab → Generate Report again. Expected: that product's Assigned cell now shows `5`.
   - In the Assign tab, assign 3 more of the same product to the same driver (same day).
   - Regenerate. Expected: Assigned cell now shows `8` (5+3).
4. **All drivers scenario:**
   - Pick "All Drivers" in the dropdown, leave Date empty, Generate Report.
   - Expected: each driver's Stock List table now has 4 columns. The "Overall Inventory Status" warehouse table at the top is **unchanged** (still 2 columns).
5. **Edit Order mode:**
   - Pick a single driver, generate, click "Edit Order". Expected: arrow buttons appear, and the Assigned column still displays correct values per row. Reorder a row up/down — the Assigned cell follows its row.
   - Click Cancel to exit edit mode. Save Order should still work for product reordering.

- [ ] **Step 2.8: Checkpoint — commit-ready**

Confirm:
- All edits are inside `generateInventoryReport`.
- No console errors on Generate Report.
- Existing columns and warehouse table are visually unchanged in values and order.

Do NOT commit yet — Task 5 batches.

---

## Task 3: Render the Assigned column in historical mode (`generateHistoricalInventoryReport`)

**Files:**
- Modify: `js/reports.js` — function `generateHistoricalInventoryReport` (~line 1325 onward). Two branches: single-driver (lines ~1329–1366) and all-drivers (lines ~1368–1422).

**Context:**
- Historical tables today have only 2 columns: `Product | Remaining stock`. There is NO Main Stock column. `Assigned` is appended after `Remaining stock`.
- The function receives `date` (YYYY-MM-DD) — this is exactly the format `getDailyAssignmentsByDriver` expects, so no conversion is needed.
- In the all-drivers branch, the existing `for (const driver of drivers) { ... }` loop is sequential. We add a parallel pre-fetch step matching the live-mode pattern to avoid making it slower.

- [ ] **Step 3.1: Single-driver branch — fetch daily assignments for the picked date**

In `if (driverId) { ... }` branch, after `const snapshot = await DB.getInventorySnapshot(driverId, date);` and after the `if (!snapshot)` early return (~line 1336), add:

```javascript
      const dailyAssignments = await DB.getDailyAssignmentsByDriver(driverId, date);
```

- [ ] **Step 3.2: Single-driver branch — update header and rows**

Find the table HTML build (~line 1346–1364). Replace:

**Before:**
```javascript
      let reportHTML = `
        <div class="report-summary">
          <h4>${driverName} Stock List - ${displayDate}</h4>
          <small class="snapshot-note"><i class="fas fa-history"></i> Historical snapshot from end of business day</small>
        </div>
        <table class="report-table inventory-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Remaining stock</th>
            </tr>
          </thead>
          <tbody>
      `;

      snapshot.snapshot.forEach(item => {
        reportHTML += `
          <tr>
            <td data-label="Product">${item.productName}</td>
            <td data-label="Remaining stock">${item.remaining}</td>
          </tr>
        `;
      });
```

**After:**
```javascript
      let reportHTML = `
        <div class="report-summary">
          <h4>${driverName} Stock List - ${displayDate}</h4>
          <small class="snapshot-note"><i class="fas fa-history"></i> Historical snapshot from end of business day</small>
        </div>
        <table class="report-table inventory-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Remaining stock</th>
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
      `;

      snapshot.snapshot.forEach(item => {
        const assignedThatDay = dailyAssignments.get(item.productId) ?? 0;
        reportHTML += `
          <tr>
            <td data-label="Product">${item.productName}</td>
            <td data-label="Remaining stock">${item.remaining}</td>
            <td data-label="Assigned">${assignedThatDay}</td>
          </tr>
        `;
      });
```

- [ ] **Step 3.3: All-drivers branch — pre-fetch snapshots and daily assignments in parallel**

Find the existing sequential loop (~line 1384–1414):

**Before:**
```javascript
      let hasAnySnapshot = false;

      for (const driver of drivers) {
        const snapshot = await DB.getInventorySnapshot(driver.id, date);

        if (snapshot && snapshot.snapshot.length > 0) {
          hasAnySnapshot = true;
          reportHTML += `
            <h4>${driver.name} Stock List</h4>
            <table class="report-table inventory-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Remaining stock</th>
                </tr>
              </thead>
              <tbody>
          `;

          snapshot.snapshot.forEach(item => {
            reportHTML += `
              <tr>
                <td data-label="Product">${item.productName}</td>
                <td data-label="Remaining stock">${item.remaining}</td>
              </tr>
            `;
          });

          reportHTML += '</tbody></table>';
        }
      }
```

**After (parallel pre-fetch, then render loop with the new column):**
```javascript
      let hasAnySnapshot = false;

      // Pre-fetch each driver's snapshot AND daily assignments in parallel
      const driverData = await Promise.all(
        drivers.map(async (driver) => ({
          driver,
          snapshot: await DB.getInventorySnapshot(driver.id, date),
          dailyAssignments: await DB.getDailyAssignmentsByDriver(driver.id, date)
        }))
      );

      for (const { driver, snapshot, dailyAssignments } of driverData) {
        if (snapshot && snapshot.snapshot.length > 0) {
          hasAnySnapshot = true;
          reportHTML += `
            <h4>${driver.name} Stock List</h4>
            <table class="report-table inventory-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Remaining stock</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody>
          `;

          snapshot.snapshot.forEach(item => {
            const assignedThatDay = dailyAssignments.get(item.productId) ?? 0;
            reportHTML += `
              <tr>
                <td data-label="Product">${item.productName}</td>
                <td data-label="Remaining stock">${item.remaining}</td>
                <td data-label="Assigned">${assignedThatDay}</td>
              </tr>
            `;
          });

          reportHTML += '</tbody></table>';
        }
      }
```

- [ ] **Step 3.4: Manually verify historical mode**

1. Reload, go to Reports → Inventory Reports.
2. **Pre-requisite:** there must be at least one closed business day with a snapshot. Pick a date you know has a snapshot.
3. **Single driver historical:**
   - Pick a driver, set Date to a past business day, Generate Report.
   - Expected: 3 columns — Product / Remaining stock / **Assigned**. The "Historical snapshot from end of business day" note still appears.
   - Cross-check the Assigned numbers against the Assign tab → Assignment History (sum any rows whose date falls on that business day for that driver).
4. **All drivers historical:**
   - Pick "All Drivers", set Date to the same past business day, Generate Report.
   - Expected: each driver block has 3 columns. Drivers with no snapshot for that date are still skipped (existing behavior).
5. **No-snapshot date:** pick a date with no closed business day. Expected: existing "No inventory snapshot available…" message — unchanged.
6. **Today as historical (edge):** if today's business day was already closed and snapshotted, picking today shows that snapshot's Assigned values reflecting today's assignments. (Most setups won't close today's day yet — this is a sanity scenario, not a strict requirement.)

- [ ] **Step 3.5: Checkpoint — commit-ready**

Confirm:
- Historical tables now have 3 columns; live tables have 4 (single & all-driver per-driver). Warehouse table unchanged.
- No console errors on either Generate Report path.

Do NOT commit yet.

---

## Task 4: Final cross-check across all four table modes

**Files:** none modified — verification only.

This task catches discrepancies between the four code paths before the bundle is committed.

- [ ] **Step 4.1: Re-run the 4 viewing scenarios end-to-end**

In one session:
1. **Live, single driver, no date** → 4 columns including Assigned.
2. **Live, all drivers, no date** → warehouse table unchanged; per-driver tables have 4 columns.
3. **Historical, single driver, past date with snapshot** → 3 columns including Assigned.
4. **Historical, all drivers, past date with snapshot** → 3 columns per driver block.

- [ ] **Step 4.2: Cross-tab tally check**

This is the workflow the change exists for. Verify it works:
1. In Assign tab → Assignment History, note the assignments made today for one specific driver, summed per product. (e.g. Product A: 50, Product B: 20.)
2. In Reports → Inventory Reports, pick that driver, leave Date empty, Generate Report.
3. Expected: the Assigned column matches the sums you just calculated. No tab-switching mid-task is needed for the admin workflow described in the spec.

- [ ] **Step 4.3: Edge cases**

- [ ] Driver with no inventory rows: no change in behavior — still says "No inventory assigned to this driver."
- [ ] Date filter clears properly via the existing "Clear date" X button — switches back to live mode and Assigned reflects today.

---

## Task 5: Commit, bump service worker, push, deploy

**Files:**
- Modify: `service-worker.js` — line 1, bump cache version.

This task only runs when the user explicitly says "commit and push" / "deploy" / equivalent.

- [ ] **Step 5.1: Bump service worker cache version**

Open `service-worker.js`. Line 1 currently is:

```javascript
const CACHE_NAME = 'inventory-manager-v45';
```

Bump to the next version (e.g. `v46`):

```javascript
const CACHE_NAME = 'inventory-manager-v46';
```

(If the version has been bumped further by another change in the meantime, increment from whatever the current value is — do not hardcode `v46`.)

- [ ] **Step 5.2: Commit all changes in one logical commit**

```bash
git add js/database.js js/reports.js service-worker.js
git commit -m "$(cat <<'EOF'
Add Assigned column to Inventory Report

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.3: Push to origin/main**

```bash
git push origin main
```

- [ ] **Step 5.4: Deploy**

```bash
firebase deploy --only hosting
```

Expected: deploy completes with `Hosting URL: https://chong-918f9.web.app`.

- [ ] **Step 5.5: Post-deploy verification**

1. Open `https://chong-918f9.web.app` in a private/incognito window (avoids stale service worker).
2. Log in as admin, go to Reports → Inventory Reports.
3. Confirm the Assigned column appears in live mode and historical mode (single + all-drivers).

---

## Self-Review

**Spec coverage:**

- [x] Spec §"Definition of Assigned" → Task 1 helper computes per-day sums, Tasks 2 & 3 use it.
- [x] Spec §"Data source" (reuse `assignments` collection) → Task 1 uses `getAssignmentsByDriver`. No schema changes.
- [x] Spec §"New DB helper" → Task 1.
- [x] Spec §"UI changes — `generateInventoryReport`" → Task 2 covers both branches.
- [x] Spec §"UI changes — `generateHistoricalInventoryReport`" → Task 3 covers both branches.
- [x] Spec §"Resulting columns" matrix → verified in Task 4.
- [x] Spec §"Edge cases" → Task 1 (empty/missing inputs), Task 2 (Edit Order mode), Task 3 (no snapshot, same-day multi-assignments via Step 2.7), Task 4 (date clear).
- [x] Spec §"Out of scope" — Assign tab unchanged, no transferred/sold columns, snapshot data model unchanged. Plan touches none of these.

**Placeholders / vagueness:** None. Every code step shows the exact code. Every verification step gives concrete expected output.

**Type consistency:** `getDailyAssignmentsByDriver` returns `Map<string, number>` everywhere. `dailyAssignments.get(productId) ?? 0` is the same access pattern in all 4 render branches. Live mode uses `item.id` (from `getDriverInventory`); historical mode uses `item.productId` (from snapshot data) — these names match what those data sources actually expose; verified in spec and existing code.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-assigned-column-inventory-report.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
