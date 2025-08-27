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
  init() {
    console.log('MyEarningsModule.init() called');
    
    // Set default date to today
    this.currentDate = new Date().toISOString().split('T')[0];
    
    // Initialize UI
    this.setupUI();
    this.bindEvents();
    this.loadEarnings();
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
      periodSelect.addEventListener('change', () => {
        this.currentPeriod = periodSelect.value;
        this.loadEarnings();
      });
    }

    // Date filter change
    const dateInput = document.getElementById('earnings-date');
    if (dateInput) {
      dateInput.addEventListener('change', () => {
        this.currentDate = dateInput.value;
        this.loadEarnings();
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-earnings');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadEarnings();
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
  },

  // Load earnings data and update UI
  loadEarnings() {
    console.log('Loading earnings for period:', this.currentPeriod, 'date:', this.currentDate);
    
    // Get current user and driver ID
    const session = DB.getCurrentSession();
    if (!session) {
      console.error('No active session found');
      return;
    }

    const user = DB.getCurrentUser();
    const driverId = user ? user.driverId : null;

    if (!driverId) {
      this.showError('Driver profile not properly configured. Please contact administrator.');
      return;
    }

    // Get filtered orders for the driver
    const orders = this.getFilteredOrders(driverId, this.currentPeriod, this.currentDate);
    console.log('Filtered orders:', orders);

    // Calculate earnings
    const earnings = this.calculateEarnings(orders);
    console.log('Calculated earnings:', earnings);

    // Update UI
    this.displayEarningsSummary(earnings);
    this.displayOrdersList(orders);
  },

  // Get filtered orders based on period and date
  getFilteredOrders(driverId, period, date) {
    const allOrders = DB.getOrdersByDriver(driverId);
    
    // Only include completed orders
    const completedOrders = allOrders.filter(order => order.status === DB.ORDER_STATUS.COMPLETED);
    
    if (!date) {
      return completedOrders;
    }

    const targetDate = new Date(date);
    
    return completedOrders.filter(order => {
      const orderDate = new Date(order.completedAt || order.createdAt);
      
      switch(period) {
        case 'day':
          return orderDate.toDateString() === targetDate.toDateString();
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

  // Calculate earnings from orders
  calculateEarnings(orders) {
    const deliveryOrders = orders.filter(order => order.deliveryMethod === 'Delivery');
    const pickupOrders = orders.filter(order => order.deliveryMethod === 'Pick up');
    
    const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const deliveryCount = deliveryOrders.length;
    const driverSalary = deliveryCount * this.DELIVERY_FEE;
    const bossCollection = totalSales - driverSalary;

    return {
      totalSales,
      totalOrders: orders.length,
      deliveryCount,
      pickupCount: pickupOrders.length,
      driverSalary,
      bossCollection,
      deliveryOrders,
      pickupOrders,
      allOrders: orders
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
      totalSalesDetail.textContent = `${earnings.totalOrders} orders`;
    }

    // Driver salary
    const driverSalaryAmount = document.getElementById('driver-salary-amount');
    const driverSalaryDetail = document.getElementById('driver-salary-detail');
    if (driverSalaryAmount) {
      driverSalaryAmount.textContent = `$${earnings.driverSalary.toFixed(2)}`;
    }
    if (driverSalaryDetail) {
      driverSalaryDetail.textContent = `${earnings.deliveryCount} deliveries × $30`;
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

    // Clear container
    container.innerHTML = '';

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
      const aDate = new Date(a.completedAt || a.createdAt);
      const bDate = new Date(b.completedAt || b.createdAt);
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
    
    const completedDate = new Date(order.completedAt || order.createdAt);
    const formattedDate = completedDate.toLocaleDateString();
    const formattedTime = completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const isDelivery = order.deliveryMethod === 'Delivery';
    const earningsAmount = isDelivery ? this.DELIVERY_FEE : 0;
    
    div.innerHTML = `
      <div class="earnings-item-header">
        <div class="order-info">
          <div class="order-id">Order #${order.id.slice(-6).toUpperCase()}</div>
          <div class="order-date">${formattedDate} at ${formattedTime}</div>
        </div>
        <div class="order-amounts">
          <div class="sale-amount">$${order.totalAmount.toFixed(2)}</div>
          <div class="earnings-amount ${isDelivery ? 'paid' : 'free'}">
            ${isDelivery ? `+$${earningsAmount.toFixed(2)}` : 'Free'}
          </div>
        </div>
      </div>
      <div class="earnings-item-details">
        <div class="delivery-info">
          <i class="fas ${isDelivery ? 'fa-truck' : 'fa-store'}"></i>
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
      </div>
    `;

    return div;
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
      }
    `;
    document.head.appendChild(styles);
  }
};