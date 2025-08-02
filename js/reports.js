/**
 * Reports module
 * Handles generating sales and inventory reports
 */

const ReportsModule = {
  // Initialize the reports module
  init() {
    this.bindEvents();
    this.updateDriverDropdowns();
    this.setDefaultDate();
  },

  // Bind event listeners
  bindEvents() {
    const salesReportBtn = document.getElementById('generate-sales-report');
    if (salesReportBtn) {
      salesReportBtn.addEventListener('click', this.generateSalesReport.bind(this));
    }
    
    const inventoryReportBtn = document.getElementById('generate-inventory-report');
    if (inventoryReportBtn) {
      inventoryReportBtn.addEventListener('click', this.generateInventoryReport.bind(this));
    }
    
    const reportTabs = document.querySelectorAll('.report-tab');
    reportTabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchReportTab(tab.dataset.report));
    });
  },

  // Set default date to today
  setDefaultDate() {
    const dateInput = document.getElementById('report-date');
    if (dateInput) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      dateInput.value = `${year}-${month}-${day}`;
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

  // Generate sales report
  generateSalesReport() {
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
    
    // Get orders for the specified period and driver (use orders if available, fallback to sales)
    const orders = typeof DB.getOrdersByPeriod === 'function' ? 
      DB.getOrdersByPeriod(driverId, period, date) : 
      (typeof DB.getSalesByPeriod === 'function' ? DB.getSalesByPeriod(driverId, period, date) : []);
    
    if (orders.length === 0) {
      resultsDiv.innerHTML = '<p class="no-data">No order data found for the selected period.</p>';
      return;
    }
    
    // Calculate totals and prepare report data
    let totalSales = 0;
    let totalItems = 0;
    const productTotals = {};
    const driverTotals = {};
    
    orders.forEach(order => {
      const driver = DB.getDriverById(order.driverId);
      if (!driver) return;
      
      // Aggregate total order amount
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
      
      // Aggregate by product
      order.lineItems.forEach(item => {
        if (!item.isFreeGift) {
          // Use actualQuantity if available (new format), otherwise fall back to quantity (old format)
          const deductionAmount = item.actualQuantity !== undefined ? item.actualQuantity : item.quantity;
          totalItems += deductionAmount;
          driverTotals[order.driverId].items += deductionAmount;
          
          if (!productTotals[item.productId]) {
            productTotals[item.productId] = {
              name: item.productName,
              quantity: 0
            };
          }
          productTotals[item.productId].quantity += deductionAmount;
        }
      });
    });
    
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
        </div>
      </div>
    `;
    
    // Driver breakdown (if not filtering by a specific driver)
    if (!driverId && Object.keys(driverTotals).length > 1) {
      reportHTML += '<h4>Orders by Driver</h4>';
      reportHTML += '<table class="report-table">';
      reportHTML += '<tr><th>Driver</th><th>Revenue</th><th>Items</th><th>% of Total</th></tr>';
      
      Object.values(driverTotals)
        .sort((a, b) => b.sales - a.sales)
        .forEach(driver => {
          const percentage = (driver.sales / totalSales * 100).toFixed(1);
          reportHTML += `
            <tr>
              <td>${driver.name}</td>
              <td>$${driver.sales.toFixed(2)}</td>
              <td>${driver.items}</td>
              <td>${percentage}%</td>
            </tr>
          `;
        });
      
      reportHTML += '</table>';
    }
    
    // Product breakdown
    reportHTML += '<h4>Sales by Product</h4>';
    reportHTML += '<table class="report-table">';
    reportHTML += '<tr><th>Product</th><th>Quantity</th></tr>';
    
    Object.values(productTotals)
      .sort((a, b) => b.quantity - a.quantity)
      .forEach(product => {
        reportHTML += `
          <tr>
            <td>${product.name}</td>
            <td>${product.quantity}</td>
          </tr>
        `;
      });
    
    reportHTML += '</table>';
    
    // Display the report
    resultsDiv.innerHTML = reportHTML;
    
    // Add some styles for the report
    const style = document.createElement('style');
    style.textContent = `
      .report-summary {
        margin-bottom: 1.5rem;
      }
      .report-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-top: 1rem;
      }
      .stat-item {
        background-color: var(--card-background);
        padding: 0.8rem;
        border-radius: var(--border-radius);
        box-shadow: var(--box-shadow);
      }
      .stat-label {
        font-weight: 500;
        margin-right: 0.5rem;
      }
      .stat-value {
        font-weight: 700;
        color: var(--primary-color);
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        margin-bottom: 1.5rem;
      }
      .report-table th, .report-table td {
        padding: 0.8rem;
        text-align: left;
      }
      .report-table th {
        background-color: rgba(0,0,0,0.05);
      }
      .report-table tr:nth-child(even) {
        background-color: rgba(0,0,0,0.02);
      }
      .no-data {
        padding: 1rem;
        text-align: center;
        color: #666;
      }
    `;
    
    if (!document.head.querySelector('style[data-report-styles]')) {
      style.setAttribute('data-report-styles', 'true');
      document.head.appendChild(style);
    }
  },

  // Generate inventory report
  generateInventoryReport() {
    const driverSelect = document.getElementById('inventory-driver');
    const resultsDiv = document.getElementById('inventory-report-results');
    
    if (!resultsDiv) return;
    
    const driverId = driverSelect.value;
    
    let inventoryData = [];
    
    if (driverId) {
      // Get inventory for a specific driver
      inventoryData = DB.getDriverInventory(driverId);
      
      if (inventoryData.length === 0) {
        resultsDiv.innerHTML = '<p class="no-data">No inventory data found for the selected driver.</p>';
        return;
      }
      
      // Sort by product name
      inventoryData.sort((a, b) => a.name.localeCompare(b.name));
      
      // Build report HTML for a specific driver
      const driver = DB.getDriverById(driverId);
      
      let reportHTML = `
        <div class="report-summary">
          <h4>Inventory Report for ${driver.name}</h4>
        </div>
        <table class="report-table">
          <tr>
            <th>Product</th>
            <th>Assigned</th>
            <th>Sold</th>
            <th>Remaining</th>
          </tr>
      `;
      
      inventoryData.forEach(item => {
        reportHTML += `
          <tr>
            <td>${item.name}</td>
            <td>${item.assigned}</td>
            <td>${item.sold}</td>
            <td>${item.remaining}</td>
          </tr>
        `;
      });
      
      reportHTML += '</table>';
      resultsDiv.innerHTML = reportHTML;
      
    } else {
      // Get inventory for all drivers
      const drivers = DB.getAllDrivers();
      
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
      const products = DB.getAllProducts();
      
      reportHTML += `
        <h4>Overall Inventory Status</h4>
        <table class="report-table">
          <tr>
            <th>Product</th>
            <th>Total Quantity</th>
          </tr>
      `;
      
      products.sort((a, b) => a.name.localeCompare(b.name)).forEach(product => {
        reportHTML += `
          <tr>
            <td>${product.name}</td>
            <td>${product.totalQuantity}</td>
          </tr>
        `;
      });
      
      reportHTML += '</table>';
      
      // Per driver inventory
      drivers.forEach(driver => {
        const driverInventory = DB.getDriverInventory(driver.id);
        
        if (driverInventory.length > 0) {
          reportHTML += `
            <h4>${driver.name}'s Inventory</h4>
            <table class="report-table">
              <tr>
                <th>Product</th>
                <th>Assigned</th>
                <th>Sold</th>
                <th>Remaining</th>
              </tr>
          `;
          
          driverInventory.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            reportHTML += `
              <tr>
                <td>${item.name}</td>
                <td>${item.assigned}</td>
                <td>${item.sold}</td>
                <td>${item.remaining}</td>
              </tr>
            `;
          });
          
          reportHTML += '</table>';
        } else {
          reportHTML += `
            <h4>${driver.name}'s Inventory</h4>
            <p class="no-data">No inventory assigned to this driver.</p>
          `;
        }
      });
      
      resultsDiv.innerHTML = reportHTML;
    }
    
    // Add some styles for the report
    const style = document.createElement('style');
    style.textContent = `
      .report-summary {
        margin-bottom: 1.5rem;
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        margin-bottom: 1.5rem;
      }
      .report-table th, .report-table td {
        padding: 0.8rem;
        text-align: left;
      }
      .report-table th {
        background-color: rgba(0,0,0,0.05);
      }
      .report-table tr:nth-child(even) {
        background-color: rgba(0,0,0,0.02);
      }
      .no-data {
        padding: 1rem;
        text-align: center;
        color: #666;
      }
    `;
    
    if (!document.head.querySelector('style[data-report-styles]')) {
      style.setAttribute('data-report-styles', 'true');
      document.head.appendChild(style);
    }
  },

  // Update driver dropdowns
  updateDriverDropdowns() {
    if (typeof DriversModule !== 'undefined') {
      DriversModule.updateDriverDropdowns();
    }
  }
};
