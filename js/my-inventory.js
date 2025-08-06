/**
 * My Inventory module for drivers
 * Provides inventory view with low stock alerts and filtering
 */

const MyInventoryModule = {
  // Current filter and sort settings
  currentFilter: '',
  currentSort: 'name',
  lowStockThreshold: 5,
  
  // Initialize the my inventory module
  init() {
    this.bindEvents();
    this.loadInventory();
  },

  // Bind event listeners
  bindEvents() {
    // Filter by stock level
    const filterSelect = document.getElementById('inventory-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        this.currentFilter = e.target.value;
        this.loadInventory();
      });
    }

    // Sort options
    const sortSelect = document.getElementById('inventory-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.currentSort = e.target.value;
        this.loadInventory();
      });
    }
  },

  // Get the current driver's ID from session
  getCurrentDriverId() {
    const session = DB.getCurrentSession();
    if (!session || session.role !== DB.ROLES.DRIVER) {
      return null;
    }

    // Get the full user record to access driverId
    const users = DB.getAll(DB.KEYS.USERS);
    const user = users.find(u => u.id === session.userId);
    if (!user) return null;

    // If user has a driverId field, use it directly
    if (user.driverId) {
      return user.driverId;
    }

    // Fallback: try to find driver by matching name
    const drivers = DB.getAllDrivers();
    const matchingDriver = drivers.find(driver => 
      driver.name.toLowerCase() === user.name.toLowerCase()
    );

    return matchingDriver ? matchingDriver.id : null;
  },

  // Load and display driver's inventory
  loadInventory() {
    const driverId = this.getCurrentDriverId();
    if (!driverId) {
      this.showError('Unable to identify current driver');
      return;
    }

    // Get inventory with alerts
    const inventoryWithAlerts = DB.getDriverInventoryWithAlerts(driverId, this.lowStockThreshold);
    
    // Filter inventory based on current filter
    let filteredInventory = this.filterInventory(inventoryWithAlerts);
    
    // Sort inventory based on current sort
    let sortedInventory = this.sortInventory(filteredInventory);

    // Update summary cards
    this.updateSummaryCards(inventoryWithAlerts);
    
    // Display inventory
    this.displayInventory(sortedInventory);
  },

  // Filter inventory based on alert level
  filterInventory(inventory) {
    if (!this.currentFilter) {
      return inventory;
    }

    return inventory.filter(item => {
      switch (this.currentFilter) {
        case 'normal':
          return item.alertLevel === 'normal';
        case 'warning':
          return item.alertLevel === 'warning';
        case 'critical':
          return item.alertLevel === 'critical';
        default:
          return true;
      }
    });
  },

  // Sort inventory based on selected criteria
  sortInventory(inventory) {
    const sortedInventory = [...inventory];

    switch (this.currentSort) {
      case 'name':
        return sortedInventory.sort((a, b) => a.name.localeCompare(b.name));
      
      case 'quantity-asc':
        return sortedInventory.sort((a, b) => a.remaining - b.remaining);
      
      case 'quantity-desc':
        return sortedInventory.sort((a, b) => b.remaining - a.remaining);
      
      case 'alert':
        // Sort by alert level: critical first, then warning, then normal
        const alertOrder = { 'critical': 0, 'warning': 1, 'normal': 2 };
        return sortedInventory.sort((a, b) => {
          const orderA = alertOrder[a.alertLevel] || 3;
          const orderB = alertOrder[b.alertLevel] || 3;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          // If same alert level, sort by quantity (ascending for alerts)
          return a.remaining - b.remaining;
        });
      
      default:
        return sortedInventory;
    }
  },

  // Update summary cards with counts
  updateSummaryCards(inventory) {
    const normalCount = inventory.filter(item => item.alertLevel === 'normal').length;
    const warningCount = inventory.filter(item => item.alertLevel === 'warning').length;
    const criticalCount = inventory.filter(item => item.alertLevel === 'critical').length;

    // Update count displays
    const normalCountEl = document.getElementById('normal-stock-count');
    const lowCountEl = document.getElementById('low-stock-count');
    const outCountEl = document.getElementById('out-stock-count');

    if (normalCountEl) normalCountEl.textContent = normalCount;
    if (lowCountEl) lowCountEl.textContent = warningCount;
    if (outCountEl) outCountEl.textContent = criticalCount;
  },

  // Display inventory items
  displayInventory(inventory) {
    const container = document.getElementById('inventory-items-container');
    const noDataMessage = document.getElementById('no-inventory-message');

    if (!container || !noDataMessage) {
      console.error('Inventory display elements not found');
      return;
    }

    // Clear existing content
    container.innerHTML = '';

    if (inventory.length === 0) {
      container.style.display = 'none';
      noDataMessage.style.display = 'block';
      return;
    }

    container.style.display = 'block';
    noDataMessage.style.display = 'none';

    // Create inventory item cards
    inventory.forEach(item => {
      const itemCard = this.createInventoryCard(item);
      container.appendChild(itemCard);
    });
  },

  // Create a single inventory item card
  createInventoryCard(item) {
    const card = document.createElement('div');
    card.className = `inventory-card alert-${item.alertLevel}`;

    // Format quantities for display
    const assignedText = item.assigned === 1 ? '1 unit' : `${item.assigned} units`;
    const soldText = item.sold === 1 ? '1 unit' : `${item.sold} units`;
    const remainingText = item.remaining === 1 ? '1 unit' : `${item.remaining} units`;

    card.innerHTML = `
      <div class="inventory-card-header">
        <div class="product-info">
          <h3 class="product-name">${this.escapeHtml(item.name)}</h3>
          <div class="alert-badge alert-${item.alertLevel}">
            <i class="fas ${this.getAlertIcon(item.alertLevel)}"></i>
            <span>${this.getAlertText(item.alertLevel)}</span>
          </div>
        </div>
        <div class="quantity-display">
          <div class="quantity-main">
            <span class="quantity-number">${item.remaining}</span>
            <span class="quantity-label">remaining</span>
          </div>
        </div>
      </div>
      <div class="inventory-card-body">
        <div class="quantity-breakdown">
          <div class="breakdown-item">
            <span class="breakdown-label">Assigned:</span>
            <span class="breakdown-value">${assignedText}</span>
          </div>
          <div class="breakdown-item">
            <span class="breakdown-label">Sold:</span>
            <span class="breakdown-value">${soldText}</span>
          </div>
          <div class="breakdown-item remaining">
            <span class="breakdown-label">Remaining:</span>
            <span class="breakdown-value">${remainingText}</span>
          </div>
        </div>
        ${this.getAlertMessage(item)}
      </div>
    `;

    return card;
  },

  // Get alert icon based on level
  getAlertIcon(alertLevel) {
    switch (alertLevel) {
      case 'critical':
        return 'fa-times-circle';
      case 'warning':
        return 'fa-exclamation-triangle';
      case 'normal':
      default:
        return 'fa-check-circle';
    }
  },

  // Get alert text based on level
  getAlertText(alertLevel) {
    switch (alertLevel) {
      case 'critical':
        return 'Out of Stock';
      case 'warning':
        return 'Low Stock';
      case 'normal':
      default:
        return 'Normal Stock';
    }
  },

  // Get alert message for item
  getAlertMessage(item) {
    if (item.alertLevel === 'critical') {
      return `
        <div class="alert-message critical">
          <i class="fas fa-exclamation-circle"></i>
          <span>This item is out of stock. Contact admin for restocking.</span>
        </div>
      `;
    } else if (item.alertLevel === 'warning') {
      return `
        <div class="alert-message warning">
          <i class="fas fa-exclamation-triangle"></i>
          <span>Low stock alert! Only ${item.remaining} ${item.remaining === 1 ? 'unit' : 'units'} remaining.</span>
        </div>
      `;
    }
    return '';
  },

  // Escape HTML to prevent XSS
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Show error message
  showError(message) {
    const container = document.getElementById('inventory-items-container');
    const noDataMessage = document.getElementById('no-inventory-message');

    if (container && noDataMessage) {
      container.style.display = 'none';
      noDataMessage.style.display = 'block';
      noDataMessage.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error Loading Inventory</p>
        <small>${this.escapeHtml(message)}</small>
      `;
    }
  },

  // Refresh inventory data
  refresh() {
    this.loadInventory();
  }
};