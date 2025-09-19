/**
 * Drivers management module
 * Handles adding, editing, and displaying drivers
 */

const DriversModule = {
  // Initialize the drivers module
  async init() {
    this.bindEvents();
    await this.loadDriversList();
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
  async handleAddDriver(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById('driver-name');
    const phoneInput = document.getElementById('driver-phone');
    const createUserCheckbox = document.getElementById('create-user-account');
    
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const createUser = createUserCheckbox ? createUserCheckbox.checked : false;
    
    if (!name || !phone) {
      alert('Please enter both driver name and phone number.');
      return;
    }
    
    try {
      const result = await DB.addDriver(name, phone, { createUser });
      
      // Reset form
      nameInput.value = '';
      phoneInput.value = '';
      if (createUserCheckbox) createUserCheckbox.checked = false;
      
      // Refresh drivers list
      await this.loadDriversList();

      // Update dashboard
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }

      // Update dropdowns
      await this.updateDriverDropdowns();
      
      // Update users list if users module is available
      if (typeof UsersModule !== 'undefined') {
        await UsersModule.loadUsers();
        await UsersModule.updateDriverDropdown();
      }
      
      // Show appropriate notification
      let message = `Driver "${name}" added successfully`;
      if (result.user && result.credentials) {
        message += `\\n\\nUser account created:\\nUsername: ${result.credentials.username}\\nPassword: ${result.credentials.password}\\n\\nPlease inform the driver to change their password on first login.`;
        alert(message);
      } else {
        this.showNotification(message);
      }
    } catch (error) {
      alert(`Failed to add driver: ${error.message}`);
    }
  },
  
  // Load drivers list
  async loadDriversList() {
    const driversList = document.getElementById('drivers-list');
    if (!driversList) return;

    try {
      const drivers = await DB.getAllDrivers();
      driversList.innerHTML = '';

      if (drivers.length === 0) {
        driversList.innerHTML = '<li class="empty-list">No drivers added yet.</li>';
        return;
      }

      for (const driver of drivers.sort((a, b) => a.name.localeCompare(b.name))) {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '1rem';
        li.style.borderBottom = '1px solid #eee';

        const itemDetails = document.createElement('div');
        itemDetails.className = 'item-details';

        // Get linked user information
        const user = driver.linkedUserId ? await DB.getUserById(driver.linkedUserId) : null;
        let userInfo = '';
        if (user) {
          userInfo = `<br><small>User: ${user.username} (${user.isActive ? 'Active' : 'Inactive'})</small>`;
        } else {
          userInfo = '<br><small style="color: #e74c3c;">No user account linked</small>';
        }

        itemDetails.innerHTML = `
          <strong>${driver.name}</strong> <span style="color: #666;">(${driver.phone})</span>
          ${userInfo}
          <br><small>Created: ${driver.createdAt?.toDate ? driver.createdAt.toDate().toLocaleDateString() : new Date(driver.createdAt).toLocaleDateString()}</small>
        `;

        const itemActions = document.createElement('div');
        itemActions.className = 'item-actions';
        itemActions.style.display = 'flex';
        itemActions.style.gap = '0.5rem';
        itemActions.style.flexWrap = 'wrap';

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

        // Add user-related actions
        if (!user) {
          const createUserButton = document.createElement('button');
          createUserButton.textContent = 'Create User';
          createUserButton.className = 'primary-button';
          createUserButton.style.padding = '0.5rem 1rem';
          createUserButton.style.fontSize = '0.9rem';
          createUserButton.setAttribute('aria-label', 'Create user account');
          createUserButton.addEventListener('click', () => this.createUserForDriver(driver.id));
          itemActions.appendChild(createUserButton);
        }

        li.appendChild(itemDetails);
        li.appendChild(itemActions);

        driversList.appendChild(li);
      }
    } catch (error) {
      driversList.innerHTML = '<li class="empty-list">Error loading drivers.</li>';
      console.error('Error loading drivers:', error);
    }
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
  async editDriver(driverId) {
    try {
      const driver = await DB.getDriverById(driverId);
      if (!driver) return;

      const newName = prompt('Enter new driver name:', driver.name);
      if (!newName || newName.trim() === '') return;

      const newPhone = prompt('Enter new phone number:', driver.phone);
      if (!newPhone || newPhone.trim() === '') return;

      await DB.updateDriver(driverId, {
        name: newName.trim(),
        phone: newPhone.trim()
      });

      // Refresh drivers list
      await this.loadDriversList();

      // Update dropdowns
      await this.updateDriverDropdowns();

      // Show notification
      this.showNotification(`Driver "${newName}" updated successfully`);
    } catch (error) {
      alert(`Error updating driver: ${error.message}`);
    }
  },
  
  // Delete driver
  async deleteDriver(driverId) {
    try {
      const driver = await DB.getDriverById(driverId);
      if (!driver) return;

      if (!confirm(`Are you sure you want to delete driver "${driver.name}"?`)) {
        return;
      }

      await DB.deleteDriver(driverId);

      // Refresh drivers list
      await this.loadDriversList();

      // Update dropdowns
      await this.updateDriverDropdowns();

      // Update dashboard if it exists
      if (typeof DashboardModule !== 'undefined') {
        await DashboardModule.updateDashboard();
      }

      // Show notification
      this.showNotification(`Driver "${driver.name}" deleted successfully`);
    } catch (error) {
      alert(`Error deleting driver: ${error.message}`);
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
  
  // Get all drivers as options for select elements
  async getDriversAsOptions(selectedId = null) {
    try {
      const drivers = await DB.getAllDrivers();
      let options = '<option value="">-- Select Driver --</option>';

      drivers.forEach(driver => {
        const selected = selectedId === driver.id ? 'selected' : '';
        options += `<option value="${driver.id}" ${selected}>${driver.name}</option>`;
      });

      return options;
    } catch (error) {
      console.error('Error getting driver options:', error);
      return '<option value="">-- Error loading drivers --</option>';
    }
  },
  
  // Create user account for existing driver
  async createUserForDriver(driverId) {
    try {
      const driver = await DB.getDriverById(driverId);
      if (!driver) {
        alert('Driver not found');
        return;
      }

      if (driver.linkedUserId) {
        alert('This driver already has a user account linked');
        return;
      }

      if (confirm(`Create user account for driver "${driver.name}"?\n\nA login account will be created with default password "Driver123!"`)) {
        // Generate a username based on the driver's name
        const baseUsername = driver.name.toLowerCase().replace(/\s+/g, '');
        let username = baseUsername;
        let counter = 1;

        // Ensure username is unique
        while (await DB.getUserByUsername(username)) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        // Create user account with a default password
        const defaultPassword = 'Driver123!';
        const newUser = await DB.createUser({
          username: username,
          password: defaultPassword,
          name: driver.name,
          role: DB.ROLES.DRIVER,
          driverId: driver.id
        });

        // Update driver with linked user ID
        await DB.updateDriver(driverId, { linkedUserId: newUser.id });

        // Refresh the display
        await this.loadDriversList();

        // Update users list if available
        if (typeof UsersModule !== 'undefined') {
          await UsersModule.loadUsers();
          await UsersModule.updateDriverDropdown();
        }

        alert(`User account created successfully!\n\nUsername: ${username}\nPassword: ${defaultPassword}\n\nPlease inform the driver to change their password on first login.`);
      }
    } catch (error) {
      alert(`Failed to create user account: ${error.message}`);
    }
  },

  // Update all driver dropdowns in the app
  async updateDriverDropdowns(selectedId = null) {
    try {
      const options = await this.getDriversAsOptions(selectedId);

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

      // Update order driver dropdown
      const orderDriverSelect = document.getElementById('order-driver');
      if (orderDriverSelect) {
        orderDriverSelect.innerHTML = options;
      }

      // Update user driver dropdown
      const userDriverSelect = document.getElementById('user-driver');
      if (userDriverSelect) {
        userDriverSelect.innerHTML = options;
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
    } catch (error) {
      console.error('Error updating driver dropdowns:', error);
    }
  }
};

// Export the module and make it globally available
export default DriversModule;
window.DriversModule = DriversModule;
