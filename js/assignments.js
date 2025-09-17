/**
 * Stock Management module
 * Handles assigning products to drivers, transferring stock, and tracking history
 */

const AssignmentsModule = {
  // Current view state
  currentView: 'assign', // 'assign' or 'transfer'
  currentHistoryView: 'assignment', // 'assignment' or 'transfer'

  // Initialize the assignments module
  async init() {
    this.bindEvents();
    await this.loadAssignmentHistory();
    await this.updateDropdowns();
    this.showAssignStockView(); // Default view
  },

  // Bind event listeners
  bindEvents() {
    // Assign form
    const assignForm = document.getElementById('assign-form');
    if (assignForm) {
      assignForm.addEventListener('submit', this.handleAssignProducts.bind(this));
    }
    
    // Transfer form
    const transferForm = document.getElementById('transfer-form');
    if (transferForm) {
      transferForm.addEventListener('submit', async (e) => await this.handleTransferStock(e));
    }
    
    // View switchers
    const showAssignBtn = document.getElementById('show-assign-stock');
    const showTransferBtn = document.getElementById('show-transfer-stock');
    if (showAssignBtn) {
      showAssignBtn.addEventListener('click', this.showAssignStockView.bind(this));
    }
    if (showTransferBtn) {
      showTransferBtn.addEventListener('click', async () => await this.showTransferStockView());
    }

    // History tab switchers
    const showAssignHistoryBtn = document.getElementById('show-assignment-history');
    const showTransferHistoryBtn = document.getElementById('show-transfer-history');
    if (showAssignHistoryBtn) {
      showAssignHistoryBtn.addEventListener('click', this.showAssignmentHistoryView.bind(this));
    }
    if (showTransferHistoryBtn) {
      showTransferHistoryBtn.addEventListener('click', this.showTransferHistoryView.bind(this));
    }

    // History filters
    const historyDriverSelect = document.getElementById('history-driver');
    if (historyDriverSelect) {
      historyDriverSelect.addEventListener('change', this.loadAssignmentHistory.bind(this));
    }
    
    const transferHistoryFilter = document.getElementById('transfer-history-filter');
    if (transferHistoryFilter) {
      transferHistoryFilter.addEventListener('change', async () => await this.loadTransferHistory());
    }

    // Transfer form dropdowns
    const transferFromSelect = document.getElementById('transfer-from-driver');
    if (transferFromSelect) {
      transferFromSelect.addEventListener('change', async () => await this.updateTransferProductOptions());
    }

    const transferProductSelect = document.getElementById('transfer-product');
    if (transferProductSelect) {
      transferProductSelect.addEventListener('change', async () => await this.updateAvailableQuantityDisplay());
    }
  },

  // Handle assigning products to a driver
  async handleAssignProducts(event) {
    event.preventDefault();

    const driverSelect = document.getElementById('assign-driver');
    const productSelect = document.getElementById('assign-product');
    const quantityInput = document.getElementById('assign-quantity');

    const driverId = driverSelect.value;
    const productId = productSelect.value;
    const quantity = parseInt(quantityInput.value);

    if (!driverId || !productId || isNaN(quantity) || quantity <= 0) {
      alert('Please select a driver, product, and enter a valid quantity.');
      return;
    }

    try {
      // Get driver and product names for display
      const driver = await DB.getDriverById(driverId);
      const product = await DB.getProductById(productId);

      if (!driver || !product) {
        alert('Selected driver or product not found.');
        return;
      }

      const newAssignment = await DB.addAssignment(driverId, productId, quantity);

      // Reset form
      quantityInput.value = '';

      // Refresh dropdowns to show updated quantities
      await this.updateDropdowns();

      // Update product dropdowns in other modules
      if (typeof ProductsModule !== 'undefined') {
        await ProductsModule.updateProductDropdowns();
        await ProductsModule.loadProductsList();
      }

      // Refresh assignment history
      await this.loadAssignmentHistory();

      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }

      // Show notification
      this.showNotification(`Assigned ${quantity} units of "${product.name}" to ${driver.name}`);

    } catch (error) {
      // Handle the error when there's not enough quantity in stock
      alert(error.message);
    }
  },
  
  // Load assignment history
  async loadAssignmentHistory() {
    const historyList = document.getElementById('assignment-history-list');
    if (!historyList) return;

    try {
      const historyDriverSelect = document.getElementById('history-driver');
      const selectedDriverId = historyDriverSelect ? historyDriverSelect.value : '';

      let assignments = await DB.getAllAssignments();

      // Filter by driver if selected
      if (selectedDriverId) {
        assignments = assignments.filter(assignment => assignment.driverId === selectedDriverId);
      }

      historyList.innerHTML = '';

      if (assignments.length === 0) {
        historyList.innerHTML = '<li class="empty-list">No assignments found.</li>';
        return;
      }

      // Sort by date, newest first
      assignments.sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));

      for (const assignment of assignments) {
        const driver = await DB.getDriverById(assignment.driverId);
        const product = await DB.getProductById(assignment.productId);

        if (!driver || !product) continue;

        const li = document.createElement('li');

        const date = new Date(assignment.assignedAt);
        const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

        li.innerHTML = `
          <div class="item-details">
            <strong>${product.name}</strong> (${assignment.quantity} units)<br>
            <span>Assigned to: ${driver.name}</span><br>
            <small>${formattedDate}</small>
          </div>
        `;

        historyList.appendChild(li);
      }
    } catch (error) {
      historyList.innerHTML = '<li class="empty-list">Error loading assignment history.</li>';
      console.error('Error loading assignments:', error);
    }
  },
  
  // Update dropdowns for driver and product selection
  async updateDropdowns() {
    try {
      // Update driver dropdown
      if (typeof DriversModule !== 'undefined') {
        await DriversModule.updateDriverDropdowns();
      }

      // Directly update product dropdown with quantities
      const assignProductSelect = document.getElementById('assign-product');
      if (assignProductSelect && typeof DB !== 'undefined') {
        const products = await DB.getAllProducts();
        let options = '<option value="">-- Select Product --</option>';

        products.forEach(product => {
          options += `<option value="${product.id}">${product.name} (Qty: ${product.totalQuantity})</option>`;
        });

        assignProductSelect.innerHTML = options;
      }
    } catch (error) {
      console.error('Error updating dropdowns:', error);
    }
  },
  
  // Show notification
  showNotification(message) {
    if (typeof AppModule !== 'undefined') {
      AppModule.showNotification(message);
    } else {
      alert(message);
    }
  },
  
  // Get driver's current inventory for a specific product
  async getDriverProductInventory(driverId, productId) {
    if (!driverId || !productId) return 0;

    const driverInventory = await DB.getDriverInventory(driverId);
    const productInventory = driverInventory.find(item => item.id === productId);

    return productInventory ? productInventory.remaining : 0;
  },

  // ============ VIEW MANAGEMENT ============

  // Show assign stock view
  showAssignStockView() {
    this.currentView = 'assign';
    const assignSection = document.getElementById('assign-stock-section');
    const transferSection = document.getElementById('transfer-stock-section');
    const assignBtn = document.getElementById('show-assign-stock');
    const transferBtn = document.getElementById('show-transfer-stock');
    
    if (assignSection) assignSection.style.display = 'block';
    if (transferSection) transferSection.style.display = 'none';
    if (assignBtn) assignBtn.classList.add('active');
    if (transferBtn) transferBtn.classList.remove('active');
  },

  // Show transfer stock view
  async showTransferStockView() {
    this.currentView = 'transfer';
    const assignSection = document.getElementById('assign-stock-section');
    const transferSection = document.getElementById('transfer-stock-section');
    const assignBtn = document.getElementById('show-assign-stock');
    const transferBtn = document.getElementById('show-transfer-stock');

    if (assignSection) assignSection.style.display = 'none';
    if (transferSection) transferSection.style.display = 'block';
    if (assignBtn) assignBtn.classList.remove('active');
    if (transferBtn) transferBtn.classList.add('active');

    // Update transfer dropdowns
    await this.updateTransferDropdowns();
  },

  // Show assignment history
  showAssignmentHistoryView() {
    this.currentHistoryView = 'assignment';
    const assignHistorySection = document.getElementById('assignment-history-section');
    const transferHistorySection = document.getElementById('transfer-history-section');
    const assignHistoryBtn = document.getElementById('show-assignment-history');
    const transferHistoryBtn = document.getElementById('show-transfer-history');
    
    if (assignHistorySection) assignHistorySection.style.display = 'block';
    if (transferHistorySection) transferHistorySection.style.display = 'none';
    if (assignHistoryBtn) assignHistoryBtn.classList.add('active');
    if (transferHistoryBtn) transferHistoryBtn.classList.remove('active');
  },

  // Show transfer history
  async showTransferHistoryView() {
    this.currentHistoryView = 'transfer';
    const assignHistorySection = document.getElementById('assignment-history-section');
    const transferHistorySection = document.getElementById('transfer-history-section');
    const assignHistoryBtn = document.getElementById('show-assignment-history');
    const transferHistoryBtn = document.getElementById('show-transfer-history');

    if (assignHistorySection) assignHistorySection.style.display = 'none';
    if (transferHistorySection) transferHistorySection.style.display = 'block';
    if (assignHistoryBtn) assignHistoryBtn.classList.remove('active');
    if (transferHistoryBtn) transferHistoryBtn.classList.add('active');

    await this.loadTransferHistory();
  },

  // ============ STOCK TRANSFER FUNCTIONALITY ============

  // Handle stock transfer form submission
  async handleTransferStock(event) {
    event.preventDefault();

    const fromDriverSelect = document.getElementById('transfer-from-driver');
    const toDriverSelect = document.getElementById('transfer-to-driver');
    const productSelect = document.getElementById('transfer-product');
    const quantityInput = document.getElementById('transfer-quantity');

    const fromDriverId = fromDriverSelect.value;
    const toDriverId = toDriverSelect.value;
    const productId = productSelect.value;
    const quantity = parseInt(quantityInput.value);

    if (!fromDriverId || !toDriverId || !productId || isNaN(quantity) || quantity <= 0) {
      alert('Please complete all fields with valid values.');
      return;
    }

    // Get names for display
    const fromDriver = await DB.getDriverById(fromDriverId);
    const toDriver = toDriverId === 'main-inventory' ? null : await DB.getDriverById(toDriverId);
    const product = await DB.getProductById(productId);
    
    if (!fromDriver || !product || (toDriverId !== 'main-inventory' && !toDriver)) {
      alert('Selected driver or product not found.');
      return;
    }

    try {
      // Perform the transfer
      const transfer = await DB.transferStock(fromDriverId, toDriverId, productId, quantity);

      // Reset form
      quantityInput.value = '';
      productSelect.innerHTML = '<option value="">-- Select Product --</option>';
      document.getElementById('available-quantity-display').textContent = '';

      // Refresh dropdowns and data
      await this.updateDropdowns();
      await this.updateTransferDropdowns();
      if (this.currentHistoryView === 'transfer') {
        await this.loadTransferHistory();
      }

      // Update other modules
      if (typeof ProductsModule !== 'undefined') {
        await ProductsModule.updateProductDropdowns();
        await ProductsModule.loadProductsList();
      }
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }
      
      // Show success notification
      const destinationText = toDriverId === 'main-inventory' ? 
        'main inventory' : toDriver.name;
      this.showNotification(`Transferred ${quantity} units of "${product.name}" from ${fromDriver.name} to ${destinationText}`);
      
    } catch (error) {
      alert(error.message);
    }
  },

  // Update transfer form dropdowns
  async updateTransferDropdowns() {
    await this.updateTransferFromDriverOptions();
    await this.updateTransferToDriverOptions();
  },

  // Update "from driver" dropdown
  async updateTransferFromDriverOptions() {
    const fromDriverSelect = document.getElementById('transfer-from-driver');
    if (!fromDriverSelect) return;

    const drivers = await DB.getAllDrivers();
    let options = '<option value="">-- Select Source Driver --</option>';

    for (const driver of drivers) {
      const inventory = await DB.getDriverInventory(driver.id);
      const hasStock = inventory.some(item => item.remaining > 0);
      if (hasStock) {
        options += `<option value="${driver.id}">${driver.name}</option>`;
      }
    }

    fromDriverSelect.innerHTML = options;
  },

  // Update "to driver" dropdown (exclude selected from-driver)
  async updateTransferToDriverOptions() {
    const fromDriverSelect = document.getElementById('transfer-from-driver');
    const toDriverSelect = document.getElementById('transfer-to-driver');
    if (!toDriverSelect) return;

    const fromDriverId = fromDriverSelect ? fromDriverSelect.value : '';
    const drivers = await DB.getAllDrivers();

    let options = '<option value="">-- Select Destination --</option>';
    options += '<option value="main-inventory">📦 Main Inventory (Collect Stock)</option>';

    drivers.forEach(driver => {
      if (driver.id !== fromDriverId) { // Exclude source driver
        options += `<option value="${driver.id}">${driver.name}</option>`;
      }
    });

    toDriverSelect.innerHTML = options;
  },

  // Update product options based on selected from-driver
  async updateTransferProductOptions() {
    const fromDriverSelect = document.getElementById('transfer-from-driver');
    const productSelect = document.getElementById('transfer-product');
    if (!fromDriverSelect || !productSelect) return;

    const fromDriverId = fromDriverSelect.value;
    if (!fromDriverId) {
      productSelect.innerHTML = '<option value="">-- Select Product --</option>';
      await this.updateTransferToDriverOptions();
      return;
    }

    // Update to-driver options (exclude selected from-driver)
    await this.updateTransferToDriverOptions();

    // Get driver's inventory
    const driverInventory = await DB.getDriverInventory(fromDriverId);
    let options = '<option value="">-- Select Product --</option>';
    
    driverInventory
      .filter(item => item.remaining > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(item => {
        options += `<option value="${item.id}">${item.name} (${item.remaining} available)</option>`;
      });
    
    productSelect.innerHTML = options;
    await this.updateAvailableQuantityDisplay();
  },

  // Update available quantity display
  async updateAvailableQuantityDisplay() {
    const fromDriverSelect = document.getElementById('transfer-from-driver');
    const productSelect = document.getElementById('transfer-product');
    const quantityDisplay = document.getElementById('available-quantity-display');

    if (!fromDriverSelect || !productSelect || !quantityDisplay) return;

    const fromDriverId = fromDriverSelect.value;
    const productId = productSelect.value;

    if (!fromDriverId || !productId) {
      quantityDisplay.textContent = '';
      return;
    }

    const available = await this.getDriverProductInventory(fromDriverId, productId);
    quantityDisplay.textContent = `Available: ${available} units`;
    
    // Update quantity input max value
    const quantityInput = document.getElementById('transfer-quantity');
    if (quantityInput) {
      quantityInput.max = available;
    }
  },

  // ============ TRANSFER HISTORY ============

  // Load transfer history
  async loadTransferHistory() {
    const historyList = document.getElementById('transfer-history-list');
    if (!historyList) return;

    const filterSelect = document.getElementById('transfer-history-filter');
    const selectedDriverId = filterSelect ? filterSelect.value : '';

    let transfers = await DB.getStockTransfers();

    // Filter by driver if selected
    if (selectedDriverId) {
      transfers = transfers.filter(transfer =>
        transfer.fromDriverId === selectedDriverId || transfer.toDriverId === selectedDriverId
      );
    }

    historyList.innerHTML = '';

    if (transfers.length === 0) {
      historyList.innerHTML = '<li class="empty-list">No transfers found.</li>';
      return;
    }

    // Sort by date, newest first
    transfers.sort((a, b) => new Date(b.transferredAt) - new Date(a.transferredAt));

    for (const transfer of transfers) {
      const fromDriver = await DB.getDriverById(transfer.fromDriverId);
      const toDriver = transfer.toDriverId ? await DB.getDriverById(transfer.toDriverId) : null;
      const product = await DB.getProductById(transfer.productId);
      
      if (!fromDriver || !product) return;
      
      const li = document.createElement('li');
      
      const date = new Date(transfer.transferredAt);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
      
      const toText = toDriver ? toDriver.name : 'Main Inventory';
      const transferTypeIcon = transfer.transferType === 'collect' ? '📦' : '🔄';
      
      li.innerHTML = `
        <div class="item-details">
          <strong>${transferTypeIcon} ${product.name}</strong> (${transfer.quantity} units)<br>
          <span>From: ${fromDriver.name} → To: ${toText}</span><br>
          <small>${formattedDate}</small>
        </div>
      `;
      
      historyList.appendChild(li);
    }

    // Update transfer history filter dropdown
    await this.updateTransferHistoryFilter();
  },

  // Update transfer history filter dropdown
  async updateTransferHistoryFilter() {
    const filterSelect = document.getElementById('transfer-history-filter');
    if (!filterSelect) return;

    const currentValue = filterSelect.value;
    const drivers = await DB.getAllDrivers();
    let options = '<option value="">All Transfers</option>';
    
    drivers.forEach(driver => {
      options += `<option value="${driver.id}">${driver.name}</option>`;
    });
    
    filterSelect.innerHTML = options;
    filterSelect.value = currentValue; // Preserve selection
  }
};

// Export the module and make it globally available
export default AssignmentsModule;
window.AssignmentsModule = AssignmentsModule;
