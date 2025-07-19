/**
 * Assignments management module
 * Handles assigning products to drivers and tracking assignment history
 */

const AssignmentsModule = {
  // Initialize the assignments module
  init() {
    this.bindEvents();
    this.loadAssignmentHistory();
    this.updateDropdowns();
  },

  // Bind event listeners
  bindEvents() {
    const assignForm = document.getElementById('assign-form');
    if (assignForm) {
      assignForm.addEventListener('submit', this.handleAssignProducts.bind(this));
    }
    
    const historyDriverSelect = document.getElementById('history-driver');
    if (historyDriverSelect) {
      historyDriverSelect.addEventListener('change', this.loadAssignmentHistory.bind(this));
    }
  },

  // Handle assigning products to a driver
  handleAssignProducts(event) {
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
    
    // Get driver and product names for display
    const driver = DB.getDriverById(driverId);
    const product = DB.getProductById(productId);
    
    if (!driver || !product) {
      alert('Selected driver or product not found.');
      return;
    }
    
    try {
      const newAssignment = DB.addAssignment(driverId, productId, quantity);
      
      // Reset form
      quantityInput.value = '';
      
      // Refresh dropdowns to show updated quantities
      this.updateDropdowns();
      
      // Update product dropdowns in other modules
      if (typeof ProductsModule !== 'undefined') {
        ProductsModule.updateProductDropdowns();
        ProductsModule.loadProductsList();
      }
      
      // Refresh assignment history
      this.loadAssignmentHistory();
      
      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        DashboardModule.updateDashboard();
      }
      
      // Show notification
      this.showNotification(`Assigned ${quantity} units of "${product.name}" to ${driver.name}`);
      
    } catch (error) {
      // Handle the error when there's not enough quantity in stock
      alert(error.message);
    }
  },
  
  // Load assignment history
  loadAssignmentHistory() {
    const historyList = document.getElementById('assignment-history-list');
    if (!historyList) return;
    
    const historyDriverSelect = document.getElementById('history-driver');
    const selectedDriverId = historyDriverSelect ? historyDriverSelect.value : '';
    
    let assignments = DB.getAllAssignments();
    
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
    
    assignments.forEach(assignment => {
      const driver = DB.getDriverById(assignment.driverId);
      const product = DB.getProductById(assignment.productId);
      
      if (!driver || !product) return;
      
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
    });
  },
  
  // Update dropdowns for driver and product selection
  updateDropdowns() {
    // Update driver dropdown
    if (typeof DriversModule !== 'undefined') {
      DriversModule.updateDriverDropdowns();
    }
    
    // Directly update product dropdown with quantities
    const assignProductSelect = document.getElementById('assign-product');
    if (assignProductSelect && typeof DB !== 'undefined') {
      const products = DB.getAllProducts();
      let options = '<option value="">-- Select Product --</option>';
      
      products.forEach(product => {
        options += `<option value="${product.id}">${product.name} (Qty: ${product.totalQuantity})</option>`;
      });
      
      assignProductSelect.innerHTML = options;
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
  getDriverProductInventory(driverId, productId) {
    if (!driverId || !productId) return 0;
    
    const driverInventory = DB.getDriverInventory(driverId);
    const productInventory = driverInventory.find(item => item.id === productId);
    
    return productInventory ? productInventory.remaining : 0;
  }
};
