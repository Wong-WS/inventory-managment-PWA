/**
 * Drivers management module
 * Handles adding, editing, and displaying drivers
 */

const DriversModule = {
  // Initialize the drivers module
  init() {
    this.bindEvents();
    this.loadDriversList();
  },

  // Bind event listeners
  bindEvents() {
    const addDriverForm = document.getElementById('add-driver-form');
    if (addDriverForm) {
      addDriverForm.addEventListener('submit', this.handleAddDriver.bind(this));
    }
    
    const driverSearch = document.getElementById('driver-search');
    if (driverSearch) {
      driverSearch.addEventListener('input', this.handleSearchDrivers.bind(this));
    }
  },

  // Handle adding a new driver
  handleAddDriver(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById('driver-name');
    const phoneInput = document.getElementById('driver-phone');
    
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    
    if (!name || !phone) {
      alert('Please enter both driver name and phone number.');
      return;
    }
    
    const newDriver = DB.addDriver(name, phone);
    
    // Reset form
    nameInput.value = '';
    phoneInput.value = '';
    
    // Refresh drivers list
    this.loadDriversList();
    
    // Update dashboard
    if (typeof DashboardModule !== 'undefined') {
      DashboardModule.updateDashboard();
    }
    
    // Update dropdowns
    this.updateDriverDropdowns();
    
    // Show notification
    this.showNotification(`Driver "${name}" added successfully`);
  },
  
  // Load drivers list
  loadDriversList() {
    const driversList = document.getElementById('drivers-list');
    if (!driversList) return;
    
    const drivers = DB.getAllDrivers();
    driversList.innerHTML = '';
    
    if (drivers.length === 0) {
      driversList.innerHTML = '<li class="empty-list">No drivers added yet.</li>';
      return;
    }
    
    drivers.sort((a, b) => a.name.localeCompare(b.name)).forEach(driver => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.padding = '1rem';
      li.style.borderBottom = '1px solid #eee';
      
      const itemDetails = document.createElement('div');
      itemDetails.className = 'item-details';
      
      const nameElement = document.createElement('strong');
      nameElement.textContent = driver.name;
      
      const phoneElement = document.createElement('span');
      phoneElement.textContent = ` (${driver.phone})`;
      phoneElement.style.color = '#666';
      
      itemDetails.appendChild(nameElement);
      itemDetails.appendChild(phoneElement);
      
      const itemActions = document.createElement('div');
      itemActions.className = 'item-actions';
      itemActions.style.display = 'flex';
      itemActions.style.gap = '0.5rem';
      
      const editButton = document.createElement('button');
      editButton.textContent = 'Edit';
      editButton.className = 'secondary-button';
      editButton.style.padding = '0.5rem 1rem';
      editButton.style.fontSize = '0.9rem';
      editButton.setAttribute('aria-label', 'Edit driver');
      editButton.addEventListener('click', () => this.editDriver(driver.id));
      
      const deleteButton = document.createElement('button');
      deleteButton.textContent = 'Delete';
      deleteButton.className = 'danger-button';
      deleteButton.style.padding = '0.5rem 1rem';
      deleteButton.style.fontSize = '0.9rem';
      deleteButton.setAttribute('aria-label', 'Delete driver');
      deleteButton.addEventListener('click', () => this.deleteDriver(driver.id));
      
      itemActions.appendChild(editButton);
      itemActions.appendChild(deleteButton);
      
      li.appendChild(itemDetails);
      li.appendChild(itemActions);
      
      driversList.appendChild(li);
    });
  },
  
  // Handle driver search
  handleSearchDrivers(event) {
    const searchTerm = event.target.value.trim().toLowerCase();
    const driversList = document.getElementById('drivers-list');
    const listItems = driversList.getElementsByTagName('li');
    
    for (const item of listItems) {
      const driverName = item.querySelector('strong').textContent.toLowerCase();
      if (driverName.includes(searchTerm)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    }
  },
  
  // Edit driver
  editDriver(driverId) {
    const driver = DB.getDriverById(driverId);
    if (!driver) return;
    
    const newName = prompt('Enter new driver name:', driver.name);
    if (!newName || newName.trim() === '') return;
    
    const newPhone = prompt('Enter new phone number:', driver.phone);
    if (!newPhone || newPhone.trim() === '') return;
    
    DB.updateDriver(driverId, {
      name: newName.trim(),
      phone: newPhone.trim()
    });
    
    // Refresh drivers list
    this.loadDriversList();
    
    // Update dropdowns
    this.updateDriverDropdowns();
    
    // Show notification
    this.showNotification(`Driver "${newName}" updated successfully`);
  },
  
  // Delete driver
  deleteDriver(driverId) {
    const driver = DB.getDriverById(driverId);
    if (!driver) return;
    
    if (!confirm(`Are you sure you want to delete driver "${driver.name}"?`)) {
      return;
    }
    
    DB.deleteDriver(driverId);
    
    // Refresh drivers list
    this.loadDriversList();
    
    // Update dropdowns
    this.updateDriverDropdowns();
    
    // Update dashboard if it exists
    if (typeof DashboardModule !== 'undefined') {
      DashboardModule.updateDashboard();
    }
    
    // Show notification
    this.showNotification(`Driver "${driver.name}" deleted successfully`);
  },
  
  // Show notification
  showNotification(message) {
    if (typeof AppModule !== 'undefined') {
      AppModule.showNotification(message);
    } else {
      alert(message);
    }
  },
  
  // Get all drivers as options for select elements
  getDriversAsOptions(selectedId = null) {
    const drivers = DB.getAllDrivers();
    let options = '<option value="">-- Select Driver --</option>';
    
    drivers.forEach(driver => {
      const selected = selectedId === driver.id ? 'selected' : '';
      options += `<option value="${driver.id}" ${selected}>${driver.name}</option>`;
    });
    
    return options;
  },
  
  // Update all driver dropdowns in the app
  updateDriverDropdowns(selectedId = null) {
    const options = this.getDriversAsOptions(selectedId);
    
    // Update assign driver dropdown
    const assignDriverSelect = document.getElementById('assign-driver');
    if (assignDriverSelect) {
      assignDriverSelect.innerHTML = options;
    }
    
    // Update history driver dropdown
    const historyDriverSelect = document.getElementById('history-driver');
    if (historyDriverSelect) {
      historyDriverSelect.innerHTML = '<option value="">All Drivers</option>' + 
        options.replace('<option value="">-- Select Driver --</option>', '');
    }
    
    // Update sales driver dropdown
    const salesDriverSelect = document.getElementById('sales-driver');
    if (salesDriverSelect) {
      salesDriverSelect.innerHTML = options;
    }
    
    // Update report driver dropdown
    const reportDriverSelect = document.getElementById('report-driver');
    if (reportDriverSelect) {
      reportDriverSelect.innerHTML = '<option value="">All Drivers</option>' + 
        options.replace('<option value="">-- Select Driver --</option>', '');
    }
    
    // Update inventory driver dropdown
    const inventoryDriverSelect = document.getElementById('inventory-driver');
    if (inventoryDriverSelect) {
      inventoryDriverSelect.innerHTML = '<option value="">All Drivers</option>' + 
        options.replace('<option value="">-- Select Driver --</option>', '');
    }
  }
};
