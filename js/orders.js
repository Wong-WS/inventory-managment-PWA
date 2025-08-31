/**
 * Order management module
 * Handles creating, managing, and tracking orders with status workflow
 */

const OrdersModule = {
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
  validateInventoryAvailability(driverId, productId, category, customQuantity = 0) {
    if (!driverId || !productId || !category) return false;
    
    const driverInventory = DB.getDriverInventory(driverId);
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
  validateAllLineItems() {
    const lineItemElements = document.querySelectorAll('.line-item');
    const orderDriverSelect = document.getElementById('order-driver');
    const driverId = orderDriverSelect ? orderDriverSelect.value : '';
    
    if (!driverId) return;
    
    lineItemElements.forEach((element) => {
      const index = element.dataset.index;
      const productSelect = document.getElementById(`line-item-product-${index}`);
      const categorySelect = document.getElementById(`line-item-category-${index}`);
      const customQuantityInput = document.getElementById(`line-item-custom-quantity-${index}`);
      
      if (productSelect && categorySelect && productSelect.value && categorySelect.value) {
        const customQuantity = customQuantityInput ? customQuantityInput.value : 0;
        const isValid = this.validateInventoryAvailability(driverId, productSelect.value, categorySelect.value, customQuantity);
        
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
          const driverInventory = DB.getDriverInventory(driverId);
          const productInventory = driverInventory.find(item => item.id === productSelect.value);
          if (productInventory) {
            const required = this.getDeductionAmount(categorySelect.value, customQuantity);
            this.showInventoryError(productInventory.name, productInventory.remaining, categorySelect.value, required);
          }
        }
      }
    });
  },

  // Initialize the orders module
  init() {
    this.lineItemCounter = 0;
    this.currentView = 'create'; // 'create' or 'manage'
    this.bindEvents();
    this.loadOrders();
    this.updateDriverDropdown();
    this.updateLineItemProductOptions();
    this.showCreateOrderView(); // Default to create view
  },

  // Bind event listeners
  bindEvents() {
    // Order creation form
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
      orderForm.addEventListener('submit', this.handleCreateOrder.bind(this));
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
      orderDriverSelect.addEventListener('change', () => {
        this.updateLineItemProductOptions();
        this.validateAllLineItems();
      });
    }

    // View switching buttons
    const createOrderBtn = document.getElementById('show-create-order');
    const manageOrdersBtn = document.getElementById('show-manage-orders');
    
    if (createOrderBtn) {
      createOrderBtn.addEventListener('click', this.showCreateOrderView.bind(this));
    }
    
    if (manageOrdersBtn) {
      manageOrdersBtn.addEventListener('click', this.showManageOrdersView.bind(this));
    }

    // Order status filter
    const statusFilter = document.getElementById('order-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', this.loadOrders.bind(this));
    }

  },

  // Show create order view
  showCreateOrderView() {
    this.currentView = 'create';
    const createSection = document.getElementById('create-order-section');
    const manageSection = document.getElementById('manage-orders-section');
    const createBtn = document.getElementById('show-create-order');
    const manageBtn = document.getElementById('show-manage-orders');
    
    if (createSection) createSection.style.display = 'block';
    if (manageSection) manageSection.style.display = 'none';
    if (createBtn) createBtn.classList.add('active');
    if (manageBtn) manageBtn.classList.remove('active');
  },

  // Show manage orders view
  showManageOrdersView() {
    this.currentView = 'manage';
    const createSection = document.getElementById('create-order-section');
    const manageSection = document.getElementById('manage-orders-section');
    const createBtn = document.getElementById('show-create-order');
    const manageBtn = document.getElementById('show-manage-orders');
    
    if (createSection) createSection.style.display = 'none';
    if (manageSection) manageSection.style.display = 'block';
    if (createBtn) createBtn.classList.remove('active');
    if (manageBtn) manageBtn.classList.add('active');
    
    this.loadOrders();
  },

  // Handle creating a new order
  handleCreateOrder(event) {
    event.preventDefault();
    
    const orderDriverSelect = document.getElementById('order-driver');
    const customerAddressInput = document.getElementById('customer-address');
    const customerDescInput = document.getElementById('customer-description');
    const totalAmountInput = document.getElementById('total-amount');
    const deliveryMethodInputs = document.querySelectorAll('input[name="delivery-method"]');
    
    const driverId = orderDriverSelect.value;
    const customerAddress = customerAddressInput.value.trim();
    const customerDescription = customerDescInput.value.trim();
    const totalAmount = parseFloat(totalAmountInput.value);
    
    // Get selected delivery method
    let deliveryMethod = '';
    deliveryMethodInputs.forEach(input => {
      if (input.checked) {
        deliveryMethod = input.value;
      }
    });
    
    if (!driverId || !customerAddress) {
      alert('Please select a driver and enter a customer address.');
      return;
    }
    
    if (!deliveryMethod) {
      alert('Please select a delivery method.');
      return;
    }
    
    if (isNaN(totalAmount) || totalAmount < 0) {
      alert('Total amount is invalid.');
      return;
    }
    
    // Collect line items
    const lineItems = [];
    const lineItemElements = document.querySelectorAll('.line-item');
    
    let valid = true;
    lineItemElements.forEach((element) => {
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
        return;
      }
      
      // Validate custom quantity for "Quantity by pcs"
      if (category === 'Quantity by pcs' && (isNaN(customQuantity) || customQuantity <= 0)) {
        valid = false;
        return;
      }
      
      const product = DB.getProductById(productId);
      if (!product) {
        valid = false;
        return;
      }
      
      // Final inventory validation check
      if (!this.validateInventoryAvailability(driverId, productId, category, customQuantity)) {
        const driverInventory = DB.getDriverInventory(driverId);
        const productInventory = driverInventory.find(item => item.id === productId);
        const required = this.getDeductionAmount(category, customQuantity);
        
        if (productInventory) {
          this.showInventoryError(productInventory.name, productInventory.remaining, category, required);
        }
        valid = false;
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
    });
    
    if (!valid || lineItems.length === 0) {
      alert('Please check your line items. Each item must have a valid product and quantity type.');
      return;
    }
    
    // Create order data object
    const orderData = {
      driverId,
      customerAddress,
      customerDescription,
      deliveryMethod,
      totalAmount,
      lineItems
    };
    
    try {
      // Create the order
      const newOrder = DB.createOrder(orderData);
      
      // Reset form
      this.resetOrderForm();
      
      // Update driver dropdown and product options
      this.updateDriverDropdown();
      this.updateLineItemProductOptions();
      
      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        DashboardModule.updateDashboard();
      }
      
      // Show notification
      const driver = DB.getDriverById(driverId);
      this.showNotification(`Order created for ${driver.name} - $${totalAmount.toFixed(2)} (Status: Pending)`);
      
      // Switch to manage view to show the new order
      this.showManageOrdersView();
      
    } catch (error) {
      alert(`Failed to create order: ${error.message}`);
    }
  },

  // Reset the order form
  resetOrderForm() {
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
      orderForm.reset();
      
      // Ensure delivery method radio buttons are cleared
      const deliveryMethodInputs = document.querySelectorAll('input[name="delivery-method"]');
      deliveryMethodInputs.forEach(input => {
        input.checked = false;
      });
    }
    
    // Reset line items to just one
    const lineItemsContainer = document.getElementById('line-items-container');
    if (lineItemsContainer) {
      lineItemsContainer.innerHTML = '';
      this.lineItemCounter = 0;
      this.addLineItem();
    }
  },

  // Add a new line item (same as sales module)
  addLineItem() {
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
          ${this.getDriverProductOptions(driverId)}
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
    const validateCurrentSelection = () => {
      const orderDriverSelect = document.getElementById('order-driver');
      const driverId = orderDriverSelect ? orderDriverSelect.value : '';
      const productId = productSelect ? productSelect.value : '';
      const category = categorySelect ? categorySelect.value : '';
      const customQuantity = customQuantityInput ? customQuantityInput.value : 0;
      
      if (!driverId || !productId || !category) return true; // Skip validation if incomplete
      
      const isValid = this.validateInventoryAvailability(driverId, productId, category, customQuantity);
      
      if (!isValid) {
        const driverInventory = DB.getDriverInventory(driverId);
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
      productSelect.addEventListener('change', () => {
        if (categorySelect && categorySelect.value) {
          if (!validateCurrentSelection()) {
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
      categorySelect.addEventListener('change', () => {
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
          if (categorySelect.value && !validateCurrentSelection()) {
            categorySelect.value = '';
          }
        }
      });
    }
    
    // Listen for custom quantity changes
    if (customQuantityInput) {
      customQuantityInput.addEventListener('change', () => {
        if (!validateCurrentSelection()) {
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

  // Load and display orders
  loadOrders() {
    const ordersList = document.getElementById('orders-list');
    if (!ordersList) return;

    const statusFilter = document.getElementById('order-status-filter');
    const selectedStatus = statusFilter ? statusFilter.value : '';
    
    const session = DB.getCurrentSession();
    if (!session) return;

    // Get orders based on user role
    let orders;
    if (session.role === DB.ROLES.ADMIN) {
      // Admins see all orders
      orders = selectedStatus ? DB.getOrdersByStatus(selectedStatus) : DB.getAllOrders();
    } else {
      // Sales reps see only their own orders
      const userOrders = DB.getOrdersBySalesRep(session.userId);
      orders = selectedStatus ? userOrders.filter(order => order.status === selectedStatus) : userOrders;
    }
    
    ordersList.innerHTML = '';
    
    if (orders.length === 0) {
      ordersList.innerHTML = '<li class="empty-list">No orders found.</li>';
      return;
    }
    
    // Sort by creation date, newest first
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    orders.forEach(order => {
      const driver = DB.getDriverById(order.driverId);
      const salesRep = DB.getUserById(order.salesRepId);
      if (!driver) return;
      
      const li = document.createElement('li');
      li.className = `order-item status-${order.status}`;
      
      const date = new Date(order.createdAt);
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
          </div>
        `;
      } else {
        // For completed/cancelled orders, only show copy button
        actionButtons = `
          <div class="order-actions">
            <button class="copy-order-btn secondary-button" data-order-id="${order.id}">
              <i class="fas fa-copy"></i> Copy Details
            </button>
          </div>
        `;
      }
      
      li.innerHTML = `
        <div class="order-details">
          <div class="order-header">
            <strong>$${order.totalAmount.toFixed(2)}</strong> - ${driver.name} ${statusBadge}
            ${session.role === DB.ROLES.ADMIN && salesRep ? `<br><small>Sales Rep: ${salesRep.name}</small>` : ''}
          </div>
          <div class="order-info">
            <span>${order.customerAddress}</span>${order.deliveryMethod ? ` • <span class="delivery-method">${order.deliveryMethod}</span>` : ''}
            ${order.customerDescription ? `<br><small>${order.customerDescription}</small>` : ''}
            <br><small>Created: ${formattedDate}</small>
            ${order.completedAt ? `<br><small>Completed: ${new Date(order.completedAt).toLocaleDateString()} ${new Date(order.completedAt).toLocaleTimeString()}</small>` : ''}
          </div>
          <div class="order-line-items">
            ${lineItemsHtml}
          </div>
          ${actionButtons}
        </div>
      `;
      
      ordersList.appendChild(li);
    });

    // Add event listeners for action buttons
    this.bindOrderActionListeners();
  },

  // Bind event listeners for order actions
  bindOrderActionListeners() {
    const completeButtons = document.querySelectorAll('.complete-order-btn');
    const cancelButtons = document.querySelectorAll('.cancel-order-btn');
    const copyButtons = document.querySelectorAll('.copy-order-btn');
    
    completeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const orderId = e.target.dataset.orderId;
        this.completeOrder(orderId);
      });
    });
    
    cancelButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const orderId = e.target.dataset.orderId;
        this.cancelOrder(orderId);
      });
    });

    copyButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const orderId = e.target.dataset.orderId;
        const order = DB.getOrderById(orderId);
        if (order) {
          this.copyOrderDetails(order);
        } else {
          this.showNotification('Order not found');
        }
      });
    });
  },

  // Complete an order
  completeOrder(orderId) {
    if (!confirm('Are you sure you want to mark this order as completed?')) {
      return;
    }
    
    try {
      DB.completeOrder(orderId);
      this.loadOrders();
      this.showNotification('Order marked as completed');
      
      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        DashboardModule.updateDashboard();
      }
    } catch (error) {
      alert(`Failed to complete order: ${error.message}`);
    }
  },

  // Cancel an order
  cancelOrder(orderId) {
    if (!confirm('Are you sure you want to cancel this order? This will restore the inventory.')) {
      return;
    }
    
    try {
      DB.cancelOrder(orderId);
      this.loadOrders();
      this.showNotification('Order cancelled and inventory restored');
      
      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        DashboardModule.updateDashboard();
      }
    } catch (error) {
      alert(`Failed to cancel order: ${error.message}`);
    }
  },
  
  // Update driver dropdown
  updateDriverDropdown() {
    if (typeof DriversModule !== 'undefined') {
      DriversModule.updateDriverDropdowns();
    }
  },
  
  // Get product options filtered by driver's inventory
  getDriverProductOptions(driverId) {
    if (!driverId) {
      return '';
    }
    
    const driverInventory = DB.getDriverInventory(driverId);
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
  updateLineItemProductOptions() {
    const orderDriverSelect = document.getElementById('order-driver');
    if (!orderDriverSelect) return;
    
    const driverId = orderDriverSelect.value;
    const productOptions = this.getDriverProductOptions(driverId);
    
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

  // Copy order details to clipboard
  async copyOrderDetails(order) {
    if (!order) {
      this.showNotification('Order data not found');
      return;
    }

    try {
      // Get driver information
      const driver = DB.getDriverById(order.driverId);
      if (!driver) {
        this.showNotification('Driver information not found');
        return;
      }

      // Format order details
      const orderText = this.formatOrderDetails(order, driver);
      
      // Try to use Clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(orderText);
        this.showNotification('Order details copied to clipboard! 📋');
      } else {
        // Fallback for older browsers or non-secure contexts
        this.fallbackCopyToClipboard(orderText);
        this.showNotification('Order details copied to clipboard! 📋');
      }
    } catch (error) {
      console.error('Failed to copy order details:', error);
      this.showNotification('Failed to copy order details. Please try again.');
    }
  },

  // Format order details as text
  formatOrderDetails(order, driver) {
    const date = new Date(order.createdAt);
    const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    
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

    // Determine earnings info for driver
    const isDelivery = order.deliveryMethod === 'Delivery';
    const earningsNote = isDelivery ? ' ($30 earned)' : ' (No earnings - pickup)';

    // Build formatted text
    const orderText = `🚚 ORDER DETAILS
Driver: ${driver.name}${driver.phone ? ` (${driver.phone})` : ''}
Customer: ${order.customerAddress}${order.customerDescription ? `\nDescription: ${order.customerDescription}` : ''}
Delivery: ${order.deliveryMethod}${earningsNote}
---
Items:
${itemsText}---
Total: $${order.totalAmount.toFixed(2)}
Order #${order.id.slice(-6).toUpperCase()}
Status: ${order.status.toUpperCase()}
Created: ${formattedDate}`;

    return orderText;
  },

  // Fallback copy method for older browsers
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
    
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
      throw err;
    } finally {
      document.body.removeChild(textArea);
    }
  },

};