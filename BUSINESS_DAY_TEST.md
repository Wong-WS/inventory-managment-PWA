# Business Day Report Testing Guide

This guide helps you test the business day reporting feature to ensure orders are correctly grouped by business day sessions, not calendar dates.

---

## Test Case 1: Normal Usage (Single Session Per Day)

**Objective:** Verify that a business day spanning midnight shows all orders in the correct report.

### Setup Steps:
1. **Open Business Day (Day 1 - e.g., Nov 19):**
   - Time: 10:00 AM
   - Physical date: Nov 19

2. **Create Orders Throughout the Day:**
   - Order A: Created at 11:00 AM (Nov 19) - $50
   - Order B: Created at 8:00 PM (Nov 19) - $75
   - **Wait for midnight to pass** *(now you're physically on Nov 20)*
   - Order C: Created at 12:30 AM (Nov 20) - $100 *(calendar date is Nov 20, but business day still open)*

3. **Close Business Day (Day 2 - Nov 20):**
   - Time: 3:00 AM
   - Physical date: Nov 20

### Generate Reports (You're now on Nov 20):

**Report for Nov 19 (yesterday):**
- ✅ Should show Orders A, B, and C
- ✅ Total: $225
- ✅ All orders from 10:00 AM Nov 19 → 3:00 AM Nov 20
- **This is the key test:** Order C appears here even though created on Nov 20

**Report for Nov 20 (today):**
- ✅ Should show 0 orders (or "No order data found")
- ✅ Order C should NOT appear here (belongs to Nov 19's business day)

---

## Test Case 2: Multiple Sessions Same Day (Edge Case)

**Objective:** Verify that multiple business day sessions on the same calendar date all show up in the report.

### Setup Steps:
1. **First Business Day Session:**
   - Open: Nov 19, 8:00 AM
   - Create Order A: $50
   - Create Order B: $75
   - Close: Nov 19, 12:00 PM

2. **Second Business Day Session:**
   - Open: Nov 19, 1:00 PM
   - Create Order C: $100
   - Create Order D: $150
   - Create Order E: $200 *(created Nov 20, 12:30 AM)*
   - Close: Nov 20, 1:00 AM

3. **Third Business Day Session (Optional):**
   - Open: Nov 20, 2:00 AM
   - Create Order F: $80
   - Close: Nov 20, 5:00 PM

### Expected Results:

**Report for Nov 19:**
- ✅ Should show Orders A, B, C, D, E
- ✅ Total: $575
- ✅ Includes ALL sessions that opened on Nov 19
- ✅ Includes Order E even though created on Nov 20

**Report for Nov 20:**
- ✅ Should show Order F only
- ✅ Total: $80
- ✅ Does NOT include Order E (belongs to Nov 19's business)

---

## Test Case 3: No Business Day for Date

**Objective:** Verify that reports show nothing when no business day exists for that date.

### Setup Steps:
1. **Open Business Day:**
   - Nov 19, 10:00 AM
   - Create Order A: $50
   - Close: Nov 19, 5:00 PM

2. **Skip Nov 20 (don't open any business day)**

3. **Open Business Day:**
   - Nov 21, 10:00 AM
   - Create Order B: $75
   - Close: Nov 21, 6:00 PM

### Expected Results:

**Report for Nov 19:**
- ✅ Shows Order A ($50)

**Report for Nov 20:**
- ✅ Shows "No order data found"
- ✅ Total: $0 or empty

**Report for Nov 21:**
- ✅ Shows Order B ($75)

---

## How to Run Tests

### Step 1: Generate Test Data
1. Go to **Dashboard** or **Orders** tab
2. Open a business day using the "Open Day" button
3. Create orders using the **Orders** tab:
   - Fill in driver, customer details, products
   - Submit orders
4. Close the business day using the "Close Day" button
5. Repeat for different times/dates as needed

### Step 2: Generate Reports
1. Go to **Reports** tab
2. Select **"Sales Report"** section
3. Set **Period** to **"Day"**
4. Select the **date** you want to test
5. Click **"Generate Report"**
6. Review the orders shown

### Step 3: Verify Results
- Check that orders appear in the correct date's report
- Verify totals match expected values
- Confirm late-night orders appear in the business day they were created under, not the calendar date

---

## Important Notes

### Business Day = Session, Not Calendar Date
- When you open a business day on Nov 19, ALL orders created during that session belong to "Nov 19's business"
- Even if the session closes at 3:00 AM on Nov 20, those orders still count as Nov 19
- This matches real-world restaurant/retail business practices

### Multiple Sessions Per Day
- If you open/close multiple times on the same calendar date, a report for that date will show ALL orders from ALL sessions that started on that date
- This gives you the complete picture of that day's business activity

### Calendar Date Changes
- The calendar date changes at midnight, but your business day can span across midnight
- Reports are based on when the business day was **opened**, not when orders were created
- Example: Day opened Nov 19 → Orders created Nov 20 1am → Report shows under Nov 19

---

## Troubleshooting

### "No order data found" when orders exist
- **Possible Cause:** The business day was opened on a different date
- **Solution:** Check which date the business day was opened on and generate report for that date

### Orders appearing on wrong date
- **Possible Cause:** Looking at calendar date instead of business day open date
- **Solution:** Remember that orders belong to the business day they were created under, not the calendar date

### Multiple sessions showing duplicate orders
- **Possible Cause:** Bug in the aggregation logic
- **Solution:** Report this - each order should appear only once

---

## Test Checklist

- [ ] Test Case 1: Single session spanning midnight
- [ ] Test Case 2: Multiple sessions same day
- [ ] Test Case 3: No business day for a date
- [ ] Verify late-night orders appear in correct business day
- [ ] Verify reports show $0 or "no data" when appropriate
- [ ] Test with different drivers (if driver filter is used)
- [ ] Test week/month/year periods still work

---

## Expected Behavior Summary

| Scenario | Report Date | Expected Result |
|----------|-------------|-----------------|
| Day opened Nov 19, closed Nov 19 | Nov 19 | All orders from that session |
| Day opened Nov 19, closed Nov 20 1am | Nov 19 | All orders including those created after midnight |
| Day opened Nov 19, closed Nov 20 1am | Nov 20 | No orders (unless another day opened Nov 20) |
| Multiple sessions on Nov 19 | Nov 19 | Orders from ALL sessions that opened Nov 19 |
| No business day opened on Nov 20 | Nov 20 | "No order data found" |

---

## Questions or Issues?

If you encounter unexpected behavior:
1. Check browser console for errors
2. Verify business day was opened/closed correctly
3. Confirm orders have `businessDayId` field set
4. Check that the date filter matches the business day open date

Good luck with testing!
