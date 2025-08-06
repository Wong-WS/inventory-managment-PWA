/**
 * Authentication module
 * Handles login/logout functionality and UI management
 */

const AuthModule = {
  // Initialize authentication module
  init() {
    this.bindEvents();
    this.checkAuthentication();
  },

  // Bind event listeners
  bindEvents() {
    // Login form submission
    document.addEventListener('submit', (event) => {
      if (event.target.id === 'login-form') {
        event.preventDefault();
        this.handleLogin();
      }
    });

    // Logout button
    document.addEventListener('click', (event) => {
      if (event.target.id === 'logout-btn') {
        this.handleLogout();
      }
    });
  },

  // Check if user is authenticated on page load
  checkAuthentication() {
    const session = DB.getCurrentSession();
    
    if (session) {
      // User is authenticated, show app
      this.showApp(session);
      
      // Extend session on activity
      this.setupSessionExtension();
    } else {
      // User not authenticated, show login
      this.showLogin();
    }
  },

  // Show login screen
  showLogin() {
    const loginScreen = document.getElementById('login-screen');
    const appHeader = document.getElementById('app-header');
    const mainContent = document.getElementById('main-content');
    const tabNavigation = document.getElementById('tab-navigation');

    // Load login template
    const template = document.getElementById('login-template');
    if (template && loginScreen) {
      loginScreen.innerHTML = '';
      loginScreen.appendChild(document.importNode(template.content, true));
      loginScreen.style.display = 'block';
    }

    // Hide app components
    if (appHeader) appHeader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';
    if (tabNavigation) tabNavigation.style.display = 'none';
  },

  // Show main app
  showApp(session) {
    console.log('AuthModule.showApp() called with session:', session);
    
    const loginScreen = document.getElementById('login-screen');
    const appHeader = document.getElementById('app-header');
    const mainContent = document.getElementById('main-content');
    const tabNavigation = document.getElementById('tab-navigation');

    console.log('DOM elements found:', {
      loginScreen: !!loginScreen,
      appHeader: !!appHeader,
      mainContent: !!mainContent,
      tabNavigation: !!tabNavigation
    });

    // Validate all required DOM elements exist
    if (!tabNavigation) {
      console.error('Critical error: tab-navigation element not found');
      alert('Application UI failed to load. Please refresh the page.');
      return;
    }

    // Hide login screen
    if (loginScreen) loginScreen.style.display = 'none';

    // Show app components with explicit flex display
    if (appHeader) {
      appHeader.style.display = 'block';
    }
    if (mainContent) {
      mainContent.style.display = 'block';
    }
    if (tabNavigation) {
      tabNavigation.style.display = 'flex';
      console.log('Tab navigation display set to flex');
    }

    // Update user info in header
    this.updateUserInfo(session);

    // Setup role-based navigation - handle both session formats for compatibility
    const userRole = session.user ? session.user.role : session.role;
    console.log('Setting up navigation for user role:', userRole);
    
    // Wait for DOM to be fully rendered before setting up navigation
    setTimeout(() => {
      this.setupRoleBasedNavigation(userRole);
      
      // Verify tab visibility after setup
      const visibleTabs = document.querySelectorAll('.tab-button[style*="flex"]');
      console.log(`${visibleTabs.length} tabs should be visible for role ${userRole}`);
      
      if (visibleTabs.length === 0) {
        console.error('No tabs are visible after role setup!');
        // Force show all tabs for admin as fallback
        if (userRole === DB.ROLES.ADMIN) {
          document.querySelectorAll('.tab-button').forEach(tab => {
            tab.style.display = 'flex';
          });
        }
      }
    }, 10);

    // Initialize the main app - should now be available since script order is fixed
    if (typeof AppModule !== 'undefined' && typeof DashboardModule !== 'undefined') {
      console.log('Initializing AppModule...');
      AppModule.init();
    } else {
      console.error('AppModule or DashboardModule not available');
      alert('Application modules failed to load. Please refresh the page.');
    }
  },

  // Handle login form submission
  async handleLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorDiv = document.getElementById('login-error');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      this.showLoginError('Please enter both username and password');
      return;
    }

    try {
      // Show loading state
      const submitBtn = document.querySelector('#login-form button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Logging in...';
      submitBtn.disabled = true;

      const session = await DB.login(username, password);

      if (session) {
        // Login successful
        this.showApp(session);
        this.showNotification(`Welcome back, ${session.user.name}!`);
      } else {
        // Login failed
        this.showLoginError('Invalid username or password');
      }

      // Reset button state
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;

    } catch (error) {
      console.error('Login error:', error);
      this.showLoginError('Login failed. Please try again.');
      
      // Reset button state
      const submitBtn = document.querySelector('#login-form button[type="submit"]');
      submitBtn.textContent = 'Login';
      submitBtn.disabled = false;
    }
  },

  // Handle logout
  handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
      DB.logout();
      this.showLogin();
      this.showNotification('You have been logged out successfully');
    }
  },

  // Show login error message
  showLoginError(message) {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      
      // Hide error after 5 seconds
      setTimeout(() => {
        errorDiv.style.display = 'none';
      }, 5000);
    }
  },

  // Update user info in header
  updateUserInfo(session) {
    const userNameSpan = document.getElementById('current-user-name');
    const userRoleSpan = document.getElementById('current-user-role');

    if (userNameSpan && session.user) {
      userNameSpan.textContent = session.user.name;
    }

    // Handle both session.role and session.user.role formats
    const userRole = session.user ? session.user.role : session.role;
    if (userRoleSpan && userRole) {
      const roleDisplayName = this.getRoleDisplayName(userRole);
      userRoleSpan.textContent = roleDisplayName;
      userRoleSpan.className = `user-role role-${userRole}`;
    }
  },

  // Get display name for role
  getRoleDisplayName(role) {
    switch (role) {
      case DB.ROLES.ADMIN:
        return 'Administrator';
      case DB.ROLES.SALES_REP:
        return 'Sales Rep';
      case DB.ROLES.DRIVER:
        return 'Driver';
      default:
        return 'User';
    }
  },

  // Setup role-based navigation
  setupRoleBasedNavigation(userRole) {
    const tabButtons = document.querySelectorAll('.tab-button');
    console.log('Found tab buttons:', tabButtons.length);
    
    if (tabButtons.length === 0) {
      console.error('No tab buttons found in DOM!');
      return;
    }
    
    let visibleTabCount = 0;
    
    tabButtons.forEach(button => {
      const tabId = button.dataset.tab;
      const shouldShow = this.canAccessTab(tabId, userRole);
      
      console.log(`Tab ${tabId}: should show = ${shouldShow} for role ${userRole}`);
      
      if (shouldShow) {
        button.style.display = 'flex';
        button.style.visibility = 'visible';
        visibleTabCount++;
      } else {
        button.style.display = 'none';
        button.style.visibility = 'hidden';
      }
    });

    console.log(`Total visible tabs after setup: ${visibleTabCount}`);
    
    // Ensure admin can see all tabs as fallback
    if (userRole === DB.ROLES.ADMIN && visibleTabCount === 0) {
      console.warn('Admin has no visible tabs, enabling all tabs');
      tabButtons.forEach(button => {
        button.style.display = 'flex';
        button.style.visibility = 'visible';
      });
    }
  },

  // Check if user can access specific tab
  canAccessTab(tabId, userRole) {
    switch (userRole) {
      case DB.ROLES.ADMIN:
        // Admin can access all tabs
        return true;
        
      case DB.ROLES.SALES_REP:
        // Sales rep can only access dashboard and orders
        return ['dashboard', 'orders'].includes(tabId);
        
      case DB.ROLES.DRIVER:
        // Driver can access dashboard, my-orders, and my-inventory
        return ['dashboard', 'my-orders', 'my-inventory'].includes(tabId);
        
      default:
        return false;
    }
  },

  // Get default tab for user role
  getDefaultTab(userRole) {
    switch (userRole) {
      case DB.ROLES.ADMIN:
        return 'dashboard';
      case DB.ROLES.SALES_REP:
        return 'dashboard';
      case DB.ROLES.DRIVER:
        return 'dashboard';
      default:
        return 'dashboard';
    }
  },

  // Setup session extension on user activity
  setupSessionExtension() {
    const events = ['click', 'keypress', 'scroll', 'mousemove'];
    let lastActivity = Date.now();

    const handleActivity = () => {
      const now = Date.now();
      // Only extend session if 5 minutes have passed since last extension
      if (now - lastActivity > 5 * 60 * 1000) {
        DB.extendSession();
        lastActivity = now;
      }
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Check session validity every minute
    setInterval(() => {
      const session = DB.getCurrentSession();
      if (!session) {
        this.showLogin();
        this.showNotification('Your session has expired. Please login again.');
      }
    }, 60 * 1000);
  },

  // Show notification
  showNotification(message) {
    if (typeof AppModule !== 'undefined') {
      AppModule.showNotification(message);
    } else {
      console.log('Notification:', message);
    }
  },

  // Get current user role
  getCurrentUserRole() {
    const session = DB.getCurrentSession();
    return session ? session.role : null;
  },

  // Check if current user has required role
  hasRole(allowedRoles) {
    return DB.hasRole(allowedRoles);
  },

  // Check if current user is admin
  isAdmin() {
    return DB.isAdmin();
  }
};

// Initialize authentication when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  AuthModule.init();
});