# Comprehensive Manual Testing Guide

## Inventory Management PWA - Role-Based Testing

This guide provides detailed, step-by-step testing scenarios for each user role. Follow these tests in order to ensure all functionality works correctly after the bug fixes.

---

## Pre-Testing Setup

### Initial Setup (Do Once)

1. Open your application in a browser (Chrome recommended)
2. Open DevTools (F12) → Console tab (keep it open to catch any errors)
3. **Clear all data** to start fresh:
   - DevTools → Application → Local Storage → Delete all
   - DevTools → Application → IndexedDB → Delete all (if any)
   - Refresh page
4. You should see the login screen

### Test Data Preparation

Before starting the role-specific tests, you'll need some baseline data. Use the default admin account to create:

- **Products**: At least 3 products (e.g., "Product A", "Product B", "Product C")
- **Drivers**: At least 2 drivers with user accounts
- **Sales Reps**: At least 1 sales rep user account

---

# TEST SUITE 1: ADMIN ROLE

**Duration: ~30-45 minutes**

---

## 1.1 Authentication & Authorization

### Test 1.1.1: Admin Login

**Steps:**

1. Go to login page
2. Enter username: `admin`
3. Enter password: `Admin123!`
4. Click "Login"

**Expected Results:**

- ✅ Login successful
- ✅ Dashboard displayed
- ✅ Tabs visible: Dashboard, Products, Drivers, Assignments, Orders, Users, Reports
- ✅ "My Orders", "My Inventory", "My Earnings" tabs are HIDDEN (driver-specific)
- ✅ User name displayed in header
- ✅ Logout button visible

**Pass/Fail:** Pass

---

### Test 1.1.2: Session Persistence

**Steps:**

1. While logged in, refresh the page (F5)

**Expected Results:**

- ✅ Still logged in after refresh
- ✅ No redirect to login page
- ✅ Same tabs still visible

**Pass/Fail:** Pass

---

### Test 1.1.3: Admin Logout

**Steps:**

1. Click "Logout" button
2. Confirm logout in dialog

**Expected Results:**

- ✅ Redirect to login page
- ✅ Dashboard no longer visible
- ✅ Session cleared

**Pass/Fail:** Pass

---

## 1.2 Product Management

**Setup:** Login as admin, go to "Products" tab

### Test 1.2.1: Add New Product

**Steps:**

1. Click "Add Product" button
2. Enter product name: "Test Product Alpha"
3. Leave quantity as 0 (default)
4. Click "Save"

**Expected Results:**

- ✅ Success notification appears
- ✅ Product appears in product list
- ✅ Product shows "Quantity: 0"
- ✅ Product has Edit and Delete buttons

**Pass/Fail:** Pass

---

### Test 1.2.2: Edit Product

**Steps:**

1. Find "Test Product Alpha" in list
2. Click "Edit" button
3. Change name to "Test Product Alpha - Updated"
4. Click "Save"

**Expected Results:**

- ✅ Success notification
- ✅ Product name updated in list
- ✅ No duplicate entries

**Pass/Fail:** Pass

---

### Test 1.2.3: Restock Product

**Steps:**

1. Find "Test Product Alpha - Updated"
2. Click "Restock" button
3. Enter quantity: `100`
4. Click "Restock"

**Expected Results:**

- ✅ Success notification
- ✅ Product now shows "Quantity: 100"
- ✅ Quantity updated immediately without refresh

**Pass/Fail:** Pass

---

### Test 1.2.4: Search Products

**Steps:**

1. In search box, type "Alpha"
2. Observe filtered list

**Expected Results:**

- ✅ Only products with "Alpha" in name are shown
- ✅ Other products are hidden
- ✅ Clearing search shows all products again

**Pass/Fail:** Pass

---

### Test 1.2.5: Delete Product (Should Fail If Used)

**Steps:**

1. Create a new product "Delete Test Product"
2. Try to delete it immediately
3. Confirm deletion

**Expected Results:**

- ✅ Product deleted successfully (since it has no dependencies)

**Pass/Fail:** Pass

---

## 1.3 Driver Management

**Setup:** Go to "Drivers" tab

### Test 1.3.1: Add Driver WITH User Account

**Steps:**

1. Click "Add Driver" button
2. Enter name: "Test Driver One"
3. Enter phone: "555-1001"
4. Check "Create user account" checkbox
5. Click "Save"

**Expected Results:**

- ✅ Success alert showing:
  - Driver added successfully
  - User account created
  - Generated username (e.g., "testdriverone" or "testdriverone1")
  - Default password: "Driver123!"
- ✅ Driver appears in list
- ✅ Driver shows status as "Active" (green)

**Pass/Fail:** Pass

**Record credentials for later:**

- Username: `testdriverone`
- Password: `Driver123!`

---

### Test 1.3.2: Add Driver WITHOUT User Account

**Steps:**

1. Click "Add Driver" button
2. Enter name: "Test Driver Two"
3. Enter phone: "555-1002"
4. DO NOT check "Create user account"
5. Click "Save"

**Expected Results:**

- ✅ Simple success notification (no credentials shown)
- ✅ Driver appears in list
- ✅ Driver shows "No user account linked" in RED

**Pass/Fail:** Pass

---

### Test 1.3.3: Edit Driver

**Steps:**

1. Find "Test Driver One"
2. Click "Edit" button
3. Change phone to "555-1001-UPDATED"
4. Click "Save"

**Expected Results:**

- ✅ Success notification
- ✅ Phone number updated in list

**Pass/Fail:** Pass

---

### Test 1.3.4: Search Drivers

**Steps:**

1. In search box, type "One"
2. Observe results

**Expected Results:**

- ✅ Only "Test Driver One" shown
- ✅ Other drivers hidden
- ✅ Clear search shows all drivers

**Pass/Fail:** Pass

---

## 1.4 Product Assignment to Drivers

**Setup:** Go to "Assignments" tab

### Test 1.4.1: Assign Stock to Driver

**Steps:**

1. In "Assign Products" section
2. Select Product: "Test Product Alpha - Updated" (should show 100 available)
3. Select Driver: "Test Driver One"
4. Enter Quantity: `30`
5. Click "Assign"

**Expected Results:**

- ✅ Success notification
- ✅ Assignment appears in "Assignment History" below
- ✅ Main product quantity reduced to 70
- ✅ Go to Products tab → verify "Test Product Alpha - Updated" now shows 70

**Pass/Fail:** Pass (but assignment history show invalid date - Fixed)

---

### Test 1.4.2: Assign More Stock to Same Driver

**Steps:**

1. Assign another 20 units of same product to same driver
2. Check assignment history

**Expected Results:**

- ✅ Two separate assignment entries visible
- ✅ Main product quantity now 50
- ✅ Driver has total 50 units assigned (cumulative)

**Pass/Fail:** Pass

---

### Test 1.4.3: Assign Exceeding Available Stock (Should Fail)

**Steps:**

1. Try to assign 100 units (more than available 50)
2. Click "Assign"

**Expected Results:**

- ✅ Error message: insufficient stock
- ✅ Assignment NOT created
- ✅ Main quantity still 50

**Pass/Fail:** Pass

---

### Test 1.4.4: Transfer Stock Between Drivers

**Steps:**

1. In "Transfer Products" section
2. Select Product: "Test Product Alpha - Updated"
3. From Driver: "Test Driver One"
4. To Driver: "Test Driver Two"
5. Quantity: `10`
6. Click "Transfer"

**Expected Results:**

- ✅ Success notification
- ✅ Transfer appears in "Transfer History"
- ✅ Driver One now has 40 units (50 - 10)
- ✅ Driver Two now has 10 units

**Pass/Fail:** Pass

---

### Test 1.4.5: Collect Stock Back to Main Inventory

**Steps:**

1. In "Transfer Products" section
2. Select Product: "Test Product Alpha - Updated"
3. From Driver: "Test Driver One"
4. To Driver: Select "-- Collect to Main Inventory --"
5. Quantity: `15`
6. Click "Transfer"

**Expected Results:**

- ✅ Success notification
- ✅ Driver One now has 25 units (40 - 15)
- ✅ Go to Products tab → Main inventory increased to 65 (50 + 15)

**Pass/Fail:** Pass

---

### Test 1.4.6: Filter Assignment History

**Steps:**

1. In "Assignment History" section
2. Select "Test Driver One" from dropdown
3. Click "Load Assignments"

**Expected Results:**

- ✅ Only assignments for Driver One shown
- ✅ Should see 2 assignment records (30 + 20)

**Pass/Fail:** Pass

---

### Test 1.4.7: Filter Transfer History

**Steps:**

1. In "Transfer History" section
2. Select "Test Driver One" from dropdown
3. Click "Load Transfers"

**Expected Results:**

- ✅ Shows transfers involving Driver One
- ✅ Should see 2 records (transfer to Driver Two + collect to main)

**Pass/Fail:** Pass

---

## 1.5 User Management

**Setup:** Go to "Users" tab

### Test 1.5.1: View All Users

**Steps:**

1. Observe user list

**Expected Results:**

- ✅ Admin user visible (yourself)
- ✅ Test Driver One's user account visible
- ✅ Each user shows: username, name, role, status (Active/Inactive)

**Pass/Fail:** ☐

---

### Test 1.5.2: Create Sales Rep User

**Steps:**

1. Click "Add User" button
2. Enter username: "salesrep1"
3. Enter password: "SalesRep123!" (at least 8 characters)
4. Enter name: "Test Sales Rep"
5. Select role: "Sales Rep"
6. Click "Save"

**Expected Results:**

- ✅ Success notification
- ✅ User appears in list with role "Sales Rep"
- ✅ User status is "Active"

**Pass/Fail:** Pass

**Record credentials:**

- Username: `salesrep1`
- Password: `SalesRep123!`

---

### Test 1.5.3: Create Driver User Linked to Existing Driver

**Steps:**

1. Click "Add User" button
2. Enter username: "driver2"
3. Enter password: "Driver2Pass!"
4. Enter name: "Test Driver Two Account"
5. Select role: "Driver"
6. Link to driver: Select "Test Driver Two" from dropdown
7. Click "Save"

**Expected Results:**

- ✅ Success notification
- ✅ User appears with role "Driver"
- ✅ Go to Drivers tab → "Test Driver Two" now shows "Active" instead of "No user account linked"

**Pass/Fail:** Pass

---

### Test 1.5.4: Deactivate User

**Steps:**

1. Find "driver2" user in list
2. Click "Deactivate" button
3. Confirm deactivation

**Expected Results:**

- ✅ Success notification
- ✅ User status changes to "Inactive" (red)
- ✅ User should not be able to login (test in incognito window if needed)

**Pass/Fail:** pass

---

### Test 1.5.5: Activate User

**Steps:**

1. Find "driver2" user
2. Click "Activate" button
3. Confirm activation

**Expected Results:**

- ✅ Success notification
- ✅ User status changes to "Active" (green)

**Pass/Fail:** pass

---

### Test 1.5.6: Reset User Password

**Steps:**

1. Find "salesrep1" user
2. Click "Reset Password" button
3. Enter new password: "NewPassword123!"
4. Confirm

**Expected Results:**

- ✅ Success alert showing new password
- ✅ User can login with new password (test later)

**Pass/Fail:** Pass

**Update credentials:**

- Username: `salesrep1`
- New Password: `NewPassword123!`

---

### Test 1.5.7: Edit User Role

**Steps:**

1. Find "salesrep1" user
2. Click "Edit" button
3. Change role from "Sales Rep" to "Admin"
4. Click "Save"

**Expected Results:**

- ✅ Success notification
- ✅ Role updated in list to "Admin"

**Pass/Fail:** No edit button to change roles. which is correct

---

### Test 1.5.8: Search Users

**Steps:**

1. In search box, type "driver"
2. Observe filtered results

**Expected Results:**

- ✅ Only users with "driver" in username/name shown
- ✅ Clear search shows all users

**Pass/Fail:** NO search box in users module (unnecessary)

---

## 1.6 Orders Management (Admin View)

**Setup:** Go to "Orders" tab

### Test 1.6.1: View All Orders

**Steps:**

1. Observe order list

**Expected Results:**

- ✅ All orders from all sales reps visible
- ✅ Each order shows: driver, customer, status, amount, date
- ✅ Status filter dropdown available (All, Pending, Completed, Cancelled)

**Pass/Fail:** Pass

---

### Test 1.6.2: Filter Orders by Status

**Steps:**

1. Select "Pending" from status filter
2. Observe list

**Expected Results:**

- ✅ Only pending orders shown
- ✅ Completed/cancelled orders hidden

**Pass/Fail:** pass

---

### Test 1.6.3: Real-Time Order Updates

**Steps:**

1. Keep Orders tab open
2. Open another browser window/incognito
3. Login as sales rep (you'll create orders in next test suite)
4. Create a new order
5. Switch back to admin window

**Expected Results:**

- ✅ New order appears automatically without manual refresh
- ✅ No duplicate entries

**Pass/Fail:** Pass (Test later with Sales Rep suite)

---

## 1.7 Reports

**Setup:** Go to "Reports" tab

### Test 1.7.1: Sales Report - Daily

**Steps:**

1. In "Sales Report" section
2. Select Period: "Day"
3. Select Date: Today's date
4. Select Driver: "All Drivers"
5. Click "Generate Report"

**Expected Results:**

- ✅ Report displays (may show "No data" if no completed orders)
- ✅ Shows: Total Revenue, Total Items, Total Orders
- ✅ If orders exist: product breakdown table visible
- ✅ If multiple drivers: driver breakdown table visible

**Pass/Fail:** Pass (tested it when there's no order, should come back again to test when there's complete orders)

---

### Test 1.7.2: Sales Report - Weekly

**Steps:**

1. Select Period: "Week"
2. Select Date: Today's date
3. Click "Generate Report"

**Expected Results:**

- ✅ Report shows date range (Sunday to Saturday of current week)
- ✅ Includes all completed orders in that week

**Pass/Fail:** Pass (same as above, needed more test)

---

### Test 1.7.3: Sales Report - Monthly

**Steps:**

1. Select Period: "Month"
2. Select Date: Today's date
3. Click "Generate Report"

**Expected Results:**

- ✅ Report shows date range (1st to last day of month)
- ✅ Month boundary calculation correct

**Pass/Fail:** pass (same as above, needed more test)

---

### Test 1.7.4: Sales Report - Specific Driver

**Steps:**

1. Select Period: "Month"
2. Select Driver: "Test Driver One"
3. Click "Generate Report"

**Expected Results:**

- ✅ Report shows only orders for selected driver
- ✅ Driver breakdown section NOT shown (single driver)

**Pass/Fail:** Pass (needed more test later)

---

### Test 1.7.5: Inventory Report - All Drivers

**Steps:**

1. In "Inventory Report" section
2. Select Driver: "All Drivers"
3. Click "Generate Report"

**Expected Results:**

- ✅ Overview table shows total assigned, sold, remaining across all products
- ✅ Breakdown by driver shows each driver's inventory
- ✅ Numbers are accurate based on assignments and orders

**Pass/Fail:** Pass (works but not responsive for mobile)

---

### Test 1.7.6: Inventory Report - Specific Driver

**Steps:**

1. Select Driver: "Test Driver One"
2. Click "Generate Report"

**Expected Results:**

- ✅ Table shows products, sold quantity, remaining quantity
- ✅ Only products assigned to this driver are shown
- ✅ Quantities match expected values (assigned - sold)

**Pass/Fail:** pass

---

## 1.8 Dashboard Functionality

**Setup:** Go to "Dashboard" tab

### Test 1.8.1: Admin Dashboard Display

**Steps:**

1. Observe dashboard

**Expected Results:**

- ✅ Shows "System Overview" or "Admin Dashboard"
- ✅ Displays key metrics (products, drivers, users, orders, etc.)
- ✅ Real-time updates when data changes

**Pass/Fail:** pass

---

# TEST SUITE 2: SALES REP ROLE

**Duration: ~25-35 minutes**

---

## 2.1 Authentication & Authorization

### Test 2.1.1: Sales Rep Login

**Steps:**

1. **Logout as admin first**
2. Go to login page
3. Enter username: `salesrep1` (or the one you created, with updated password)
4. Enter password: `NewPassword123!`
5. Click "Login"

**Expected Results:**

- ✅ Login successful
- ✅ Dashboard displayed
- ✅ Tabs visible: **Dashboard, Orders** ONLY
- ✅ Products, Drivers, Assignments, Users, Reports tabs are HIDDEN (admin-only)
- ✅ "My Orders", "My Inventory", "My Earnings" tabs are HIDDEN (driver-only)
- ✅ Logout button visible

**Pass/Fail:** pass

---

### Test 2.1.2: Sales Rep Session Persistence

**Steps:**

1. Refresh page (F5)

**Expected Results:**

- ✅ Still logged in
- ✅ Same limited tabs visible
- ✅ No access to admin features

**Pass/Fail:** pass

---

## 2.2 Dashboard (Sales Rep View)

**Setup:** Go to "Dashboard" tab

### Test 2.2.1: Sales Rep Dashboard Display

**Steps:**

1. Observe dashboard content

**Expected Results:**

- ✅ Shows sales-specific metrics
- ✅ May show: Today's orders, pending orders, completed orders
- ✅ Does NOT show admin-level system metrics
- ✅ Real-time updates

**Pass/Fail:** pass

---

## 2.3 Create Orders (CRITICAL - Tests Bug Fixes)

**Setup:** Go to "Orders" tab

### Test 2.3.1: Create Simple Order

**Steps:**

1. Click "Create Order" or "New Order" button
2. Select Driver: "Test Driver One"
3. Customer Address: "123 Test Street"
4. Customer Description: "Test Customer 1"
5. Delivery Method: "Paid"
6. Add Line Item:
   - Product: "Test Product Alpha - Updated"
   - Category: "Q" (deducts 1 unit)
   - Quantity: Leave as default
   - Free Gift: Unchecked
7. Enter Total Amount: `25.00`
8. Click "Create Order"

**Expected Results:**

- ✅ Success notification
- ✅ Order appears in order list with status "Pending"
- ✅ Order shows all entered details correctly
- ✅ **CRITICAL**: Check inventory (admin login required) - Driver One should have 1 less unit (24 remaining instead of 25)

**Pass/Fail:** Pass

**Notes:** This tests that inventory is deducted ONCE, not twice (Bug Fix #1)

---

### Test 2.3.2: Create Order with Multiple Line Items

**Steps:**

1. Click "Create Order"
2. Select Driver: "Test Driver One"
3. Customer Address: "456 Test Avenue"
4. Delivery Method: "Paid"
5. Add Line Item 1:
   - Product: "Test Product Alpha - Updated"
   - Category: "H" (deducts 2 units)
6. Add Line Item 2:
   - Product: Select another product if available
   - Category: "Q" (deducts 1 unit)
7. Enter Total Amount: `50.00`
8. Click "Create Order"

**Expected Results:**

- ✅ Order created successfully
- ✅ Order shows 2 line items
- ✅ Inventory deducted correctly for both items (total 3 units from Driver One)

**Pass/Fail:** Kinda works but have to make sure I press add line item first before picking products and quantity - Fixed

---

### Test 2.3.3: Create Order with Free Gift (NOW DEDUCTS INVENTORY - NEW BEHAVIOR)

**Steps:**

1. Note driver's current inventory for a product (e.g., Product A: 20 remaining)
2. Click "Create Order"
3. Select Driver: "Test Driver One"
4. Customer Address: "789 Test Boulevard"
5. Add Line Item:
   - Product: "Test Product Alpha - Updated"
   - Category: "Q" (deducts 1 unit)
   - **Check "Free Gift" checkbox**
6. Enter Total Amount: `0.00`
7. Click "Create Order"

**Expected Results:**

- ✅ Order created successfully
- ✅ **CRITICAL NEW BEHAVIOR**: Inventory IS deducted (check admin inventory - should be 19 remaining)
- ✅ Free gift badge shown in order details
- ✅ Driver inventory reduced by 1 unit (same as paid items)

**Pass/Fail:** ☐

**Notes:** Free gifts now deduct from inventory (changed behavior)

---

### Test 2.3.3b: Free Gift Requires Inventory (NEW VALIDATION)

**Steps:**

1. Find driver with exactly 1 unit remaining of a product
2. Click "Create Order"
3. Select that driver
4. Add Line Item:
   - Select the product with 1 unit
   - Category: "H" (requires 2 units)
   - **Check "Free Gift" checkbox**
5. Try to create order

**Expected Results:**

- ✅ **NEW VALIDATION**: Error message appears
- ✅ Error states "Insufficient inventory for [product name] (free gift)"
- ✅ Order NOT created
- ✅ Cannot give free gifts without sufficient inventory

**Pass/Fail:** ☐

**Notes:** Free gifts now require inventory validation just like paid items

---

### Test 2.3.4: Create Order with Category Deductions

**Steps:**

1. Create 4 separate orders with same product, different categories:

**Order A:**

- Category: "Q" → should deduct 1 unit
- Total: $10

**Order B:**

- Category: "H" → should deduct 2 units
- Total: $20

**Order C:**

- Category: "Oz" → should deduct 4 units
- Total: $40

**Order D:**

- Category: "Quantity by pcs"
- Enter actual quantity: 5 → should deduct 5 units
- Total: $50

**Expected Results:**

- ✅ All 4 orders created
- ✅ Total inventory deducted: 1 + 2 + 4 + 5 = 12 units
- ✅ Verify in admin inventory report

**Pass/Fail:** Pass

---

### Test 2.3.5: Create Order Exceeding Driver Inventory (Should Fail)

**Steps:**

1. Click "Create Order"
2. Select driver with limited inventory
3. Try to add more units than driver has
4. Try to create order

**Expected Results:**

- ✅ Error message: insufficient inventory
- ✅ Order NOT created
- ✅ Inventory unchanged

**Pass/Fail:** Pass

---

### Test 2.3.6: Driver Change Validation

**Steps:**

1. Start creating an order
2. Select Driver: "Test Driver One"
3. Add a product line item
4. Change driver to "Test Driver Two"
5. Observe line items

**Expected Results:**

- ✅ Line items are revalidated
- ✅ If Driver Two doesn't have the product, line item is cleared/flagged
- ✅ Can only select products that new driver has

**Pass/Fail:** Pass

---

## 2.4 Complete Orders

**Setup:** Have at least 2 pending orders from previous tests

### Test 2.4.1: Complete Order

**Steps:**

1. Find a pending order in list
2. Click "Complete" button
3. Confirm completion

**Expected Results:**

- ✅ Success notification
- ✅ Order status changes to "Completed"
- ✅ Order moves to completed section (if filtered)
- ✅ Inventory remains deducted (already deducted on creation)

**Pass/Fail:** Pass

---

## 2.5 Cancel Orders (CRITICAL - Tests Bug Fix #2)

**Setup:** Have at least 2 pending orders

### Test 2.5.1: Cancel Order WITHOUT Paying Driver

**Steps:**

1. Note current driver inventory (login as admin if needed: Driver One should have X units remaining)
2. Find a pending order (e.g., the one with 1 unit deducted)
3. Click "Cancel" button
4. In cancel dialog, **UNCHECK "Pay driver for this order"**
5. Confirm cancellation

**Expected Results:**

- ✅ Success notification
- ✅ Order status changes to "Cancelled"
- ✅ Order shows delivery method as "Free"
- ✅ **CRITICAL**: Check inventory - 1 unit should be RESTORED to driver
- ✅ Check inventory report (admin) - cancelled order should NOT count as "sold"

**Pass/Fail:** Pass

**Notes:** This was already working correctly before fixes.

---

### Test 2.5.2: Cancel Order WITH Paying Driver (CRITICAL BUG FIX)

**Steps:**

1. Note current driver inventory
2. Find another pending order (e.g., the one with 2 units deducted for "H" category)
3. Click "Cancel" button
4. In cancel dialog, **CHECK "Pay driver for this order"** (keep it checked)
5. Confirm cancellation

**Expected Results:**

- ✅ Success notification
- ✅ Order status changes to "Cancelled"
- ✅ Order delivery method stays as "Paid"
- ✅ **CRITICAL BUG FIX**: Check inventory - 2 units should be RESTORED to driver (THIS WAS BROKEN, NOW FIXED)
- ✅ Check inventory report (admin) - cancelled order should NOT count as "sold"
- ✅ Cancelled order should NOT appear in sales reports

**Pass/Fail:** Pass

**Notes:** 🔥 This is the main bug that was fixed! Before the fix, inventory was NOT restored when cancelling with driver payment.

---

### Test 2.5.3: Verify Sales Report Excludes Cancelled Orders

**Steps:**

1. Login as admin
2. Go to Reports tab
3. Generate sales report for today
4. Check if cancelled orders appear

**Expected Results:**

- ✅ Cancelled orders (both types) do NOT appear in sales report
- ✅ Only completed orders appear
- ✅ Total revenue only includes completed orders

**Pass/Fail:** Pass

---

### Test 2.5.4: Verify Inventory Report Accuracy After Cancellations

**Steps:**

1. Login as admin
2. Go to Reports → Inventory Report
3. Select "Test Driver One"
4. Generate report
5. Calculate expected inventory:
   - Started with: 25 units assigned
   - Deducted for completed orders: \_\_\_ units
   - Deducted for pending orders: \_\_\_ units
   - Cancelled orders: 0 units (should be restored)
   - Remaining = 25 - (completed + pending)

**Expected Results:**

- ✅ Remaining inventory matches calculation
- ✅ Cancelled orders are NOT counted in "sold"

**Pass/Fail:** Pass

---

## 2.6 Order List Management

### Test 2.6.1: Filter Orders by Status

**Steps:**

1. Use status filter dropdown
2. Select "Pending"
3. Select "Completed"
4. Select "Cancelled"
5. Select "All"

**Expected Results:**

- ✅ List filters correctly for each status
- ✅ Count matches visible orders
- ✅ Switching filters works smoothly

**Pass/Fail:** Pass

---

### Test 2.6.2: Real-Time Order Updates

**Steps:**

1. Keep Orders tab open
2. Open another browser window/incognito
3. Login as admin
4. Admin changes an order status
5. Switch back to sales rep window

**Expected Results:**

- ✅ Order status updates automatically
- ✅ No page refresh needed
- ✅ No duplicate entries

**Pass/Fail:** Pass

---

### Test 2.6.3: Copy Order Details to Clipboard

**Steps:**

1. Find any order
2. Click "Copy" button (if available)

**Expected Results:**

- ✅ Order details copied to clipboard
- ✅ Can paste into notepad/text editor
- ✅ Format is readable

**Pass/Fail:** Pass

---

### Test 2.6.4: View Order Details

**Steps:**

1. Click on an order to expand/view details

**Expected Results:**

- ✅ All order information displayed
- ✅ Line items with categories and quantities visible
- ✅ Customer information shown
- ✅ Order date/time shown
- ✅ Status clearly indicated

**Pass/Fail:** Pass

---

## 2.7 Sales Rep Limitations (Security Test)

### Test 2.7.1: Attempt to Access Admin Features

**Steps:**

1. Try to manually navigate to admin-only pages (if URLs are exposed)
2. Or try typing admin-only URLs in address bar

**Expected Results:**

- ✅ Access denied or redirected
- ✅ Error message if applicable
- ✅ Cannot view/modify products, drivers, users

**Pass/Fail:** Pass

---

### Test 2.7.2: Cannot View Other Sales Reps' Orders

**Steps:**

1. Check if order list shows orders from other sales reps

**Expected Results:**

- ✅ Only own orders visible
- ✅ Cannot see other sales reps' orders

**Pass/Fail:** Pass (Verify implementation) (but might change to everyone can see each other sales)

---

# TEST SUITE 3: DRIVER ROLE

**Duration: ~20-30 minutes**

---

## 3.1 Authentication & Authorization

### Test 3.1.1: Driver Login

**Steps:**

1. **Logout as sales rep**
2. Go to login page
3. Enter username: (the driver account you created, e.g., `testdriverone`)
4. Enter password: `Driver123!`
5. Click "Login"

**Expected Results:**

- ✅ Login successful
- ✅ Dashboard displayed
- ✅ Tabs visible: **Dashboard, My Orders, My Inventory, My Earnings** ONLY
- ✅ Products, Drivers, Assignments, Orders, Users, Reports tabs are HIDDEN (admin-only)
- ✅ Logout button visible
- ✅ Driver-specific interface shown

**Pass/Fail:** pass

---

### Test 3.1.2: Driver Session Persistence

**Steps:**

1. Refresh page (F5)

**Expected Results:**

- ✅ Still logged in
- ✅ Same driver-specific tabs visible
- ✅ No access to admin/sales features

**Pass/Fail:** pass

---

## 3.2 Dashboard (Driver View)

**Setup:** Go to "Dashboard" tab

### Test 3.2.1: Driver Dashboard Display

**Steps:**

1. Observe dashboard content

**Expected Results:**

- ✅ Shows driver-specific metrics
- ✅ May show: Assigned inventory, pending orders, completed orders, today's earnings
- ✅ Quick summary of inventory status
- ✅ Low stock alerts (if any products are low)

**Pass/Fail:** pass

---

### Test 3.2.2: Low Stock Alerts

**Steps:**

1. Check if any products are marked as low stock
2. Note which products have low inventory

**Expected Results:**

- ✅ Products with low quantity highlighted (e.g., red/yellow indicator)
- ✅ Alert message displayed if stock is low
- ✅ Accurate threshold (e.g., < 10 units = low)

**Pass/Fail:** pass (didnt test but most likely work. not too important too)

---

## 3.3 My Orders (Driver View)

**Setup:** Go to "My Orders" tab

### Test 3.3.1: View Assigned Orders

**Steps:**

1. Observe order list

**Expected Results:**

- ✅ Only orders assigned to THIS driver are visible
- ✅ Orders from other drivers are HIDDEN
- ✅ Each order shows: customer address, delivery method, amount, status, date
- ✅ Orders are sorted by date (newest first or oldest first)

**Pass/Fail:** Pass

---

### Test 3.3.2: Filter Orders by Status

**Steps:**

1. Use status filter (if available)
2. Filter by "Pending"
3. Filter by "Completed"
4. Filter by "All"

**Expected Results:**

- ✅ List filters correctly
- ✅ Status changes reflected immediately
- ✅ Count accurate

**Pass/Fail:** Pass

---

### Test 3.3.3: View Order Details

**Steps:**

1. Click on an order to view details

**Expected Results:**

- ✅ Customer address displayed
- ✅ Customer description shown (if provided)
- ✅ Line items with product names and quantities
- ✅ Total amount
- ✅ Delivery method (Paid/Free)
- ✅ Order status
- ✅ Created date/time

**Pass/Fail:** pass

---

### Test 3.3.4: Verify Cannot Modify Orders

**Steps:**

1. Try to find Edit/Delete/Complete/Cancel buttons on orders

**Expected Results:**

- ✅ NO buttons to modify order status
- ✅ Read-only view only
- ✅ Driver cannot complete/cancel orders (sales rep function only)

**Pass/Fail:** pass

---

### Test 3.3.5: Real-Time Order Updates

**Steps:**

1. Keep "My Orders" tab open
2. Open another browser window
3. Login as sales rep
4. Create a new order assigned to this driver
5. Switch back to driver window

**Expected Results:**

- ✅ New order appears automatically
- ✅ No manual refresh needed
- ✅ No duplicate entries
- ✅ Notification/indicator for new order (if implemented)

**Pass/Fail:** pass

---

### Test 3.3.6: Search/Filter Orders

**Steps:**

1. If search box is available, search by customer address or description
2. Observe filtered results

**Expected Results:**

- ✅ Matching orders shown
- ✅ Non-matching orders hidden
- ✅ Clear search shows all orders

**Pass/Fail:** pass

---

## 3.4 My Inventory (Driver View)

**Setup:** Go to "My Inventory" tab

### Test 3.4.1: View Current Inventory

**Steps:**

1. Observe inventory list

**Expected Results:**

- ✅ All products assigned to this driver are shown
- ✅ Each product shows:
  - Product name
  - Assigned quantity (total assigned to driver)
  - Sold quantity (from completed orders)
  - Remaining quantity (assigned - sold)
- ✅ Products with 0 remaining may be hidden or grayed out
- ✅ Quantities are accurate based on orders

**Pass/Fail:** pass

---

### Test 3.4.2: Verify Inventory Accuracy After Order Creation

**Steps:**

1. Note current "Remaining" quantity for a product
2. Open another window, login as sales rep
3. Create a new pending order for this driver with that product
4. Switch back to driver window

**Expected Results:**

- ✅ "Sold" quantity increased by order amount
- ✅ "Remaining" quantity decreased by order amount
- ✅ Update happens in real-time or after refresh

**Pass/Fail:** Pass

---

### Test 3.4.3: Verify Inventory Accuracy After Order Completion

**Steps:**

1. Note current inventory
2. Login as sales rep in another window
3. Complete a pending order
4. Check driver inventory again

**Expected Results:**

- ✅ Inventory unchanged (already deducted when order was created)
- ✅ "Sold" count includes completed orders
- ✅ Remaining quantity stays the same

**Pass/Fail:** Pass

---

### Test 3.4.4: Verify Inventory Restoration After Order Cancellation (CRITICAL)

**Steps:**

1. **Initial State**: Note driver inventory
   - Example: Product Alpha - Assigned: 25, Sold: 10, Remaining: 15
2. Login as sales rep in another window
3. Create a pending order for this driver: 5 units of Product Alpha
   - Expected: Sold: 15, Remaining: 10
4. Cancel the order WITHOUT paying driver
5. Switch back to driver inventory

**Expected Results:**

- ✅ Sold decreases back to 10 (5 units restored)
- ✅ Remaining increases back to 15
- ✅ Inventory accurately reflects cancellation

**Pass/Fail:** Pass

---

### Test 3.4.5: Verify Inventory Restoration for Cancelled Order WITH Payment (CRITICAL BUG FIX)

**Steps:**

1. Note current inventory
2. Create a pending order via sales rep: 3 units
   - Inventory should decrease by 3
3. Cancel order WITH paying driver (check "Pay driver")
4. Check driver inventory

**Expected Results:**

- ✅ **BUG FIX VERIFICATION**: Inventory RESTORED (3 units added back)
- ✅ Sold count decreases by 3
- ✅ Remaining increases by 3
- ✅ **THIS WAS BROKEN BEFORE - should now work correctly**

**Pass/Fail:** Pass

---

### Test 3.4.6: Low Stock Indicators

**Steps:**

1. Find a product with low remaining quantity (< 10 units)
2. Observe visual indicators

**Expected Results:**

- ✅ Low stock products highlighted (red/yellow)
- ✅ Warning icon or badge shown
- ✅ Threshold is reasonable (e.g., < 10 units)

**Pass/Fail:** Pass

---

### Test 3.4.7: Sort Inventory

**Steps:**

1. If sorting is available, try sorting by:
   - Product name
   - Remaining quantity
   - Sold quantity

**Expected Results:**

- ✅ List sorts correctly
- ✅ Ascending/descending toggle works
- ✅ Sort persists during session

**Pass/Fail:** Pass

---

### Test 3.4.8: Search Inventory

**Steps:**

1. If search is available, search for a product by name
2. Observe results

**Expected Results:**

- ✅ Matching products shown
- ✅ Non-matching products hidden
- ✅ Clear search shows all products

**Pass/Fail:** Pass (no search)

---

## 3.5 My Earnings (Driver View)

**Setup:** Go to "My Earnings" tab

### Test 3.5.1: View Earnings Summary

**Steps:**

1. Observe earnings display

**Expected Results:**

- ✅ Shows total earnings (from completed orders)
- ✅ May show breakdown by period (today, week, month)
- ✅ May show order count
- ✅ Only includes completed orders where delivery method = "Paid"
- ✅ Excludes cancelled orders where delivery method = "Free"
- ✅ **INCLUDES** cancelled orders where delivery method = "Paid" (driver still gets paid)

**Pass/Fail:** Pass

---

### Test 3.5.2: Filter Earnings by Period

**Steps:**

1. If period filter is available (Day/Week/Month)
2. Select "Day" and choose today
3. Select "Week" and choose current week
4. Select "Month" and choose current month

**Expected Results:**

- ✅ Earnings filtered correctly for each period
- ✅ Date range displayed accurately
- ✅ Calculations are correct

**Pass/Fail:** pass

---

### Test 3.5.3: Earnings from Cancelled Orders WITH Payment

**Steps:**

1. Check current total earnings (note the amount)
2. Login as sales rep
3. Create an order for this driver: $50, delivery method = Paid
4. Complete the order
5. Check driver earnings → should increase by $50
6. Cancel the order WITH "Pay driver" checked
7. Check driver earnings again

**Expected Results:**

- ✅ Earnings REMAIN at increased amount ($50 still counted)
- ✅ Cancelled orders with payment still contribute to earnings
- ✅ This is correct behavior (driver delivered but order was cancelled)

**Pass/Fail:** pass

---

### Test 3.5.4: Earnings from Cancelled Orders WITHOUT Payment

**Steps:**

1. Note current earnings
2. Create and complete an order for $30
3. Earnings increase by $30
4. Cancel order WITHOUT "Pay driver" (delivery method becomes "Free")
5. Check earnings

**Expected Results:**

- ✅ Earnings DECREASE by $30 (order no longer paid)
- ✅ Correctly reflects that driver is not paid for this order

**Pass/Fail:** pass

---

### Test 3.5.5: View Earnings History/Details

**Steps:**

1. If there's a detailed view or order list
2. Check individual order contributions to earnings

**Expected Results:**

- ✅ List of paid orders shown
- ✅ Each order shows amount contributed
- ✅ Date/time of each order
- ✅ Customer information (if shown)

**Pass/Fail:** Pass

---

## 3.6 Driver Limitations (Security Test)

### Test 3.6.1: Cannot Access Admin Features

**Steps:**

1. Try to access admin URLs manually
2. Try to navigate to Products, Drivers, Assignments, Users tabs

**Expected Results:**

- ✅ Access denied or redirected
- ✅ Cannot view admin-only content
- ✅ Tabs are hidden and inaccessible

**Pass/Fail:** pass (I guess is pass cuz there's no special url)

---

### Test 3.6.2: Cannot Access Sales Rep Features

**Steps:**

1. Try to access Orders tab (sales rep view)
2. Try to create/modify orders

**Expected Results:**

- ✅ Access denied
- ✅ Cannot create or modify orders
- ✅ Can only VIEW own orders in "My Orders"

**Pass/Fail:** pass

---

### Test 3.6.3: Cannot View Other Drivers' Data

**Steps:**

1. Check if any data from other drivers is visible
2. Check orders, inventory, earnings

**Expected Results:**

- ✅ Only own driver's data visible
- ✅ Cannot see other drivers' orders, inventory, or earnings
- ✅ Data is properly isolated

**Pass/Fail:** pass

---

## 3.7 Real-Time Updates

### Test 3.7.1: Inventory Updates in Real-Time

**Steps:**

1. Keep "My Inventory" tab open
2. Login as admin in another window
3. Assign more stock to this driver
4. Switch back to driver window

**Expected Results:**

- ✅ Inventory updates automatically
- ✅ New assigned quantity reflected
- ✅ No manual refresh needed

**Pass/Fail:** pass

---

### Test 3.7.2: Order Updates in Real-Time

**Steps:**

1. Keep "My Orders" tab open
2. Login as sales rep in another window
3. Complete a pending order for this driver
4. Switch back to driver window

**Expected Results:**

- ✅ Order status updates to "Completed" automatically
- ✅ Order moves to completed section (if filtered)
- ✅ Real-time sync working

**Pass/Fail:** pass

---

# CROSS-ROLE INTEGRATION TESTS

**Duration: ~15-20 minutes**

These tests verify that different roles work together correctly and data flows properly across the system.

---

## 4.1 Complete Workflow Test

### Test 4.1.1: End-to-End Order Flow

**Steps:**

1. **Admin**: Create product "Integration Test Product", restock to 100 units
2. **Admin**: Create driver "Integration Test Driver" with user account
3. **Admin**: Assign 50 units to driver
4. **Admin**: Create sales rep user "integrationrep"
5. **Sales Rep Login**: Create order for driver (10 units)
6. **Driver Login**: View order in "My Orders"
7. **Driver**: Check inventory - should show 10 units sold, 40 remaining
8. **Sales Rep**: Complete the order
9. **Driver**: Check earnings - should reflect order amount
10. **Admin**: Run sales report - order should appear
11. **Admin**: Run inventory report - should show accurate quantities

**Expected Results:**

- ✅ All steps complete without errors
- ✅ Data consistent across all roles
- ✅ Inventory tracking accurate throughout
- ✅ Reports reflect correct data

**Pass/Fail:** ☐

---

### Test 4.1.2: Cancellation Workflow (Critical)

**Steps:**

1. **Sales Rep**: Create order for 5 units (driver now has 35 remaining)
2. **Driver**: Verify inventory shows 15 sold, 35 remaining
3. **Sales Rep**: Cancel order WITH paying driver
4. **Driver**: Verify inventory shows 10 sold, 40 remaining (5 units restored)
5. **Driver**: Verify earnings still include cancelled order amount
6. **Admin**: Verify inventory report excludes cancelled order
7. **Admin**: Verify sales report excludes cancelled order

**Expected Results:**

- ✅ Inventory restored correctly
- ✅ Earnings handled correctly based on payment choice
- ✅ Reports exclude cancelled orders from sales
- ✅ **All roles see consistent data**

**Pass/Fail:** ☐

---

## 4.2 Concurrent User Tests

### Test 4.2.1: Multiple Users Creating Orders Simultaneously

**Steps:**

1. Open 2 browser windows (or use 2 devices)
2. Login as sales rep in both
3. Both create orders for same driver at exact same time
4. Submit both orders simultaneously

**Expected Results:**

- ✅ Both orders created successfully
- ✅ No duplicate order IDs
- ✅ Inventory deducted correctly for both orders
- ✅ No race condition errors
- ✅ No negative inventory

**Pass/Fail:** ☐

---

### Test 4.2.2: Admin Modifying Data While Sales Rep Uses It

**Steps:**

1. Sales rep starts creating an order
2. Admin deletes/modifies a driver or product while order form is open
3. Sales rep tries to submit order

**Expected Results:**

- ✅ Error handling if referenced data deleted
- ✅ Graceful validation message
- ✅ No system crash
- ✅ Data remains consistent

**Pass/Fail:** ☐

---

## 4.3 Data Consistency Tests

### Test 4.3.1: Inventory Calculations Across All Views

**Steps:**

1. **Admin**: Note main inventory quantity for a product
2. **Admin**: Note total assigned to all drivers
3. **Driver**: Note individual driver inventories
4. Calculate: Main + Sum(Driver Assigned) = Total Product Quantity?
5. **Admin**: Check inventory report totals

**Expected Results:**

- ✅ Main inventory + assigned inventory = total expected
- ✅ No inventory "lost" in the system
- ✅ Reports match actual data
- ✅ All calculations consistent

**Pass/Fail:** ☐

---

### Test 4.3.2: Order Counts Across Roles

**Steps:**

1. Count total orders in admin view
2. Count orders in sales rep view (should match if same sales rep)
3. Count orders in driver view (only for that driver)
4. Verify totals add up correctly

**Expected Results:**

- ✅ Order counts consistent
- ✅ Filtering works correctly
- ✅ No missing orders
- ✅ No duplicate orders

**Pass/Fail:** ☐

---

## 4.4 Report Accuracy Tests

### Test 4.4.1: Sales Report Matches Order Data

**Steps:**

1. Count all completed orders manually for today
2. Sum up total amounts
3. Generate sales report for today
4. Compare report totals with manual calculation

**Expected Results:**

- ✅ Report totals match manual calculation
- ✅ Product breakdown accurate
- ✅ Driver breakdown accurate
- ✅ Only completed orders included
- ✅ Cancelled orders excluded

**Pass/Fail:** ☐

---

### Test 4.4.2: Inventory Report Matches Actual Inventory

**Steps:**

1. For each driver, manually calculate:
   - Assigned = sum of all assignments
   - Sold = sum of line items in pending + completed orders (not cancelled)
   - Remaining = Assigned - Sold
2. Generate inventory report
3. Compare with manual calculations

**Expected Results:**

- ✅ Report matches calculations
- ✅ Cancelled orders properly excluded
- ✅ Free gifts NOW DEDUCT from inventory (new behavior)
- ✅ All drivers accounted for

**Pass/Fail:** ☐

---

### Test 4.4.3: Free Gift Reporting - Summary Stats (NEW FEATURE)

**Setup:** Create test orders with mix of paid and free gift items

**Steps:**

1. **Create Test Data** (as sales rep):
   - Order 1: 3x Product A (paid, Q type = 3 units)
   - Order 2: 2x Product B (free gift, H type = 4 units)
   - Order 3: 1x Product A (free gift, Q type = 1 unit)
2. Complete all orders
3. Login as admin → Go to Reports → Sales Report
4. Generate report for today
5. Check summary stats section

**Expected Results:**

- ✅ **4 stat cards displayed** (not 3)
- ✅ Card 1: "Total Revenue" - Shows revenue from paid items only
- ✅ Card 2: "Total Items Sold" - Shows 3 (paid items only, excludes free gifts)
- ✅ Card 3: "Number of Orders" - Shows 3
- ✅ Card 4: **"Number of Free Gifts" - Shows 5** (2+2 from H type + 1 from Q type) ⭐ NEW
- ✅ All numbers accurate and properly separated

**Pass/Fail:** ☐

**Notes:** This is a NEW feature - free gifts now tracked separately in reports

---

### Test 4.4.4: Free Gift Reporting - Product Breakdown Tables (NEW FEATURE)

**Setup:** Using same test data from Test 4.4.3

**Steps:**

1. Generate sales report for today
2. Scroll down to product breakdown section
3. Verify TWO separate tables exist

**Expected Results for "Sales by Product" Table:**

- ✅ Table shows ONLY paid items
- ✅ Product A: 3 units (free gift excluded)
- ✅ Product B: NOT listed (was free gift only)
- ✅ Sorted by quantity (highest first)

**Expected Results for "Free Gifts by Product" Table:**

- ✅ **NEW TABLE appears below "Sales by Product"**
- ✅ Table header: "Free Gifts by Product" ⭐ NEW
- ✅ Product B: 4 units (2 units x H type deduction)
- ✅ Product A: 1 unit
- ✅ Sorted by quantity (highest first - Product B at top)
- ✅ Uses same styling as "Sales by Product" table

**Pass/Fail:** ☐

---

### Test 4.4.5: Free Gift Section Visibility (NEW FEATURE)

**Steps:**

1. Generate report for period with NO free gifts
2. Check if "Free Gifts by Product" section appears
3. Generate report for period WITH free gifts
4. Check section visibility

**Expected Results:**

- ✅ When totalFreeGifts = 0: "Free Gifts by Product" section HIDDEN
- ✅ When totalFreeGifts > 0: "Free Gifts by Product" section VISIBLE
- ✅ "Number of Free Gifts" stat always shows (even if 0)

**Pass/Fail:** ☐

---

### Test 4.4.6: Free Gift Inventory Deduction (NEW BEHAVIOR)

**Setup:** Test that free gifts now deduct inventory

**Steps:**

1. Note driver's current inventory: Product A = 20 units remaining
2. As sales rep: Create order with Product A (Q type, **Free Gift checked**)
3. Check driver inventory immediately after order creation
4. Generate inventory report for driver

**Expected Results:**

- ✅ **CRITICAL NEW BEHAVIOR**: Inventory deducted by 1 unit (now 19 remaining)
- ✅ Inventory report shows "Sold: increased by 1"
- ✅ Free gifts treated identically to paid items for inventory
- ✅ Cancelled free gift orders restore inventory

**Pass/Fail:** ☐

**Notes:** This is a MAJOR behavior change - free gifts previously did NOT deduct inventory

---

### Test 4.4.7: Free Gift Report Accuracy Calculation

**Setup:** Manual calculation verification

**Steps:**

1. Create diverse test orders:
   - 2 orders with paid Q (2 units sold)
   - 1 order with paid H (2 units sold)
   - 3 orders with free gift Q (3 units as gifts)
   - 1 order with free gift Oz (4 units as gifts)
2. Manually calculate:
   - Total Items Sold (paid) = 2 + 2 = 4
   - Total Free Gifts = 3 + 4 = 7
3. Generate report
4. Compare with manual calculation

**Expected Results:**

- ✅ "Total Items Sold" = 4 (matches manual)
- ✅ "Number of Free Gifts" = 7 (matches manual)
- ✅ "Sales by Product" totals match paid items
- ✅ "Free Gifts by Product" totals match gift items
- ✅ Sum of both tables = total inventory deducted

**Pass/Fail:** ☐

---

### Test 4.4.8: Free Gift Date Range Filtering

**Steps:**

1. Create free gift order today
2. Create free gift order yesterday (if possible, or use different dates)
3. Generate reports for:
   - Today only
   - This week
   - This month

**Expected Results:**

- ✅ Today's report: Shows only today's free gifts
- ✅ Weekly report: Shows this week's free gifts
- ✅ Monthly report: Shows this month's free gifts
- ✅ Free gift filtering works same as paid items
- ✅ Date range filtering accurate for both tables

**Pass/Fail:** ☐

---

### Test 4.4.9: Mixed Orders in Reports (Paid + Free Gifts)

**Setup:** Test orders with both paid and free gift items

**Steps:**

1. Create single order with 3 line items:
   - Line 1: Product A, Q, paid (1 unit)
   - Line 2: Product B, H, **free gift** (2 units)
   - Line 3: Product C, Oz, paid (4 units)
2. Complete order
3. Generate sales report

**Expected Results:**

- ✅ "Total Items Sold": 5 (A + C only, 1+4)
- ✅ "Number of Free Gifts": 2 (B only)
- ✅ "Sales by Product":
  - Product A: 1
  - Product C: 4
  - Product B: NOT listed
- ✅ "Free Gifts by Product":
  - Product B: 2
  - Product A & C: NOT listed
- ✅ Clear separation between paid and gift items

**Pass/Fail:** ☐

---

## 4.5 Edge Cases

### Test 4.5.1: Empty States

**Steps:**

1. Create a new driver with no inventory
2. View as driver - check My Inventory tab
3. Create a driver with inventory but no orders
4. Generate reports with no data

**Expected Results:**

- ✅ "No data" messages displayed appropriately
- ✅ No errors or blank screens
- ✅ UI remains functional
- ✅ Can still perform other actions

**Pass/Fail:** ☐

---

### Test 4.5.2: Very Large Quantities

**Steps:**

1. Create order with large quantity (e.g., 9999 units)
2. Check calculations
3. Generate reports

**Expected Results:**

- ✅ Large numbers handled correctly
- ✅ No overflow errors
- ✅ UI displays numbers properly
- ✅ Reports format correctly

**Pass/Fail:** ☐

---

### Test 4.5.3: Special Characters in Text Fields

**Steps:**

1. Create product with special characters: `Test & "Product" <Special>`
2. Create order with customer address containing: `O'Brien's House, 123 1st St.`
3. View in different roles

**Expected Results:**

- ✅ Special characters displayed correctly
- ✅ No XSS vulnerabilities
- ✅ Data saved and retrieved properly
- ✅ No encoding issues

**Pass/Fail:** ☐

---

### Test 4.5.4: Browser Refresh During Operations

**Steps:**

1. Start creating an order
2. Refresh browser mid-way through
3. Start assignment
4. Refresh browser
5. Check data consistency

**Expected Results:**

- ✅ No partial data saved
- ✅ No corrupted state
- ✅ Form data cleared after refresh
- ✅ Can restart operation cleanly

**Pass/Fail:** ☐

---

# FINAL VERIFICATION CHECKLIST

After completing all tests, verify the following:

## Critical Bug Fixes Verification

### ✅ Bug Fix #1: Double Inventory Deduction

- ☐ Orders only deduct inventory once (not twice)
- ☐ No duplicate sale entries created
- ☐ Inventory calculations use orders, not legacy sales

### ✅ Bug Fix #2: Cancelled Order Inventory Restoration

- ☐ Cancelling order WITHOUT paying driver → inventory restored ✅
- ☐ Cancelling order WITH paying driver → inventory restored ✅ (was broken, now fixed)
- ☐ Both scenarios tested and working

### ✅ Bug Fix #3: User Deactivation

- ☐ Deactivate user button works
- ☐ Deactivated users cannot login
- ☐ Activate user button works

### ✅ Bug Fix #4: Password Reset Security

- ☐ Password reset hashes password properly
- ☐ Can login with new password
- ☐ No plain text passwords stored

### ✅ Bug Fix #5: Session Management

- ☐ Login works correctly
- ☐ Session persists across page refresh
- ☐ Logout clears session properly

### ✅ Bug Fix #6: Alert Formatting

- ☐ Driver creation alert shows proper line breaks
- ☐ Messages are readable

### ✅ Bug Fix #7: Report Null Checks

- ☐ Reports handle null values gracefully
- ☐ No crashes when data is missing

---

## General System Health

- ☐ No console errors during any tests
- ☐ No browser warnings
- ☐ Firebase sync working (check Network tab)
- ☐ Real-time updates working across all modules
- ☐ No memory leaks (check Chrome DevTools Memory tab after extended use)
- ☐ PWA installable (if on HTTPS)
- ☐ Offline functionality (if service worker active)

---

## Performance

- ☐ App loads within 3 seconds
- ☐ Order creation is instant
- ☐ Inventory updates quickly
- ☐ Reports generate within 5 seconds
- ☐ No lag when switching tabs
- ☐ Real-time updates appear within 1-2 seconds

---

## User Experience

- ☐ All forms have proper validation
- ☐ Error messages are clear and helpful
- ☐ Success notifications appear and are visible
- ☐ Loading indicators shown during operations
- ☐ UI is responsive on mobile devices
- ☐ Navigation is intuitive
- ☐ All buttons work as expected

---

# TEST RESULTS SUMMARY

## Test Statistics

**Admin Tests:**

- Total Tests: 35+
- Passed: \_\_\_
- Failed: \_\_\_
- Pass Rate: \_\_\_%

**Sales Rep Tests:**

- Total Tests: 25+
- Passed: \_\_\_
- Failed: \_\_\_
- Pass Rate: \_\_\_%

**Driver Tests:**

- Total Tests: 25+
- Passed: \_\_\_
- Failed: \_\_\_
- Pass Rate: \_\_\_%

**Integration Tests:**

- Total Tests: 15+
- Passed: \_\_\_
- Failed: \_\_\_
- Pass Rate: \_\_\_%

**Overall:**

- Total Tests: 100+
- Passed: \_\_\_
- Failed: \_\_\_
- **Overall Pass Rate: \_\_\_%**

---

## Critical Bugs Found During Testing

List any bugs found:

1. ***
2. ***
3. ***

---

## Recommendations

Based on testing results:

1. ***
2. ***
3. ***

---

## Test Completion

**Tested By:** **\*\*\*\***\_\_\_**\*\*\*\***
**Date:** **\*\*\*\***\_\_\_**\*\*\*\***
**Time Spent:** **\*\*\*\***\_\_\_**\*\*\*\***
**Environment:** Browser: **\_\_\_** OS: **\_\_\_** Device: **\_\_\_**

**Overall Assessment:**
☐ System ready for production
☐ Minor issues found, fixes recommended
☐ Major issues found, further development required

---

**Notes:**

---

---

---

---

# End of Comprehensive Testing Guide

**Good luck with your testing! 🚀**

Remember to test thoroughly, especially the critical bug fixes around order cancellation and inventory management. These are the core fixes that were made to your system.
