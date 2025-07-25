/**
 * Sales management module
 * Handles recording sales transactions and displaying sales history
 */

const SalesModule = {
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
    const salesDriverSelect = document.getElementById('sales-driver');
    const driverId = salesDriverSelect ? salesDriverSelect.value : '';
    
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

  // Initialize the sales module
  init() {
    this.lineItemCounter = 0;
    this.bindEvents();
    this.loadRecentSales();
    this.updateDriverDropdown();
    this.updateLineItemProductOptions();
  },

  // Bind event listeners
  bindEvents() {
    const salesForm = document.getElementById('sales-form');
    if (salesForm) {
      salesForm.addEventListener('submit', this.handleRecordSale.bind(this));
    }
    
    const addLineItemButton = document.getElementById('add-line-item');
    if (addLineItemButton) {
      addLineItemButton.addEventListener('click', this.addLineItem.bind(this));
    }
    
    // Add event listeners for the first line item
    this.addLineItemListeners(0);
    
    // Update sales driver selection
    const salesDriverSelect = document.getElementById('sales-driver');
    if (salesDriverSelect) {
      salesDriverSelect.addEventListener('change', () => {
        this.updateLineItemProductOptions();
        this.validateAllLineItems();
      });
    }
  },

  // Handle recording a new sale
  handleRecordSale(event) {
    event.preventDefault();
    
    const salesDriverSelect = document.getElementById('sales-driver');
    const customerAddressInput = document.getElementById('customer-address');
    const customerDescInput = document.getElementById('customer-description');
    const totalAmountInput = document.getElementById('total-amount');
    const deliveryMethodInputs = document.querySelectorAll('input[name="delivery-method"]');
    
    const driverId = salesDriverSelect.value;
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
    
    // Create sale data object
    const saleData = {
      driverId,
      customerAddress,
      customerDescription,
      deliveryMethod,
      totalAmount,
      lineItems
    };
    
    // Add the sale
    const newSale = DB.addSale(saleData);
    
    // Reset form
    const salesForm = document.getElementById('sales-form');
    if (salesForm) {
      salesForm.reset();
      
      // Ensure delivery method radio buttons are cleared
      const deliveryMethodInputs = document.querySelectorAll('input[name=\"delivery-method\"]');
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
    
    // Update driver dropdown and product options
    this.updateDriverDropdown();
    this.updateLineItemProductOptions();
    
    // Refresh recent sales
    setTimeout(() => {
      this.loadRecentSales();
    }, 100);
    
    // Update dashboard if it exists
    if (typeof DashboardModule !== 'undefined') {
      DashboardModule.updateDashboard();
    }
    
    // Show notification
    const driver = DB.getDriverById(driverId);
    this.showNotification(`Sale recorded for ${driver.name} - $${totalAmount.toFixed(2)}`);
  },
  
  // Add a new line item
  addLineItem() {
    const lineItemsContainer = document.getElementById('line-items-container');
    const index = this.lineItemCounter++;
    
    const lineItemDiv = document.createElement('div');
    lineItemDiv.className = 'line-item';
    lineItemDiv.dataset.index = index;
    
    // Get the driver ID to filter products
    const salesDriverSelect = document.getElementById('sales-driver');
    const driverId = salesDriverSelect ? salesDriverSelect.value : '';
    
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
  
  // Add event listeners for line items
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
      const salesDriverSelect = document.getElementById('sales-driver');
      const driverId = salesDriverSelect ? salesDriverSelect.value : '';
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
  
  
  // Load recent sales
  loadRecentSales() {
    const salesList = document.getElementById('recent-sales-list');
    if (!salesList) return;
    
    const sales = DB.getAllSales();
    salesList.innerHTML = '';
    
    if (sales.length === 0) {
      salesList.innerHTML = '<li class="empty-list">No sales recorded yet.</li>';
      return;
    }
    
    // Sort by date, newest first
    sales.sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));
    
    // Show only the 10 most recent sales
    const recentSales = sales.slice(0, 10);
    
    recentSales.forEach(sale => {
      const driver = DB.getDriverById(sale.driverId);
      if (!driver) return;
      
      const li = document.createElement('li');
      
      const date = new Date(sale.saleDate);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
      
      let lineItemsHtml = '';
      sale.lineItems.forEach(item => {
        const giftBadge = item.isFreeGift ? '<span class="badge">Free Gift</span>' : '';
        
        // Determine what to display for quantity
        let displayQuantity;
        if (item.category) {
          // For "Quantity by pcs", show the actual custom number instead of category text
          displayQuantity = item.category === 'Quantity by pcs' ? item.actualQuantity : item.category;
        } else {
          // Fallback to old format for backward compatibility
          displayQuantity = item.quantity;
        }
        
        const displayText = `${item.productName} x ${displayQuantity}`;
        lineItemsHtml += `
          <div class="sale-line-item">
            ${displayText} ${giftBadge}
          </div>
        `;
      });
      
      li.innerHTML = `
        <div class="item-details">
          <strong>$${sale.totalAmount.toFixed(2)}</strong> - ${driver.name}<br>
          <span>${sale.customerAddress}</span>${sale.deliveryMethod ? ` • <span class="delivery-method">${sale.deliveryMethod}</span>` : ''}
          ${sale.customerDescription ? `<br><small>${sale.customerDescription}</small>` : ''}
          <br><small>${formattedDate}</small>
          <div class="sale-line-items">
            ${lineItemsHtml}
          </div>
        </div>
      `;
      
      salesList.appendChild(li);
    });
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
    const salesDriverSelect = document.getElementById('sales-driver');
    if (!salesDriverSelect) return;
    
    const driverId = salesDriverSelect.value;
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
  }
};
