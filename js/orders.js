/**
 * Order management module
 * Handles creating, managing, and tracking orders with status workflow
 */

const OrdersModule = {
  // Cache for drivers and users to avoid N+1 queries
  driversCache: new Map(),
  usersCache: new Map(),
  cacheInitialized: false,

  // Initialize caches with all drivers and users
  async initializeCaches() {
    if (this.cacheInitialized) return;

    try {
      // Fetch all drivers and users in parallel
      const [drivers, users] = await Promise.all([
        DB.getAllDrivers(),
        DB.getAllUsers()
      ]);

      // Populate caches
      this.driversCache.clear();
      this.usersCache.clear();

      drivers.forEach(driver => {
        this.driversCache.set(driver.id, driver);
      });

      users.forEach(user => {
        this.usersCache.set(user.id, user);
      });

      this.cacheInitialized = true;
      console.log(`OrdersModule: Caches initialized - ${drivers.length} drivers, ${users.length} users`);
    } catch (error) {
      console.error('Failed to initialize caches:', error);
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

  // Get user from cache (with fallback to DB)
  async getCachedUser(userId) {
    if (!userId) return null;

    // Check cache first
    if (this.usersCache.has(userId)) {
      return this.usersCache.get(userId);
    }

    // Fallback to DB and update cache
    const user = await DB.getUserById(userId);
    if (user) {
      this.usersCache.set(userId, user);
    }
    return user;
  },

  // Refresh caches when drivers/users are updated
  refreshDriverCache(driver) {
    if (driver && driver.id) {
      this.driversCache.set(driver.id, driver);
    }
  },

  refreshUserCache(user) {
    if (user && user.id) {
      this.usersCache.set(user.id, user);
    }
  },

  // Parse Firebase date safely
  parseFirebaseDate(date) {
    if (!date) return new Date();

    // Handle Firebase Timestamp
    if (date.toDate && typeof date.toDate === 'function') {
      return date.toDate();
    }

    // Handle ISO string
    if (typeof date === 'string') {
      return new Date(date);
    }

    // Handle regular Date object
    if (date instanceof Date) {
      return date;
    }

    // Fallback
    return new Date();
  },

  // Calculate deduction amount based on category
  getDeductionAmount(category, customQuantity = 0) {
    switch(category) {
      case 'Q': return 1;
      case 'H': return 2;
      case 'Oz': return 4;
      case 'Quantity by pcs': return parseInt(customQuantity) || 0;
      default: return 0;
    }
  },

  // Validate if inventory is available for the selected quantity type
  async validateInventoryAvailability(driverId, productId, category, customQuantity = 0) {
    if (!driverId || !productId || !category) return false;

    const driverInventory = await DB.getDriverInventory(driverId);
    const productInventory = driverInventory.find(item => item.id === productId);

    if (!productInventory) return false;

    const requiredAmount = this.getDeductionAmount(category, customQuantity);
    return productInventory.remaining >= requiredAmount;
  },

  // Show inventory validation error message
  showInventoryError(productName, available, category, required) {
    const categoryName = category === 'Quantity by pcs' ? `${category} (${required})` : category;
    alert(`Not enough inventory! Product "${productName}" has only ${available} units available, but "${categoryName}" requires ${required} units.`);
  },

  // Validate all line items when driver changes
  async validateAllLineItems() {
    const lineItemElements = document.querySelectorAll('.line-item');
    const orderDriverSelect = document.getElementById('order-driver');
    const driverId = orderDriverSelect ? orderDriverSelect.value : '';

    if (!driverId) return;

    for (const element of lineItemElements) {
      const index = element.dataset.index;
      const productSelect = document.getElementById(`line-item-product-${index}`);
      const categorySelect = document.getElementById(`line-item-category-${index}`);
      const customQuantityInput = document.getElementById(`line-item-custom-quantity-${index}`);

      if (productSelect && categorySelect && productSelect.value && categorySelect.value) {
        const customQuantity = customQuantityInput ? customQuantityInput.value : 0;
        const isValid = await this.validateInventoryAvailability(driverId, productSelect.value, categorySelect.value, customQuantity);

        if (!isValid) {
          // Reset invalid selections
          categorySelect.value = '';
          const customQuantityGroup = document.getElementById(`custom-quantity-group-${index}`);
          if (customQuantityGroup) {
            customQuantityGroup.style.display = 'none';
          }
          if (customQuantityInput) {
            customQuantityInput.required = false;
            customQuantityInput.value = '';
          }

          // Show error message
          const driverInventory = await DB.getDriverInventory(driverId);
          const productInventory = driverInventory.find(item => item.id === productSelect.value);
          if (productInventory) {
            const required = this.getDeductionAmount(categorySelect.value, customQuantity);
            this.showInventoryError(productInventory.name, productInventory.remaining, categorySelect.value, required);
          }
        }
      }
    }
  },

  // Initialize the orders module
  async init() {
    this.lineItemCounter = 1; // Start at 1 because HTML already has line-item with data-index="0"
    this.currentView = 'create'; // 'create' or 'manage'
    this.ordersListenerUnsubscribe = null; // Track listener for cleanup

    // Initialize caches immediately for performance
    await this.initializeCaches();

    this.bindEvents();
    // Don't setup listener immediately - only when manage view is shown
    await this.updateDriverDropdown();
    await this.updateLineItemProductOptions();
    this.showCreateOrderView(); // Default to create view
  },

  // Bind event listeners
  bindEvents() {
    // Order creation form
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
      orderForm.addEventListener('submit', async (e) => await this.handleCreateOrder(e));
    }
    
    const addLineItemButton = document.getElementById('add-line-item');
    if (addLineItemButton) {
      addLineItemButton.addEventListener('click', this.addLineItem.bind(this));
    }
    
    // Add event listeners for the first line item
    this.addLineItemListeners(0);
    
    // Update order driver selection
    const orderDriverSelect = document.getElementById('order-driver');
    if (orderDriverSelect) {
      orderDriverSelect.addEventListener('change', async () => {
        await this.updateLineItemProductOptions();
        await this.validateAllLineItems();
      });
    }

    // View switching buttons
    const createOrderBtn = document.getElementById('show-create-order');
    const manageOrdersBtn = document.getElementById('show-manage-orders');
    const payDriverBtn = document.getElementById('show-pay-driver');

    if (createOrderBtn) {
      createOrderBtn.addEventListener('click', this.showCreateOrderView.bind(this));
    }

    if (manageOrdersBtn) {
      manageOrdersBtn.addEventListener('click', async () => {
        await this.showManageOrdersView();
      });
    }

    if (payDriverBtn) {
      payDriverBtn.addEventListener('click', this.showPayDriverView.bind(this));
    }

    // Order status filter
    const statusFilter = document.getElementById('order-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        this.setupOrdersListener();
      });
    }

    // Payment form
    const paymentForm = document.getElementById('pay-driver-form');
    if (paymentForm) {
      paymentForm.addEventListener('submit', async (e) => await this.handleCreatePayment(e));
    }

  },

  // Show create order view
  showCreateOrderView() {
    this.currentView = 'create';
    const createSection = document.getElementById('create-order-section');
    const manageSection = document.getElementById('manage-orders-section');
    const payDriverSection = document.getElementById('pay-driver-section');
    const createBtn = document.getElementById('show-create-order');
    const manageBtn = document.getElementById('show-manage-orders');
    const payDriverBtn = document.getElementById('show-pay-driver');

    if (createSection) createSection.style.display = 'block';
    if (manageSection) manageSection.style.display = 'none';
    if (payDriverSection) payDriverSection.style.display = 'none';
    if (createBtn) createBtn.classList.add('active');
    if (manageBtn) manageBtn.classList.remove('active');
    if (payDriverBtn) payDriverBtn.classList.remove('active');

    // Clean up all listeners when not in manage view
    if (this.ordersListenerUnsubscribe) {
      this.ordersListenerUnsubscribe();
      this.ordersListenerUnsubscribe = null;
    }
    if (this.driversListenerUnsubscribe) {
      // driversListenerUnsubscribe is a listenerId string, use DB.cleanupListener
      if (typeof DB !== 'undefined') {
        DB.cleanupListener(this.driversListenerUnsubscribe);
      }
      this.driversListenerUnsubscribe = null;
    }
    if (this.usersListenerUnsubscribe) {
      // usersListenerUnsubscribe is a listenerId string, use DB.cleanupListener
      if (typeof DB !== 'undefined') {
        DB.cleanupListener(this.usersListenerUnsubscribe);
      }
      this.usersListenerUnsubscribe = null;
    }
  },

  // Show manage orders view
  showManageOrdersView() {
    this.currentView = 'manage';
    const createSection = document.getElementById('create-order-section');
    const manageSection = document.getElementById('manage-orders-section');
    const payDriverSection = document.getElementById('pay-driver-section');
    const createBtn = document.getElementById('show-create-order');
    const manageBtn = document.getElementById('show-manage-orders');
    const payDriverBtn = document.getElementById('show-pay-driver');

    if (createSection) createSection.style.display = 'none';
    if (manageSection) manageSection.style.display = 'block';
    if (payDriverSection) payDriverSection.style.display = 'none';
    if (createBtn) createBtn.classList.remove('active');
    if (manageBtn) manageBtn.classList.add('active');
    if (payDriverBtn) payDriverBtn.classList.remove('active');

    // Show loading state while orders load
    this.showLoading('Loading orders...');

    // Setup real-time listener only when showing manage view
    this.setupOrdersListener();
  },

  // Show pay driver view
  showPayDriverView() {
    this.currentView = 'payment';
    const createSection = document.getElementById('create-order-section');
    const manageSection = document.getElementById('manage-orders-section');
    const payDriverSection = document.getElementById('pay-driver-section');
    const createBtn = document.getElementById('show-create-order');
    const manageBtn = document.getElementById('show-manage-orders');
    const payDriverBtn = document.getElementById('show-pay-driver');

    if (createSection) createSection.style.display = 'none';
    if (manageSection) manageSection.style.display = 'none';
    if (payDriverSection) payDriverSection.style.display = 'block';
    if (createBtn) createBtn.classList.remove('active');
    if (manageBtn) manageBtn.classList.remove('active');
    if (payDriverBtn) payDriverBtn.classList.add('active');

    // Set default payment date to today
    const paymentDateInput = document.getElementById('payment-date');
    if (paymentDateInput) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      paymentDateInput.value = `${year}-${month}-${day}`;
    }

    // Load recent payment history
    this.loadPaymentHistory();

    // Clean up orders listeners when not in manage view
    if (this.ordersListenerUnsubscribe) {
      this.ordersListenerUnsubscribe();
      this.ordersListenerUnsubscribe = null;
    }
    if (this.driversListenerUnsubscribe) {
      if (typeof DB !== 'undefined') {
        DB.cleanupListener(this.driversListenerUnsubscribe);
      }
      this.driversListenerUnsubscribe = null;
    }
    if (this.usersListenerUnsubscribe) {
      if (typeof DB !== 'undefined') {
        DB.cleanupListener(this.usersListenerUnsubscribe);
      }
      this.usersListenerUnsubscribe = null;
    }
  },

  // Handle creating a direct payment
  async handleCreatePayment(event) {
    event.preventDefault();

    // Prevent duplicate submissions
    const submitButton = event.target.querySelector('button[type="submit"]');
    if (submitButton && submitButton.disabled) {
      return; // Already submitting
    }

    const driverSelect = document.getElementById('payment-driver');
    const amountInput = document.getElementById('payment-amount');
    const reasonInput = document.getElementById('payment-reason');
    const dateInput = document.getElementById('payment-date');

    const driverId = driverSelect.value;
    const amount = parseFloat(amountInput.value);
    const reason = reasonInput.value.trim();
    const date = dateInput.value;

    // Determine payment type based on amount (for database storage)
    const paymentType = amount >= 0 ? 'Payment' : 'Deduction';

    // Validation
    if (!driverId) {
      alert('Please select a driver');
      return;
    }

    if (isNaN(amount) || amount === 0) {
      alert('Please enter a valid non-zero amount');
      return;
    }

    if (!reason || reason.length < 5) {
      alert('Please enter a reason (minimum 5 characters)');
      return;
    }

    if (!date) {
      alert('Please select a payment date');
      return;
    }

    // Check if date is in the future
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate > today) {
      alert('Payment date cannot be in the future');
      return;
    }

    // Disable submit button
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Recording Payment...';
    }

    try {
      const paymentData = {
        driverId,
        amount,
        paymentType,
        reason,
        date
      };

      await DB.createDirectPayment(paymentData);

      // Get driver name for notification
      const driver = await DB.getDriverById(driverId);
      const driverName = driver ? driver.name : 'Unknown Driver';
      const amountStr = amount >= 0 ? `+$${amount.toFixed(2)}` : `-$${Math.abs(amount).toFixed(2)}`;

      this.showNotification(`Payment recorded: ${amountStr} ${paymentType} for ${driverName}`);

      // Reset form
      event.target.reset();

      // Set default date to today again
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      dateInput.value = `${year}-${month}-${day}`;

      // Reload payment history
      this.loadPaymentHistory();

    } catch (error) {
      console.error('Error creating payment:', error);
      alert(`Failed to create payment: ${error.message}`);
    } finally {
      // Re-enable submit button
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Record Payment';
      }
    }
  },

  // Load payment history
  async loadPaymentHistory() {
    const historyList = document.getElementById('payment-history-list');
    if (!historyList) return;

    historyList.innerHTML = '<li class="loading">Loading payment history...</li>';

    try {
      const payments = await DB.getAllDirectPayments();

      if (payments.length === 0) {
        historyList.innerHTML = '<li class="no-data">No payment history yet</li>';
        return;
      }

      // Show only recent 10 payments
      const recentPayments = payments.slice(0, 10);

      historyList.innerHTML = '';

      recentPayments.forEach(payment => {
        const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
        const formattedDate = `${paymentDate.toLocaleDateString()} ${paymentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const amountClass = payment.amount >= 0 ? 'positive' : 'negative';
        const amountStr = payment.amount >= 0 ? `+$${payment.amount.toFixed(2)}` : `-$${Math.abs(payment.amount).toFixed(2)}`;

        // Get driver name from cache
        const driver = this.driversCache.get(payment.driverId);
        const driverName = driver ? driver.name : 'Unknown Driver';

        const li = document.createElement('li');
        li.className = `payment-item ${amountClass}`;
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '1rem';
        li.style.borderBottom = '1px solid #eee';

        const paymentInfo = document.createElement('div');
        paymentInfo.style.flex = '1';
        paymentInfo.innerHTML = `
          <div class="payment-header" style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <strong>${driverName}</strong>
            <span class="payment-amount ${amountClass}" style="color: ${payment.amount >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${amountStr}</span>
          </div>
          <div class="payment-details" style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
            <span class="payment-date">${formattedDate}</span>
          </div>
          <div class="payment-reason" style="font-size: 0.9rem; color: #666;">${payment.reason}</div>
        `;

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'danger-button';
        deleteButton.style.padding = '0.5rem 1rem';
        deleteButton.style.fontSize = '0.9rem';
        deleteButton.addEventListener('click', () => this.deletePayment(payment.id));

        li.appendChild(paymentInfo);
        li.appendChild(deleteButton);
        historyList.appendChild(li);
      });

    } catch (error) {
      console.error('Error loading payment history:', error);
      historyList.innerHTML = '<li class="error">Error loading payment history</li>';
    }
  },

  // Delete a direct payment
  async deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment?')) {
      return;
    }

    try {
      await DB.deleteDirectPayment(paymentId);
      this.showNotification('Payment deleted successfully');
      await this.loadPaymentHistory();
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert(`Failed to delete payment: ${error.message}`);
    }
  },

  // Handle creating a new order
  async handleCreateOrder(event) {
    event.preventDefault();

    // Prevent duplicate submissions
    const submitButton = event.target.querySelector('button[type="submit"]');
    if (submitButton && submitButton.disabled) {
      return; // Already submitting
    }

    const orderDriverSelect = document.getElementById('order-driver');
    const customerAddressInput = document.getElementById('customer-address');
    const customerDescInput = document.getElementById('customer-description');
    const orderRemarkInput = document.getElementById('order-remark');
    const driverSalaryInput = document.getElementById('driver-salary');
    const totalAmountInput = document.getElementById('total-amount');

    const driverId = orderDriverSelect.value;
    const customerAddress = customerAddressInput.value.trim();
    const customerDescription = customerDescInput.value.trim();
    const orderRemark = orderRemarkInput.value.trim();
    const driverSalary = parseFloat(driverSalaryInput.value);
    const totalAmount = parseFloat(totalAmountInput.value);

    if (!driverId || !customerAddress) {
      alert('Please select a driver and enter a customer address.');
      return;
    }

    if (isNaN(driverSalary) || driverSalary < 0) {
      alert('Driver salary must be a valid positive number.');
      return;
    }

    if (isNaN(totalAmount) || totalAmount < 0) {
      alert('Total amount is invalid.');
      return;
    }

    // Disable submit button to prevent duplicates
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Creating Order...';
    }

    // Collect line items
    const lineItems = [];
    const lineItemElements = document.querySelectorAll('.line-item');

    let valid = true;
    for (const element of lineItemElements) {
      const index = element.dataset.index;
      const productSelect = document.getElementById(`line-item-product-${index}`);
      const categorySelect = document.getElementById(`line-item-category-${index}`);
      const customQuantityInput = document.getElementById(`line-item-custom-quantity-${index}`);
      const giftCheckbox = document.getElementById(`line-item-gift-${index}`);

      const productId = productSelect.value;
      const category = categorySelect.value;
      const customQuantity = customQuantityInput ? parseInt(customQuantityInput.value) : 0;
      const isFreeGift = giftCheckbox.checked;

      if (!productId || !category) {
        valid = false;
        break;
      }

      // Validate custom quantity for "Quantity by pcs"
      if (category === 'Quantity by pcs' && (isNaN(customQuantity) || customQuantity <= 0)) {
        valid = false;
        break;
      }

      const product = await DB.getProductById(productId);
      if (!product) {
        valid = false;
        break;
      }
      
      // Final inventory validation check
      if (!(await this.validateInventoryAvailability(driverId, productId, category, customQuantity))) {
        const driverInventory = await DB.getDriverInventory(driverId);
        const productInventory = driverInventory.find(item => item.id === productId);
        const required = this.getDeductionAmount(category, customQuantity);

        if (productInventory) {
          this.showInventoryError(productInventory.name, productInventory.remaining, category, required);
        }
        valid = false;

        // Re-enable submit button on validation error
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Create Order';
        }
        return;
      }
      
      // Calculate actual deduction amount
      const actualQuantity = this.getDeductionAmount(category, customQuantity);
      
      lineItems.push({
        productId,
        productName: product.name,
        category,
        actualQuantity,
        isFreeGift
      });
    }
    
    if (!valid || lineItems.length === 0) {
      alert('Please check your line items. Each item must have a valid product and quantity type.');

      // Re-enable submit button on validation error
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Create Order';
      }
      return;
    }
    
    // Create order data object
    const orderData = {
      driverId,
      customerAddress,
      customerDescription,
      remark: orderRemark,
      driverSalary,
      totalAmount,
      lineItems
    };
    
    try {
      // Create the order
      const newOrder = await DB.createOrder(orderData);

      // Reset form
      await this.resetOrderForm();

      // Refresh all UI elements in parallel (independent operations)
      await Promise.all([
        this.updateDriverDropdown(),
        this.updateLineItemProductOptions(),
        typeof DashboardModule !== 'undefined' ? DashboardModule.updateDashboard() : Promise.resolve()
      ]);

      // Show notification
      const driver = await DB.getDriverById(driverId);
      this.showNotification(`Order created for ${driver.name} - $${totalAmount.toFixed(2)} (Status: Pending)`);

      // Re-enable submit button after successful submission
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Create Order';
      }

      // Real-time listener will automatically show the new order
      // No need to manually switch views

    } catch (error) {
      alert(`Failed to create order: ${error.message}`);

      // Re-enable submit button on error
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Create Order';
      }
    }
  },

  // Reset the order form
  async resetOrderForm() {
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
      orderForm.reset();
    }

    // Reset line items to just one
    const lineItemsContainer = document.getElementById('line-items-container');
    if (lineItemsContainer) {
      lineItemsContainer.innerHTML = '';
      this.lineItemCounter = 0;
      await this.addLineItem();
    }
  },

  // Add a new line item (same as sales module)
  async addLineItem() {
    const lineItemsContainer = document.getElementById('line-items-container');
    const index = this.lineItemCounter++;
    
    const lineItemDiv = document.createElement('div');
    lineItemDiv.className = 'line-item';
    lineItemDiv.dataset.index = index;
    
    // Get the driver ID to filter products
    const orderDriverSelect = document.getElementById('order-driver');
    const driverId = orderDriverSelect ? orderDriverSelect.value : '';
    
    // Create HTML for the new line item
    lineItemDiv.innerHTML = `
      <div class="form-group">
        <label for="line-item-product-${index}">Product</label>
        <select class="line-item-product" id="line-item-product-${index}" required>
          <option value="">-- Select Product --</option>
          ${await this.getDriverProductOptions(driverId)}
        </select>
      </div>
      <div class="form-group">
        <label for="line-item-category-${index}">Quantity Type</label>
        <select class="line-item-category" id="line-item-category-${index}" required>
          <option value="">-- Select Type --</option>
          <option value="Q">Q</option>
          <option value="H">H</option>
          <option value="Oz">Oz</option>
          <option value="Quantity by pcs">Quantity by pcs</option>
        </select>
      </div>
      <div class="form-group" id="custom-quantity-group-${index}" style="display: none;">
        <label for="line-item-custom-quantity-${index}">Custom Quantity</label>
        <input type="number" class="line-item-custom-quantity" id="line-item-custom-quantity-${index}" min="1">
      </div>
      <div class="form-group checkbox">
        <label for="line-item-gift-${index}">
          <input type="checkbox" class="line-item-gift" id="line-item-gift-${index}">
          Free Gift
        </label>
      </div>
      <button type="button" class="remove-line-item danger-button">Remove</button>
    `;
    
    lineItemsContainer.appendChild(lineItemDiv);
    
    // Show remove buttons if there is more than one line item
    this.updateRemoveButtons();
    
    // Add event listeners for the new line item
    this.addLineItemListeners(index);
  },
  
  // Update the visibility of remove buttons
  updateRemoveButtons() {
    const removeButtons = document.querySelectorAll('.remove-line-item');
    const lineItems = document.querySelectorAll('.line-item');
    
    if (lineItems.length > 1) {
      removeButtons.forEach(button => {
        button.style.display = '';
      });
    } else {
      removeButtons.forEach(button => {
        button.style.display = 'none';
      });
    }
  },
  
  // Add event listeners for line items (same as sales module)
  addLineItemListeners(index) {
    const lineItemDiv = document.querySelector(`.line-item[data-index="${index}"]`);
    if (!lineItemDiv) return;
    
    const removeButton = lineItemDiv.querySelector('.remove-line-item');
    if (removeButton) {
      removeButton.addEventListener('click', () => this.removeLineItem(index));
    }
    
    // Get references to form elements
    const productSelect = document.getElementById(`line-item-product-${index}`);
    const categorySelect = document.getElementById(`line-item-category-${index}`);
    const customQuantityGroup = document.getElementById(`custom-quantity-group-${index}`);
    const customQuantityInput = document.getElementById(`line-item-custom-quantity-${index}`);
    
    // Validation helper for this line item
    const validateCurrentSelection = async () => {
      const orderDriverSelect = document.getElementById('order-driver');
      const driverId = orderDriverSelect ? orderDriverSelect.value : '';
      const productId = productSelect ? productSelect.value : '';
      const category = categorySelect ? categorySelect.value : '';
      const customQuantity = customQuantityInput ? customQuantityInput.value : 0;

      if (!driverId || !productId || !category) return true; // Skip validation if incomplete

      const isValid = await this.validateInventoryAvailability(driverId, productId, category, customQuantity);

      if (!isValid) {
        const driverInventory = await DB.getDriverInventory(driverId);
        const productInventory = driverInventory.find(item => item.id === productId);
        const required = this.getDeductionAmount(category, customQuantity);

        if (productInventory) {
          this.showInventoryError(productInventory.name, productInventory.remaining, category, required);
        }
        return false;
      }
      return true;
    };
    
    // Listen for product changes
    if (productSelect) {
      productSelect.addEventListener('change', async () => {
        if (categorySelect && categorySelect.value) {
          if (!(await validateCurrentSelection())) {
            // Reset category if validation fails
            categorySelect.value = '';
            if (customQuantityGroup) {
              customQuantityGroup.style.display = 'none';
            }
            if (customQuantityInput) {
              customQuantityInput.required = false;
              customQuantityInput.value = '';
            }
          }
        }
      });
    }
    
    // Listen for category changes to show/hide custom quantity input and validate
    if (categorySelect && customQuantityGroup) {
      categorySelect.addEventListener('change', async () => {
        if (categorySelect.value === 'Quantity by pcs') {
          customQuantityGroup.style.display = 'block';
          if (customQuantityInput) {
            customQuantityInput.required = true;
          }
        } else {
          customQuantityGroup.style.display = 'none';
          if (customQuantityInput) {
            customQuantityInput.required = false;
            customQuantityInput.value = '';
          }

          // Validate non-custom categories
          if (categorySelect.value && !(await validateCurrentSelection())) {
            categorySelect.value = '';
          }
        }
      });
    }
    
    // Listen for custom quantity changes
    if (customQuantityInput) {
      customQuantityInput.addEventListener('change', async () => {
        if (!(await validateCurrentSelection())) {
          customQuantityInput.value = '';
        }
      });
    }
  },
  
  // Remove a line item
  removeLineItem(index) {
    const lineItemDiv = document.querySelector(`.line-item[data-index="${index}"]`);
    if (!lineItemDiv) return;
    
    lineItemDiv.remove();
    
    // Update the visibility of remove buttons
    this.updateRemoveButtons();
  },

  // Setup real-time orders listener
  setupOrdersListener() {
    const session = DB.getCurrentSession();
    if (!session) return;

    // Clean up existing listener first
    if (this.ordersListenerUnsubscribe) {
      this.ordersListenerUnsubscribe();
      this.ordersListenerUnsubscribe = null;
    }

    const statusFilter = document.getElementById('order-status-filter');
    const selectedStatus = statusFilter ? statusFilter.value : '';

    // Determine filters based on user role
    const filters = {};

    if (session.role === DB.ROLES.SALES_REP) {
      // Sales reps see only their own orders
      filters.salesRepId = session.userId;
    }
    // Admins see all orders (no additional filters)

    if (selectedStatus) {
      filters.status = selectedStatus;
    }

    // Setup real-time listener and store unsubscribe function
    this.ordersListenerUnsubscribe = DB.listenToOrders(async (orders) => {
      await this.displayOrders(orders);
    }, filters);

    // Also listen to drivers and users to keep cache updated
    if (!this.driversListenerUnsubscribe) {
      this.driversListenerUnsubscribe = DB.listenToDrivers((drivers) => {
        drivers.forEach(driver => this.refreshDriverCache(driver));
      });
    }

    if (!this.usersListenerUnsubscribe) {
      this.usersListenerUnsubscribe = DB.listenToUsers((users) => {
        users.forEach(user => this.refreshUserCache(user));
      });
    }
  },

  // Show loading indicator
  showLoading(message = 'Loading orders...') {
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;

    ordersList.innerHTML = `
      <li>
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <p>${message}</p>
        </div>
      </li>
    `;
  },

  // Display orders (used by real-time listener)
  async displayOrders(orders) {
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;

    const session = DB.getCurrentSession();
    if (!session) return;

    // Filter out orders created before today (hide yesterday's orders)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const todaysOrders = orders.filter(order => {
      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      const orderDateNormalized = new Date(orderDate);
      orderDateNormalized.setHours(0, 0, 0, 0); // Normalize to start of day
      return orderDateNormalized >= today; // Only show today's orders
    });

    if (todaysOrders.length === 0) {
      ordersList.innerHTML = '<li class="empty-list">No orders found for today.</li>';
      return;
    }

    // Sort by creation date, newest first (Firebase timestamp handling)
    todaysOrders.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateB - dateA;
    });

    // Pre-fetch all unique driver and user IDs in parallel batches
    const driverIds = [...new Set(todaysOrders.map(o => o.driverId))];
    const userIds = [...new Set(todaysOrders.map(o => o.salesRepId).filter(id => id))];

    // Batch fetch any missing drivers/users not in cache
    const missingDrivers = driverIds.filter(id => !this.driversCache.has(id));
    const missingUsers = userIds.filter(id => !this.usersCache.has(id));

    if (missingDrivers.length > 0 || missingUsers.length > 0) {
      await Promise.all([
        ...missingDrivers.map(id => this.getCachedDriver(id)),
        ...missingUsers.map(id => this.getCachedUser(id))
      ]);
    }

    // Build all DOM elements BEFORE manipulating the actual DOM to prevent race conditions
    const orderElements = [];

    for (const order of todaysOrders) {
      // Use cached data (synchronous now!)
      const driver = this.driversCache.get(order.driverId);
      const salesRep = this.usersCache.get(order.salesRepId);
      if (!driver) continue;

      const li = document.createElement('li');
      li.className = `order-item status-${order.status}`;

      const date = this.parseFirebaseDate(order.createdAt);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

      let lineItemsHtml = '';
      order.lineItems.forEach(item => {
        const giftBadge = item.isFreeGift ? '<span class="badge">Free Gift</span>' : '';

        // Determine what to display for quantity
        let displayQuantity;
        if (item.category) {
          displayQuantity = item.category === 'Quantity by pcs' ? item.actualQuantity : item.category;
        } else {
          displayQuantity = item.quantity || item.actualQuantity;
        }

        const displayText = `${item.productName} x ${displayQuantity}`;
        lineItemsHtml += `
          <div class="order-line-item">
            ${displayText} ${giftBadge}
          </div>
        `;
      });

      // Status badge
      const statusBadge = `<span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span>`;

      // Action buttons based on status
      let actionButtons = '';
      if (order.status === DB.ORDER_STATUS.PENDING) {
        actionButtons = `
          <div class="order-actions">
            <button class="complete-order-btn primary-button" data-order-id="${order.id}">Complete</button>
            <button class="cancel-order-btn danger-button" data-order-id="${order.id}">Cancel</button>
            <button class="copy-order-btn secondary-button" data-order-id="${order.id}">
              <i class="fas fa-copy"></i> Copy Details
            </button>
            <button class="delete-order-btn danger-button" data-order-id="${order.id}">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        `;
      } else {
        // For completed/cancelled orders, show copy and delete buttons
        actionButtons = `
          <div class="order-actions">
            <button class="copy-order-btn secondary-button" data-order-id="${order.id}">
              <i class="fas fa-copy"></i> Copy Details
            </button>
            <button class="delete-order-btn danger-button" data-order-id="${order.id}">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        `;
      }

      // Generate Order ID (same format as copy details)
      const orderId = `#${order.id.slice(-6).toUpperCase()}`;

      li.innerHTML = `
        <div class="order-details">
          <div class="order-header">
            <strong>Order ${orderId}</strong> • <strong>$${order.totalAmount.toFixed(2)}</strong> - ${driver.name} ${statusBadge}
            ${session.role === DB.ROLES.ADMIN && salesRep ? `<br><small>Sales Rep: ${salesRep.name}</small>` : ''}
          </div>
          <div class="order-info">
            <span>${order.customerAddress}</span>${order.deliveryMethod ? ` • <span class="delivery-method">${order.deliveryMethod}</span>` : ''}
            ${order.customerDescription ? `<br><small><strong>Description:</strong> ${order.customerDescription}</small>` : ''}
            ${order.remark ? `<br><small><strong>Remark:</strong> ${order.remark}</small>` : ''}
            <br><small>Created: ${formattedDate}</small>
            ${order.completedAt ? `<br><small>Completed: ${this.parseFirebaseDate(order.completedAt).toLocaleDateString()} ${this.parseFirebaseDate(order.completedAt).toLocaleTimeString()}</small>` : ''}
          </div>
          <div class="order-line-items">
            ${lineItemsHtml}
          </div>
          ${actionButtons}
        </div>
      `;

      orderElements.push(li);
    }

    // ATOMIC DOM UPDATE: Clear and rebuild in one operation
    ordersList.innerHTML = '';
    orderElements.forEach(li => ordersList.appendChild(li));

    // Add event listeners for action buttons
    this.bindOrderActionListeners();
  },

  // Bind event listeners for order actions
  bindOrderActionListeners() {
    const completeButtons = document.querySelectorAll('.complete-order-btn');
    const cancelButtons = document.querySelectorAll('.cancel-order-btn');
    const copyButtons = document.querySelectorAll('.copy-order-btn');
    const deleteButtons = document.querySelectorAll('.delete-order-btn');

    completeButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        const orderId = e.target.dataset.orderId;
        await this.completeOrder(orderId);
      });
    });

    cancelButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        const orderId = e.target.dataset.orderId;
        await this.cancelOrder(orderId);
      });
    });

    copyButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        const orderId = e.target.dataset.orderId;
        const order = await DB.getOrderById(orderId);
        if (order) {
          // Use cached driver data for instant access
          const driver = await this.getCachedDriver(order.driverId);
          if (driver) {
            this.copyOrderDetails(order, driver);
          } else {
            this.showNotification('Driver information not found');
          }
        } else {
          this.showNotification('Order not found');
        }
      });
    });

    deleteButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        const orderId = e.target.dataset.orderId;
        await this.deleteOrder(orderId);
      });
    });
  },

  // Complete an order
  async completeOrder(orderId) {
    if (!confirm('Are you sure you want to mark this order as completed?')) {
      return;
    }

    try {
      await DB.completeOrder(orderId);
      this.showNotification('Order marked as completed');

      // Real-time listeners will automatically update dashboard
    } catch (error) {
      alert(`Failed to complete order: ${error.message}`);
    }
  },

  // Cancel an order
  async cancelOrder(orderId) {
    if (!confirm('Are you sure you want to cancel this order? This will restore the inventory.')) {
      return;
    }
    
    // Ask whether to pay the driver
    const payDriver = confirm('Pay the driver $30 for this cancelled order?\n\nClick "OK" to pay the driver $30\nClick "Cancel" to not pay the driver');
    
    try {
      await DB.cancelOrder(orderId, payDriver);
      const paymentMessage = payDriver ? 'Order cancelled, inventory restored, and driver will be paid $30' : 'Order cancelled, inventory restored, and driver will not be paid';
      this.showNotification(paymentMessage);

      // Real-time listeners will automatically update dashboard
    } catch (error) {
      alert(`Failed to cancel order: ${error.message}`);
    }
  },
  
  // Update driver dropdown
  async updateDriverDropdown() {
    if (typeof DriversModule !== 'undefined') {
      await DriversModule.updateDriverDropdowns();
    }
  },
  
  // Get product options filtered by driver's inventory
  async getDriverProductOptions(driverId) {
    if (!driverId) {
      return '';
    }

    const driverInventory = await DB.getDriverInventory(driverId);
    let options = '';
    
    driverInventory
      .filter(item => item.remaining > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(item => {
        options += `<option value="${item.id}">${item.name} (${item.remaining} available)</option>`;
      });
    
    return options;
  },
  
  // Update line item product options based on selected driver
  async updateLineItemProductOptions() {
    const orderDriverSelect = document.getElementById('order-driver');
    if (!orderDriverSelect) return;

    const driverId = orderDriverSelect.value;
    const productOptions = await this.getDriverProductOptions(driverId);
    
    const lineItemProducts = document.querySelectorAll('.line-item-product');
    lineItemProducts.forEach(select => {
      select.innerHTML = '<option value="">-- Select Product --</option>' + productOptions;
    });
  },
  
  // Show notification
  showNotification(message) {
    if (typeof AppModule !== 'undefined') {
      AppModule.showNotification(message);
    } else {
      alert(message);
    }
  },

  // Delete an order
  async deleteOrder(orderId) {
    // Get order details first for confirmation message
    const order = await DB.getOrderById(orderId);
    if (!order) {
      alert('Order not found');
      return;
    }

    // Get driver for display
    const driver = await this.getCachedDriver(order.driverId);
    const driverName = driver ? driver.name : 'Unknown Driver';
    const orderNumber = `#${order.id.slice(-6).toUpperCase()}`;

    // Confirmation with strong warning
    const confirmMessage = `⚠️ WARNING: DELETE ORDER ${orderNumber}\n\n` +
      `This will permanently delete this order and:\n` +
      `• Restore driver inventory (${order.lineItems.length} product(s))\n` +
      `• Remove from ${driverName}'s earnings\n` +
      `• Remove from all reports\n` +
      `• Cannot be undone!\n\n` +
      `Type "DELETE" to confirm:`;

    const userInput = prompt(confirmMessage);

    if (userInput !== 'DELETE') {
      if (userInput !== null) {
        alert('Deletion cancelled. You must type "DELETE" to confirm.');
      }
      return;
    }

    // Final confirmation
    const finalConfirm = confirm(`Are you absolutely sure you want to delete order ${orderNumber}?\n\nThis action CANNOT be undone!`);
    if (!finalConfirm) {
      alert('Deletion cancelled.');
      return;
    }

    try {
      // Delete the order
      await DB.deleteOrder(orderId);

      // Refresh orders list - orders are auto-refreshed via real-time listener
      // No need to call loadOrders() - the listener will update automatically

      // Update dashboard if available
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }

      // Show success notification
      this.showNotification(`Order ${orderNumber} deleted successfully. Driver inventory and earnings automatically restored.`);

    } catch (error) {
      console.error('Error deleting order:', error);
      alert(`Failed to delete order: ${error.message}`);
    }
  },

  // Copy order details to clipboard (driver data already fetched)
  copyOrderDetails(order, driver) {
    if (!order || !driver) {
      this.showNotification('Order or driver data not found');
      return;
    }

    try {
      // Format order details
      const orderText = this.formatOrderDetails(order, driver);

      // Try clipboard methods
      let copySuccess = false;

      // Try execCommand first
      try {
        copySuccess = this.fallbackCopyToClipboard(orderText);
      } catch (err) {
        console.log('execCommand failed:', err);
      }

      // Try Clipboard API if execCommand failed
      if (!copySuccess && navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(orderText)
          .then(() => {
            this.showNotification('Order details copied to clipboard! 📋');
            copySuccess = true;
          })
          .catch(() => {
            // Both methods failed, show manual copy dialog
            this.showManualCopyDialog(orderText);
          });
      } else if (copySuccess) {
        this.showNotification('Order details copied to clipboard! 📋');
      } else {
        // execCommand failed and no Clipboard API, show manual copy
        this.showManualCopyDialog(orderText);
      }
    } catch (error) {
      console.error('Failed to copy order details:', error);
      const orderText = this.formatOrderDetails(order, driver);
      this.showManualCopyDialog(orderText);
    }
  },

  // Show manual copy dialog
  showManualCopyDialog(text) {
    alert('Please copy the order details below:\n\n' + text);
  },

  // Format order details as text
  formatOrderDetails(order, driver) {
    const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
    const formattedDate = `${createdDate.toLocaleDateString()} ${createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    
    // Format line items
    let itemsText = '';
    order.lineItems.forEach(item => {
      const giftNote = item.isFreeGift ? ' (Free Gift)' : '';
      let displayQuantity;
      
      if (item.category) {
        displayQuantity = item.category === 'Quantity by pcs' ? `${item.actualQuantity} pcs` : item.category;
      } else {
        displayQuantity = item.quantity || item.actualQuantity;
      }
      
      itemsText += `• ${item.productName} x ${displayQuantity}${giftNote}\n`;
    });

    // Build formatted text
    const orderText = `🚚 ORDER DETAILS
Address: ${order.customerAddress}${order.customerDescription ? `\nDescription: ${order.customerDescription}` : ''}${order.remark ? `\nRemark: ${order.remark}` : ''}
---
Items:
${itemsText}---
Total: $${order.totalAmount.toFixed(2)}
Order #${order.id.slice(-6).toUpperCase()}`;

    return orderText;
  },

  // Fallback copy method using execCommand
  fallbackCopyToClipboard(text) {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();

    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
      success = false;
    } finally {
      document.body.removeChild(textArea);
    }

    return success;
  },

};

// Export the module and make it globally available
export default OrdersModule;
window.OrdersModule = OrdersModule;