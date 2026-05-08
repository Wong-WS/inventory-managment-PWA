# Inline edit driver stock from Inventory Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin add stock from main → driver and return stock from driver → main directly inline in the Inventory Report's single-driver live view, using existing `DB.addAssignment` and `DB.transferStock` operations.

**Architecture:** UI-only change in `js/reports.js`. The single-driver live branch of `generateInventoryReport` builds its row list as the union of the driver's current inventory and the full product catalog, then renders an inline stepper (`−`, qty input, `+`) per row. A new `bindInventoryEditEvents()` method wires click handlers that validate, prompt with `confirm()`, call the existing DB helpers, and re-render the report. No new DB methods. No schema change. Historical mode and All Drivers view stay read-only.

**Tech Stack:** Vanilla JS PWA. Firestore via `DB` module. No build step. Manual browser verification.

**Spec:** `docs/superpowers/specs/2026-05-08-inline-edit-driver-stock-from-report-design.md`

**Project rule on commits:** This project's `CLAUDE.md` requires explicit user permission to commit/push/deploy. Tasks below end at commit-ready checkpoints; the final commit + service-worker bump + push + `firebase deploy` is consolidated into Task 4 and runs only when the user requests it.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `js/reports.js` | Modify (`generateInventoryReport` single-driver branch + new helpers) | Catalog-union row list, render inline stepper, bind event handlers, call DB helpers |
| `service-worker.js` | Modify (cache version bump) | Force PWA clients to pick up the new JS |

No new files. No HTML changes (the report HTML is built dynamically in JS). No new DB methods.

---

## Task 1: Render full product catalog with inline stepper in single-driver live mode

**Files:**
- Modify: `js/reports.js` — function `generateInventoryReport`, single-driver branch (currently roughly lines 1163–1234 after recent edits; the implementer should locate it by function/branch identity rather than line numbers).

**Context the engineer needs:**

- This is a vanilla JS PWA with no build step. Edits to `.js` files take effect on browser refresh.
- The single-driver branch runs only when `driverId` is set AND `selectedDate` is empty (live mode).
- The current single-driver branch:
  1. Calls `inventoryData = await DB.getDriverInventory(driverId)` — returns rows where the driver has been assigned at least 1 unit at some point. Each row has `{id, name, assigned, sold, transferred, remaining}`.
  2. Calls `await DB.getDailyAssignmentsByDriver(driverId, today)` — returns `Map<productId, qty>` with today's net assignments per product.
  3. Builds a `mainStockMap` from `await DB.getAllProducts()` for the Main Stock column.
  4. Renders a 4-column table: Product / Remaining stock / Main Stock / Assigned.
- For this feature we need the row list to be the **union** of `inventoryData` and the full product catalog: every product in `DB.getAllProducts()` gets a row, even if the driver has never been assigned that product.
- Products the driver has never had display with `Remaining = 0`, `Assigned = 0`, plus a visual hint: muted grey product name with `(no inventory yet)` suffix.
- Sort order today: items in driver's `productOrder` first (in their saved order), then alphabetical fallback. New catalog products that aren't in `productOrder` and aren't in `inventoryData` should fall to the alphabetical-tail group, which preserves the current sorting policy.

- [ ] **Step 1.1: Read the current single-driver branch**

Open `js/reports.js`. Locate `generateInventoryReport` (search for `async generateInventoryReport()`). Read the entire `if (driverId) { ... }` block (single-driver branch) and the surrounding context (the `today` variable assignment, the `if (selectedDate)` early-return). Confirm you understand:
- Where `inventoryData` is built
- Where `mainStockMap` is built
- Where the table HTML is assembled and rendered
- That `bindInventoryReorderEvents()` is called at the end of the branch

- [ ] **Step 1.2: Replace the single-driver branch body with the new logic**

Find the existing single-driver branch — it begins with the line:
```javascript
    if (driverId) {
      // Get inventory for a specific driver
      inventoryData = await DB.getDriverInventory(driverId);
```

…and ends right before the `} else {` that starts the all-drivers branch (the line before `// Get inventory for all drivers`).

Replace the entire branch body (everything between `if (driverId) {` and the matching `} else {`) with this code:

```javascript
    if (driverId) {
      // Get the driver's inventory rows (only includes products they've been assigned at some point)
      const driverInventory = await DB.getDriverInventory(driverId);
      const dailyAssignments = await DB.getDailyAssignmentsByDriver(driverId, today);
      const allProducts = await DB.getAllProducts();
      const mainStockMap = new Map(allProducts.map(p => [p.id, p.totalQuantity]));

      // Build the row list as the union of driver's inventory + full catalog.
      // Products the driver has never had appear with remaining=0, assigned=0, and an "(no inventory yet)" hint.
      const inventoryById = new Map(driverInventory.map(item => [item.id, item]));

      const driver = await this.getCachedDriver(driverId);
      const driverProductOrder = (driver && driver.productOrder) || [];

      const inventoryData = [];
      // Existing inventory rows first, preserving order from getDriverInventory (which honors productOrder)
      for (const item of driverInventory) {
        inventoryData.push({ ...item, isUnassigned: false });
      }
      // Then add catalog products the driver has never touched, sorted alphabetically
      const catalogOnlyProducts = allProducts
        .filter(p => !inventoryById.has(p.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const product of catalogOnlyProducts) {
        inventoryData.push({
          id: product.id,
          name: product.name,
          assigned: 0,
          sold: 0,
          transferred: 0,
          remaining: 0,
          isUnassigned: true
        });
      }

      if (inventoryData.length === 0) {
        resultsDiv.innerHTML = '<p class="no-data">No products in catalog.</p>';
        return;
      }

      // Store current state for reordering and edit handlers
      this.currentInventoryData = inventoryData;
      this.currentDriverId = driverId;
      this.isEditOrderMode = false;

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

      inventoryData.forEach((item, index) => {
        const mainQty = mainStockMap.has(item.id) ? mainStockMap.get(item.id) : 0;
        const assignedToday = dailyAssignments.get(item.id) ?? 0;
        const productNameCell = item.isUnassigned
          ? `<span style="color: #999;">${item.name} <em style="font-size: 0.85em;">(no inventory yet)</em></span>`
          : item.name;
        const minusDisabled = item.remaining <= 0 ? 'disabled' : '';
        const plusDisabled = mainQty <= 0 ? 'disabled' : '';
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
            <td data-label="Product">${productNameCell}</td>
            <td data-label="Remaining stock">${item.remaining}</td>
            <td data-label="Main Stock">${mainQty}</td>
            <td data-label="Assigned">
              <div class="assigned-stepper" style="display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap;">
                <span class="assigned-today" style="font-weight: bold; min-width: 1.5em;">${assignedToday}</span>
                <button class="btn-stock-minus" data-product-id="${item.id}" data-product-name="${item.name}" ${minusDisabled} style="padding: 0.2rem 0.5rem; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">−</button>
                <input type="number" class="stock-qty-input" data-product-id="${item.id}" min="1" step="1" value="1" style="width: 3rem; padding: 0.2rem; border: 1px solid #ccc; border-radius: 3px;">
                <button class="btn-stock-plus" data-product-id="${item.id}" data-product-name="${item.name}" ${plusDisabled} style="padding: 0.2rem 0.5rem; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">+</button>
              </div>
            </td>
          </tr>
        `;
      });

      reportHTML += '</tbody></table>';
      resultsDiv.innerHTML = reportHTML;

      // Bind event listeners (reorder + new edit-stock listeners)
      this.bindInventoryReorderEvents();
      this.bindInventoryEditEvents();

```

Note the closing brace for the `if (driverId) {` block is the last `}` before `} else {`. Make sure that closing `}` is preserved (it ends the if-branch); your edit replaces only the body, not the surrounding `if`/`else` structure.

After this edit, the all-drivers branch (`} else {`) and everything beyond is unchanged.

- [ ] **Step 1.3: Add the `bindInventoryEditEvents` method**

Locate the existing `bindInventoryReorderEvents` method in `js/reports.js` (search for `bindInventoryReorderEvents()`). Read its full body to understand the event-binding pattern (clone-and-replace to avoid duplicate listeners). Immediately AFTER `bindInventoryReorderEvents` ends (after its closing `},`), add this new method:

```javascript
  // Bind +/- inline-stepper handlers in the single-driver live inventory report
  bindInventoryEditEvents() {
    const plusButtons = document.querySelectorAll('.btn-stock-plus');
    const minusButtons = document.querySelectorAll('.btn-stock-minus');

    plusButtons.forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', (e) => this.handleStockAdjustClick(e, '+'));
    });

    minusButtons.forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', (e) => this.handleStockAdjustClick(e, '-'));
    });
  },

  // Handle a + or - stepper click: validate, confirm, run, and refresh
  async handleStockAdjustClick(event, direction) {
    const button = event.currentTarget;
    const productId = button.getAttribute('data-product-id');
    const productName = button.getAttribute('data-product-name');
    const driverId = this.currentDriverId;
    if (!productId || !driverId) return;

    const qtyInput = document.querySelector(`.stock-qty-input[data-product-id="${productId}"]`);
    const qty = parseInt(qtyInput?.value, 10);

    if (!Number.isInteger(qty) || qty < 1) {
      alert('Enter a valid quantity (1 or more).');
      return;
    }

    // Look up current state for validation
    const row = this.currentInventoryData.find(item => item.id === productId);
    if (!row) {
      alert('Product no longer available — refresh the report.');
      return;
    }
    const allProducts = await DB.getAllProducts();
    const mainProduct = allProducts.find(p => p.id === productId);
    const mainQty = mainProduct ? mainProduct.totalQuantity : 0;

    if (direction === '+') {
      if (qty > mainQty) {
        alert(`Only ${mainQty} available in main inventory.`);
        return;
      }
    } else {
      if (qty > row.remaining) {
        alert(`Driver only has ${row.remaining} remaining.`);
        return;
      }
    }

    const driver = await this.getCachedDriver(driverId);
    const driverName = driver ? driver.name : 'this driver';
    const verb = direction === '+' ? `Add ${qty} of ${productName} to ${driverName}` : `Return ${qty} of ${productName} from ${driverName} to main inventory`;

    if (!confirm(`${verb}?`)) return;

    try {
      if (direction === '+') {
        await DB.addAssignment(driverId, productId, qty);
      } else {
        await DB.transferStock(driverId, 'main-inventory', productId, qty);
      }
      // Refresh: re-run the report with the same filters (driver still selected, no date)
      await this.generateInventoryReport();
    } catch (error) {
      console.error('Stock adjustment error:', error);
      alert(`Failed to update stock: ${error.message || error}`);
    }
  },
```

Note the trailing comma after `handleStockAdjustClick`'s closing `}` so the next method in the object literal still parses.

- [ ] **Step 1.4: Manually verify the rendering and full UX**

1. Reload the deployed app (or run locally with `python3 -m http.server 8000` and open `http://localhost:8000`). Hard reload to bypass service worker cache.
2. Log in as admin → Reports → Inventory Reports.
3. Pick a single driver, leave Date empty, click Generate Report.
4. **Expected layout:**
   - 4 columns: `Product | Remaining stock | Main Stock | Assigned`.
   - The Assigned cell now contains: today's number + a `−` button, a number input (default 1), and a `+` button.
   - Products the driver has never had show in muted grey with `(no inventory yet)` after the name and `0` in Remaining.
5. **Plus-action scenario:**
   - Find a product with Main Stock > 0. Type `3` in the input. Click `+`. Confirm popup appears: "Add 3 of <product> to <driver>?". Click OK.
   - Expected: report refreshes; that row's Remaining went up by 3, Main Stock went down by 3, Assigned went up by 3 (today's net).
   - Open Assign tab → Assignment History. Expected: a new entry "<product> (3 units) Assigned to: <driver>" with today's timestamp.
6. **Minus-action scenario:**
   - Find a product with Remaining > 0. Type `2` in input. Click `−`. Confirm popup: "Return 2 of <product> from <driver> to main inventory?". OK.
   - Expected: Remaining went down by 2, Main Stock went up by 2, Assigned went down by 2 (clamped at 0).
   - Open Assign tab → Transfer History. Expected: a new entry showing the collect-to-main transfer.
7. **Disabled / blocked states:**
   - Product where Main Stock is 0: `+` button is disabled (greyed out).
   - Product where driver Remaining is 0: `−` button is disabled.
   - Type `0` or empty → click `+` → alert "Enter a valid quantity (1 or more)."
   - Type a number larger than Main Stock → click `+` → alert "Only N available in main inventory."
   - Type a number larger than Remaining → click `−` → alert "Driver only has N remaining."
8. **Other views unchanged:**
   - Switch to "All Drivers" with no date → no +/− buttons anywhere.
   - Switch back to single driver and pick a past date → buttons disappear (historical mode shows the read-only Assigned column from the snapshot).
9. **Edit Order coexistence:**
   - Single driver, live mode, click "Edit Order" → arrow up/down buttons appear in their hidden first column. The +/− stepper still works. Reordering products still works. Click Save Order; reorder persists. Click Cancel; reorders revert.
10. **Driver "My Inventory" untouched:**
    - Log out, log in as the driver → "My Inventory" still shows only products the driver has been assigned (no `(no inventory yet)` rows). The catalog-union behavior must NOT leak into the driver's view.

- [ ] **Step 1.5: Checkpoint — work is commit-ready**

Confirm:
- All edits are inside `js/reports.js`.
- `git diff --stat js/reports.js` shows a single-file change.
- No console errors on Generate Report or after +/− actions.
- The `} else {` boundary between single-driver and all-drivers branches is intact.
- The `bindInventoryReorderEvents()` call is still present at the end of the single-driver branch (we did not remove it).
- The new `bindInventoryEditEvents()` method, plus `handleStockAdjustClick()`, are siblings in the `ReportsModule` object literal.

Do NOT commit yet — Task 4 batches the commit/deploy.

---

## Task 2: Cross-check that historical mode and all-drivers stay read-only

**Files:** none modified — verification only.

This task catches regressions in the views the spec says must remain read-only.

- [ ] **Step 2.1: Verify all the read-only views**

In one session:
1. Reports → Inventory Reports → "All Drivers" + no date → Generate. Expected: the per-driver tables have NO +/- buttons. Just the existing 4-column display.
2. Single driver + past date with snapshot → Generate. Expected: 3-column historical table, no buttons.
3. Single driver + past date with NO snapshot → "No inventory snapshot available…" message unchanged.
4. The "Overall Inventory Status" warehouse table at the top of the All Drivers view is unchanged (Product / Total Quantity).

- [ ] **Step 2.2: Verify driver-side views unchanged**

Log in as a driver → "My Inventory" view → Expected: shows only products the driver has been assigned, identical to before this change.

---

## Task 3: User performs the full manual verification scenarios

**Files:** none modified — verification only.

Repeat Step 1.4 scenarios as a final pass before committing. The user is the verifier here; subagents cannot drive the browser.

- [ ] **Step 3.1: Walk through Step 1.4 scenarios end-to-end on the deployed site**

If anything is off, report concrete inputs/outputs (which product, what number you typed, what you saw) so the implementer can fix before commit.

---

## Task 4: Commit, bump service worker, push, deploy

**Files:**
- Modify: `service-worker.js` — line 1, bump cache version.

This task only runs when the user explicitly says "commit and push" / "deploy" / equivalent.

- [ ] **Step 4.1: Bump service worker cache version**

Open `service-worker.js`. Line 1 currently is:

```javascript
const CACHE_NAME = 'inventory-manager-v47';
```

Bump to the next version (e.g. `v48`):

```javascript
const CACHE_NAME = 'inventory-manager-v48';
```

(If the version has been bumped further by another change in the meantime, increment from whatever the current value is — do not hardcode `v48`.)

- [ ] **Step 4.2: Commit all changes in one logical commit**

Include the spec and plan files if they are still untracked.

```bash
git add js/reports.js service-worker.js docs/superpowers/
git commit -m "$(cat <<'EOF'
Add inline +/- stock adjustment to Inventory Report

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4.3: Push to origin/main**

```bash
git push origin main
```

- [ ] **Step 4.4: Deploy**

```bash
firebase deploy --only hosting
```

Expected: deploy completes with `Hosting URL: https://chong-918f9.web.app`.

- [ ] **Step 4.5: Post-deploy verification**

1. Open `https://chong-918f9.web.app` in a private/incognito window (avoids stale service worker).
2. Log in as admin → Reports → Inventory Reports → single driver → Generate Report.
3. Confirm the +/− stepper appears and works as in Step 1.4.

---

## Self-Review

**Spec coverage:**

- [x] Spec §"Cell layout" → Task 1 step 1.2 renders today's number + `−` + qty input + `+` per row.
- [x] Spec §"`+` action → `addAssignment`" → Task 1 step 1.3 `handleStockAdjustClick` with direction `+`.
- [x] Spec §"`−` action → `transferStock(... 'main-inventory' ...)`" → Task 1 step 1.3 `handleStockAdjustClick` with direction `-`.
- [x] Spec §"Confirmation popup before each action" → `if (!confirm(...)) return;` in `handleStockAdjustClick`.
- [x] Spec §"Disabled and blocked states" — Main 0 / Remaining 0 disable; qty>limit alerts; qty<1 alerts → all in step 1.2 (disabled attrs) and step 1.3 (validation).
- [x] Spec §"Row list change" — full catalog union with `(no inventory yet)` hint → step 1.2's `inventoryData` build + `productNameCell` rendering.
- [x] Spec §"Refresh after action" → `await this.generateInventoryReport()` at the end of the success path in `handleStockAdjustClick`.
- [x] Spec §"Edit Order mode coexistence" → step 1.2 keeps `bindInventoryReorderEvents()` call; step 1.3's `bindInventoryEditEvents()` is independent.
- [x] Spec §"Where the controls appear" matrix → only the single-driver branch is modified; all-drivers and historical branches stay untouched. Verified in Task 2.
- [x] Spec §"Database operations (no new helpers)" → handler calls `DB.addAssignment` and `DB.transferStock` only; no new methods defined.
- [x] Spec §"Driver's existing My Inventory view is unchanged" → `getDriverInventory` itself is not modified; the catalog-union logic lives only in `generateInventoryReport`'s single-driver branch. Task 2 step 2.2 verifies.

**Placeholders / vagueness:** None. Every code step shows the exact code. Verification steps give concrete expected outputs.

**Type / property consistency:**
- `currentDriverId`, `currentInventoryData` — already used by the existing reorder code; reused as-is.
- `isUnassigned` — new boolean flag set by step 1.2 and consumed only by the rendering code in the same step. No leakage to other callers (it's added to the local row object via spread, not persisted).
- `data-product-id` / `data-product-name` attributes on buttons match the queries in `handleStockAdjustClick`.
- `.stock-qty-input[data-product-id="..."]` selector matches the input rendered in step 1.2.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-inline-edit-driver-stock-from-report.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
