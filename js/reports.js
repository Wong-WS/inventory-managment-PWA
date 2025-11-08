/**
 * Reports module
 * Handles generating sales and inventory reports
 */

const ReportsModule = {
  // Cache for drivers to avoid N+1 queries
  driversCache: new Map(),
  cacheInitialized: false,

  // Initialize cache with all drivers
  async initializeCache() {
    if (this.cacheInitialized) return;

    try {
      const drivers = await DB.getAllDrivers();

      this.driversCache.clear();
      drivers.forEach(driver => {
        this.driversCache.set(driver.id, driver);
      });

      this.cacheInitialized = true;
      console.log(`ReportsModule: Cache initialized - ${drivers.length} drivers`);
    } catch (error) {
      console.error('Failed to initialize cache:', error);
    }
  },

  // Get driver from cache (with fallback to DB)
  async getCachedDriver(driverId) {
    if (!driverId) return null;

    // Check cache first
    if (this.driversCache.has(driverId)) {
      return this.driversCache.get(driverId);
    }

    // Fallback to DB and update cache
    const driver = await DB.getDriverById(driverId);
    if (driver) {
      this.driversCache.set(driverId, driver);
    }
    return driver;
  },

  // Initialize the reports module
  async init() {
    // Initialize cache for performance
    await this.initializeCache();

    this.bindEvents();
    await this.updateDriverDropdowns();
    this.setDefaultDate();
  },

  // Bind event listeners
  bindEvents() {
    const salesReportBtn = document.getElementById('generate-sales-report');
    if (salesReportBtn) {
      salesReportBtn.addEventListener('click', async () => await this.generateSalesReport());
    }

    const inventoryReportBtn = document.getElementById('generate-inventory-report');
    if (inventoryReportBtn) {
      inventoryReportBtn.addEventListener('click', async () => await this.generateInventoryReport());
    }

    const earningsReportBtn = document.getElementById('generate-earnings-report');
    if (earningsReportBtn) {
      earningsReportBtn.addEventListener('click', async () => await this.generateDriverEarningsReport());
    }

    const reportTabs = document.querySelectorAll('.report-tab');
    reportTabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchReportTab(tab.dataset.report));
    });
  },

  // Set default date to today
  setDefaultDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const defaultDate = `${year}-${month}-${day}`;

    const dateInput = document.getElementById('report-date');
    if (dateInput) {
      dateInput.value = defaultDate;
    }

    const earningsDateInput = document.getElementById('earnings-date');
    if (earningsDateInput) {
      earningsDateInput.value = defaultDate;
    }
  },

  // Switch between report tabs
  switchReportTab(tabId) {
    // Update tab buttons
    const tabButtons = document.querySelectorAll('.report-tab');
    tabButtons.forEach(button => {
      if (button.dataset.report === tabId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // Update report sections
    const reportSections = document.querySelectorAll('.report-section');
    reportSections.forEach(section => {
      if (section.id === `${tabId}-report`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });
  },

  // Show loading indicator
  showLoading(elementId, message = 'Loading...') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>
    `;
  },

  // Generate sales report
  async generateSalesReport() {
    const driverSelect = document.getElementById('report-driver');
    const periodSelect = document.getElementById('report-period');
    const dateInput = document.getElementById('report-date');
    const resultsDiv = document.getElementById('sales-report-results');

    if (!resultsDiv) return;

    const driverId = driverSelect.value;
    const period = periodSelect.value;
    const date = dateInput.value;

    if (!period || !date) {
      alert('Please select a period and date.');
      return;
    }

    // Show loading state
    this.showLoading('sales-report-results', 'Generating sales report...');

    // Get orders for the specified period and driver (use orders if available, fallback to sales)
    const orders = typeof DB.getOrdersByPeriod === 'function' ?
      await DB.getOrdersByPeriod(driverId, period, date) :
      (typeof DB.getSalesByPeriod === 'function' ? await DB.getSalesByPeriod(driverId, period, date) : []);

    if (orders.length === 0) {
      resultsDiv.innerHTML = '<p class="no-data">No order data found for the selected period.</p>';
      return;
    }

    // Calculate totals and prepare report data
    let totalSales = 0;
    let totalItems = 0;
    let totalFreeGifts = 0;
    const productTotals = {};
    const freeGiftProductTotals = {};
    const driverTotals = {};

    // Pre-fetch all unique driver IDs in parallel batch
    const driverIds = [...new Set(orders.map(o => o.driverId))];
    const missingDrivers = driverIds.filter(id => !this.driversCache.has(id));

    if (missingDrivers.length > 0) {
      await Promise.all(missingDrivers.map(id => this.getCachedDriver(id)));
    }

    for (const order of orders) {
      // Skip cancelled orders for sales report (only count completed orders)
      if (order.status === DB.ORDER_STATUS.CANCELLED) {
        continue;
      }

      // Use cached driver (instant lookup!)
      const driver = this.driversCache.get(order.driverId);
      if (!driver) continue;

      // Aggregate total order amount (completed orders only)
      totalSales += order.totalAmount;

      // Aggregate by driver
      if (!driverTotals[order.driverId]) {
        driverTotals[order.driverId] = {
          name: driver.name,
          sales: 0,
          items: 0
        };
      }
      driverTotals[order.driverId].sales += order.totalAmount;
      
      // Aggregate by product (separate tracking for paid items vs free gifts)
      order.lineItems.forEach(item => {
        // Use actualQuantity if available (new format), otherwise fall back to quantity (old format)
        const deductionAmount = item.actualQuantity != null ? item.actualQuantity : item.quantity;

        if (!item.isFreeGift) {
          // Track paid items (for "Sales by Product")
          totalItems += deductionAmount;
          driverTotals[order.driverId].items += deductionAmount;

          if (!productTotals[item.productId]) {
            productTotals[item.productId] = {
              name: item.productName,
              quantity: 0
            };
          }
          productTotals[item.productId].quantity += deductionAmount;
        } else {
          // Track free gifts separately (for "Free Gifts by Product")
          totalFreeGifts += deductionAmount;

          if (!freeGiftProductTotals[item.productId]) {
            freeGiftProductTotals[item.productId] = {
              name: item.productName,
              quantity: 0
            };
          }
          freeGiftProductTotals[item.productId].quantity += deductionAmount;
        }
      });
    }
    
    // Format date range for display
    const displayDate = new Date(date);
    let dateRangeText = '';
    
    switch(period) {
      case 'day':
        dateRangeText = displayDate.toLocaleDateString();
        break;
      case 'week': {
        const weekStart = new Date(displayDate);
        weekStart.setDate(displayDate.getDate() - displayDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        dateRangeText = `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
        break;
      }
      case 'month': {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        dateRangeText = `${monthNames[displayDate.getMonth()]} ${displayDate.getFullYear()}`;
        break;
      }
      case 'year':
        dateRangeText = displayDate.getFullYear().toString();
        break;
    }
    
    // Build report HTML
    let reportHTML = `
      <div class="report-summary">
        <h4>Orders Report: ${dateRangeText}</h4>
        <div class="report-stats">
          <div class="stat-item">
            <span class="stat-label">Total Revenue:</span>
            <span class="stat-value">$${totalSales.toFixed(2)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Items Sold:</span>
            <span class="stat-value">${totalItems}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Number of Orders:</span>
            <span class="stat-value">${orders.length}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Number of Free Gifts:</span>
            <span class="stat-value">${totalFreeGifts}</span>
          </div>
        </div>
      </div>
    `;
    
    // Driver breakdown (if not filtering by a specific driver)
    if (!driverId && Object.keys(driverTotals).length > 1) {
      reportHTML += '<h4>Orders by Driver</h4>';
      reportHTML += '<table class="report-table">';
      reportHTML += '<thead><tr><th>Driver</th><th>Revenue</th><th>Items</th><th>% of Total</th></tr></thead>';
      reportHTML += '<tbody>';

      Object.values(driverTotals)
        .sort((a, b) => b.sales - a.sales)
        .forEach(driver => {
          const percentage = (driver.sales / totalSales * 100).toFixed(1);
          reportHTML += `
            <tr>
              <td data-label="Driver">${driver.name}</td>
              <td data-label="Revenue">$${driver.sales.toFixed(2)}</td>
              <td data-label="Items">${driver.items}</td>
              <td data-label="% of Total">${percentage}%</td>
            </tr>
          `;
        });

      reportHTML += '</tbody></table>';
    }
    
    // Product breakdown
    reportHTML += '<h4>Sales by Product</h4>';
    reportHTML += '<table class="report-table">';
    reportHTML += '<thead><tr><th>Product</th><th>Quantity</th></tr></thead>';
    reportHTML += '<tbody>';

    Object.values(productTotals)
      .sort((a, b) => b.quantity - a.quantity)
      .forEach(product => {
        reportHTML += `
          <tr>
            <td data-label="Product">${product.name}</td>
            <td data-label="Quantity">${product.quantity}</td>
          </tr>
        `;
      });

    reportHTML += '</tbody></table>';

    // Free gifts breakdown (only show if there are free gifts)
    if (totalFreeGifts > 0) {
      reportHTML += '<h4>Free Gifts by Product</h4>';
      reportHTML += '<table class="report-table">';
      reportHTML += '<thead><tr><th>Product</th><th>Quantity</th></tr></thead>';
      reportHTML += '<tbody>';

      Object.values(freeGiftProductTotals)
        .sort((a, b) => b.quantity - a.quantity)
        .forEach(product => {
          reportHTML += `
            <tr>
              <td data-label="Product">${product.name}</td>
              <td data-label="Quantity">${product.quantity}</td>
            </tr>
          `;
        });

      reportHTML += '</tbody></table>';
    }

    // Display the report
    resultsDiv.innerHTML = reportHTML;
    
    // Add some styles for the report
    const style = document.createElement('style');
    style.textContent = `
      .report-summary {
        margin-bottom: 1.5rem;
      }
      .report-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      .stat-item {
        background-color: var(--card-background);
        padding: 1rem;
        border-radius: var(--border-radius);
        box-shadow: var(--box-shadow);
        min-height: 80px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .stat-label {
        font-weight: 500;
        margin-bottom: 0.5rem;
        display: block;
        font-size: 0.9rem;
        color: #666;
      }
      .stat-value {
        font-weight: 700;
        color: var(--primary-color);
        font-size: 1.5rem;
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        margin-bottom: 1.5rem;
        overflow-x: auto;
        display: block;
      }
      .report-table thead,
      .report-table tbody,
      .report-table tr {
        display: table;
        width: 100%;
        table-layout: fixed;
      }
      .report-table th, .report-table td {
        padding: 0.8rem;
        text-align: left;
        border-bottom: 1px solid var(--border-color);
      }
      .report-table th {
        background-color: rgba(0,0,0,0.05);
        font-weight: 600;
      }
      .report-table tbody tr:nth-child(even) {
        background-color: rgba(0,0,0,0.02);
      }
      .no-data {
        padding: 1rem;
        text-align: center;
        color: #666;
      }

      /* Mobile optimization */
      @media (max-width: 767px) {
        .report-stats {
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }
        .stat-item {
          padding: 0.75rem;
          min-height: 60px;
        }
      }
    `;
    
    if (!document.head.querySelector('style[data-report-styles]')) {
      style.setAttribute('data-report-styles', 'true');
      document.head.appendChild(style);
    }
  },

  // Generate inventory report
  async generateInventoryReport() {
    const driverSelect = document.getElementById('inventory-driver');
    const resultsDiv = document.getElementById('inventory-report-results');

    if (!resultsDiv) return;

    const driverId = driverSelect.value;

    // Show loading state
    this.showLoading('inventory-report-results', 'Generating inventory report...');

    let inventoryData = [];

    if (driverId) {
      // Get inventory for a specific driver
      inventoryData = await DB.getDriverInventory(driverId);

      if (inventoryData.length === 0) {
        resultsDiv.innerHTML = '<p class="no-data">No inventory data found for the selected driver.</p>';
        return;
      }

      // Sort by product name
      inventoryData.sort((a, b) => a.name.localeCompare(b.name));

      // Build report HTML for a specific driver
      const driver = await this.getCachedDriver(driverId);
      
      let reportHTML = `
        <div class="report-summary">
          <h4>Inventory Report for ${driver.name}</h4>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Sold</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
      `;

      inventoryData.forEach(item => {
        reportHTML += `
          <tr>
            <td data-label="Product">${item.name}</td>
            <td data-label="Sold">${item.sold}</td>
            <td data-label="Remaining">${item.remaining}</td>
          </tr>
        `;
      });

      reportHTML += '</tbody></table>';
      resultsDiv.innerHTML = reportHTML;
      
    } else {
      // Get inventory for all drivers
      const drivers = await DB.getAllDrivers();

      if (drivers.length === 0) {
        resultsDiv.innerHTML = '<p class="no-data">No drivers found.</p>';
        return;
      }

      // Build report HTML for all drivers
      let reportHTML = `
        <div class="report-summary">
          <h4>Inventory Report for All Drivers</h4>
        </div>
      `;

      // Overall inventory status
      const products = await DB.getAllProducts();
      
      reportHTML += `
        <h4>Overall Inventory Status</h4>
        <table class="report-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Total Quantity</th>
            </tr>
          </thead>
          <tbody>
      `;

      products.sort((a, b) => a.name.localeCompare(b.name)).forEach(product => {
        reportHTML += `
          <tr>
            <td data-label="Product">${product.name}</td>
            <td data-label="Total Quantity">${product.totalQuantity}</td>
          </tr>
        `;
      });

      reportHTML += '</tbody></table>';

      // Pre-fetch all driver inventories in parallel (much faster!)
      const driverInventories = await Promise.all(
        drivers.map(async (driver) => ({
          driver,
          inventory: await DB.getDriverInventory(driver.id)
        }))
      );

      // Per driver inventory
      for (const { driver, inventory: driverInventory } of driverInventories) {
        
        if (driverInventory.length > 0) {
          reportHTML += `
            <h4>${driver.name}'s Inventory</h4>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Sold</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
          `;

          driverInventory.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            reportHTML += `
              <tr>
                <td data-label="Product">${item.name}</td>
                <td data-label="Sold">${item.sold}</td>
                <td data-label="Remaining">${item.remaining}</td>
              </tr>
            `;
          });

          reportHTML += '</tbody></table>';
        } else {
          reportHTML += `
            <h4>${driver.name}'s Inventory</h4>
            <p class="no-data">No inventory assigned to this driver.</p>
          `;
        }
      }
      
      resultsDiv.innerHTML = reportHTML;
    }
    
    // Styles already loaded from sales report generation
    // No need to duplicate
  },

  // Update driver dropdowns
  async updateDriverDropdowns() {
    if (typeof DriversModule !== 'undefined') {
      await DriversModule.updateDriverDropdowns();
    }
  },

  // ===== DRIVER EARNINGS REPORT METHODS =====

  // Helper: Format date range for display
  formatDateRange(period, date) {
    const displayDate = new Date(date);
    let dateRangeText = '';

    switch(period) {
      case 'day':
        dateRangeText = displayDate.toLocaleDateString();
        break;
      case 'week': {
        const weekStart = new Date(displayDate);
        weekStart.setDate(displayDate.getDate() - displayDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        dateRangeText = `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
        break;
      }
      case 'month': {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        dateRangeText = `${monthNames[displayDate.getMonth()]} ${displayDate.getFullYear()}`;
        break;
      }
      case 'year':
        dateRangeText = displayDate.getFullYear().toString();
        break;
    }

    return dateRangeText;
  },

  // Generate driver earnings report (main entry point)
  async generateDriverEarningsReport() {
    const driverId = document.getElementById('earnings-driver').value;
    const period = document.getElementById('earnings-period').value;
    const date = document.getElementById('earnings-date').value;

    if (!date) {
      alert('Please select a date');
      return;
    }

    this.showLoading('earnings-report-results', 'Calculating earnings...');

    try {
      if (driverId) {
        // Single driver view
        await this.generateSingleDriverEarnings(driverId, period, date);
      } else {
        // All drivers view
        await this.generateAllDriversEarnings(period, date);
      }
    } catch (error) {
      console.error('Error generating earnings report:', error);
      document.getElementById('earnings-report-results').innerHTML =
        `<div class="no-data">Error generating report: ${error.message}</div>`;
    }
  },

  // Generate earnings report for all drivers
  async generateAllDriversEarnings(period, date) {
    const drivers = await DB.getAllDrivers();

    if (drivers.length === 0) {
      document.getElementById('earnings-report-results').innerHTML =
        '<div class="no-data">No drivers found</div>';
      return;
    }

    // Calculate earnings for each driver in parallel
    const driverEarningsPromises = drivers.map(async (driver) => {
      const orders = await DB.getOrdersByPeriod(driver.id, period, date);
      const directPayments = await DB.getDirectPaymentsByPeriod(driver.id, period, date);
      const earnings = this.calculateDriverEarnings(orders, directPayments);
      return {
        driver,
        ...earnings
      };
    });

    const driverEarnings = await Promise.all(driverEarningsPromises);

    // Calculate totals
    const totals = {
      totalSales: driverEarnings.reduce((sum, d) => sum + d.totalSales, 0),
      totalDriverSalary: driverEarnings.reduce((sum, d) => sum + d.driverSalary, 0),
      totalDirectPayments: driverEarnings.reduce((sum, d) => sum + d.directPaymentsTotal, 0),
      totalDriverEarnings: driverEarnings.reduce((sum, d) => sum + d.totalDriverEarnings, 0),
      totalBossCollection: driverEarnings.reduce((sum, d) => sum + d.bossCollection, 0),
      totalOrders: driverEarnings.reduce((sum, d) => sum + d.totalOrders, 0),
      totalDeliveries: driverEarnings.reduce((sum, d) => sum + d.deliveryCount, 0)
    };

    // Render the all-drivers view
    this.renderAllDriversEarningsReport(driverEarnings, totals, period, date);
  },

  // Generate earnings report for a single driver
  async generateSingleDriverEarnings(driverId, period, date) {
    const driver = await this.getCachedDriver(driverId);
    if (!driver) {
      document.getElementById('earnings-report-results').innerHTML =
        '<div class="no-data">Driver not found</div>';
      return;
    }

    const orders = await DB.getOrdersByPeriod(driverId, period, date);
    const directPayments = await DB.getDirectPaymentsByPeriod(driverId, period, date);
    const earnings = this.calculateDriverEarnings(orders, directPayments);

    // Render the single-driver view
    this.renderSingleDriverEarningsReport(driver, earnings, orders, directPayments, period, date);
  },

  // Calculate driver earnings from orders and direct payments
  calculateDriverEarnings(orders, directPayments = []) {
    // Separate completed and cancelled orders
    const completedOrders = orders.filter(order => order.status === DB.ORDER_STATUS.COMPLETED);
    const cancelledOrders = orders.filter(order => order.status === DB.ORDER_STATUS.CANCELLED);

    // For sales metrics, only count completed orders
    const totalSales = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // For driver salary, count paid orders from both completed and cancelled
    const paidOrders = orders.filter(order =>
      order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery'
    );
    const freeOrders = orders.filter(order =>
      order.deliveryMethod === 'Free' || order.deliveryMethod === 'Pick up'
    );

    const paidCount = paidOrders.length;

    // Calculate driver salary from orders by summing individual order salaries
    // Use nullish coalescing for backward compatibility (old orders default to $30)
    const DELIVERY_FEE = 30;
    const driverSalary = paidOrders.reduce((sum, order) => {
      return sum + (order.driverSalary ?? DELIVERY_FEE);
    }, 0);

    // Calculate direct payments total
    const directPaymentsTotal = directPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Total driver earnings = order salary + direct payments
    const totalDriverEarnings = driverSalary + directPaymentsTotal;

    // Boss collection = Total completed sales - ALL driver payments
    const bossCollection = totalSales - totalDriverEarnings;

    return {
      totalSales,
      totalOrders: completedOrders.length,
      deliveryCount: paidCount,
      pickupCount: freeOrders.length,
      driverSalary,              // Salary from orders only
      directPaymentsTotal,       // Total from direct payments
      totalDriverEarnings,       // Combined total
      bossCollection,
      completedOrders,
      cancelledOrders,
      paidOrders,
      freeOrders,
      directPayments             // Include for display
    };
  },

  // Render all drivers earnings report
  renderAllDriversEarningsReport(driverEarnings, totals, period, date) {
    const dateRange = this.formatDateRange(period, date);

    let html = `
      <div class="report-summary">
        <h4>Driver Earnings Report: ${dateRange}</h4>
        <div class="report-stats">
          <div class="stat-item">
            <span class="stat-label">Total Sales:</span>
            <span class="stat-value">$${totals.totalSales.toFixed(2)}</span>
            <span class="stat-detail">${totals.totalOrders} completed orders</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Order Salary:</span>
            <span class="stat-value">$${totals.totalDriverSalary.toFixed(2)}</span>
            <span class="stat-detail">${totals.totalDeliveries} paid deliveries</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Direct Payments:</span>
            <span class="stat-value">$${totals.totalDirectPayments.toFixed(2)}</span>
            <span class="stat-detail">Bonuses, advances, etc.</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total to Drivers:</span>
            <span class="stat-value">$${totals.totalDriverEarnings.toFixed(2)}</span>
            <span class="stat-detail">All driver payments</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Boss Collection:</span>
            <span class="stat-value">$${totals.totalBossCollection.toFixed(2)}</span>
            <span class="stat-detail">${((totals.totalBossCollection / totals.totalSales * 100) || 0).toFixed(1)}% of sales</span>
          </div>
        </div>
      </div>

      <h4>Earnings by Driver</h4>
    `;

    // Sort drivers by total sales (descending)
    const sortedEarnings = [...driverEarnings].sort((a, b) => b.totalSales - a.totalSales);

    if (sortedEarnings.length === 0 || sortedEarnings.every(d => d.totalSales === 0)) {
      html += '<div class="no-data">No earnings data for this period</div>';
    } else {
      html += `
        <table class="report-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Sales</th>
              <th>Deliveries</th>
              <th>Order Salary</th>
              <th>Direct Payments</th>
              <th>Total Earnings</th>
              <th>Boss Gets</th>
            </tr>
          </thead>
          <tbody>
            ${sortedEarnings.map(d => `
              <tr>
                <td data-label="Driver">${d.driver.name}</td>
                <td data-label="Sales">$${d.totalSales.toFixed(2)}</td>
                <td data-label="Deliveries">${d.deliveryCount} paid</td>
                <td data-label="Order Salary">$${d.driverSalary.toFixed(2)}</td>
                <td data-label="Direct Payments" style="color: ${d.directPaymentsTotal >= 0 ? '#28a745' : '#dc3545'}">$${d.directPaymentsTotal.toFixed(2)}</td>
                <td data-label="Total Earnings"><strong>$${d.totalDriverEarnings.toFixed(2)}</strong></td>
                <td data-label="Boss Gets">$${d.bossCollection.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    document.getElementById('earnings-report-results').innerHTML = html;
  },

  // Render single driver earnings report
  renderSingleDriverEarningsReport(driver, earnings, orders, directPayments, period, date) {
    const dateRange = this.formatDateRange(period, date);

    let html = `
      <div class="report-summary">
        <h4>Earnings Report for ${driver.name}: ${dateRange}</h4>
        <div class="report-stats">
          <div class="stat-item">
            <span class="stat-label">Total Sales:</span>
            <span class="stat-value">$${earnings.totalSales.toFixed(2)}</span>
            <span class="stat-detail">${earnings.totalOrders} completed orders</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Order Salary:</span>
            <span class="stat-value">$${earnings.driverSalary.toFixed(2)}</span>
            <span class="stat-detail">${earnings.deliveryCount} paid deliveries</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Direct Payments:</span>
            <span class="stat-value" style="color: ${earnings.directPaymentsTotal >= 0 ? '#28a745' : '#dc3545'}">$${earnings.directPaymentsTotal.toFixed(2)}</span>
            <span class="stat-detail">${directPayments.length} payments</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Earnings:</span>
            <span class="stat-value">$${earnings.totalDriverEarnings.toFixed(2)}</span>
            <span class="stat-detail">All driver payments</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Boss Collection:</span>
            <span class="stat-value">$${earnings.bossCollection.toFixed(2)}</span>
            <span class="stat-detail">${((earnings.bossCollection / earnings.totalSales * 100) || 0).toFixed(1)}% of sales</span>
          </div>
        </div>
      </div>

      <h4>Earnings Breakdown</h4>
    `;

    // Create earnings breakdown with orders and direct payments
    const paidDeliveries = earnings.paidOrders;
    const freePickups = earnings.freeOrders;

    html += `
      <div class="earnings-breakdown">
        <h5>Paid Deliveries (${paidDeliveries.length})</h5>
        ${paidDeliveries.length > 0 ? this.renderOrderList(paidDeliveries) : '<p class="no-data">No paid deliveries</p>'}

        <h5>Free Pickups (${freePickups.length})</h5>
        ${freePickups.length > 0 ? this.renderOrderList(freePickups) : '<p class="no-data">No free pickups</p>'}

        <h5>Direct Payments (${directPayments.length})</h5>
        ${directPayments.length > 0 ? this.renderDirectPaymentsList(directPayments) : '<p class="no-data">No direct payments</p>'}
      </div>
    `;

    document.getElementById('earnings-report-results').innerHTML = html;
  },

  // Helper: Render order list
  renderOrderList(orders) {
    return `
      <table class="report-table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Date</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Driver Salary</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => {
            const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
            const formattedDate = createdDate.toLocaleDateString();
            const orderNum = `#${order.id.slice(-6).toUpperCase()}`;
            const salary = order.driverSalary ?? 30;
            const isPaid = order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery';

            return `
              <tr>
                <td data-label="Order ID">${orderNum}</td>
                <td data-label="Date">${formattedDate}</td>
                <td data-label="Status">${order.status}</td>
                <td data-label="Amount">$${order.totalAmount.toFixed(2)}</td>
                <td data-label="Driver Salary">${isPaid ? `$${salary.toFixed(2)}` : '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  // Helper: Render direct payments list
  renderDirectPaymentsList(payments) {
    return `
      <table class="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Reason</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map(payment => {
            const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
            const formattedDate = paymentDate.toLocaleDateString();
            const isPositive = payment.amount >= 0;
            const sign = payment.amount >= 0 ? '+' : '';

            return `
              <tr>
                <td data-label="Date">${formattedDate}</td>
                <td data-label="Reason">${payment.reason}</td>
                <td data-label="Amount" style="color: ${isPositive ? '#28a745' : '#dc3545'}; font-weight: bold;">
                  ${sign}$${payment.amount.toFixed(2)}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }
};

// Export the module and make it globally available
export default ReportsModule;
window.ReportsModule = ReportsModule;
