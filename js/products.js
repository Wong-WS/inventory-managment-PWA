/**
 * Products management module
 * Handles adding, editing, and displaying products
 */

// Import database
import { DB } from './database.js';

const ProductsModule = {
  // Initialize the products module
  async init() {
    this.bindEvents();
    await this.loadProductsList();
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
  async handleAddProduct(event) {
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

    try {
      // Add product with specified quantity
      const newProduct = await DB.addProduct(name, quantity);

      // Reset form
      nameInput.value = '';
      quantityInput.value = '0';

      // Refresh product list
      await this.loadProductsList();

      // Update dashboard
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }

      // Show notification
      this.showNotification(`Product "${name}" added successfully with ${quantity} units`);
    } catch (error) {
      alert(`Error adding product: ${error.message}`);
    }
  },
  
  // Load products list
  async loadProductsList() {
    const productsList = document.getElementById('products-list');
    if (!productsList) return;

    try {
      const products = await DB.getAllProducts();
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

        const restockButton = document.createElement('button');
        restockButton.textContent = 'Restock';
        restockButton.className = 'primary-button';
        restockButton.style.padding = '0.5rem 1rem';
        restockButton.style.fontSize = '0.9rem';
        restockButton.style.backgroundColor = '#28a745';
        restockButton.style.borderColor = '#28a745';
        restockButton.setAttribute('aria-label', 'Restock product');
        restockButton.addEventListener('click', () => this.restockProduct(product.id));

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'danger-button';
        deleteButton.style.padding = '0.5rem 1rem';
        deleteButton.style.fontSize = '0.9rem';
        deleteButton.setAttribute('aria-label', 'Delete product');
        deleteButton.addEventListener('click', () => this.deleteProduct(product.id));

        itemActions.appendChild(editButton);
        itemActions.appendChild(restockButton);
        itemActions.appendChild(deleteButton);

        li.appendChild(itemDetails);
        li.appendChild(itemActions);

        productsList.appendChild(li);
      });
    } catch (error) {
      productsList.innerHTML = '<li class="empty-list">Error loading products.</li>';
      console.error('Error loading products:', error);
    }
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
  async editProduct(productId) {
    try {
      const product = await DB.getProductById(productId);
      if (!product) return;

      const newName = prompt('Enter new product name:', product.name);
      if (!newName || newName.trim() === '') return;

      const newQuantity = prompt('Enter new product quantity:', product.totalQuantity);
      const quantity = parseInt(newQuantity);

      if (isNaN(quantity) || quantity < 0) {
        alert('Please enter a valid quantity.');
        return;
      }

      await DB.updateProduct(productId, {
        name: newName.trim(),
        totalQuantity: quantity
      });

      // Refresh product list
      await this.loadProductsList();

      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }

      // Show notification
      this.showNotification(`Product "${newName}" updated successfully`);
    } catch (error) {
      alert(`Error updating product: ${error.message}`);
    }
  },
  
  // Delete product
  async deleteProduct(productId) {
    try {
      const product = await DB.getProductById(productId);
      if (!product) return;

      if (!confirm(`Are you sure you want to delete "${product.name}"?`)) {
        return;
      }

      await DB.deleteProduct(productId);

      // Refresh product list
      await this.loadProductsList();

      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }

      // Show notification
      this.showNotification(`Product "${product.name}" deleted successfully`);
    } catch (error) {
      alert(`Error deleting product: ${error.message}`);
    }
  },

  // Restock product
  async restockProduct(productId) {
    try {
      const product = await DB.getProductById(productId);
      if (!product) return;

      const restockAmount = prompt(`How much do you want to restock for "${product.name}"?\nCurrent quantity: ${product.totalQuantity}`, '');
      if (!restockAmount || restockAmount.trim() === '') return;

      const quantity = parseInt(restockAmount);
      if (isNaN(quantity) || quantity <= 0) {
        alert('Please enter a valid positive number for restock amount.');
        return;
      }

      await DB.restockProduct(productId, quantity);

      // Refresh product list
      await this.loadProductsList();

      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }

      // Show notification
      this.showNotification(`Product "${product.name}" restocked with ${quantity} units`);
    } catch (error) {
      alert(`Error restocking product: ${error.message}`);
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
  
  // Get all products as options for select elements
  async getProductsAsOptions(selectedId = null, includeQuantity = true) {
    try {
      const products = await DB.getAllProducts();
      let options = '<option value="">-- Select Product --</option>';

      products.forEach(product => {
        const selected = selectedId === product.id ? 'selected' : '';
        const quantityInfo = includeQuantity ? ` (Qty: ${product.totalQuantity})` : '';
        options += `<option value="${product.id}" ${selected}>${product.name}${quantityInfo}</option>`;
      });

      return options;
    } catch (error) {
      console.error('Error getting product options:', error);
      return '<option value="">-- Error loading products --</option>';
    }
  },
  
  // Update all product dropdowns in the app
  async updateProductDropdowns(selectedId = null) {
    try {
      // Explicitly ensure we include quantity in dropdown options
      const options = await this.getProductsAsOptions(selectedId, true);

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
    } catch (error) {
      console.error('Error updating product dropdowns:', error);
    }
  }
};

// Export the module and make it globally available
export default ProductsModule;
window.ProductsModule = ProductsModule;
