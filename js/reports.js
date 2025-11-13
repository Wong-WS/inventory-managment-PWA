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

    // Add report styles on init (not just when generating sales report)
    this.addReportStyles();

    this.bindEvents();
    await this.updateDriverDropdowns();
    this.setDefaultDate();
  },

  // Add report styles to document head
  addReportStyles() {
    // Only add styles once
    if (document.head.querySelector('style[data-report-styles]')) {
      return;
    }

    const style = document.createElement('style');
    style.setAttribute('data-report-styles', 'true');
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
        color: var(--text-secondary);
        font-size: 0.875rem;
        margin-bottom: 0.25rem;
      }
      .stat-value {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--text-primary);
      }
      .stat-detail {
        font-size: 0.75rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        background-color: var(--card-background);
        border-radius: var(--border-radius);
        overflow: hidden;
        box-shadow: var(--box-shadow);
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
      .report-table tbody tr:hover {
        background-color: rgba(0,0,0,0.05);
      }

      /* Inventory table specific styles */
      .inventory-table {
        font-size: 0.95rem;
        display: table;
        width: 100%;
      }
      .inventory-table thead {
        display: table-header-group;
      }
      .inventory-table tbody {
        display: table-row-group;
      }
      .inventory-table tr {
        display: table-row;
      }
      .inventory-table th,
      .inventory-table td {
        display: table-cell;
      }
      .inventory-table thead th {
        background-color: #cfe2ff;
        color: #052c65;
        font-weight: 600;
        text-align: center;
        padding: 0.75rem 0.5rem;
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .inventory-table tbody td {
        text-align: center;
        padding: 0.6rem 0.5rem;
        white-space: nowrap;
      }
      .inventory-table tbody td:first-child {
        text-align: left;
        font-weight: 500;
        white-space: normal;
        min-width: 100px;
      }
      .inventory-table tbody tr:nth-child(odd) {
        background-color: #ffffff;
      }
      .inventory-table tbody tr:nth-child(even) {
        background-color: #f8f9fa;
      }
      .inventory-table tbody tr:hover {
        background-color: #e3f2fd;
      }

      /* Mobile: Keep table horizontal and scrollable */
      @media (max-width: 768px) {
        .report-stats {
          grid-template-columns: 1fr;
        }
        .stat-item {
          padding: 0.75rem;
          min-height: 60px;
        }
        .inventory-table {
          font-size: 0.85rem;
          display: block;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .inventory-table thead {
          display: table-header-group;
        }
        .inventory-table tbody {
          display: table-row-group;
        }
        .inventory-table tr {
          display: table-row;
        }
        .inventory-table th,
        .inventory-table td {
          display: table-cell;
        }
        .inventory-table thead th {
          padding: 0.6rem 0.4rem;
          font-size: 0.8rem;
        }
        .inventory-table tbody td {
          padding: 0.5rem 0.4rem;
          font-size: 0.85rem;
        }
        .inventory-table tbody td:first-child {
          min-width: 80px;
          max-width: 120px;
        }
        /* Remove data-label display for inventory table */
        .inventory-table td:before {
          content: none !important;
          display: none !important;
        }
      }

      /* Inventory Reorder Buttons */
      #edit-order-controls {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .btn-edit-order,
      .btn-save-order,
      .btn-cancel-order {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: var(--border-radius);
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        transition: all 0.2s;
      }

      .btn-edit-order {
        background-color: #007bff;
        color: white;
      }

      .btn-edit-order:hover {
        background-color: #0056b3;
      }

      .btn-save-order {
        background-color: #28a745;
        color: white;
        margin-right: 0.5rem;
      }

      .btn-save-order:hover {
        background-color: #218838;
      }

      .btn-cancel-order {
        background-color: #6c757d;
        color: white;
      }

      .btn-cancel-order:hover {
        background-color: #5a6268;
      }

      .reorder-controls {
        text-align: center !important;
        padding: 0.5rem !important;
        white-space: nowrap !important;
      }

      .btn-move-up,
      .btn-move-down {
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        transition: all 0.2s;
        margin: 0 2px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .btn-move-up:hover:not(:disabled),
      .btn-move-down:hover:not(:disabled) {
        background: #0056b3;
      }

      .btn-move-up:disabled,
      .btn-move-down:disabled {
        background: #ccc;
        cursor: not-allowed;
        opacity: 0.5;
      }

      .btn-move-up i,
      .btn-move-down i {
        font-size: 0.9rem;
      }

      @media (max-width: 768px) {
        .btn-edit-order,
        .btn-save-order,
        .btn-cancel-order {
          padding: 0.4rem 0.8rem;
          font-size: 0.85rem;
        }

        .btn-move-up,
        .btn-move-down {
          width: 28px;
          height: 28px;
        }

        .btn-move-up i,
        .btn-move-down i {
          font-size: 0.8rem;
        }
      }

      /* Admin Payment Form Styles */
      .admin-payment-section {
        background: white;
        border-radius: var(--border-radius);
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        border: 1px solid #e9ecef;
      }

      .admin-payment-section h4 {
        margin: 0 0 0.5rem 0;
        color: #333;
        font-size: 1.1rem;
      }

      .section-helper-text {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: #666;
        margin-bottom: 1rem;
        padding: 0.5rem;
        background: #f8f9fa;
        border-radius: 4px;
      }

      .section-helper-text i {
        color: #007bff;
      }

      .admin-payment-form .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .holding-display {
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 0.75rem;
        background: #f8f9fa;
        border-radius: var(--border-radius);
        border: 1px solid #e9ecef;
      }

      .holding-display label {
        font-size: 0.85rem;
        color: #666;
        margin-bottom: 0.25rem;
      }

      .holding-amount-text {
        font-size: 1.25rem;
        font-weight: bold;
      }

      .section-divider {
        height: 1px;
        background: linear-gradient(to right, transparent, #e9ecef, transparent);
        margin: 2rem 0;
      }

      #pending-payments-report h3 {
        margin-top: 1.5rem;
      }

      /* Payment History Styles */
      .payment-history-section {
        margin-top: 2rem;
      }

      /* Payment Edit Form Styles */
      .payment-edit-form {
        padding: 1rem;
        background: #f8f9fa;
        border-radius: var(--border-radius);
        margin-top: 0.5rem;
      }

      .edit-form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .edit-form-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
      }

      .icon-button {
        background: none;
        border: none;
        color: #007bff;
        cursor: pointer;
        padding: 0.5rem;
        font-size: 1.1rem;
        border-radius: 4px;
        transition: all 0.2s;
      }

      .icon-button:hover {
        background: rgba(0, 123, 255, 0.1);
        color: #0056b3;
      }

      .icon-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      @media (max-width: 768px) {
        .edit-form-row {
          grid-template-columns: 1fr;
        }
      }

      .payment-history-filters {
        display: flex;
        gap: 1rem;
        align-items: end;
        margin-bottom: 1.5rem;
        padding: 1rem;
        background: #f8f9fa;
        border-radius: var(--border-radius);
        border: 1px solid #e9ecef;
      }

      .payment-history-filters .form-group {
        flex: 1;
        margin-bottom: 0;
      }

      .payment-history-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .payment-history-list .payment-item {
        background: #fff;
        border: 1px solid #e9ecef;
        border-radius: var(--border-radius);
        overflow: hidden;
        transition: box-shadow 0.2s;
      }

      .payment-history-list .payment-item:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .payment-history-list .payment-item.payment-pending {
        border-left: 4px solid #ffc107;
      }

      .payment-history-list .payment-item.payment-approved {
        border-left: 4px solid #28a745;
      }

      .payment-history-list .payment-item.payment-cancelled {
        border-left: 4px solid #dc3545;
        opacity: 0.7;
      }

      .payment-history-list .payment-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
      }

      .payment-history-list .payment-info {
        flex-grow: 1;
      }

      .payment-history-list .payment-driver-name {
        font-weight: 600;
        color: #333;
        margin-bottom: 0.25rem;
      }

      .payment-history-list .payment-amount {
        font-size: 1.25rem;
        font-weight: bold;
        color: #333;
        margin-bottom: 0.25rem;
      }

      .payment-history-list .payment-date {
        font-size: 0.8rem;
        color: #666;
      }

      .payment-history-list .payment-details {
        padding: 1rem;
      }

      .payment-history-list .payment-reason {
        display: flex;
        align-items: start;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: #666;
      }

      .payment-history-list .payment-reason i {
        color: #999;
        width: 16px;
        flex-shrink: 0;
        margin-top: 0.25rem;
      }

      @media (max-width: 768px) {
        .admin-payment-form .form-row {
          grid-template-columns: 1fr;
        }

        .admin-payment-section {
          padding: 1rem;
        }

        .payment-history-filters {
          flex-direction: column;
          align-items: stretch;
        }

        .payment-history-list .payment-header {
          flex-direction: column;
          gap: 0.75rem;
          align-items: flex-start;
        }
      }
    `;

    document.head.appendChild(style);
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

    // Admin payment form (submit on behalf of driver)
    this.bindAdminPaymentForm();

    // Payment history section
    this.bindPaymentHistoryEvents();
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

    // Load pending payments if that tab is selected
    if (tabId === 'pending-payments') {
      this.loadPendingPayments();
      this.loadPaymentHistory();
    }
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

      // Sorting is now handled in getDriverInventory() based on custom productOrder
      // No need to sort here anymore

      // Build report HTML for a specific driver
      const driver = await this.getCachedDriver(driverId);

      // Store current state for reordering
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
              <th>Sale</th>
              <th>Remaining stock</th>
            </tr>
          </thead>
          <tbody>
      `;

      inventoryData.forEach((item, index) => {
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
            <td data-label="Sale">${item.sold}</td>
            <td data-label="Remaining stock">${item.remaining}</td>
          </tr>
        `;
      });

      reportHTML += '</tbody></table>';
      resultsDiv.innerHTML = reportHTML;

      // Bind event listeners
      this.bindInventoryReorderEvents();
      
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
            <h4>${driver.name} Stock List</h4>
            <table class="report-table inventory-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Sale</th>
                  <th>Remaining stock</th>
                </tr>
              </thead>
              <tbody>
          `;

          // Sorting is already handled in getDriverInventory()
          driverInventory.forEach(item => {
            reportHTML += `
              <tr>
                <td data-label="Product">${item.name}</td>
                <td data-label="Sale">${item.sold}</td>
                <td data-label="Remaining stock">${item.remaining}</td>
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

  // ===== INVENTORY PRODUCT ORDER MANAGEMENT =====

  bindInventoryReorderEvents() {
    const toggleBtn = document.getElementById('toggle-edit-order');
    const saveBtn = document.getElementById('save-order');
    const cancelBtn = document.getElementById('cancel-order');

    // Remove old event listeners by cloning and replacing (prevents duplicate events)
    if (toggleBtn) {
      const newToggleBtn = toggleBtn.cloneNode(true);
      toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
      newToggleBtn.addEventListener('click', () => this.toggleEditOrderMode());
    }

    if (saveBtn) {
      const newSaveBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      newSaveBtn.addEventListener('click', () => this.saveProductOrder());
    }

    if (cancelBtn) {
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      newCancelBtn.addEventListener('click', () => this.cancelEditOrderMode());
    }

    // Bind move buttons
    const moveUpButtons = document.querySelectorAll('.btn-move-up');
    const moveDownButtons = document.querySelectorAll('.btn-move-down');

    moveUpButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-index'));
        this.moveProductUp(index);
      });
    });

    moveDownButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-index'));
        this.moveProductDown(index);
      });
    });
  },

  toggleEditOrderMode() {
    this.isEditOrderMode = !this.isEditOrderMode;
    this.updateEditModeUI();
  },

  exitEditOrderMode() {
    this.isEditOrderMode = false;
    this.updateEditModeUI();
  },

  updateEditModeUI() {
    const toggleBtn = document.getElementById('toggle-edit-order');
    const saveBtn = document.getElementById('save-order');
    const cancelBtn = document.getElementById('cancel-order');
    const reorderControls = document.querySelectorAll('.reorder-controls');
    const reorderControlsCol = document.querySelector('.reorder-controls-col');

    if (this.isEditOrderMode) {
      // Enter edit mode
      toggleBtn.style.display = 'none';
      saveBtn.style.display = 'inline-block';
      cancelBtn.style.display = 'inline-block';
      reorderControlsCol.style.display = 'table-cell';
      reorderControls.forEach(cell => cell.style.display = 'table-cell');
    } else {
      // Exit edit mode
      toggleBtn.style.display = 'inline-block';
      saveBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      reorderControlsCol.style.display = 'none';
      reorderControls.forEach(cell => cell.style.display = 'none');
    }
  },

  moveProductUp(index) {
    if (index <= 0) return; // Already at top

    // Swap with previous item
    const temp = this.currentInventoryData[index];
    this.currentInventoryData[index] = this.currentInventoryData[index - 1];
    this.currentInventoryData[index - 1] = temp;

    // Re-render table
    this.rerenderInventoryTable();
  },

  moveProductDown(index) {
    if (index >= this.currentInventoryData.length - 1) return; // Already at bottom

    // Swap with next item
    const temp = this.currentInventoryData[index];
    this.currentInventoryData[index] = this.currentInventoryData[index + 1];
    this.currentInventoryData[index + 1] = temp;

    // Re-render table
    this.rerenderInventoryTable();
  },

  rerenderInventoryTable() {
    const tbody = document.querySelector('#inventory-order-table tbody');
    if (!tbody) return;

    let tbodyHTML = '';
    this.currentInventoryData.forEach((item, index) => {
      tbodyHTML += `
        <tr data-product-id="${item.id}" data-index="${index}">
          <td class="reorder-controls" style="${this.isEditOrderMode ? 'display: table-cell;' : 'display: none;'}">
            <button class="btn-move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>
              <i class="fas fa-arrow-up"></i>
            </button>
            <button class="btn-move-down" data-index="${index}" ${index === this.currentInventoryData.length - 1 ? 'disabled' : ''}>
              <i class="fas fa-arrow-down"></i>
            </button>
          </td>
          <td data-label="Product">${item.name}</td>
          <td data-label="Sale">${item.sold}</td>
          <td data-label="Remaining stock">${item.remaining}</td>
        </tr>
      `;
    });

    tbody.innerHTML = tbodyHTML;

    // Re-bind events
    this.bindInventoryReorderEvents();
  },

  async saveProductOrder() {
    try {
      // Extract product IDs in current order
      const productOrder = this.currentInventoryData.map(item => item.id);

      // Save to Firebase
      await DB.updateDriverProductOrder(this.currentDriverId, productOrder);

      // Exit edit mode (no alert popup)
      this.exitEditOrderMode();

    } catch (error) {
      console.error('Error saving product order:', error);
      alert('Failed to save product order. Please try again.');
    }
  },

  cancelEditOrderMode() {
    // Reload the report to reset changes
    this.generateInventoryReport();
  },

  // ===== DRIVER EARNINGS REPORT METHODS =====

  // Helper: Get orders up to end of period (cumulative)
  async getOrdersUpToDate(driverId, period, date) {
    const allOrders = await DB.getOrdersByDriver(driverId);
    const endDate = this.getEndOfPeriod(period, date);

    return allOrders.filter(order => {
      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      return orderDate <= endDate;
    });
  },

  // Helper: Get direct payments up to end of period (cumulative)
  async getDirectPaymentsUpToDate(driverId, period, date) {
    const allPayments = await DB.getDirectPaymentsByDriver(driverId);
    const endDate = this.getEndOfPeriod(period, date);

    return allPayments.filter(payment => {
      const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
      return paymentDate <= endDate;
    });
  },

  // Helper: Get approved boss payments up to end of period (cumulative)
  async getApprovedBossPaymentsUpToDate(driverId, period, date) {
    // Get all approved boss payments (driver-to-boss)
    const allPayments = await DB.getApprovedDriverPayments(driverId, null, null);
    const endDate = this.getEndOfPeriod(period, date);

    return allPayments.filter(payment => {
      const paymentDate = payment.createdAt?.toDate ? payment.createdAt.toDate() : new Date(payment.createdAt);
      return paymentDate <= endDate;
    });
  },

  // Helper: Get end of period date
  getEndOfPeriod(period, date) {
    const targetDate = new Date(date);
    let endDate;

    switch(period) {
      case 'day':
        endDate = new Date(targetDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week': {
        const dayOfWeek = targetDate.getDay();
        endDate = new Date(targetDate);
        endDate.setDate(targetDate.getDate() - dayOfWeek + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'month':
        endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'year':
        endDate = new Date(targetDate.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default:
        endDate = new Date(); // Default to now
    }

    return endDate;
  },

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
      // Get period-based data for display
      const orders = await DB.getOrdersByPeriod(driver.id, period, date);
      const directPayments = await DB.getDirectPaymentsByPeriod(driver.id, period, date);
      const approvedBossPayments = await DB.getApprovedDriverPayments(driver.id, period, date);

      // Get UP-TO-END-OF-PERIOD data for holding calculation
      const upToEndOrders = await this.getOrdersUpToDate(driver.id, period, date);
      const upToEndDirectPayments = await this.getDirectPaymentsUpToDate(driver.id, period, date);
      const upToEndApprovedBossPayments = await this.getApprovedBossPaymentsUpToDate(driver.id, period, date);

      // Filter orders to only completed/cancelled paid ones
      const upToEndPaidOrders = upToEndOrders.filter(order => {
        if (order.status === DB.ORDER_STATUS.COMPLETED) {
          return true;
        }
        if (order.status === DB.ORDER_STATUS.CANCELLED) {
          return order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery';
        }
        return false;
      });

      // Calculate period earnings for display (including period-only Boss Paid)
      const earnings = this.calculateDriverEarnings(orders, directPayments, approvedBossPayments);

      // Calculate holding as of end of selected period (cumulative)
      const upToEndEarnings = this.calculateDriverEarnings(upToEndPaidOrders, upToEndDirectPayments, upToEndApprovedBossPayments);

      return {
        driver,
        ...earnings,
        // Override ONLY holding amount with cumulative value (keep Boss Paid as period-only)
        holdingAmount: upToEndEarnings.holdingAmount,
        allTimeBossCollection: upToEndEarnings.bossCollection
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
      totalApprovedBossPayments: driverEarnings.reduce((sum, d) => sum + d.approvedBossPaymentsTotal, 0),
      totalHolding: driverEarnings.reduce((sum, d) => sum + d.holdingAmount, 0),
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

    // Get period-based data for display
    const orders = await DB.getOrdersByPeriod(driverId, period, date);
    const directPayments = await DB.getDirectPaymentsByPeriod(driverId, period, date);
    const approvedBossPayments = await DB.getApprovedDriverPayments(driverId, period, date);

    // Get UP-TO-END-OF-PERIOD data for holding calculation
    // This gives us cumulative data from beginning of time up to the end of selected period
    const upToEndOrders = await this.getOrdersUpToDate(driverId, period, date);
    const upToEndDirectPayments = await this.getDirectPaymentsUpToDate(driverId, period, date);
    const upToEndApprovedBossPayments = await this.getApprovedBossPaymentsUpToDate(driverId, period, date);

    // Filter orders to only completed/cancelled paid ones
    const upToEndPaidOrders = upToEndOrders.filter(order => {
      if (order.status === DB.ORDER_STATUS.COMPLETED) {
        return true;
      }
      if (order.status === DB.ORDER_STATUS.CANCELLED) {
        return order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery';
      }
      return false;
    });

    // Calculate period earnings for display (including period-only Boss Paid)
    const earnings = this.calculateDriverEarnings(orders, directPayments, approvedBossPayments);

    // Calculate holding as of end of selected period (cumulative)
    const upToEndEarnings = this.calculateDriverEarnings(upToEndPaidOrders, upToEndDirectPayments, upToEndApprovedBossPayments);

    // Override ONLY holding amount with cumulative value (keep Boss Paid as period-only)
    earnings.holdingAmount = upToEndEarnings.holdingAmount;
    earnings.allTimeBossCollection = upToEndEarnings.bossCollection;

    // Render the single-driver view (Boss Paid will be period-only from approvedBossPayments)
    this.renderSingleDriverEarningsReport(driver, earnings, orders, directPayments, approvedBossPayments, period, date);
  },

  // Calculate driver earnings from orders and direct payments
  calculateDriverEarnings(orders, directPayments = [], approvedBossPayments = []) {
    // Separate completed and cancelled orders
    const completedOrders = orders.filter(order => order.status === DB.ORDER_STATUS.COMPLETED);
    const cancelledOrders = orders.filter(order => order.status === DB.ORDER_STATUS.CANCELLED);

    // For sales metrics, only count completed orders
    const totalSales = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // For driver salary, count paid orders from ONLY completed and cancelled (not pending)
    const paidOrders = orders.filter(order =>
      (order.status === DB.ORDER_STATUS.COMPLETED || order.status === DB.ORDER_STATUS.CANCELLED) &&
      (order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery')
    );
    const freeOrders = orders.filter(order =>
      (order.status === DB.ORDER_STATUS.COMPLETED || order.status === DB.ORDER_STATUS.CANCELLED) &&
      (order.deliveryMethod === 'Free' || order.deliveryMethod === 'Pick up')
    );

    const paidCount = paidOrders.length;

    // Calculate driver salary from orders by summing individual order salaries
    // Use nullish coalescing for backward compatibility (old orders default to $30)
    const DELIVERY_FEE = 30;
    const driverSalary = paidOrders.reduce((sum, order) => {
      return sum + (order.driverSalary ?? DELIVERY_FEE);
    }, 0);

    // Calculate direct payments total (admin-to-driver)
    const directPaymentsTotal = directPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Total driver earnings = order salary + direct payments
    const totalDriverEarnings = driverSalary + directPaymentsTotal;

    // Boss collection = Total completed sales - ALL driver payments
    const bossCollection = totalSales - totalDriverEarnings;

    // NEW: Calculate approved boss payments total (driver-to-boss)
    const approvedBossPaymentsTotal = approvedBossPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // NEW: Holding amount = What driver currently has
    const holdingAmount = bossCollection - approvedBossPaymentsTotal;

    return {
      totalSales,
      totalOrders: completedOrders.length,
      deliveryCount: paidCount,
      pickupCount: freeOrders.length,
      driverSalary,              // Salary from orders only
      directPaymentsTotal,       // Total from direct payments (admin-to-driver)
      totalDriverEarnings,       // Combined total
      bossCollection,
      approvedBossPaymentsTotal, // NEW: Total approved payments to boss
      holdingAmount,             // NEW: Available amount driver has
      completedOrders,
      cancelledOrders,
      paidOrders,
      freeOrders,
      directPayments,            // Include for display
      approvedBossPayments       // NEW: Include for display
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
              <th>Boss Paid</th>
              <th>Holding</th>
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
                <td data-label="Boss Paid" style="color: #dc3545">$${d.approvedBossPaymentsTotal.toFixed(2)}</td>
                <td data-label="Holding" style="color: #28a745; font-weight: bold;">$${d.holdingAmount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    document.getElementById('earnings-report-results').innerHTML = html;
  },

  // Render single driver earnings report
  renderSingleDriverEarningsReport(driver, earnings, orders, directPayments, approvedBossPayments, period, date) {
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
          <div class="stat-item">
            <span class="stat-label">Boss Paid:</span>
            <span class="stat-value" style="color: #dc3545">$${earnings.approvedBossPaymentsTotal.toFixed(2)}</span>
            <span class="stat-detail">${approvedBossPayments.length} approved payments</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Holding Amount:</span>
            <span class="stat-value" style="color: #28a745">$${earnings.holdingAmount.toFixed(2)}</span>
            <span class="stat-detail">All-time balance with driver</span>
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
  },

  // ==================== PENDING PAYMENTS METHODS ====================

  /**
   * Load and display pending driver-to-boss payments
   */
  async loadPendingPayments() {
    const resultsDiv = document.getElementById('pending-payments-results');
    const noDataMessage = document.getElementById('no-pending-payments-message');

    if (!resultsDiv) return;

    // Show loading
    resultsDiv.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>Loading pending payments...</p>
      </div>
    `;

    try {
      // Get all pending driver-to-boss payments
      const pendingPayments = await DB.getPendingDriverPayments();

      if (pendingPayments.length === 0) {
        resultsDiv.innerHTML = '';
        if (noDataMessage) {
          noDataMessage.style.display = 'block';
        }
        return;
      }

      if (noDataMessage) {
        noDataMessage.style.display = 'none';
      }

      // Get driver info for each payment
      const paymentsWithDrivers = await Promise.all(
        pendingPayments.map(async payment => {
          const driver = await this.getCachedDriver(payment.driverId);
          return {
            ...payment,
            driverName: driver ? driver.name : 'Unknown Driver'
          };
        })
      );

      // Display payments
      this.displayPendingPayments(paymentsWithDrivers);

    } catch (error) {
      console.error('Error loading pending payments:', error);
      resultsDiv.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load pending payments</p>
        </div>
      `;
    }
  },

  /**
   * Display pending payments in the UI
   */
  displayPendingPayments(payments) {
    const resultsDiv = document.getElementById('pending-payments-results');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = `
      <div class="pending-payments-list">
        ${payments.map(payment => this.createPendingPaymentCard(payment)).join('')}
      </div>
    `;

    // Bind event listeners for approve/cancel buttons
    payments.forEach(payment => {
      const approveBtn = document.getElementById(`approve-payment-${payment.id}`);
      const cancelBtn = document.getElementById(`cancel-payment-${payment.id}`);

      if (approveBtn) {
        approveBtn.addEventListener('click', () => this.handleApprovePayment(payment));
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.handleCancelPayment(payment));
      }
    });
  },

  /**
   * Create HTML card for a pending payment
   */
  createPendingPaymentCard(payment) {
    const paymentDate = payment.createdAt?.toDate ? payment.createdAt.toDate() : new Date(payment.createdAt);
    const formattedDate = paymentDate.toLocaleDateString();
    const formattedTime = paymentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="pending-payment-card" id="payment-card-${payment.id}">
        <div class="payment-card-header">
          <div class="payment-card-info">
            <h4>${payment.driverName}</h4>
            <div class="payment-card-date">
              <i class="fas fa-clock"></i>
              <span>${formattedDate} at ${formattedTime}</span>
            </div>
          </div>
          <div class="payment-card-amount">
            $${payment.amount.toFixed(2)}
          </div>
        </div>
        <div class="payment-card-body">
          <div class="payment-card-reason">
            <strong>Reason:</strong>
            <p>${payment.reason}</p>
          </div>
        </div>
        <div class="payment-card-actions">
          <button id="approve-payment-${payment.id}" class="approve-button">
            <i class="fas fa-check-circle"></i> Approve
          </button>
          <button id="cancel-payment-${payment.id}" class="cancel-button">
            <i class="fas fa-times-circle"></i> Cancel
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Handle approving a payment
   */
  async handleApprovePayment(payment) {
    const confirmed = confirm(
      `Approve payment of $${payment.amount.toFixed(2)} from ${payment.driverName}?\n\n` +
      `Reason: ${payment.reason}`
    );

    if (!confirmed) return;

    const approveBtn = document.getElementById(`approve-payment-${payment.id}`);
    const cancelBtn = document.getElementById(`cancel-payment-${payment.id}`);

    // Disable buttons
    if (approveBtn) {
      approveBtn.disabled = true;
      approveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Approving...';
    }
    if (cancelBtn) {
      cancelBtn.disabled = true;
    }

    try {
      await DB.approveDriverPayment(payment.id);
      alert('Payment approved successfully!');

      // Reload pending payments
      await this.loadPendingPayments();

    } catch (error) {
      console.error('Error approving payment:', error);
      alert('Failed to approve payment: ' + error.message);

      // Re-enable buttons
      if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
      }
      if (cancelBtn) {
        cancelBtn.disabled = false;
      }
    }
  },

  /**
   * Handle cancelling a payment
   */
  async handleCancelPayment(payment) {
    const confirmed = confirm(
      `Cancel payment of $${payment.amount.toFixed(2)} from ${payment.driverName}?\n\n` +
      `Original reason: ${payment.reason}\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmed) return;

    const approveBtn = document.getElementById(`approve-payment-${payment.id}`);
    const cancelBtn = document.getElementById(`cancel-payment-${payment.id}`);

    // Disable buttons
    if (approveBtn) {
      approveBtn.disabled = true;
    }
    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...';
    }

    try {
      await DB.cancelDriverPayment(payment.id);
      alert('Payment cancelled successfully!');

      // Reload pending payments
      await this.loadPendingPayments();

    } catch (error) {
      console.error('Error cancelling payment:', error);
      alert('Failed to cancel payment: ' + error.message);

      // Re-enable buttons
      if (approveBtn) {
        approveBtn.disabled = false;
      }
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.innerHTML = '<i class="fas fa-times-circle"></i> Cancel';
      }
    }
  },

  /**
   * Bind admin payment form events
   */
  bindAdminPaymentForm() {
    const form = document.getElementById('admin-driver-payment-form');
    const driverSelect = document.getElementById('admin-payment-driver');
    const dateInput = document.getElementById('admin-payment-date');

    // Set default date to today
    if (dateInput) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today;
    }

    if (form) {
      form.addEventListener('submit', (event) => this.handleAdminPaymentSubmit(event));
    }

    if (driverSelect) {
      driverSelect.addEventListener('change', () => this.handleAdminDriverChange());
    }
  },

  /**
   * Handle driver selection change - load and display holding amount
   */
  async handleAdminDriverChange() {
    const driverSelect = document.getElementById('admin-payment-driver');
    const holdingDisplay = document.getElementById('admin-payment-holding');

    if (!driverSelect || !holdingDisplay) return;

    const driverId = driverSelect.value;

    if (!driverId) {
      holdingDisplay.textContent = '-';
      holdingDisplay.style.color = '';
      return;
    }

    try {
      // Calculate driver's holding amount (all-time)
      const allTimeOrders = await DB.getOrdersByDriver(driverId);
      const allTimeDirectPayments = await DB.getDirectPaymentsByDriver(driverId);
      const allTimeApprovedBossPayments = await DB.getApprovedDriverPayments(driverId, null, null);

      // Filter orders to only completed/cancelled paid ones
      const allTimePaidOrders = allTimeOrders.filter(order => {
        if (order.status === DB.ORDER_STATUS.COMPLETED) {
          return true;
        }
        if (order.status === DB.ORDER_STATUS.CANCELLED) {
          return order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery';
        }
        return false;
      });

      // Calculate total sales (completed orders only)
      const completedOrders = allTimePaidOrders.filter(order => order.status === DB.ORDER_STATUS.COMPLETED);
      const totalSales = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

      // Calculate driver earnings from orders
      const paidOrders = allTimePaidOrders.filter(order => order.deliveryMethod === 'Paid' || order.deliveryMethod === 'Delivery');
      const orderSalary = paidOrders.reduce((sum, order) => {
        return sum + (order.driverSalary ?? 30); // Default $30 per delivery
      }, 0);

      // Calculate direct payments total
      const directPaymentsTotal = allTimeDirectPayments.reduce((sum, payment) => sum + payment.amount, 0);

      // Total driver earnings
      const totalDriverEarnings = orderSalary + directPaymentsTotal;

      // Boss collection
      const bossCollection = totalSales - totalDriverEarnings;

      // Approved boss payments
      const approvedBossPaymentsTotal = allTimeApprovedBossPayments.reduce((sum, payment) => sum + payment.amount, 0);

      // Holding amount
      const holdingAmount = bossCollection - approvedBossPaymentsTotal;

      // Store for validation
      this.currentDriverHolding = holdingAmount;

      // Display with color coding
      const displayAmount = Math.max(0, holdingAmount);
      holdingDisplay.textContent = `$${displayAmount.toFixed(2)}`;

      if (holdingAmount < 0) {
        holdingDisplay.style.color = '#dc3545'; // Red
      } else if (holdingAmount === 0) {
        holdingDisplay.style.color = '#6c757d'; // Gray
      } else {
        holdingDisplay.style.color = '#28a745'; // Green
      }

    } catch (error) {
      console.error('Error loading driver holding:', error);
      holdingDisplay.textContent = 'Error';
      holdingDisplay.style.color = '#dc3545';
    }
  },

  /**
   * Handle admin payment form submission
   */
  async handleAdminPaymentSubmit(event) {
    event.preventDefault();

    const driverSelect = document.getElementById('admin-payment-driver');
    const amountInput = document.getElementById('admin-payment-amount');
    const reasonInput = document.getElementById('admin-payment-reason');
    const dateInput = document.getElementById('admin-payment-date');
    const submitBtn = document.getElementById('submit-admin-payment');

    const driverId = driverSelect.value;
    const amount = parseFloat(amountInput.value);
    const reason = reasonInput.value.trim();
    const paymentDate = dateInput.value;

    // Validation
    if (!driverId) {
      alert('Please select a driver');
      return;
    }

    if (!amount || amount <= 0) {
      alert('Please enter a valid amount greater than 0');
      return;
    }

    if (!paymentDate) {
      alert('Please select a payment date');
      return;
    }

    if (!reason || reason.length < 5) {
      alert('Please provide a reason (minimum 5 characters)');
      return;
    }

    // Check if amount exceeds holding
    if (this.currentDriverHolding !== undefined) {
      const holdingAmount = this.currentDriverHolding;
      const displayHolding = Math.max(0, holdingAmount);

      if (amount > holdingAmount || holdingAmount <= 0) {
        alert(`Cannot submit payment. Amount ($${amount.toFixed(2)}) exceeds available holding ($${displayHolding.toFixed(2)})`);
        return;
      }
    }

    // Check pending payments to prevent over-commitment
    try {
      const pendingPayments = await DB.getPendingDriverPayments(driverId);
      const totalPendingAmount = pendingPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const totalCommitment = amount + totalPendingAmount;
      const availableAfterPending = this.currentDriverHolding - totalPendingAmount;

      if (totalCommitment > this.currentDriverHolding) {
        alert(
          `Cannot submit payment.\n\n` +
          `Current holding: $${this.currentDriverHolding.toFixed(2)}\n` +
          `Pending payments: $${totalPendingAmount.toFixed(2)}\n` +
          `Available after pending: $${availableAfterPending.toFixed(2)}\n\n` +
          `Payment of $${amount.toFixed(2)} would exceed available amount.`
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
      // Get driver name for the payment record
      const driver = await DB.getDriverById(driverId);
      if (!driver) {
        throw new Error('Driver not found');
      }

      // Create payment with auto-approval (admin is submitting)
      await DB.createDriverToBossPaymentByAdmin({
        driverId: driverId,
        driverName: driver.name,
        amount: amount,
        reason: reason,
        paymentDate: paymentDate
      });

      // Success
      alert('Payment submitted and approved successfully!');

      // Clear form
      driverSelect.value = '';
      amountInput.value = '';
      reasonInput.value = '';
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today; // Reset to today
      document.getElementById('admin-payment-holding').textContent = '-';
      document.getElementById('admin-payment-holding').style.color = '';
      this.currentDriverHolding = undefined;

      // Reload pending payments list (in case there are others)
      await this.loadPendingPayments();

      // Reload payment history
      await this.loadPaymentHistory();

    } catch (error) {
      console.error('Error submitting payment:', error);
      alert('Failed to submit payment: ' + error.message);
    } finally {
      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Payment';
    }
  },

  /**
   * Bind payment history events
   */
  bindPaymentHistoryEvents() {
    const driverFilter = document.getElementById('payment-history-driver');
    const refreshBtn = document.getElementById('refresh-payment-history');

    if (driverFilter) {
      driverFilter.addEventListener('change', () => this.loadPaymentHistory());
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadPaymentHistory());
    }
  },

  /**
   * Load payment history for admin view
   */
  async loadPaymentHistory() {
    const driverFilter = document.getElementById('payment-history-driver');
    const resultsContainer = document.getElementById('payment-history-results');
    const noDataMessage = document.getElementById('no-payment-history-message');

    if (!resultsContainer) return;

    try {
      const selectedDriverId = driverFilter ? driverFilter.value : '';

      // Get all driver-to-boss payments
      let allPayments;
      if (selectedDriverId) {
        // Get payments for specific driver
        allPayments = await DB.getDriverPaymentHistory(selectedDriverId);
      } else {
        // Get all payments from all drivers
        const allDrivers = await DB.getAllDrivers();
        const paymentPromises = allDrivers.map(driver => DB.getDriverPaymentHistory(driver.id));
        const paymentArrays = await Promise.all(paymentPromises);
        allPayments = paymentArrays.flat();

        // Sort by payment date (newest first)
        allPayments.sort((a, b) => {
          const aDate = a.date?.toDate ? a.date.toDate() : new Date(a.date);
          const bDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
          return bDate - aDate;
        });
      }

      // Display results
      if (allPayments.length === 0) {
        resultsContainer.style.display = 'none';
        if (noDataMessage) {
          noDataMessage.style.display = 'block';
        }
        return;
      }

      resultsContainer.style.display = 'block';
      if (noDataMessage) {
        noDataMessage.style.display = 'none';
      }

      resultsContainer.innerHTML = '';
      allPayments.forEach(payment => {
        const paymentCard = this.createPaymentHistoryCard(payment);
        resultsContainer.appendChild(paymentCard);
      });

    } catch (error) {
      console.error('Error loading payment history:', error);
      resultsContainer.innerHTML = '<p class="error-message">Failed to load payment history</p>';
    }
  },

  /**
   * Create payment history card element
   */
  createPaymentHistoryCard(payment) {
    const card = document.createElement('div');
    card.className = `payment-item payment-${payment.status}`;

    // Use payment date (actual payment date) instead of createdAt (when entered in system)
    const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
    const formattedDate = paymentDate.toLocaleDateString();
    const formattedTime = paymentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Get driver name - use cached driver or fetch if needed
    let driverName = payment.driverName || 'Unknown Driver';

    // If driverName not in payment, try to get from cache
    if (!payment.driverName && payment.driverId) {
      const driver = this.driversCache.get(payment.driverId);
      if (driver) {
        driverName = driver.name;
      }
    }

    // Status badge
    let statusBadge = '';
    if (payment.status === 'pending') {
      statusBadge = '<span class="status-badge pending"><i class="fas fa-clock"></i> PENDING</span>';
    } else if (payment.status === 'approved') {
      statusBadge = '<span class="status-badge approved"><i class="fas fa-check-circle"></i> APPROVED</span>';
    } else if (payment.status === 'cancelled') {
      statusBadge = '<span class="status-badge cancelled"><i class="fas fa-times-circle"></i> CANCELLED</span>';
    }

    // Edit button only for approved payments
    const editButton = payment.status === 'approved'
      ? `<button class="icon-button edit-payment-btn" data-payment-id="${payment.id}" title="Edit Payment">
           <i class="fas fa-edit"></i>
         </button>`
      : '';

    card.innerHTML = `
      <div class="payment-header">
        <div class="payment-info">
          <div class="payment-driver-name">${driverName}</div>
          <div class="payment-amount" data-field="amount">$${payment.amount.toFixed(2)}</div>
          <div class="payment-date" data-field="date">${formattedDate} at ${formattedTime}</div>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          ${statusBadge}
          ${editButton}
        </div>
      </div>
      <div class="payment-details">
        <div class="payment-reason" data-field="reason">
          <i class="fas fa-comment"></i>
          <span>${payment.reason}</span>
        </div>
      </div>
    `;

    // Add edit button click handler
    if (payment.status === 'approved') {
      const editBtn = card.querySelector('.edit-payment-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => this.handleEditPayment(payment, card));
      }
    }

    return card;
  },

  /**
   * Handle editing a payment inline
   */
  async handleEditPayment(payment, card) {
    // Get current values
    const paymentDateObj = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
    const currentDate = paymentDateObj.toISOString().split('T')[0];
    const currentAmount = payment.amount;
    const currentReason = payment.reason;

    // Create inline edit form
    const editForm = document.createElement('div');
    editForm.className = 'payment-edit-form';
    editForm.innerHTML = `
      <div class="edit-form-row">
        <div class="form-group">
          <label>Payment Date</label>
          <input type="date" id="edit-date-${payment.id}" value="${currentDate}" required>
        </div>
        <div class="form-group">
          <label>Amount ($)</label>
          <input type="number" id="edit-amount-${payment.id}" value="${currentAmount}" step="0.01" min="0.01" required>
        </div>
      </div>
      <div class="form-group">
        <label>Reason</label>
        <textarea id="edit-reason-${payment.id}" rows="2" required minlength="5">${currentReason}</textarea>
      </div>
      <div class="edit-form-actions">
        <button class="primary-button save-edit-btn" data-payment-id="${payment.id}">
          <i class="fas fa-save"></i> Save
        </button>
        <button class="secondary-button cancel-edit-btn">
          <i class="fas fa-times"></i> Cancel
        </button>
      </div>
    `;

    // Replace payment details with edit form
    const paymentDetails = card.querySelector('.payment-details');
    const originalContent = paymentDetails.innerHTML;
    paymentDetails.innerHTML = '';
    paymentDetails.appendChild(editForm);

    // Disable edit button while editing
    const editBtn = card.querySelector('.edit-payment-btn');
    if (editBtn) editBtn.disabled = true;

    // Handle save
    const saveBtn = editForm.querySelector('.save-edit-btn');
    saveBtn.addEventListener('click', async () => {
      const newDate = document.getElementById(`edit-date-${payment.id}`).value;
      const newAmount = parseFloat(document.getElementById(`edit-amount-${payment.id}`).value);
      const newReason = document.getElementById(`edit-reason-${payment.id}`).value.trim();

      if (!newDate || !newAmount || newAmount <= 0 || !newReason || newReason.length < 5) {
        alert('Please fill in all fields correctly');
        return;
      }

      try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        await DB.updatePayment(payment.id, {
          date: newDate,
          amount: newAmount,
          reason: newReason
        });

        alert('Payment updated successfully!');
        await this.loadPaymentHistory(); // Reload to show updated data

      } catch (error) {
        console.error('Error updating payment:', error);
        alert('Failed to update payment: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
      }
    });

    // Handle cancel
    const cancelBtn = editForm.querySelector('.cancel-edit-btn');
    cancelBtn.addEventListener('click', () => {
      paymentDetails.innerHTML = originalContent;
      if (editBtn) editBtn.disabled = false;
    });
  }
};

// Export the module and make it globally available
export default ReportsModule;
window.ReportsModule = ReportsModule;
