/**
 * User management module
 * Handles user creation, editing, and management (Admin only)
 */

const UsersModule = {
  // Initialize the users module
  init() {
    // Check if user is admin
    if (!DB.isAdmin()) {
      alert('Access denied. Admin privileges required.');
      return;
    }

    this.bindEvents();
    this.loadUsers();
    this.updateDriverDropdown();
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
  },

  // Handle role change in user form
  handleRoleChange() {
    const userRoleSelect = document.getElementById('user-role');
    const driverGroup = document.getElementById('user-driver-group');
    const driverSelect = document.getElementById('user-driver');

    if (userRoleSelect && driverGroup && driverSelect) {
      if (userRoleSelect.value === 'driver') {
        driverGroup.style.display = 'block';
        driverSelect.required = true;
      } else {
        driverGroup.style.display = 'none';
        driverSelect.required = false;
        driverSelect.value = '';
      }
    }
  },

  // Handle adding a new user
  async handleAddUser(event) {
    event.preventDefault();

    const usernameInput = document.getElementById('user-username');
    const passwordInput = document.getElementById('user-password');
    const nameInput = document.getElementById('user-name');
    const roleSelect = document.getElementById('user-role');
    const driverSelect = document.getElementById('user-driver');

    const userData = {
      username: usernameInput.value.trim(),
      password: passwordInput.value,
      name: nameInput.value.trim(),
      role: roleSelect.value
    };

    // Add driver link if role is driver
    if (userData.role === 'driver' && driverSelect.value) {
      userData.driverId = driverSelect.value;
    }

    try {
      const newUser = await DB.createUser(userData);
      
      // Reset form
      event.target.reset();
      this.handleRoleChange(); // Reset driver group visibility

      // Reload users list
      this.loadUsers();
      
      this.showNotification(`User "${newUser.username}" created successfully`);
    } catch (error) {
      alert(`Failed to create user: ${error.message}`);
    }
  },

  // Load and display users
  loadUsers() {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;

    const users = DB.getAllUsers();
    usersList.innerHTML = '';

    if (users.length === 0) {
      usersList.innerHTML = '<li class="empty-list">No users found.</li>';
      return;
    }

    users.forEach(user => {
      const li = document.createElement('li');
      
      // Get driver name if user is linked to a driver
      let driverInfo = '';
      if (user.role === 'driver' && user.driverId) {
        const driver = DB.getDriverById(user.driverId);
        driverInfo = driver ? ` → ${driver.name}` : ' → Driver not found';
      }

      const roleDisplayName = this.getRoleDisplayName(user.role);
      const statusBadge = user.isActive ? 
        '<span class="badge status-active">Active</span>' : 
        '<span class="badge status-inactive">Inactive</span>';

      li.innerHTML = `
        <div class="item-details">
          <strong>${user.name}</strong> (@${user.username})<br>
          <span>Role: ${roleDisplayName}${driverInfo}</span><br>
          <small>Created: ${new Date(user.createdAt).toLocaleDateString()}</small>
          ${user.lastLoginAt ? `<br><small>Last Login: ${new Date(user.lastLoginAt).toLocaleDateString()}</small>` : ''}
          <br>${statusBadge}
        </div>
        <div class="item-actions">
          ${user.isActive ? 
            `<button class="danger-button" onclick="UsersModule.deactivateUser('${user.id}')">Deactivate</button>` :
            `<button class="secondary-button" onclick="UsersModule.activateUser('${user.id}')">Activate</button>`
          }
          <button class="secondary-button" onclick="UsersModule.resetPassword('${user.id}')">Reset Password</button>
        </div>
      `;
      
      usersList.appendChild(li);
    });
  },

  // Update driver dropdown for user creation
  updateDriverDropdown() {
    const driverSelect = document.getElementById('user-driver');
    if (!driverSelect) return;

    const drivers = DB.getAllDrivers();
    const users = DB.getAllUsers();
    
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
        DB.deactivateUser(userId);
        this.loadUsers();
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
      this.loadUsers();
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
        await DB.updateUser(userId, { password: newPassword });
        this.showNotification('Password reset successfully');
        alert(`Password has been reset to: ${newPassword}\nPlease inform the user to change it on next login.`);
      } catch (error) {
        alert(`Failed to reset password: ${error.message}`);
      }
    } else if (newPassword !== null) {
      alert('Password must be at least 8 characters long');
    }
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