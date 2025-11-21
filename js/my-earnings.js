/**
 * My Earnings Module (Driver View)
 * Handles driver earnings calculation based on completed deliveries
 */

const MyEarningsModule = {
  // Constants
  DELIVERY_FEE: 30, // $30 per delivery
  
  // Current filter state
  currentPeriod: 'day',
  currentDate: null,
  currentFilter: 'delivery',

  // Initialize the module
  async init() {
    console.log('MyEarningsModule.init() called');

    // Set default date to today (using local timezone)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    this.currentDate = `${year}-${month}-${day}`;

    // Initialize UI
    this.setupUI();
    this.bindEvents();
    await this.loadEarnings();
  },

  // Set up the UI elements
  setupUI() {
    // Set default date in date picker
    const dateInput = document.getElementById('earnings-date');
    if (dateInput) {
      dateInput.value = this.currentDate;
    }

    // Set default period
    const periodSelect = document.getElementById('earnings-period');
    if (periodSelect) {
      periodSelect.value = this.currentPeriod;
    }

    this.addEarningsStyles();
  },

  // Bind event listeners
  bindEvents() {
    // Period filter change
    const periodSelect = document.getElementById('earnings-period');
    if (periodSelect) {
      periodSelect.addEventListener('change', async () => {
        this.currentPeriod = periodSelect.value;
        await this.loadEarnings();
      });
    }

    // Date filter change
    const dateInput = document.getElementById('earnings-date');
    if (dateInput) {
      dateInput.addEventListener('change', async () => {
        this.currentDate = dateInput.value;
        await this.loadEarnings();
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-earnings');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await this.loadEarnings();
      });
    }

    // Earnings tab filters
    const earningsTabs = document.querySelectorAll('.earnings-tab');
    earningsTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Update active tab
        earningsTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update filter and reload
        this.currentFilter = tab.dataset.filter;
        this.displayOrdersList();
      });
    });

    // Driver to Boss payment form submission
    const paymentForm = document.getElementById('driver-to-boss-payment-form');
    if (paymentForm) {
      paymentForm.addEventListener('submit', (event) => this.handleDriverPaymentSubmit(event));
    }
  },

  // Load earnings data and update UI
  async loadEarnings() {
    console.log('Loading earnings for period:', this.currentPeriod, 'date:', this.currentDate);

    // Get current user and driver ID
    const session = DB.getCurrentSession();
    if (!session) {
      console.error('No active session found');
      return;
    }

    const user = await DB.getCurrentUser();
    const driverId = user ? user.driverId : null;

    if (!driverId) {
      this.showError('Driver profile not properly configured. Please contact administrator.');
      return;
    }

    // Store driver ID for later use
    this.currentDriverId = driverId;

    // Get filtered orders for the driver (for display based on selected period)
    const orders = await this.getFilteredOrders(driverId, this.currentPeriod, this.currentDate);
    console.log('Filtered orders:', orders);

    // Get direct payments for the driver (admin-to-driver) for selected period
    const directPayments = await DB.getDirectPaymentsByPeriod(driverId, this.currentPeriod, this.currentDate);
    console.log('Direct payments:', directPayments);

    // IMPORTANT: Get ALL-TIME data for holding calculation (not filtered by period)
    const allTimeOrders = await DB.getOrdersByDriver(driverId);
    const allTimeDirectPayments = await DB.getDirectPaymentsByDriver(driverId);
    const allTimeApprovedBossPayments = await DB.getApprovedDriverPayments(driverId, null, null);

    // Filter all-time orders to only completed/cancelled paid ones (same logic as getFilteredOrders)
    const allTimePaidOrders = allTimeOrders.filter(order => {
      if (order.status === DB.ORDER_STATUS.COMPLETED) {
        return true;
      }
      if (order.status === DB.ORDER_STATUS.CANCELLED) {
        return order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery';
      }
      return false;
    });

    // Calculate all-time holding
    const allTimeEarnings = this.calculateEarnings(allTimePaidOrders, allTimeDirectPayments, allTimeApprovedBossPayments);
    console.log('All-time holding:', allTimeEarnings.holdingAmount);

    // Get approved boss payments for selected period (for display in breakdown)
    const approvedBossPayments = await DB.getApprovedDriverPayments(driverId, this.currentPeriod, this.currentDate);
    console.log('Approved boss payments (period):', approvedBossPayments);

    // Calculate earnings for selected period (for display)
    const earnings = this.calculateEarnings(orders, directPayments, approvedBossPayments);
    console.log('Calculated earnings (period):', earnings);

    // Update UI - use period earnings for display, but ALL-TIME holding
    this.displayEarningsSummary(earnings);
    this.displayOrdersList(orders);
    this.displayHoldingAmount(allTimeEarnings.holdingAmount); // Use all-time holding!
    await this.loadDriverPaymentHistory(driverId);

    // Store all-time holding for payment validation
    this.currentHoldingAmount = allTimeEarnings.holdingAmount;
  },

  // Get filtered orders based on period and date
  async getFilteredOrders(driverId, period, date) {
    const allOrders = await DB.getOrdersByDriver(driverId);

    // Include completed orders and cancelled orders where driver should be paid
    const paidOrders = allOrders.filter(order => {
      if (order.status === DB.ORDER_STATUS.COMPLETED) {
        return true;
      }
      // Include cancelled orders where driver should still be paid (delivery method remains 'Paid')
      if (order.status === DB.ORDER_STATUS.CANCELLED) {
        return order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery';
      }
      return false;
    });

    if (!date) {
      return paidOrders;
    }

    const targetDate = new Date(date);

    // For 'day' period, use business day filtering instead of calendar date
    if (period === 'day') {
      // Get business days for the selected date
      const businessDays = await DB.getBusinessDayByDate(date);

      if (businessDays && businessDays.length > 0) {
        // Filter by business day IDs
        const businessDayIds = businessDays.map(d => d.id);
        return paidOrders.filter(order => businessDayIds.includes(order.businessDayId));
      } else {
        // No business day for this date - return empty
        return [];
      }
    }

    return paidOrders.filter(order => {
      // Use completedAt for completed orders, cancelledAt for cancelled orders, or createdAt as fallback
      const timestamp = order.completedAt || order.cancelledAt || order.createdAt;
      // Handle Firebase Timestamp properly
      const orderDate = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);

      switch(period) {
        case 'week':
          const weekStart = new Date(targetDate);
          weekStart.setDate(targetDate.getDate() - targetDate.getDay());
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          return orderDate >= weekStart && orderDate <= weekEnd;
        case 'month':
          return orderDate.getMonth() === targetDate.getMonth() && 
                 orderDate.getFullYear() === targetDate.getFullYear();
        default:
          return true;
      }
    });
  },

  // Calculate earnings from orders and direct payments
  calculateEarnings(orders, directPayments = [], approvedBossPayments = []) {
    // Separate completed and cancelled orders
    const completedOrders = orders.filter(order => order.status === DB.ORDER_STATUS.COMPLETED);
    const cancelledOrders = orders.filter(order => order.status === DB.ORDER_STATUS.CANCELLED);

    // For sales metrics, only count completed orders
    const totalSales = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // For driver salary, count paid orders from both completed and cancelled
    const paidOrders = orders.filter(order => order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery');
    const freeOrders = orders.filter(order => order.deliveryMethod === 'Free' || order.deliveryMethod === 'Pick up');

    const paidCount = paidOrders.length;

    // Calculate driver salary from orders by summing individual order salaries
    // Use nullish coalescing for backward compatibility (old orders default to $30)
    const orderSalary = paidOrders.reduce((sum, order) => {
      return sum + (order.driverSalary ?? this.DELIVERY_FEE);
    }, 0);

    // Calculate direct payments total (admin-to-driver payments only)
    const directPaymentsTotal = directPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Total driver earnings = order salary + direct payments
    const totalDriverEarnings = orderSalary + directPaymentsTotal;

    // Boss collection = Total completed sales - ALL driver payments (orders + direct payments)
    const bossCollection = totalSales - totalDriverEarnings;

    // NEW: Calculate approved boss payments total
    const approvedBossPaymentsTotal = approvedBossPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // NEW: Holding amount = What driver currently has (bossCollection - approved payments to boss)
    const holdingAmount = bossCollection - approvedBossPaymentsTotal;

    return {
      totalSales, // Only completed orders
      totalOrders: completedOrders.length, // Only completed orders for sales metrics
      deliveryCount: paidCount, // Keep old property name for compatibility (includes cancelled paid orders)
      pickupCount: freeOrders.length,
      driverSalary: orderSalary, // Salary from orders only (for display breakdown)
      directPaymentsTotal, // Total from direct payments
      totalDriverEarnings, // Combined total
      bossCollection, // Based on completed sales only
      approvedBossPaymentsTotal, // NEW: Total approved payments to boss
      holdingAmount, // NEW: Available to pay to boss
      deliveryOrders: paidOrders, // Keep old property name for compatibility
      pickupOrders: freeOrders,
      allOrders: orders, // All orders for display purposes
      completedOrders,
      cancelledOrders,
      directPayments, // Include direct payments for display
      approvedBossPayments // NEW: Include approved boss payments
    };
  },

  // Display earnings summary
  displayEarningsSummary(earnings) {
    // Total sales
    const totalSalesAmount = document.getElementById('total-sales-amount');
    const totalSalesDetail = document.getElementById('total-sales-detail');
    if (totalSalesAmount) {
      totalSalesAmount.textContent = `$${earnings.totalSales.toFixed(2)}`;
    }
    if (totalSalesDetail) {
      totalSalesDetail.textContent = `${earnings.totalOrders} completed orders`;
    }

    // Driver salary (now shows total earnings including direct payments)
    const driverSalaryAmount = document.getElementById('driver-salary-amount');
    const driverSalaryDetail = document.getElementById('driver-salary-detail');
    if (driverSalaryAmount) {
      driverSalaryAmount.textContent = `$${earnings.totalDriverEarnings.toFixed(2)}`;
    }
    if (driverSalaryDetail) {
      const completedPaidCount = earnings.completedOrders.filter(order => order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery').length;
      const cancelledPaidCount = earnings.cancelledOrders.filter(order => order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery').length;

      // Build detail text showing breakdown
      let detailParts = [];

      // Add order salary part
      if (completedPaidCount > 0 || cancelledPaidCount > 0) {
        if (cancelledPaidCount > 0) {
          detailParts.push(`$${earnings.driverSalary.toFixed(2)} from ${completedPaidCount + cancelledPaidCount} deliveries`);
        } else {
          detailParts.push(`$${earnings.driverSalary.toFixed(2)} from ${completedPaidCount} deliveries`);
        }
      }

      // Add direct payments part
      if (earnings.directPaymentsTotal !== 0) {
        const sign = earnings.directPaymentsTotal > 0 ? '+' : '';
        detailParts.push(`${sign}$${earnings.directPaymentsTotal.toFixed(2)} direct payments`);
      }

      // Combine or show default
      if (detailParts.length > 0) {
        driverSalaryDetail.textContent = detailParts.join(' + ');
      } else {
        driverSalaryDetail.textContent = `0 deliveries`;
      }
    }

    // Boss collection
    const bossCollectionAmount = document.getElementById('boss-collection-amount');
    if (bossCollectionAmount) {
      bossCollectionAmount.textContent = `$${earnings.bossCollection.toFixed(2)}`;
    }

    // Store earnings data for orders list display
    this.currentEarnings = earnings;
  },

  // Display orders list based on current filter
  displayOrdersList(orders = null) {
    const container = document.getElementById('earnings-list-container');
    const noDataMessage = document.getElementById('no-earnings-message');

    if (!container || !this.currentEarnings) {
      return;
    }

    // Clear container
    container.innerHTML = '';

    // Special handling for direct payments filter
    if (this.currentFilter === 'payments') {
      this.displayDirectPaymentsList();
      return;
    }

    // Determine which orders to show based on current filter
    let ordersToShow = [];
    switch (this.currentFilter) {
      case 'delivery':
        ordersToShow = this.currentEarnings.deliveryOrders;
        break;
      case 'pickup':
        ordersToShow = this.currentEarnings.pickupOrders;
        break;
      case 'all':
        ordersToShow = this.currentEarnings.allOrders;
        break;
    }

    if (ordersToShow.length === 0) {
      if (noDataMessage) {
        noDataMessage.style.display = 'block';
      }
      return;
    }

    if (noDataMessage) {
      noDataMessage.style.display = 'none';
    }

    // Sort orders by completion date, newest first
    ordersToShow.sort((a, b) => {
      const aTimestamp = a.completedAt || a.createdAt;
      const bTimestamp = b.completedAt || b.createdAt;
      const aDate = aTimestamp?.toDate ? aTimestamp.toDate() : new Date(aTimestamp);
      const bDate = bTimestamp?.toDate ? bTimestamp.toDate() : new Date(bTimestamp);
      return bDate - aDate;
    });

    // Display each order
    ordersToShow.forEach(order => {
      const orderElement = this.createOrderElement(order);
      container.appendChild(orderElement);
    });
  },

  // Create HTML element for an order
  createOrderElement(order) {
    const div = document.createElement('div');
    div.className = `earnings-item ${order.deliveryMethod.toLowerCase().replace(' ', '-')}`;
    
    const timestamp = order.completedAt || order.cancelledAt || order.createdAt;
    const completedDate = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const formattedDate = completedDate.toLocaleDateString();
    const formattedTime = completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const isPaid = order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery';
    const earningsAmount = isPaid ? (order.driverSalary ?? this.DELIVERY_FEE) : 0;
    
    div.innerHTML = `
      <div class="earnings-item-header">
        <div class="order-info">
          <div class="order-id">Order #${order.id.slice(-6).toUpperCase()}</div>
          <div class="order-date">${formattedDate} at ${formattedTime}</div>
          <div class="order-status ${order.status.toLowerCase()}">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</div>
        </div>
        <div class="order-amounts">
          <div class="sale-amount">$${order.totalAmount.toFixed(2)}</div>
          <div class="earnings-amount ${isPaid ? 'paid' : 'free'}">
            ${isPaid ? `+$${earningsAmount.toFixed(2)}` : 'Free'}
          </div>
        </div>
      </div>
      <div class="earnings-item-details">
        <div class="delivery-info">
          <i class="fas ${isPaid ? 'fa-truck' : 'fa-store'}"></i>
          <span>${order.deliveryMethod}</span>
        </div>
        <div class="customer-info">
          <i class="fas fa-map-marker-alt"></i>
          <span>${order.customerAddress}</span>
        </div>
        ${order.customerDescription ? `
          <div class="customer-description">
            <i class="fas fa-info-circle"></i>
            <span>${order.customerDescription}</span>
          </div>
        ` : ''}
        ${order.remark ? `
          <div class="order-remark">
            <i class="fas fa-sticky-note"></i>
            <span><strong>Remark:</strong> ${order.remark}</span>
          </div>
        ` : ''}
      </div>
    `;

    return div;
  },

  // Display direct payments list
  displayDirectPaymentsList() {
    const container = document.getElementById('earnings-list-container');
    const noDataMessage = document.getElementById('no-earnings-message');

    if (!container || !this.currentEarnings) {
      return;
    }

    // Clear container
    container.innerHTML = '';

    const directPayments = this.currentEarnings.directPayments || [];

    if (directPayments.length === 0) {
      if (noDataMessage) {
        noDataMessage.style.display = 'block';
        noDataMessage.innerHTML = `
          <i class="fas fa-inbox"></i>
          <p>No direct payments found</p>
          <small>Direct payments will appear here when made by admin or sales reps</small>
        `;
      }
      return;
    }

    if (noDataMessage) {
      noDataMessage.style.display = 'none';
    }

    // Sort payments by date, newest first
    directPayments.sort((a, b) => {
      const aDate = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const bDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return bDate - aDate;
    });

    // Display each payment
    directPayments.forEach(payment => {
      const paymentElement = this.createDirectPaymentElement(payment);
      container.appendChild(paymentElement);
    });
  },

  // Create HTML element for a direct payment
  createDirectPaymentElement(payment) {
    const div = document.createElement('div');
    const isPositive = payment.amount >= 0;
    div.className = `earnings-item ${isPositive ? 'payment-positive' : 'payment-negative'}`;

    const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
    const formattedDate = paymentDate.toLocaleDateString();

    // Format amount with sign
    const sign = payment.amount >= 0 ? '+' : '';
    const amountDisplay = `${sign}$${payment.amount.toFixed(2)}`;
    const amountClass = isPositive ? 'positive-amount' : 'negative-amount';

    div.innerHTML = `
      <div class="order-header">
        <div class="order-info">
          <div class="order-id">
            <i class="fas fa-money-bill-wave"></i>
            <span>Direct Payment</span>
          </div>
          <div class="order-date">${formattedDate}</div>
        </div>
        <div class="order-amount ${amountClass}" style="font-weight: bold;">
          ${amountDisplay}
        </div>
      </div>
      <div class="order-details">
        <div class="order-address">
          <i class="fas fa-comment"></i>
          <span>${payment.reason}</span>
        </div>
      </div>
    `;

    return div;
  },

  // Display holding amount in UI
  displayHoldingAmount(holdingAmount) {
    // Update the "Available to Pay" amount in the Pay Boss section
    const holdingAmountValue = document.getElementById('holding-amount-value');
    if (holdingAmountValue) {
      const displayAmount = Math.max(0, holdingAmount); // Don't show negative
      holdingAmountValue.textContent = `$${displayAmount.toFixed(2)}`;

      // Color code based on amount
      if (holdingAmount < 0) {
        holdingAmountValue.style.color = '#dc3545'; // Red for negative
      } else if (holdingAmount === 0) {
        holdingAmountValue.style.color = '#6c757d'; // Gray for zero
      } else {
        holdingAmountValue.style.color = '#28a745'; // Green for positive
      }
    }

    // Update the new Holding summary card
    const holdingSummaryAmount = document.getElementById('holding-summary-amount');
    if (holdingSummaryAmount) {
      const displayAmount = Math.max(0, holdingAmount); // Don't show negative
      holdingSummaryAmount.textContent = `$${displayAmount.toFixed(2)}`;
    }
  },

  // Load and display driver payment history
  async loadDriverPaymentHistory(driverId) {
    try {
      // Get all driver-to-boss payments (pending, approved, cancelled)
      const allPayments = await DB.getDriverPaymentHistory(driverId);
      this.displayDriverPaymentHistory(allPayments);
    } catch (error) {
      console.error('Error loading payment history:', error);
    }
  },

  // Display driver payment history
  displayDriverPaymentHistory(payments) {
    const paymentList = document.getElementById('driver-payment-list');
    const noPaymentsMessage = document.getElementById('no-payments-message');

    if (!paymentList) return;

    // Clear list
    paymentList.innerHTML = '';

    if (!payments || payments.length === 0) {
      if (noPaymentsMessage) {
        noPaymentsMessage.style.display = 'block';
      }
      return;
    }

    if (noPaymentsMessage) {
      noPaymentsMessage.style.display = 'none';
    }

    // Sort by date, newest first
    payments.sort((a, b) => {
      const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return bDate - aDate;
    });

    // Display each payment
    payments.forEach(payment => {
      const paymentElement = this.createDriverPaymentElement(payment);
      paymentList.appendChild(paymentElement);
    });
  },

  // Create HTML element for driver payment
  createDriverPaymentElement(payment) {
    const div = document.createElement('div');
    div.className = `payment-item payment-${payment.status}`;

    const paymentDate = payment.createdAt?.toDate ? payment.createdAt.toDate() : new Date(payment.createdAt);
    const formattedDate = paymentDate.toLocaleDateString();
    const formattedTime = paymentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Status badge
    let statusBadge = '';
    let statusIcon = '';
    if (payment.status === 'pending') {
      statusBadge = '<span class="status-badge pending"><i class="fas fa-clock"></i> Pending</span>';
      statusIcon = 'fa-clock';
    } else if (payment.status === 'approved') {
      statusBadge = '<span class="status-badge approved"><i class="fas fa-check-circle"></i> Approved</span>';
      statusIcon = 'fa-check-circle';
    } else if (payment.status === 'cancelled') {
      statusBadge = '<span class="status-badge cancelled"><i class="fas fa-times-circle"></i> Cancelled</span>';
      statusIcon = 'fa-times-circle';
    }

    div.innerHTML = `
      <div class="payment-header">
        <div class="payment-info">
          <div class="payment-amount">$${payment.amount.toFixed(2)}</div>
          <div class="payment-date">${formattedDate} at ${formattedTime}</div>
        </div>
        ${statusBadge}
      </div>
      <div class="payment-details">
        <div class="payment-reason">
          <i class="fas fa-comment"></i>
          <span>${payment.reason}</span>
        </div>
      </div>
    `;

    return div;
  },

  // Handle driver payment submission
  async handleDriverPaymentSubmit(event) {
    event.preventDefault();

    const amountInput = document.getElementById('boss-payment-amount');
    const reasonInput = document.getElementById('boss-payment-reason');
    const submitBtn = document.getElementById('submit-boss-payment');

    const amount = parseFloat(amountInput.value);
    const reason = reasonInput.value.trim();

    // Validation
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount greater than 0');
      return;
    }

    if (!reason || reason.length < 5) {
      alert('Please provide a reason (minimum 5 characters)');
      return;
    }

    // Check if amount exceeds ALL-TIME holding amount
    if (this.currentHoldingAmount !== undefined) {
      const holdingAmount = this.currentHoldingAmount;
      const displayHolding = Math.max(0, holdingAmount); // Show 0 if negative

      if (amount > holdingAmount || holdingAmount <= 0) {
        alert(`Cannot submit payment. Amount ($${amount.toFixed(2)}) exceeds available holding ($${displayHolding.toFixed(2)})`);
        return;
      }
    }

    // IMPORTANT: Check pending payments to prevent over-commitment
    try {
      const pendingPayments = await DB.getPendingDriverPayments(this.currentDriverId);
      const totalPendingAmount = pendingPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const totalCommitment = amount + totalPendingAmount;
      const availableAfterPending = this.currentHoldingAmount - totalPendingAmount;

      if (totalCommitment > this.currentHoldingAmount) {
        alert(
          `Cannot submit payment.\n\n` +
          `Current holding: $${this.currentHoldingAmount.toFixed(2)}\n` +
          `Pending payments: $${totalPendingAmount.toFixed(2)}\n` +
          `Available after pending: $${availableAfterPending.toFixed(2)}\n\n` +
          `Your payment of $${amount.toFixed(2)} would exceed available amount.`
        );
        return;
      }
    } catch (error) {
      console.error('Error checking pending payments:', error);
      alert('Failed to verify pending payments. Please try again.');
      return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    try {
      // Create payment
      await DB.createDriverToBossPayment({
        driverId: this.currentDriverId,
        amount: amount,
        reason: reason
      });

      // Success
      alert('Payment submitted successfully! Waiting for admin approval.');

      // Clear form
      amountInput.value = '';
      reasonInput.value = '';

      // Reload earnings and payment history
      await this.loadEarnings();

    } catch (error) {
      console.error('Error submitting payment:', error);
      alert('Failed to submit payment. Please try again.');
    } finally {
      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Payment';
    }
  },

  // Show error message
  showError(message) {
    const container = document.querySelector('.my-earnings-container');
    if (container) {
      container.innerHTML = `
        <h2>My Earnings</h2>
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>${message}</p>
        </div>
      `;
    }
  },

  // Add styles for earnings page
  addEarningsStyles() {
    if (document.getElementById('earnings-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'earnings-styles';
    styles.textContent = `
      .my-earnings-container {
        padding: 1rem;
        max-width: 1200px;
        margin: 0 auto;
      }

      .earnings-filters {
        display: flex;
        gap: 1rem;
        align-items: end;
        margin-bottom: 2rem;
        padding: 1rem;
        background: #f8f9fa;
        border-radius: var(--border-radius);
        border: 1px solid #e9ecef;
      }

      .earnings-summary {
        margin-bottom: 2rem;
      }

      .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .summary-card {
        background: white;
        border-radius: var(--border-radius);
        padding: 1.5rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        border-left: 4px solid;
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .summary-card.total-sales {
        border-left-color: #007bff;
      }

      .summary-card.driver-salary {
        border-left-color: #28a745;
        background: linear-gradient(135deg, #f0fff4 0%, #ffffff 100%);
      }

      .summary-card.boss-collection {
        border-left-color: #6c757d;
      }

      .summary-card.holding-amount {
        border-left-color: #17a2b8;
        background: linear-gradient(135deg, #e0f7fa 0%, #ffffff 100%);
      }

      .summary-icon {
        font-size: 2rem;
        color: var(--primary-color);
        flex-shrink: 0;
      }

      .summary-content {
        flex-grow: 1;
      }

      .summary-number {
        font-size: 1.75rem;
        font-weight: bold;
        color: #333;
        margin-bottom: 0.25rem;
      }

      .summary-label {
        font-size: 0.9rem;
        color: #666;
        margin-bottom: 0.25rem;
      }

      .summary-detail {
        font-size: 0.8rem;
        color: #888;
      }

      .earnings-breakdown {
        background: white;
        border-radius: var(--border-radius);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }

      .earnings-breakdown h3 {
        padding: 1rem 1.5rem;
        margin: 0;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
        color: #333;
      }

      .earnings-tabs {
        display: flex;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
      }

      .earnings-tab {
        flex: 1;
        padding: 0.75rem 1rem;
        background: none;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
        color: #666;
        font-weight: 500;
      }

      .earnings-tab.active {
        background: white;
        color: var(--primary-color);
        border-bottom: 2px solid var(--primary-color);
      }

      .earnings-tab:hover {
        background: #e9ecef;
      }

      .earnings-list {
        min-height: 200px;
      }

      .earnings-items {
        padding: 1rem;
      }

      .earnings-item {
        background: #fff;
        border: 1px solid #e9ecef;
        border-radius: var(--border-radius);
        margin-bottom: 1rem;
        overflow: hidden;
        transition: box-shadow 0.2s;
      }

      .earnings-item:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .earnings-item.delivery {
        border-left: 4px solid #28a745;
      }

      .earnings-item.pick-up {
        border-left: 4px solid #6c757d;
      }

      .earnings-item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
      }

      .order-info {
        flex-grow: 1;
      }

      .order-id {
        font-weight: bold;
        color: #333;
        font-size: 0.9rem;
      }

      .order-date {
        color: #666;
        font-size: 0.8rem;
        margin-top: 0.25rem;
      }

      .order-amounts {
        text-align: right;
      }

      .sale-amount {
        font-size: 1.1rem;
        font-weight: bold;
        color: #333;
      }

      .earnings-amount {
        font-size: 0.9rem;
        margin-top: 0.25rem;
        font-weight: 500;
      }

      .earnings-amount.paid {
        color: #28a745;
      }

      .earnings-amount.free {
        color: #6c757d;
      }

      .earnings-item-details {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .delivery-info,
      .customer-info,
      .customer-description {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: #666;
      }

      .delivery-info i {
        color: var(--primary-color);
        width: 16px;
      }

      .customer-info i,
      .customer-description i {
        color: #999;
        width: 16px;
      }

      .no-data-message {
        text-align: center;
        padding: 3rem 2rem;
        color: #666;
      }

      .no-data-message i {
        font-size: 3rem;
        color: #ddd;
        margin-bottom: 1rem;
      }

      .no-data-message p {
        font-size: 1.1rem;
        margin-bottom: 0.5rem;
      }

      .no-data-message small {
        color: #999;
      }

      .error-message {
        padding: 2rem;
        text-align: center;
        color: #e74c3c;
        background: #fff5f5;
        border: 1px solid #e74c3c;
        border-radius: var(--border-radius);
        margin: 1rem 0;
      }

      .error-message i {
        font-size: 2rem;
        margin-bottom: 1rem;
      }

      /* Direct payment styling */
      .payment-positive {
        border-left: 4px solid #28a745;
      }

      .payment-negative {
        border-left: 4px solid #dc3545;
      }

      .positive-amount {
        color: #28a745;
      }

      .negative-amount {
        color: #dc3545;
      }

      /* Mobile optimizations */
      @media (max-width: 768px) {
        .my-earnings-container {
          padding: 0.5rem;
        }

        .earnings-filters {
          flex-direction: column;
          align-items: stretch;
          gap: 0.75rem;
        }

        .summary-cards {
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }

        .summary-card {
          padding: 1rem;
          flex-direction: column;
          text-align: center;
          gap: 0.75rem;
        }

        .summary-icon {
          font-size: 1.5rem;
        }

        .summary-number {
          font-size: 1.5rem;
        }

        .earnings-tabs {
          flex-direction: column;
        }

        .earnings-tab {
          padding: 1rem;
          text-align: left;
        }

        .earnings-item-header {
          flex-direction: column;
          gap: 0.75rem;
          align-items: flex-start;
        }

        .order-amounts {
          text-align: left;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .earnings-item-details {
          padding: 0.75rem;
        }
      }

      @media (max-width: 480px) {
        .earnings-filters {
          padding: 0.75rem;
        }

        .summary-card {
          padding: 0.75rem;
        }

        .earnings-item-header {
          padding: 0.75rem;
        }

        .earnings-item-details {
          padding: 0.5rem 0.75rem;
          gap: 0.75rem;
        }

        .delivery-info,
        .customer-info,
        .customer-description {
          font-size: 0.85rem;
        }
        
        .order-status {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 0.25rem;
          display: inline-block;
        }
        
        .order-status.completed {
          background: #d4edda;
          color: #155724;
        }
        
        .order-status.cancelled {
          background: #f8d7da;
          color: #721c24;
        }
        
        .earnings-item.paid {
          border-left: 4px solid #28a745;
        }
        
        .earnings-item.free {
          border-left: 4px solid #6c757d;
        }
      }

      /* Pay Boss Section Styles */
      .pay-boss-section {
        margin-top: 2rem;
        background: white;
        border-radius: var(--border-radius);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }

      .pay-boss-section h3 {
        padding: 1rem 1.5rem;
        margin: 0;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
        color: #333;
      }

      .holding-amount-display {
        padding: 1.5rem;
        background: linear-gradient(135deg, #f0fff4 0%, #ffffff 100%);
        border-bottom: 1px solid #e9ecef;
      }

      .holding-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
      }

      .holding-info label {
        font-size: 1rem;
        font-weight: 500;
        color: #666;
      }

      .holding-amount {
        font-size: 1.75rem;
        font-weight: bold;
        color: #28a745;
      }

      .holding-formula {
        display: block;
        color: #888;
        font-size: 0.85rem;
        font-style: italic;
      }

      .payment-form {
        padding: 1.5rem;
        border-bottom: 1px solid #e9ecef;
      }

      .payment-form .form-group {
        margin-bottom: 1rem;
      }

      .payment-form label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #333;
      }

      .payment-form input,
      .payment-form textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #e9ecef;
        border-radius: var(--border-radius);
        font-size: 1rem;
      }

      .payment-form textarea {
        resize: vertical;
        font-family: inherit;
      }

      .payment-form button[type="submit"] {
        width: 100%;
        padding: 0.75rem;
        background: var(--primary-color);
        color: white;
        border: none;
        border-radius: var(--border-radius);
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }

      .payment-form button[type="submit"]:hover {
        background: #0056b3;
      }

      .payment-form button[type="submit"]:disabled {
        background: #6c757d;
        cursor: not-allowed;
      }

      .payment-history {
        padding: 1.5rem;
      }

      .payment-history h4 {
        margin: 0 0 1rem 0;
        color: #333;
        font-size: 1rem;
      }

      .payment-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .payment-item {
        background: #fff;
        border: 1px solid #e9ecef;
        border-radius: var(--border-radius);
        overflow: hidden;
        transition: box-shadow 0.2s;
      }

      .payment-item:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .payment-item.payment-pending {
        border-left: 4px solid #ffc107;
      }

      .payment-item.payment-approved {
        border-left: 4px solid #28a745;
      }

      .payment-item.payment-cancelled {
        border-left: 4px solid #dc3545;
        opacity: 0.7;
      }

      .payment-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
      }

      .payment-info {
        flex-grow: 1;
      }

      .payment-amount {
        font-size: 1.25rem;
        font-weight: bold;
        color: #333;
      }

      .payment-date {
        font-size: 0.8rem;
        color: #666;
        margin-top: 0.25rem;
      }

      .status-badge {
        padding: 0.5rem 1rem;
        border-radius: var(--border-radius);
        font-size: 0.85rem;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }

      .status-badge.pending {
        background: #fff3cd;
        color: #856404;
      }

      .status-badge.approved {
        background: #d4edda;
        color: #155724;
      }

      .status-badge.cancelled {
        background: #f8d7da;
        color: #721c24;
      }

      .payment-details {
        padding: 1rem;
      }

      .payment-reason {
        display: flex;
        align-items: start;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: #666;
      }

      .payment-reason i {
        color: #999;
        width: 16px;
        flex-shrink: 0;
        margin-top: 0.25rem;
      }

      @media (max-width: 768px) {
        .holding-info {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .payment-header {
          flex-direction: column;
          gap: 0.75rem;
          align-items: flex-start;
        }
      }
    `;
    document.head.appendChild(styles);
  }
};

// Export the module and make it globally available
export default MyEarningsModule;
window.MyEarningsModule = MyEarningsModule;