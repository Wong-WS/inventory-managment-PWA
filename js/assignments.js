/**
 * Stock Management module
 * Handles assigning products to drivers, transferring stock, and tracking history
 */

const AssignmentsModule = {
  // Current view state
  currentView: 'assign', // 'assign' or 'transfer'
  currentHistoryView: 'assignment', // 'assignment' or 'transfer'

  // Cache for drivers and products to avoid N+1 queries
  driversCache: new Map(),
  productsCache: new Map(),
  cacheInitialized: false,
  assignmentItemCounter: 1, // Track dynamic line items

  // Initialize caches
  async initializeCaches() {
    if (this.cacheInitialized) return;

    try {
      const [drivers, products] = await Promise.all([
        DB.getAllDrivers(),
        DB.getAllProducts()
      ]);

      this.driversCache.clear();
      this.productsCache.clear();

      drivers.forEach(driver => this.driversCache.set(driver.id, driver));
      products.forEach(product => this.productsCache.set(product.id, product));

      this.cacheInitialized = true;
      console.log(`AssignmentsModule: Caches initialized - ${drivers.length} drivers, ${products.length} products`);
    } catch (error) {
      console.error('Failed to initialize caches:', error);
    }
  },

  // Get cached driver
  async getCachedDriver(driverId) {
    if (!driverId) return null;
    if (this.driversCache.has(driverId)) {
      return this.driversCache.get(driverId);
    }
    const driver = await DB.getDriverById(driverId);
    if (driver) this.driversCache.set(driverId, driver);
    return driver;
  },

  // Get cached product
  async getCachedProduct(productId) {
    if (!productId) return null;
    if (this.productsCache.has(productId)) {
      return this.productsCache.get(productId);
    }
    const product = await DB.getProductById(productId);
    if (product) this.productsCache.set(productId, product);
    return product;
  },

  // Initialize the assignments module
  async init() {
    // Initialize caches for performance
    await this.initializeCaches();

    this.assignmentItemCounter = 1; // Initialize counter

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

    // Add assignment item button
    const addItemButton = document.getElementById('add-assignment-item');
    if (addItemButton) {
      addItemButton.addEventListener('click', this.addAssignmentItem.bind(this));
    }

    // Add listeners for first item
    this.addAssignmentItemListeners(0);

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

    // Prevent duplicate submissions
    const submitButton = event.target.querySelector('button[type="submit"]');
    if (submitButton && submitButton.disabled) {
      return; // Already submitting
    }

    const driverSelect = document.getElementById('assign-driver');
    const driverId = driverSelect.value;

    if (!driverId) {
      alert('Please select a driver.');
      return;
    }

    // Disable submit button to prevent duplicates
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Assigning...';
    }

    try {
      // Collect all assignment items
      const assignmentItems = [];
      const itemElements = document.querySelectorAll('.assignment-item');

      let valid = true;
      for (const element of itemElements) {
        const index = element.dataset.index;
        const productSelect = document.getElementById(`assignment-product-${index}`);
        const quantityInput = document.getElementById(`assignment-quantity-${index}`);

        const productId = productSelect.value;
        const quantity = parseInt(quantityInput.value);

        if (!productId || isNaN(quantity) || quantity <= 0) {
          valid = false;
          break;
        }

        assignmentItems.push({ productId, quantity });
      }

      if (!valid || assignmentItems.length === 0) {
        alert('Please select products and enter valid quantities for all items.');

        // Re-enable button on error
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Assign Products';
        }
        return;
      }

      // Check for duplicate products
      const productIds = assignmentItems.map(item => item.productId);
      const uniqueProductIds = new Set(productIds);
      if (productIds.length !== uniqueProductIds.size) {
        alert('You have selected the same product multiple times. Please remove duplicates.');

        // Re-enable button on error
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Assign Products';
        }
        return;
      }

      // Get driver for display
      const driver = await DB.getDriverById(driverId);
      if (!driver) {
        alert('Selected driver not found.');

        // Re-enable button on error
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Assign Products';
        }
        return;
      }

      // Validate inventory for all products BEFORE creating assignments
      for (const item of assignmentItems) {
        const product = await DB.getProductById(item.productId);
        if (!product || product.totalQuantity < item.quantity) {
          const productName = product ? product.name : 'Unknown product';
          const available = product ? product.totalQuantity : 0;
          alert(`Insufficient stock for "${productName}". Available: ${available}, Requested: ${item.quantity}`);

          // Re-enable button on error
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Assign Products';
          }
          return;
        }
      }

      // Create assignments for each item
      const assignmentPromises = assignmentItems.map(item =>
        DB.addAssignment(driverId, item.productId, item.quantity)
      );

      await Promise.all(assignmentPromises);

      // Reset form
      await this.resetAssignmentForm();

      // Refresh all UI elements in parallel (independent operations)
      await Promise.all([
        this.updateDropdowns(),
        this.loadAssignmentHistory(),
        typeof ProductsModule !== 'undefined' ? ProductsModule.updateProductDropdowns() : Promise.resolve(),
        typeof ProductsModule !== 'undefined' ? ProductsModule.loadProductsList() : Promise.resolve(),
        typeof DashboardModule !== 'undefined' ? DashboardModule.updateDashboard() : Promise.resolve()
      ]);

      // Show notification
      const totalItems = assignmentItems.length;
      const totalQuantity = assignmentItems.reduce((sum, item) => sum + item.quantity, 0);
      this.showNotification(`Assigned ${totalItems} product(s) (${totalQuantity} total units) to ${driver.name}`);

      // Re-enable button after successful assignment
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Assign Products';
      }

    } catch (error) {
      // Handle the error when there's not enough quantity in stock
      alert(error.message);

      // Re-enable button on error
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Assign Products';
      }
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

      // Sort by date, newest first (handle Firebase Timestamps properly)
      assignments.sort((a, b) => {
        const dateA = a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(a.assignedAt);
        const dateB = b.assignedAt?.toDate ? b.assignedAt.toDate() : new Date(b.assignedAt);
        return dateB - dateA;
      });

      // Pre-fetch any missing drivers/products
      const driverIds = [...new Set(assignments.map(a => a.driverId))];
      const productIds = [...new Set(assignments.map(a => a.productId))];

      await Promise.all([
        ...driverIds.filter(id => !this.driversCache.has(id)).map(id => this.getCachedDriver(id)),
        ...productIds.filter(id => !this.productsCache.has(id)).map(id => this.getCachedProduct(id))
      ]);

      for (const assignment of assignments) {
        // Use cached data (instant!)
        const driver = this.driversCache.get(assignment.driverId);
        const product = this.productsCache.get(assignment.productId);

        if (!driver || !product) continue;

        const li = document.createElement('li');

        const assignedDate = assignment.assignedAt?.toDate ? assignment.assignedAt.toDate() : new Date(assignment.assignedAt);
        const formattedDate = `${assignedDate.toLocaleDateString()} ${assignedDate.toLocaleTimeString()}`;

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

      // Update all product dropdowns for assignment items
      const productSelects = document.querySelectorAll('.assignment-product');
      if (productSelects.length > 0 && typeof DB !== 'undefined') {
        const products = await DB.getAllProducts();
        let options = '<option value="">-- Select Product --</option>';

        products.forEach(product => {
          options += `<option value="${product.id}">${product.name} (Qty: ${product.totalQuantity})</option>`;
        });

        productSelects.forEach(select => {
          select.innerHTML = options;
        });
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

  // Add a new assignment line item
  async addAssignmentItem() {
    const container = document.getElementById('assignment-items-container');
    const index = this.assignmentItemCounter++;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'assignment-item';
    itemDiv.dataset.index = index;

    itemDiv.innerHTML = `
      <div class="form-group">
        <label for="assignment-product-${index}">Select Product</label>
        <select class="assignment-product" id="assignment-product-${index}" required>
          <option value="">-- Select Product --</option>
          ${await this.getProductOptionsHtml()}
        </select>
      </div>
      <div class="form-group">
        <label for="assignment-quantity-${index}">Quantity</label>
        <input type="number" class="assignment-quantity" id="assignment-quantity-${index}" min="1" required>
      </div>
      <button type="button" class="remove-assignment-item danger-button">Remove</button>
    `;

    container.appendChild(itemDiv);

    // Show remove buttons if there's more than one item
    this.updateRemoveButtons();

    // Add event listeners for the new item
    this.addAssignmentItemListeners(index);
  },

  // Remove an assignment line item
  removeAssignmentItem(index) {
    const itemDiv = document.querySelector(`.assignment-item[data-index="${index}"]`);
    if (!itemDiv) return;

    itemDiv.remove();

    // Update the visibility of remove buttons
    this.updateRemoveButtons();
  },

  // Update the visibility of remove buttons
  updateRemoveButtons() {
    const removeButtons = document.querySelectorAll('.remove-assignment-item');
    const items = document.querySelectorAll('.assignment-item');

    if (items.length > 1) {
      removeButtons.forEach(button => {
        button.style.display = '';
      });
    } else {
      removeButtons.forEach(button => {
        button.style.display = 'none';
      });
    }
  },

  // Add event listeners for assignment items
  addAssignmentItemListeners(index) {
    const itemDiv = document.querySelector(`.assignment-item[data-index="${index}"]`);
    if (!itemDiv) return;

    const removeButton = itemDiv.querySelector('.remove-assignment-item');
    if (removeButton) {
      removeButton.addEventListener('click', () => this.removeAssignmentItem(index));
    }
  },

  // Get product options as HTML string
  async getProductOptionsHtml() {
    if (typeof DB !== 'undefined') {
      const products = await DB.getAllProducts();
      let options = '';

      products.forEach(product => {
        options += `<option value="${product.id}">${product.name} (Qty: ${product.totalQuantity})</option>`;
      });

      return options;
    }
    return '';
  },

  // Reset assignment form to initial state
  async resetAssignmentForm() {
    const form = document.getElementById('assign-form');
    if (form) {
      form.reset();
    }

    // Reset to single item
    const container = document.getElementById('assignment-items-container');
    if (container) {
      container.innerHTML = '';
      this.assignmentItemCounter = 0;
      await this.addAssignmentItem();
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

    // Prevent duplicate submissions
    const submitButton = event.target.querySelector('button[type="submit"]');
    if (submitButton && submitButton.disabled) {
      return; // Already submitting
    }

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

    // Disable submit button to prevent duplicates
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Transferring...';
    }

    // Get names for display
    const fromDriver = await DB.getDriverById(fromDriverId);
    const toDriver = toDriverId === 'main-inventory' ? null : await DB.getDriverById(toDriverId);
    const product = await DB.getProductById(productId);

    if (!fromDriver || !product || (toDriverId !== 'main-inventory' && !toDriver)) {
      alert('Selected driver or product not found.');

      // Re-enable button on error
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Transfer Stock';
      }
      return;
    }

    try {
      // Perform the transfer
      await DB.transferStock(fromDriverId, toDriverId, productId, quantity);

      // Reset form
      quantityInput.value = '';
      productSelect.innerHTML = '<option value="">-- Select Product --</option>';
      document.getElementById('available-quantity-display').textContent = '';

      // Refresh all UI elements in parallel (independent operations)
      await Promise.all([
        this.updateDropdowns(),
        this.updateTransferDropdowns(),
        this.currentHistoryView === 'transfer' ? this.loadTransferHistory() : Promise.resolve(),
        typeof ProductsModule !== 'undefined' ? ProductsModule.updateProductDropdowns() : Promise.resolve(),
        typeof ProductsModule !== 'undefined' ? ProductsModule.loadProductsList() : Promise.resolve(),
        typeof DashboardModule !== 'undefined' ? DashboardModule.updateDashboard() : Promise.resolve()
      ]);

      // Show success notification
      const destinationText = toDriverId === 'main-inventory' ?
        'main inventory' : toDriver.name;
      this.showNotification(`Transferred ${quantity} units of "${product.name}" from ${fromDriver.name} to ${destinationText}`);

      // Re-enable button after successful transfer
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Transfer Stock';
      }

    } catch (error) {
      alert(error.message);

      // Re-enable button on error
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Transfer Stock';
      }
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

    // Sort by date, newest first (handle Firebase Timestamps properly)
    transfers.sort((a, b) => {
      const dateA = a.transferredAt?.toDate ? a.transferredAt.toDate() : new Date(a.transferredAt);
      const dateB = b.transferredAt?.toDate ? b.transferredAt.toDate() : new Date(b.transferredAt);
      return dateB - dateA;
    });

    // Pre-fetch any missing drivers/products
    const fromDriverIds = [...new Set(transfers.map(t => t.fromDriverId))];
    const toDriverIds = [...new Set(transfers.map(t => t.toDriverId).filter(id => id))];
    const productIds = [...new Set(transfers.map(t => t.productId))];

    await Promise.all([
      ...fromDriverIds.filter(id => !this.driversCache.has(id)).map(id => this.getCachedDriver(id)),
      ...toDriverIds.filter(id => !this.driversCache.has(id)).map(id => this.getCachedDriver(id)),
      ...productIds.filter(id => !this.productsCache.has(id)).map(id => this.getCachedProduct(id))
    ]);

    for (const transfer of transfers) {
      // Use cached data (instant!)
      const fromDriver = this.driversCache.get(transfer.fromDriverId);
      const toDriver = transfer.toDriverId ? this.driversCache.get(transfer.toDriverId) : null;
      const product = this.productsCache.get(transfer.productId);

      if (!fromDriver || !product) continue;

      const li = document.createElement('li');

      const date = transfer.transferredAt?.toDate ? transfer.transferredAt.toDate() : new Date(transfer.transferredAt);
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
