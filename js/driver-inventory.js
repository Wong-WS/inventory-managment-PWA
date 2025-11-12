/**
 * Driver Inventory module (Admin only)
 * Allows admins to view all drivers' inventory with low stock alerts
 */

const DriverInventoryModule = {
  // State
  currentDriverFilter: '', // empty = all drivers
  lowStockThreshold: 5,
  allDriversData: [],
  assignmentsListenerId: null,
  ordersListenerId: null,

  // Optimization: Debounce timer
  debounceTimer: null,

  // Initialize the module
  async init() {
    this.bindEvents();
    await this.loadDriversInventory();
    await this.setupRealtimeListeners();
  },

  // Bind event listeners
  bindEvents() {
    const driverFilter = document.getElementById('driver-filter');
    if (driverFilter) {
      driverFilter.addEventListener('change', () => {
        this.currentDriverFilter = driverFilter.value;
        this.displayInventory();
      });
    }

    // Bind accordion toggle handlers (delegated event)
    const container = document.getElementById('drivers-inventory-container');
    if (container) {
      container.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.driver-card-toggle');
        if (toggleBtn) {
          const card = toggleBtn.closest('.driver-inventory-card');
          if (card) {
            card.classList.toggle('expanded');
          }
        }
      });
    }
  },

  // Load all drivers' inventory
  async loadDriversInventory() {
    try {
      this.showLoading();

      // Fetch all drivers' inventory
      this.allDriversData = await DB.getAllDriversInventory(this.lowStockThreshold);

      // Update driver filter dropdown
      this.updateDriverFilter();

      // Display inventory
      this.displayInventory();

    } catch (error) {
      console.error('Error loading drivers inventory:', error);
      this.showError('Failed to load drivers inventory');
    }
  },

  // Update driver filter dropdown
  updateDriverFilter() {
    const driverFilter = document.getElementById('driver-filter');
    if (!driverFilter) return;

    let options = '<option value="">All Drivers</option>';

    this.allDriversData.forEach(({ driver }) => {
      options += `<option value="${driver.id}">${driver.name}</option>`;
    });

    driverFilter.innerHTML = options;
    driverFilter.value = this.currentDriverFilter;
  },

  // Display inventory based on current filters
  displayInventory() {
    // Filter data based on selected driver
    let filteredData = this.allDriversData;
    if (this.currentDriverFilter) {
      filteredData = this.allDriversData.filter(({ driver }) => driver.id === this.currentDriverFilter);
    }

    // Update summary cards
    this.updateSummaryCards(filteredData);

    // Display driver inventory cards
    this.displayDriverCards(filteredData);
  },

  // Update summary cards
  updateSummaryCards(data) {
    let totalLowStock = 0;
    let totalOutOfStock = 0;
    let totalNormal = 0;

    data.forEach(({ inventory }) => {
      inventory.forEach(item => {
        if (item.isOutOfStock) {
          totalOutOfStock++;
        } else if (item.isLowStock) {
          totalLowStock++;
        } else if (item.remaining > 0) {
          totalNormal++;
        }
      });
    });

    // Update normal stock card
    const normalCard = document.querySelector('.summary-card.normal .summary-number');
    if (normalCard) normalCard.textContent = totalNormal;

    // Update low stock card
    const lowStockCard = document.querySelector('.summary-card.warning .summary-number');
    if (lowStockCard) lowStockCard.textContent = totalLowStock;

    // Update out of stock card
    const outOfStockCard = document.querySelector('.summary-card.critical .summary-number');
    if (outOfStockCard) outOfStockCard.textContent = totalOutOfStock;
  },

  // Display driver inventory cards
  displayDriverCards(data) {
    const container = document.getElementById('drivers-inventory-container');
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = '<div class="no-data-message">No drivers found</div>';
      return;
    }

    container.innerHTML = '';

    data.forEach(({ driver, inventory }) => {
      const card = this.createDriverCard(driver, inventory);
      container.appendChild(card);
    });
  },

  // Create a driver inventory card
  createDriverCard(driver, inventory) {
    const card = document.createElement('div');
    card.className = 'driver-inventory-card';

    // Calculate summary for this driver
    const lowStock = inventory.filter(item => item.isLowStock).length;
    const outOfStock = inventory.filter(item => item.isOutOfStock).length;
    const normalStock = inventory.filter(item => item.remaining > 0 && !item.isLowStock).length;

    // Filter out products with 0 assigned (never assigned to this driver)
    const assignedInventory = inventory.filter(item => item.assigned > 0);

    // Create header
    const header = document.createElement('div');
    header.className = 'driver-card-header';

    let alertBadge = '';
    if (outOfStock > 0) {
      alertBadge = `<span class="alert-badge critical">${outOfStock} Out of Stock</span>`;
    } else if (lowStock > 0) {
      alertBadge = `<span class="alert-badge warning">${lowStock} Low Stock</span>`;
    }

    header.innerHTML = `
      <div class="driver-card-title">
        <h3>${driver.name}</h3>
        ${alertBadge}
      </div>
      <div class="driver-card-summary">
        <span class="summary-item normal">${normalStock} Normal</span>
        <span class="summary-item warning">${lowStock} Low</span>
        <span class="summary-item critical">${outOfStock} Out</span>
      </div>
      <button class="driver-card-toggle" type="button">
        <i class="fas fa-chevron-down"></i>
      </button>
    `;

    // Create body (inventory items)
    const body = document.createElement('div');
    body.className = 'driver-card-body';

    if (assignedInventory.length === 0) {
      body.innerHTML = '<div class="no-data-message">No products assigned to this driver yet</div>';
    } else {
      assignedInventory.forEach(item => {
        const itemDiv = this.createInventoryItem(item);
        body.appendChild(itemDiv);
      });
    }

    card.appendChild(header);
    card.appendChild(body);

    return card;
  },

  // Create an inventory item element
  createInventoryItem(item) {
    const itemDiv = document.createElement('div');
    itemDiv.className = `inventory-item alert-${item.alertLevel}`;

    let alertBadge = '';
    let alertMessage = '';

    if (item.isOutOfStock) {
      alertBadge = '<span class="alert-badge critical">Out of Stock</span>';
      alertMessage = '<div class="alert-message critical">⚠️ This product is out of stock</div>';
    } else if (item.isLowStock) {
      alertBadge = '<span class="alert-badge warning">Low Stock</span>';
      alertMessage = `<div class="alert-message warning">⚠️ Only ${item.remaining} units remaining</div>`;
    }

    itemDiv.innerHTML = `
      <div class="inventory-item-header">
        <span class="product-name">${item.name}</span>
        ${alertBadge}
      </div>
      <div class="inventory-item-details">
        <div class="inventory-stat">
          <span class="stat-label">Assigned:</span>
          <span class="stat-value">${item.assigned}</span>
        </div>
        <div class="inventory-stat">
          <span class="stat-label">Sold:</span>
          <span class="stat-value">${item.sold}</span>
        </div>
        <div class="inventory-stat">
          <span class="stat-label">Remaining:</span>
          <span class="stat-value remaining">${item.remaining}</span>
        </div>
      </div>
      ${alertMessage}
    `;

    return itemDiv;
  },

  // Debounced reload function (optimization: batch rapid changes)
  debouncedReload() {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer to reload after 1 second of inactivity
    this.debounceTimer = setTimeout(async () => {
      await this.loadDriversInventory();
    }, 1000);
  },

  // Update single driver's inventory (optimization: targeted updates)
  async updateSingleDriver(driverId) {
    try {
      // Find the driver in our data
      const driverData = this.allDriversData.find(d => d.driver.id === driverId);

      if (driverData) {
        // Only reload this driver's inventory
        const newInventory = await DB.getDriverInventoryWithAlerts(driverId, this.lowStockThreshold);
        driverData.inventory = newInventory;

        // Re-display the UI
        this.displayInventory();
      } else {
        // Driver not in current list, do full reload
        await this.loadDriversInventory();
      }
    } catch (error) {
      console.error('Error updating single driver:', error);
      // Fall back to full reload on error
      await this.loadDriversInventory();
    }
  },

  // Setup real-time listeners
  async setupRealtimeListeners() {
    // Listen to assignments changes
    this.assignmentsListenerId = DB.listenToAssignments(async (assignments) => {
      // Optimization: Use debounced reload to batch rapid changes
      this.debouncedReload();
    });

    // Listen to orders changes
    this.ordersListenerId = DB.listenToOrders(async (orders) => {
      // Optimization: Use debounced reload to batch rapid changes
      this.debouncedReload();
    });
  },

  // Show loading state
  showLoading() {
    const container = document.getElementById('drivers-inventory-container');
    if (container) {
      container.innerHTML = '<div class="loading-message">Loading drivers inventory...</div>';
    }
  },

  // Show error state
  showError(message) {
    const container = document.getElementById('drivers-inventory-container');
    if (container) {
      container.innerHTML = `<div class="error-message">${message}</div>`;
    }
  },

  // Cleanup listeners when leaving the tab
  cleanup() {
    // Clear any pending debounce timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.assignmentsListenerId) {
      DB.cleanupListener(this.assignmentsListenerId);
      this.assignmentsListenerId = null;
    }

    if (this.ordersListenerId) {
      DB.cleanupListener(this.ordersListenerId);
      this.ordersListenerId = null;
    }
  }
};

// Export the module and make it globally available
export default DriverInventoryModule;
window.DriverInventoryModule = DriverInventoryModule;
