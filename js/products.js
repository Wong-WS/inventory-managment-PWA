/**
 * Products management module
 * Handles adding, editing, and displaying products
 */

const ProductsModule = {
  // Initialize the products module
  init() {
    this.bindEvents();
    this.loadProductsList();
  },

  // Bind event listeners
  bindEvents() {
    const addProductForm = document.getElementById('add-product-form');
    if (addProductForm) {
      addProductForm.addEventListener('submit', this.handleAddProduct.bind(this));
    }
    
    const productSearch = document.getElementById('product-search');
    if (productSearch) {
      productSearch.addEventListener('input', this.handleSearchProducts.bind(this));
    }
  },

  // Handle adding a new product
  handleAddProduct(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById('product-name');
    const quantityInput = document.getElementById('product-quantity');
    const name = nameInput.value.trim();
    const quantity = parseInt(quantityInput.value);
    
    if (!name) {
      alert('Please enter a valid product name.');
      return;
    }
    
    if (isNaN(quantity) || quantity < 0) {
      alert('Please enter a valid quantity (0 or greater).');
      return;
    }
    
    // Add product with specified quantity
    const newProduct = DB.addProduct(name, quantity);
    
    // Reset form
    nameInput.value = '';
    quantityInput.value = '0';
    
    // Refresh product list
    this.loadProductsList();
    
    // Update dashboard
    if (typeof DashboardModule !== 'undefined') {
      DashboardModule.updateDashboard();
    }
    
    // Show notification
    this.showNotification(`Product "${name}" added successfully with ${quantity} units`);
  },
  
  // Load products list
  loadProductsList() {
    const productsList = document.getElementById('products-list');
    if (!productsList) return;
    
    const products = DB.getAllProducts();
    productsList.innerHTML = '';
    
    if (products.length === 0) {
      productsList.innerHTML = '<li class="empty-list">No products added yet.</li>';
      return;
    }
    
    products.sort((a, b) => a.name.localeCompare(b.name)).forEach(product => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.padding = '1rem';
      li.style.borderBottom = '1px solid #eee';
      
      const itemDetails = document.createElement('div');
      itemDetails.className = 'item-details';
      
      const nameElement = document.createElement('strong');
      nameElement.textContent = product.name;
      
      const quantityElement = document.createElement('span');
      quantityElement.textContent = ` (Qty: ${product.totalQuantity})`;
      quantityElement.style.color = '#666';
      
      itemDetails.appendChild(nameElement);
      itemDetails.appendChild(quantityElement);
      
      const itemActions = document.createElement('div');
      itemActions.className = 'item-actions';
      itemActions.style.display = 'flex';
      itemActions.style.gap = '0.5rem';
      
      const editButton = document.createElement('button');
      editButton.textContent = 'Edit';
      editButton.className = 'secondary-button';
      editButton.style.padding = '0.5rem 1rem';
      editButton.style.fontSize = '0.9rem';
      editButton.setAttribute('aria-label', 'Edit product');
      editButton.addEventListener('click', () => this.editProduct(product.id));
      
      const deleteButton = document.createElement('button');
      deleteButton.textContent = 'Delete';
      deleteButton.className = 'danger-button';
      deleteButton.style.padding = '0.5rem 1rem';
      deleteButton.style.fontSize = '0.9rem';
      deleteButton.setAttribute('aria-label', 'Delete product');
      deleteButton.addEventListener('click', () => this.deleteProduct(product.id));
      
      itemActions.appendChild(editButton);
      itemActions.appendChild(deleteButton);
      
      li.appendChild(itemDetails);
      li.appendChild(itemActions);
      
      productsList.appendChild(li);
    });
  },
  
  // Handle product search
  handleSearchProducts(event) {
    const searchTerm = event.target.value.trim().toLowerCase();
    const productsList = document.getElementById('products-list');
    const listItems = productsList.getElementsByTagName('li');
    
    for (const item of listItems) {
      const productName = item.querySelector('strong').textContent.toLowerCase();
      if (productName.includes(searchTerm)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    }
  },
  
  // Edit product
  editProduct(productId) {
    const product = DB.getProductById(productId);
    if (!product) return;
    
    const newName = prompt('Enter new product name:', product.name);
    if (!newName || newName.trim() === '') return;
    
    const newQuantity = prompt('Enter new product quantity:', product.totalQuantity);
    const quantity = parseInt(newQuantity);
    
    if (isNaN(quantity) || quantity < 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    
    DB.updateProduct(productId, {
      name: newName.trim(),
      totalQuantity: quantity
    });
    
    // Refresh product list
    this.loadProductsList();
    
    // Update dashboard if it exists
    if (typeof DashboardModule !== 'undefined') {
      DashboardModule.updateDashboard();
    }
    
    // Show notification
    this.showNotification(`Product "${newName}" updated successfully`);
  },
  
  // Delete product
  deleteProduct(productId) {
    const product = DB.getProductById(productId);
    if (!product) return;
    
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) {
      return;
    }
    
    DB.deleteProduct(productId);
    
    // Refresh product list
    this.loadProductsList();
    
    // Update dashboard if it exists
    if (typeof DashboardModule !== 'undefined') {
      DashboardModule.updateDashboard();
    }
    
    // Show notification
    this.showNotification(`Product "${product.name}" deleted successfully`);
  },
  
  // Show notification
  showNotification(message) {
    if (typeof AppModule !== 'undefined') {
      AppModule.showNotification(message);
    } else {
      alert(message);
    }
  },
  
  // Get all products as options for select elements
  getProductsAsOptions(selectedId = null, includeQuantity = true) {
    const products = DB.getAllProducts();
    let options = '<option value="">-- Select Product --</option>';
    
    products.forEach(product => {
      const selected = selectedId === product.id ? 'selected' : '';
      const quantityInfo = includeQuantity ? ` (Qty: ${product.totalQuantity})` : '';
      options += `<option value="${product.id}" ${selected}>${product.name}${quantityInfo}</option>`;
    });
    
    return options;
  },
  
  // Update all product dropdowns in the app
  updateProductDropdowns(selectedId = null) {
    // Explicitly ensure we include quantity in dropdown options
    const options = this.getProductsAsOptions(selectedId, true);
    
    // Update assign product dropdown
    const assignProductSelect = document.getElementById('assign-product');
    if (assignProductSelect) {
      assignProductSelect.innerHTML = options;
    }
    
    // Update sales line item product dropdowns
    const lineItemProducts = document.querySelectorAll('.line-item-product');
    lineItemProducts.forEach(select => {
      const currentValue = select.value;
      select.innerHTML = options;
      if (currentValue) {
        select.value = currentValue;
      }
    });
  }
};
