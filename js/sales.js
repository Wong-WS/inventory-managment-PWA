/**
 * Sales management module
 * Handles recording sales transactions and displaying sales history
 */

const SalesModule = {
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
      salesDriverSelect.addEventListener('change', this.updateLineItemProductOptions.bind(this));
    }
  },

  // Handle recording a new sale
  handleRecordSale(event) {
    event.preventDefault();
    
    const salesDriverSelect = document.getElementById('sales-driver');
    const customerAddressInput = document.getElementById('customer-address');
    const customerDescInput = document.getElementById('customer-description');
    const totalAmountInput = document.getElementById('total-amount');
    
    const driverId = salesDriverSelect.value;
    const customerAddress = customerAddressInput.value.trim();
    const customerDescription = customerDescInput.value.trim();
    const totalAmount = parseFloat(totalAmountInput.value);
    
    if (!driverId || !customerAddress) {
      alert('Please select a driver and enter a customer address.');
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
      const quantityInput = document.getElementById(`line-item-quantity-${index}`);
      const priceInput = document.getElementById(`line-item-price-${index}`);
      const giftCheckbox = document.getElementById(`line-item-gift-${index}`);
      
      const productId = productSelect.value;
      const quantity = parseInt(quantityInput.value);
      const price = parseFloat(priceInput.value);
      const isFreeGift = giftCheckbox.checked;
      
      if (!productId || isNaN(quantity) || quantity <= 0 || isNaN(price) || price < 0) {
        valid = false;
        return;
      }
      
      const product = DB.getProductById(productId);
      if (!product) {
        valid = false;
        return;
      }
      
      lineItems.push({
        productId,
        productName: product.name,
        quantity,
        price,
        isFreeGift
      });
    });
    
    if (!valid || lineItems.length === 0) {
      alert('Please check your line items. Each item must have a valid product, quantity, and price.');
      return;
    }
    
    // Create sale data object
    const saleData = {
      driverId,
      customerAddress,
      customerDescription,
      totalAmount,
      lineItems
    };
    
    // Add the sale
    const newSale = DB.addSale(saleData);
    
    // Reset form
    salesForm.reset();
    
    // Reset line items to just one
    const lineItemsContainer = document.getElementById('line-items-container');
    lineItemsContainer.innerHTML = '';
    this.lineItemCounter = 0;
    this.addLineItem();
    
    // Refresh recent sales
    this.loadRecentSales();
    
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
        <label for="line-item-quantity-${index}">Quantity</label>
        <input type="number" class="line-item-quantity" id="line-item-quantity-${index}" min="1" required>
      </div>
      <div class="form-group">
        <label for="line-item-price-${index}">Price</label>
        <input type="number" class="line-item-price" id="line-item-price-${index}" min="0" step="0.01" required>
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
    
    const priceInput = document.getElementById(`line-item-price-${index}`);
    const quantityInput = document.getElementById(`line-item-quantity-${index}`);
    const giftCheckbox = document.getElementById(`line-item-gift-${index}`);
    
    // Update total amount on price or quantity change
    if (priceInput) {
      priceInput.addEventListener('change', this.updateTotalAmount.bind(this));
    }
    
    if (quantityInput) {
      quantityInput.addEventListener('change', this.updateTotalAmount.bind(this));
    }
    
    if (giftCheckbox) {
      giftCheckbox.addEventListener('change', () => {
        if (giftCheckbox.checked) {
          priceInput.value = "0";
          priceInput.disabled = true;
        } else {
          priceInput.disabled = false;
        }
        this.updateTotalAmount();
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
    
    // Update the total amount
    this.updateTotalAmount();
  },
  
  // Update the total amount based on line items
  updateTotalAmount() {
    let total = 0;
    const lineItemElements = document.querySelectorAll('.line-item');
    
    lineItemElements.forEach((element) => {
      const index = element.dataset.index;
      const quantityInput = document.getElementById(`line-item-quantity-${index}`);
      const priceInput = document.getElementById(`line-item-price-${index}`);
      const giftCheckbox = document.getElementById(`line-item-gift-${index}`);
      
      const quantity = parseInt(quantityInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const isFreeGift = giftCheckbox.checked;
      
      if (!isFreeGift) {
        total += quantity * price;
      }
    });
    
    const totalAmountInput = document.getElementById('total-amount');
    if (totalAmountInput) {
      totalAmountInput.value = total.toFixed(2);
    }
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
        lineItemsHtml += `
          <div class="sale-line-item">
            ${item.productName} x ${item.quantity} - $${(item.price * item.quantity).toFixed(2)} ${giftBadge}
          </div>
        `;
      });
      
      li.innerHTML = `
        <div class="item-details">
          <strong>$${sale.totalAmount.toFixed(2)}</strong> - ${driver.name}<br>
          <span>${sale.customerAddress}</span>
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
