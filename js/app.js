/**
 * Main application module
 * Handles navigation, tab switching, and dashboard
 */

const AppModule = {
  // Initialize the application
  init() {
    // Load the default tab (dashboard)
    this.loadTab('dashboard');
    
    // Bind event listeners
    this.bindEvents();
    
    // Show welcome notification
    this.showNotification('Welcome to Inventory Manager!');
  },
  
  // Bind event listeners
  bindEvents() {
    // Tab navigation
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.dataset.tab;
        this.loadTab(tabId);
      });
    });
  },
  
  // Load a specific tab
  loadTab(tabId) {
    // Update active tab button
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      if (button.dataset.tab === tabId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // Get tab template and load content
    const template = document.getElementById(`${tabId}-template`);
    const mainContent = document.getElementById('main-content');
    
    if (template && mainContent) {
      mainContent.innerHTML = '';
      mainContent.appendChild(document.importNode(template.content, true));
      
      // Initialize module based on tab
      this.initModuleForTab(tabId);
    }
  },
  
  // Initialize the appropriate module for the current tab
  initModuleForTab(tabId) {
    switch (tabId) {
      case 'dashboard':
        if (typeof DashboardModule !== 'undefined') {
          DashboardModule.init();
        }
        break;
      case 'products':
        if (typeof ProductsModule !== 'undefined') {
          ProductsModule.init();
        }
        break;
      case 'drivers':
        if (typeof DriversModule !== 'undefined') {
          DriversModule.init();
        }
        break;
      case 'assign':
        if (typeof AssignmentsModule !== 'undefined') {
          AssignmentsModule.init();
        }
        break;
      case 'sales':
        if (typeof SalesModule !== 'undefined') {
          SalesModule.init();
        }
        break;
      case 'reports':
        if (typeof ReportsModule !== 'undefined') {
          ReportsModule.init();
        }
        break;
    }
  },
  
  // Show a notification to the user
  showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    // Add styles if they don't exist yet
    if (!document.getElementById('notification-styles')) {
      const styles = document.createElement('style');
      styles.id = 'notification-styles';
      styles.textContent = `
        .notification {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background-color: var(--primary-color);
          color: white;
          padding: 1rem;
          border-radius: var(--border-radius);
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
          z-index: 1000;
          transition: all 0.3s;
          opacity: 0;
          max-width: 90%;
          text-align: center;
        }
        .notification.show {
          opacity: 1;
        }
      `;
      document.head.appendChild(styles);
    }
    
    // Add to document
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Hide and remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  },
};

/**
 * Dashboard module
 * Handles displaying summary information and recent activity
 */
const DashboardModule = {
  // Initialize the dashboard
  init() {
    this.updateDashboard();
    this.loadRecentActivity();
  },
  
  // Update dashboard statistics
  updateDashboard() {
    // Update product count
    const productCount = document.getElementById('product-count');
    if (productCount) {
      const products = DB.getAllProducts();
      productCount.textContent = products.length;
    }
    
    // Update driver count
    const driverCount = document.getElementById('driver-count');
    if (driverCount) {
      const drivers = DB.getAllDrivers();
      driverCount.textContent = drivers.length;
    }
    
    // Update today's sales
    const todaySales = document.getElementById('today-sales');
    if (todaySales) {
      const amount = DB.getTodaySalesAmount();
      todaySales.textContent = `$${amount.toFixed(2)}`;
    }
    
    // Update total inventory
    const totalInventory = document.getElementById('total-inventory');
    if (totalInventory) {
      const count = DB.getTotalInventory();
      totalInventory.textContent = count;
    }
  },
  
  // Load recent activity (sales and assignments)
  loadRecentActivity() {
    const activityList = document.getElementById('recent-activity-list');
    if (!activityList) return;
    
    // Get recent sales
    const sales = DB.getAllSales();
    
    // Get recent assignments
    const assignments = DB.getAllAssignments();
    
    // Combine and sort by date
    const activities = [
      ...sales.map(sale => ({
        type: 'sale',
        date: new Date(sale.saleDate),
        data: sale
      })),
      ...assignments.map(assignment => ({
        type: 'assignment',
        date: new Date(assignment.assignedAt),
        data: assignment
      }))
    ];
    
    // Sort by date, newest first
    activities.sort((a, b) => b.date - a.date);
    
    // Take only the 10 most recent activities
    const recentActivities = activities.slice(0, 10);
    
    activityList.innerHTML = '';
    
    if (recentActivities.length === 0) {
      activityList.innerHTML = '<li class="empty-list">No recent activity.</li>';
      return;
    }
    
    // Display activities
    recentActivities.forEach(activity => {
      const li = document.createElement('li');
      
      const formattedDate = `${activity.date.toLocaleDateString()} ${activity.date.toLocaleTimeString()}`;
      
      if (activity.type === 'sale') {
        const sale = activity.data;
        const driver = DB.getDriverById(sale.driverId);
        if (!driver) return;
        
        li.innerHTML = `
          <i class="fas fa-cash-register activity-icon"></i>
          <div class="activity-details">
            <strong>Sale: $${sale.totalAmount.toFixed(2)}</strong><br>
            <span>Driver: ${driver.name}</span><br>
            <small>${formattedDate}</small>
          </div>
        `;
      } else if (activity.type === 'assignment') {
        const assignment = activity.data;
        const driver = DB.getDriverById(assignment.driverId);
        const product = DB.getProductById(assignment.productId);
        
        if (!driver || !product) return;
        
        li.innerHTML = `
          <i class="fas fa-truck-loading activity-icon"></i>
          <div class="activity-details">
            <strong>Assignment: ${product.name} (${assignment.quantity})</strong><br>
            <span>Driver: ${driver.name}</span><br>
            <small>${formattedDate}</small>
          </div>
        `;
      }
      
      activityList.appendChild(li);
    });
    
    // Add styles for activity list if they don't exist yet
    if (!document.getElementById('activity-styles')) {
      const styles = document.createElement('style');
      styles.id = 'activity-styles';
      styles.textContent = `
        .activity-icon {
          margin-right: 1rem;
          font-size: 1.2rem;
          color: var(--primary-color);
        }
        #recent-activity-list li {
          display: flex;
          align-items: center;
          padding: 0.8rem 0;
          border-bottom: 1px solid var(--border-color);
        }
        #recent-activity-list li:last-child {
          border-bottom: none;
        }
        .activity-details {
          flex-grow: 1;
        }
      `;
      document.head.appendChild(styles);
    }
  }
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  AppModule.init();
});
