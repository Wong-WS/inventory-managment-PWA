/**
 * User management module
 * Handles user creation, editing, and management (Admin only)
 */

const UsersModule = {
  // Initialize the users module
  async init() {
    // Check if user is admin
    if (!DB.isAdmin()) {
      alert('Access denied. Admin privileges required.');
      return;
    }

    this.bindEvents();
    await this.loadUsers();
    await this.updateDriverDropdown();
    await this.loadPinStatus();
    await this.loadBusinessDayHistory();
  },

  // Bind event listeners
  bindEvents() {
    const addUserForm = document.getElementById('add-user-form');
    if (addUserForm) {
      addUserForm.addEventListener('submit', this.handleAddUser.bind(this));
    }

    // Show/hide driver selection based on role
    const userRoleSelect = document.getElementById('user-role');
    if (userRoleSelect) {
      userRoleSelect.addEventListener('change', this.handleRoleChange.bind(this));
    }

    // Database reset button
    const resetDatabaseBtn = document.getElementById('reset-database-btn');
    if (resetDatabaseBtn) {
      resetDatabaseBtn.addEventListener('click', this.handleResetDatabase.bind(this));
    }

    // Business Day PIN form
    const setPinForm = document.getElementById('set-pin-form');
    if (setPinForm) {
      setPinForm.addEventListener('submit', this.handleSetPin.bind(this));
    }
  },

  // Handle role change in user form
  handleRoleChange() {
    const userRoleSelect = document.getElementById('user-role');
    const driverGroup = document.getElementById('user-driver-group');
    const phoneGroup = document.getElementById('user-phone-group');
    const driverSelect = document.getElementById('user-driver');
    const phoneInput = document.getElementById('user-phone');
    const createDriverCheckbox = document.getElementById('create-driver-profile');

    if (userRoleSelect && driverGroup && driverSelect) {
      if (userRoleSelect.value === 'driver') {
        driverGroup.style.display = 'block';
        if (phoneGroup) phoneGroup.style.display = 'block';
        // Not required by default since user can link to existing driver
        driverSelect.required = false;
      } else {
        driverGroup.style.display = 'none';
        if (phoneGroup) phoneGroup.style.display = 'none';
        driverSelect.required = false;
        driverSelect.value = '';
        if (phoneInput) phoneInput.value = '';
        if (createDriverCheckbox) createDriverCheckbox.checked = false;
      }
    }
  },

  // Handle adding a new user
  async handleAddUser(event) {
    event.preventDefault();

    const usernameInput = document.getElementById('user-username');
    const passwordInput = document.getElementById('user-password');
    const nameInput = document.getElementById('user-name');
    const phoneInput = document.getElementById('user-phone');
    const roleSelect = document.getElementById('user-role');
    const driverSelect = document.getElementById('user-driver');
    const createDriverCheckbox = document.getElementById('create-driver-profile');

    const userData = {
      username: usernameInput.value.trim(),
      password: passwordInput.value,
      name: nameInput.value.trim(),
      role: roleSelect.value
    };

    // Handle driver role specific logic
    if (userData.role === 'driver') {
      if (driverSelect.value) {
        // Link to existing driver profile
        userData.driverId = driverSelect.value;
      } else if (createDriverCheckbox && createDriverCheckbox.checked) {
        // Create new driver profile automatically
        userData.createDriverProfile = true;
        userData.phone = phoneInput ? phoneInput.value.trim() : '';
      }
    }

    try {
      const newUser = await DB.createUser(userData);
      
      // Show success message with additional info for driver users
      let message = `User "${newUser.username}" created successfully`;
      if (userData.role === 'driver' && userData.createDriverProfile) {
        message += ' with driver profile';
      }
      
      // Reset form
      event.target.reset();
      this.handleRoleChange(); // Reset driver group visibility

      // Reload users list and update driver dropdown
      await this.loadUsers();
      await this.updateDriverDropdown();

      // Update driver dropdowns in other modules
      if (typeof DriversModule !== 'undefined') {
        await DriversModule.updateDriverDropdowns();
      }
      
      this.showNotification(message);
    } catch (error) {
      alert(`Failed to create user: ${error.message}`);
    }
  },

  // Load and display users
  async loadUsers() {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;

    const users = await DB.getAllUsers();
    usersList.innerHTML = '';

    if (users.length === 0) {
      usersList.innerHTML = '<li class="empty-list">No users found.</li>';
      return;
    }

    // Sort users: active users first, then inactive users
    const sortedUsers = users.sort((a, b) => {
      if (a.isActive === b.isActive) return 0;
      return a.isActive ? -1 : 1; // Active users (-1) come before inactive (1)
    });

    for (const user of sortedUsers) {
      const li = document.createElement('li');

      // Get driver name if user is linked to a driver
      let driverInfo = '';
      if (user.role === 'driver' && user.driverId) {
        const driver = await DB.getDriverById(user.driverId);
        driverInfo = driver ? ` → ${driver.name} (${driver.phone})` : ' → Driver not found';
      } else if (user.role === 'driver' && !user.driverId) {
        driverInfo = ' → <span style="color: #e74c3c;">No driver profile linked</span>';
      }

      const roleDisplayName = this.getRoleDisplayName(user.role);
      const statusBadge = user.isActive ? 
        '<span class="badge status-active">Active</span>' : 
        '<span class="badge status-inactive">Inactive</span>';

      const actions = [];
      
      // Standard actions
      if (user.isActive) {
        actions.push(`<button class="danger-button" onclick="UsersModule.deactivateUser('${user.id}')">Deactivate</button>`);
      } else {
        actions.push(`<button class="secondary-button" onclick="UsersModule.activateUser('${user.id}')">Activate</button>`);
      }
      actions.push(`<button class="secondary-button" onclick="UsersModule.resetPassword('${user.id}')">Reset Password</button>`);
      
      // Driver-specific actions
      if (user.role === 'driver') {
        if (!user.driverId) {
          actions.push(`<button class="primary-button" onclick="UsersModule.linkToDriver('${user.id}')">Link to Driver</button>`);
          actions.push(`<button class="secondary-button" onclick="UsersModule.createDriverProfile('${user.id}')">Create Driver Profile</button>`);
        } else {
          actions.push(`<button class="secondary-button" onclick="UsersModule.unlinkFromDriver('${user.id}')">Unlink Driver</button>`);
        }
      }

      li.innerHTML = `
        <div class="item-details">
          <strong>${user.name}</strong> (@${user.username})<br>
          <span>Role: ${roleDisplayName}${driverInfo}</span><br>
          <small>Created: ${user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString() : new Date(user.createdAt).toLocaleDateString()}</small>
          ${user.lastLoginAt ? `<br><small>Last Login: ${user.lastLoginAt?.toDate ? user.lastLoginAt.toDate().toLocaleDateString() : new Date(user.lastLoginAt).toLocaleDateString()}</small>` : ''}
          <br>${statusBadge}
        </div>
        <div class="item-actions">
          ${actions.join('')}
        </div>
      `;
      
      usersList.appendChild(li);
    }
  },

  // Update driver dropdown for user creation
  async updateDriverDropdown() {
    const driverSelect = document.getElementById('user-driver');
    if (!driverSelect) return;

    const drivers = await DB.getAllDrivers();
    const users = await DB.getAllUsers();

    // Get list of driver IDs that are already linked to users
    const linkedDriverIds = users.filter(user => user.driverId).map(user => user.driverId);

    // Clear existing options except the first one
    driverSelect.innerHTML = '<option value="">-- Select Driver --</option>';

    drivers.forEach(driver => {
      // Only show drivers that aren't already linked to a user account
      if (!linkedDriverIds.includes(driver.id)) {
        const option = document.createElement('option');
        option.value = driver.id;
        option.textContent = `${driver.name} (${driver.phone})`;
        driverSelect.appendChild(option);
      }
    });
  },

  // Get display name for role
  getRoleDisplayName(role) {
    switch (role) {
      case DB.ROLES.ADMIN:
        return 'Administrator';
      case DB.ROLES.SALES_REP:
        return 'Sales Representative';
      case DB.ROLES.DRIVER:
        return 'Driver';
      default:
        return 'Unknown';
    }
  },

  // Deactivate user
  async deactivateUser(userId) {
    if (confirm('Are you sure you want to deactivate this user?')) {
      try {
        await DB.updateUser(userId, { isActive: false });
        await this.loadUsers();
        this.showNotification('User deactivated successfully');
      } catch (error) {
        alert(`Failed to deactivate user: ${error.message}`);
      }
    }
  },

  // Activate user
  async activateUser(userId) {
    try {
      await DB.updateUser(userId, { isActive: true });
      await this.loadUsers();
      this.showNotification('User activated successfully');
    } catch (error) {
      alert(`Failed to activate user: ${error.message}`);
    }
  },

  // Reset user password
  async resetPassword(userId) {
    const newPassword = prompt('Enter new password for this user:');

    if (newPassword && newPassword.length >= 8) {
      try {
        // Hash the password before storing
        const salt = await DB.generateSalt();
        const passwordHash = await DB.hashPassword(newPassword, salt);

        await DB.updateUser(userId, {
          passwordHash: passwordHash,
          salt: salt
        });

        this.showNotification('Password reset successfully');
        alert(`Password has been reset to: ${newPassword}\nPlease inform the user to change it on next login.`);
      } catch (error) {
        alert(`Failed to reset password: ${error.message}`);
      }
    } else if (newPassword !== null) {
      alert('Password must be at least 8 characters long');
    }
  },

  // Link user to existing driver profile
  async linkToDriver(userId) {
    const availableDrivers = await this.getUnlinkedDrivers();
    
    if (availableDrivers.length === 0) {
      alert('No unlinked driver profiles available. Create a new driver profile first.');
      return;
    }
    
    const driverOptions = availableDrivers.map(driver => 
      `${driver.id}: ${driver.name} (${driver.phone})`
    ).join('\n');
    
    const selectedDriverId = prompt(
      `Select a driver to link to:\n\n${driverOptions}\n\nEnter the driver ID:`
    );
    
    if (selectedDriverId && availableDrivers.find(d => d.id === selectedDriverId)) {
      try {
        await DB.linkUserToDriver(userId, selectedDriverId);
        await this.loadUsers();
        await this.updateDriverDropdown();
        this.showNotification('User linked to driver successfully');
      } catch (error) {
        alert(`Failed to link user to driver: ${error.message}`);
      }
    }
  },

  // Create new driver profile for user
  async createDriverProfile(userId) {
    const user = await DB.getUserById(userId);
    if (!user) {
      alert('User not found');
      return;
    }
    
    const phone = prompt(`Create driver profile for ${user.name}\n\nEnter phone number:`);
    if (!phone || !phone.trim()) {
      return;
    }
    
    try {
      const newDriver = await DB.addDriver(user.name, phone.trim(), { 
        linkedUserId: user.id 
      });
      
      await DB.updateUser(userId, { driverId: newDriver.id });
      
      await this.loadUsers();
      await this.updateDriverDropdown();

      if (typeof DriversModule !== 'undefined') {
        await DriversModule.loadDriversList();
        await DriversModule.updateDriverDropdowns();
      }
      
      this.showNotification(`Driver profile created for ${user.name}`);
    } catch (error) {
      alert(`Failed to create driver profile: ${error.message}`);
    }
  },

  // Unlink user from driver
  async unlinkFromDriver(userId) {
    const user = await DB.getUserById(userId);
    if (!user || !user.driverId) {
      return;
    }

    const driver = await DB.getDriverById(user.driverId);
    const driverName = driver ? driver.name : 'Unknown Driver';
    
    if (confirm(`Are you sure you want to unlink ${user.name} from driver profile "${driverName}"?`)) {
      try {
        await DB.unlinkUserFromDriver(userId);
        await this.loadUsers();
        await this.updateDriverDropdown();
        this.showNotification('User unlinked from driver successfully');
      } catch (error) {
        alert(`Failed to unlink user: ${error.message}`);
      }
    }
  },

  // Get list of drivers not linked to any user
  async getUnlinkedDrivers() {
    const drivers = await DB.getAllDrivers();
    const users = await DB.getAllUsers();
    const linkedDriverIds = users.filter(user => user.driverId).map(user => user.driverId);
    
    return drivers.filter(driver => !linkedDriverIds.includes(driver.id));
  },

  // Show notification
  showNotification(message) {
    if (typeof AppModule !== 'undefined') {
      AppModule.showNotification(message);
    } else {
      alert(message);
    }
  },

  // Handle database reset
  async handleResetDatabase() {
    const confirmMessage = 'WARNING: This will DELETE ALL DATA from the database!\n\n' +
      'This includes:\n' +
      '- All products\n' +
      '- All drivers\n' +
      '- All assignments\n' +
      '- All orders\n' +
      '- All sales records\n' +
      '- All stock transfers\n' +
      '- All users (except the default admin)\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Type "RESET" to confirm:';

    const userInput = prompt(confirmMessage);

    if (userInput !== 'RESET') {
      if (userInput !== null) {
        alert('Database reset cancelled. You must type "RESET" to confirm.');
      }
      return;
    }

    // Final confirmation
    const finalConfirm = confirm('Are you absolutely sure? This is your last chance to cancel!');
    if (!finalConfirm) {
      alert('Database reset cancelled.');
      return;
    }

    try {
      // Disable the button to prevent multiple clicks
      const resetBtn = document.getElementById('reset-database-btn');
      if (resetBtn) {
        resetBtn.disabled = true;
        resetBtn.textContent = 'Resetting...';
      }

      // Perform the reset
      const result = await DB.resetDatabase();

      // Show summary
      const summary = `Database reset complete!\n\n` +
        `Deleted:\n` +
        `- ${result.products} products\n` +
        `- ${result.drivers} drivers\n` +
        `- ${result.assignments} assignments\n` +
        `- ${result.orders} orders\n` +
        `- ${result.sales} sales records\n` +
        `- ${result.stockTransfers} stock transfers\n` +
        `- ${result.users} users\n\n` +
        `Default admin account has been recreated.\n` +
        `Username: admin\n` +
        `Password: Admin123!\n\n` +
        `You will now be logged out. Please log in again.`;

      alert(summary);

      // Redirect to login
      window.location.reload();
    } catch (error) {
      alert(`Failed to reset database: ${error.message}`);

      // Re-enable the button
      const resetBtn = document.getElementById('reset-database-btn');
      if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Reset Database';
      }
    }
  },

  // ===============================
  // BUSINESS DAY PIN MANAGEMENT
  // ===============================

  /**
   * Load PIN configuration status
   */
  async loadPinStatus() {
    const statusDiv = document.getElementById('pin-status-message');
    if (!statusDiv) return;

    try {
      const isPinConfigured = await DB.isBusinessDayPinConfigured();

      if (isPinConfigured) {
        statusDiv.innerHTML = `
          <div style="padding: 0.75rem; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; color: #155724;">
            <i class="fas fa-check-circle"></i> PIN is configured and active
          </div>
        `;
      } else {
        statusDiv.innerHTML = `
          <div style="padding: 0.75rem; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; color: #856404;">
            <i class="fas fa-exclamation-triangle"></i> PIN not configured. Please set a PIN to enable business day management.
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading PIN status:', error);
      statusDiv.innerHTML = `
        <div style="padding: 0.75rem; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; color: #721c24;">
          <i class="fas fa-times-circle"></i> Error loading PIN status
        </div>
      `;
    }
  },

  /**
   * Handle PIN form submission
   */
  async handleSetPin(event) {
    event.preventDefault();

    const newPinInput = document.getElementById('new-pin');
    const confirmPinInput = document.getElementById('confirm-pin');

    if (!newPinInput || !confirmPinInput) return;

    const newPin = newPinInput.value.trim();
    const confirmPin = confirmPinInput.value.trim();

    // Validate PIN format
    if (!/^\d{4}$/.test(newPin)) {
      alert('PIN must be exactly 4 digits (0-9)');
      return;
    }

    // Validate PIN confirmation
    if (newPin !== confirmPin) {
      alert('PINs do not match. Please try again.');
      confirmPinInput.value = '';
      confirmPinInput.focus();
      return;
    }

    // Confirm action
    if (!confirm('Are you sure you want to set/change the business day PIN? This will affect all users who can open/close business days.')) {
      return;
    }

    try {
      const session = DB.getCurrentSession();
      if (!session) {
        alert('Session expired. Please login again.');
        return;
      }

      // Set the PIN
      await DB.setBusinessDayPin(newPin, session.userId);

      alert('Business day PIN has been set successfully!');

      // Clear form
      newPinInput.value = '';
      confirmPinInput.value = '';

      // Reload PIN status
      await this.loadPinStatus();

    } catch (error) {
      console.error('Error setting PIN:', error);
      alert(`Failed to set PIN: ${error.message}`);
    }
  },

  /**
   * Load business day history
   */
  async loadBusinessDayHistory() {
    const historyList = document.getElementById('business-day-history-list');
    if (!historyList) return;

    try {
      const businessDays = await DB.getAllBusinessDays();

      if (businessDays.length === 0) {
        historyList.innerHTML = '<li class="empty-list">No business days yet</li>';
        return;
      }

      // Show only last 10 days
      const recentDays = businessDays.slice(0, 10);

      historyList.innerHTML = recentDays.map(day => {
        const openedDate = day.openedAt?.toDate ? day.openedAt.toDate() : new Date(day.openedAt);
        const closedDate = day.closedAt ? (day.closedAt.toDate ? day.closedAt.toDate() : new Date(day.closedAt)) : null;

        const statusClass = day.status === 'active' ? 'status-active' : 'status-closed';
        const statusIcon = day.status === 'active' ? 'fa-check-circle' : 'fa-lock';

        return `
          <li>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong>${day.displayLabel}</strong>
                <span class="badge ${statusClass}" style="margin-left: 0.5rem;">
                  <i class="fas ${statusIcon}"></i> ${day.status.toUpperCase()}
                </span>
                <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
                  Opened: ${openedDate.toLocaleString()} by ${day.openedByName}
                  ${closedDate ? `<br>Closed: ${closedDate.toLocaleString()} by ${day.closedByName}` : ''}
                </div>
              </div>
            </div>
          </li>
        `;
      }).join('');

      // Add CSS for status badges if not exists
      if (!document.getElementById('business-day-history-styles')) {
        const styles = document.createElement('style');
        styles.id = 'business-day-history-styles';
        styles.textContent = `
          .badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: bold;
          }
          .status-active {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
          }
          .status-closed {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
          }
        `;
        document.head.appendChild(styles);
      }

    } catch (error) {
      console.error('Error loading business day history:', error);
      historyList.innerHTML = '<li class="empty-list">Error loading history</li>';
    }
  }
};

// Export the module and make it globally available
export default UsersModule;
window.UsersModule = UsersModule;