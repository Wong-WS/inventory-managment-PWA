/**
 * Main application module
 * Handles navigation, tab switching, and dashboard
 */

// Import database
import { DB } from "./database.js";

const AppModule = {
  // Initialize the application
  init() {
    // Load the default tab (dashboard)
    this.loadTab("dashboard").catch((error) => {
      console.error("Error loading dashboard:", error);
    });

    // Bind event listeners
    this.bindEvents();

    // Show welcome notification
    this.showNotification("Welcome to Inventory Manager!");
  },


  // Bind event listeners
  bindEvents() {
    // Tab navigation
    const tabButtons = document.querySelectorAll(".tab-button");
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.dataset.tab;
        this.loadTab(tabId).catch((error) => {
          console.error("Error loading tab:", error);
        });
      });
    });
  },

  // Load a specific tab
  async loadTab(tabId) {
    // Update active tab button
    const tabButtons = document.querySelectorAll(".tab-button");

    tabButtons.forEach((button) => {
      if (button.dataset.tab === tabId) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });

    // Get tab template and load content
    const template = document.getElementById(`${tabId}-template`);
    const mainContent = document.getElementById("main-content");

    if (template && mainContent) {
      mainContent.innerHTML = "";
      mainContent.appendChild(document.importNode(template.content, true));

      // Initialize module based on tab
      this.initModuleForTab(tabId);
    } else {
      console.error(`Failed to load tab ${tabId}: template or mainContent not found`);
    }
  },

  // Initialize the appropriate module for the current tab
  async initModuleForTab(tabId) {
    // Check authentication before initializing modules
    const session = DB.getCurrentSession();
    if (!session) {
      return; // Not authenticated, don't initialize modules
    }

    // Check if user has access to this tab
    if (
      typeof AuthModule !== "undefined" &&
      !AuthModule.canAccessTab(tabId, session.role)
    ) {
      return; // User doesn't have access to this tab
    }

    try {
      switch (tabId) {
        case "dashboard":
          if (typeof DashboardModule !== "undefined") {
            await DashboardModule.init();
          }
          break;
        case "products":
          if (typeof ProductsModule !== "undefined") {
            await ProductsModule.init();
          }
          break;
        case "drivers":
          if (typeof DriversModule !== "undefined") {
            await DriversModule.init();
          }
          break;
        case "assign":
          if (typeof AssignmentsModule !== "undefined") {
            await AssignmentsModule.init();
          }
          break;
        case "sales":
          if (typeof SalesModule !== "undefined") {
            await SalesModule.init();
          }
          break;
        case "orders":
          if (typeof OrdersModule !== "undefined") {
            await OrdersModule.init();
          }
          break;
        case "my-orders":
          if (typeof MyOrdersModule !== "undefined") {
            await MyOrdersModule.init();
          }
          break;
        case "my-inventory":
          if (typeof MyInventoryModule !== "undefined") {
            await MyInventoryModule.init();
          }
          break;
        case "my-earnings":
          if (typeof MyEarningsModule !== "undefined") {
            await MyEarningsModule.init();
          }
          break;
        case "reports":
          if (typeof ReportsModule !== "undefined") {
            await ReportsModule.init();
          }
          break;
        case "users":
          if (typeof UsersModule !== "undefined") {
            await UsersModule.init();
          }
          break;
      }
    } catch (error) {
      console.error(`Error initializing ${tabId} module:`, error);
      this.showNotification(`Error loading ${tabId}. Please try again.`);
    }
  },

  // Show a notification to the user
  showNotification(message) {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;

    // Add styles if they don't exist yet
    if (!document.getElementById("notification-styles")) {
      const styles = document.createElement("style");
      styles.id = "notification-styles";
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
      notification.classList.add("show");
    }, 10);

    // Hide and remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove("show");
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
  async init() {
    await this.updateDashboard();
    await this.loadRecentActivity();
  },

  // Update dashboard statistics
  async updateDashboard() {
    const session = DB.getCurrentSession();
    if (!session) return;

    // Check if user is a driver
    if (session.role === DB.ROLES.DRIVER) {
      await this.updateDriverDashboard();
    } else {
      await this.updateAdminDashboard();
    }
  },

  // Update dashboard for drivers
  async updateDriverDashboard() {
    const dashboardContainer = document.querySelector(".dashboard-container");
    if (!dashboardContainer) return;

    // Get driver data
    const user = await DB.getCurrentUser();
    const driverId = user ? user.driverId : null;

    if (!driverId) {
      dashboardContainer.innerHTML =
        '<div class="error-message">Driver profile not properly configured. Please contact administrator.</div>';
      return;
    }

    // Get driver-specific data (temporarily simplified for Firebase migration)
    // TODO: These methods need to be converted to async Firebase
    const inventoryWithAlerts = [];
    const orderSummary = { todayOrders: 0, todayEarnings: 0, pendingOrders: 0 };

    // Count alerts
    const lowStockCount = inventoryWithAlerts.filter(
      (item) => item.isLowStock
    ).length;
    const outOfStockCount = inventoryWithAlerts.filter(
      (item) => item.isOutOfStock
    ).length;
    const totalAlerts = lowStockCount + outOfStockCount;

    // Get top low stock items (max 5)
    const lowStockItems = inventoryWithAlerts
      .filter((item) => item.isLowStock || item.isOutOfStock)
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 5);

    // Update dashboard cards with driver-specific content
    dashboardContainer.innerHTML = `
      <h2>Driver Dashboard</h2>
      <div class="dashboard-cards">
        <div class="card ${totalAlerts > 0 ? "alert-card" : ""}">
          <h3>Inventory Alerts</h3>
          <p>${totalAlerts}</p>
          <small>${outOfStockCount} out of stock, ${lowStockCount} low stock</small>
        </div>
        <div class="card">
          <h3>Today's Orders</h3>
          <p>${orderSummary.total}</p>
          <small>${orderSummary.pending.count} pending, ${
      orderSummary.completed.count
    } completed</small>
        </div>
        <div class="card ${
          orderSummary.pending.count > 0 ? "pending-card" : ""
        }">
          <h3>Pending Revenue</h3>
          <p>$${orderSummary.pending.totalAmount.toFixed(2)}</p>
          <small>From ${orderSummary.pending.count} pending orders</small>
        </div>
        <div class="card">
          <h3>Completed Today</h3>
          <p>$${orderSummary.completed.totalAmount.toFixed(2)}</p>
          <small>From ${orderSummary.completed.count} orders</small>
        </div>
      </div>
      
      ${
        lowStockItems.length > 0
          ? `
        <div class="low-stock-section">
          <h3>
            <i class="fas fa-exclamation-triangle"></i>
            Items Needing Attention
          </h3>
          <div class="low-stock-items">
            ${lowStockItems
              .map(
                (item) => `
              <div class="low-stock-item ${item.alertLevel}">
                <div class="item-info">
                  <strong>${item.productName}</strong>
                  <span class="quantity-info">
                    ${item.remaining} remaining
                    ${item.isOutOfStock ? " (OUT OF STOCK)" : " (LOW STOCK)"}
                  </span>
                </div>
                <div class="alert-indicator">
                  <i class="fas ${
                    item.isOutOfStock
                      ? "fa-times-circle"
                      : "fa-exclamation-circle"
                  }"></i>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `
          : ""
      }
      
      <div class="delivery-status">
        <h3>Quick Delivery Summary</h3>
        <div class="status-grid">
          <div class="status-item">
            <i class="fas fa-clock"></i>
            <span>Pending: ${orderSummary.pending.count}</span>
          </div>
          <div class="status-item">
            <i class="fas fa-check-circle"></i>
            <span>Completed: ${orderSummary.completed.count}</span>
          </div>
          <div class="status-item">
            <i class="fas fa-ban"></i>
            <span>Cancelled: ${orderSummary.cancelled.count}</span>
          </div>
        </div>
      </div>
    `;

    // Add driver dashboard specific styles
    this.addDriverDashboardStyles();
  },

  // Update dashboard for admin/sales rep users
  async updateAdminDashboard() {
    // Update product count
    const productCount = document.getElementById("product-count");
    if (productCount) {
      const products = await DB.getAllProducts();
      productCount.textContent = products.length;
    }

    // Update driver count
    const driverCount = document.getElementById("driver-count");
    if (driverCount) {
      const drivers = await DB.getAllDrivers();
      driverCount.textContent = drivers.length;
    }

    // Update today's sales (temporarily disabled for Firebase migration)
    const todaySales = document.getElementById("today-sales");
    if (todaySales) {
      todaySales.textContent = "$0.00";
    }

    // Update total inventory (temporarily disabled for Firebase migration)
    const totalInventory = document.getElementById("total-inventory");
    if (totalInventory) {
      totalInventory.textContent = "0";
    }
  },

  // Add styles specific to driver dashboard
  addDriverDashboardStyles() {
    if (document.getElementById("driver-dashboard-styles")) return;

    const styles = document.createElement("style");
    styles.id = "driver-dashboard-styles";
    styles.textContent = `
      .alert-card {
        border-left: 4px solid #e74c3c;
        background: linear-gradient(135deg, #fff5f5 0%, #ffffff 100%);
      }
      
      .pending-card {
        border-left: 4px solid #f39c12;
        background: linear-gradient(135deg, #fffbf0 0%, #ffffff 100%);
      }
      
      .dashboard-cards .card small {
        display: block;
        margin-top: 0.5rem;
        color: #666;
        font-size: 0.85rem;
      }
      
      .low-stock-section {
        margin: 2rem 0;
        padding: 1rem;
        border: 1px solid #e0e0e0;
        border-radius: var(--border-radius);
        background: #fafafa;
      }
      
      .low-stock-section h3 {
        color: #e74c3c;
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .low-stock-items {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      
      .low-stock-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        border-radius: var(--border-radius);
        background: white;
        border-left: 4px solid;
      }
      
      .low-stock-item.critical {
        border-left-color: #e74c3c;
        background: #fff5f5;
      }
      
      .low-stock-item.warning {
        border-left-color: #f39c12;
        background: #fffbf0;
      }
      
      .item-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      
      .quantity-info {
        font-size: 0.9rem;
        color: #666;
      }
      
      .alert-indicator {
        color: #e74c3c;
        font-size: 1.2rem;
      }
      
      .delivery-status {
        margin: 2rem 0;
        padding: 1rem;
        border: 1px solid #e0e0e0;
        border-radius: var(--border-radius);
        background: white;
      }
      
      .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      
      .status-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        background: #f8f9fa;
        border-radius: var(--border-radius);
        border: 1px solid #e9ecef;
      }
      
      .status-item i {
        color: var(--primary-color);
        width: 20px;
        text-align: center;
      }
      
      .error-message {
        padding: 2rem;
        text-align: center;
        color: #e74c3c;
        background: #fff5f5;
        border: 1px solid #e74c3c;
        border-radius: var(--border-radius);
        margin: 1rem 0;
      }
      
      /* Mobile optimizations */
      @media (max-width: 768px) {
        .dashboard-cards {
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }
        
        .dashboard-cards .card {
          padding: 1rem;
        }
        
        .dashboard-cards .card h3 {
          font-size: 0.9rem;
          margin-bottom: 0.5rem;
        }
        
        .dashboard-cards .card p {
          font-size: 1.5rem;
          margin-bottom: 0.25rem;
        }
        
        .low-stock-item {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.5rem;
        }
        
        .alert-indicator {
          align-self: flex-end;
        }
        
        .status-grid {
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }
        
        .status-item {
          padding: 0.5rem;
        }
      }
      
      @media (max-width: 480px) {
        .dashboard-cards {
          grid-template-columns: 1fr;
        }
        
        .low-stock-section, .delivery-status {
          margin: 1rem 0;
          padding: 0.75rem;
        }
      }
    `;
    document.head.appendChild(styles);
  },

  // Load recent activity (sales and assignments)
  async loadRecentActivity() {
    const activityList = document.getElementById("recent-activity-list");
    if (!activityList) return;

    const session = DB.getCurrentSession();
    if (!session) return;

    // For drivers, show only their own activity
    if (session.role === DB.ROLES.DRIVER) {
      await this.loadDriverRecentActivity(activityList);
    } else {
      await this.loadAdminRecentActivity(activityList);
    }
  },

  // Load recent activity for drivers (their own orders and assignments)
  async loadDriverRecentActivity(activityList) {
    const user = await DB.getCurrentUser();
    const driverId = user ? user.driverId : null;

    if (!driverId) {
      activityList.innerHTML =
        '<li class="empty-list">Driver profile not configured.</li>';
      return;
    }

    // Get driver's recent orders and assignments
    const driverOrders = await DB.getOrdersByDriver(driverId);
    const allAssignments = await DB.getAllAssignments();
    const driverAssignments = allAssignments.filter(
      (a) => a.driverId === driverId
    );

    // Combine and sort by date
    const activities = [
      ...driverOrders.map((order) => ({
        type: "order",
        date: new Date(order.createdAt),
        data: order,
      })),
      ...driverAssignments.map((assignment) => ({
        type: "assignment",
        date: new Date(assignment.assignedAt),
        data: assignment,
      })),
    ];

    // Sort by date, newest first
    activities.sort((a, b) => b.date - a.date);

    // Take only the 10 most recent activities
    const recentActivities = activities.slice(0, 10);

    activityList.innerHTML = "";

    if (recentActivities.length === 0) {
      activityList.innerHTML =
        '<li class="empty-list">No recent activity.</li>';
      return;
    }

    // Display activities
    for (const activity of recentActivities) {
      const li = document.createElement("li");

      const formattedDate = `${activity.date.toLocaleDateString()} ${activity.date.toLocaleTimeString()}`;

      if (activity.type === "order") {
        const order = activity.data;

        li.innerHTML = `
          <i class="fas fa-clipboard-list activity-icon"></i>
          <div class="activity-details">
            <strong>Order: $${order.totalAmount.toFixed(2)}</strong>
            <span class="status-badge status-${
              order.status
            }">${order.status.toUpperCase()}</span><br>
            <span>Customer: ${order.customerAddress}</span><br>
            <small>${formattedDate}</small>
          </div>
        `;
      } else if (activity.type === "assignment") {
        const assignment = activity.data;
        const product = await DB.getProductById(assignment.productId);

        if (!product) continue;

        li.innerHTML = `
          <i class="fas fa-truck-loading activity-icon"></i>
          <div class="activity-details">
            <strong>Received: ${product.name} (${assignment.quantity})</strong><br>
            <span>Added to your inventory</span><br>
            <small>${formattedDate}</small>
          </div>
        `;
      }

      activityList.appendChild(li);
    }

    this.addActivityListStyles();
  },

  // Load recent activity for admin/sales rep users (all activities)
  async loadAdminRecentActivity(activityList) {
    // Get recent orders and assignments (no longer show old sales)
    const orders = await DB.getAllOrders();
    const assignments = await DB.getAllAssignments();

    // Combine and sort by date
    const activities = [
      ...orders.map((order) => ({
        type: "order",
        date: new Date(order.createdAt),
        data: order,
      })),
      ...assignments.map((assignment) => ({
        type: "assignment",
        date: new Date(assignment.assignedAt),
        data: assignment,
      })),
    ];

    // Sort by date, newest first
    activities.sort((a, b) => b.date - a.date);

    // Take only the 10 most recent activities
    const recentActivities = activities.slice(0, 10);

    activityList.innerHTML = "";

    if (recentActivities.length === 0) {
      activityList.innerHTML =
        '<li class="empty-list">No recent activity.</li>';
      return;
    }

    // Display activities
    for (const activity of recentActivities) {
      const li = document.createElement("li");

      const formattedDate = `${activity.date.toLocaleDateString()} ${activity.date.toLocaleTimeString()}`;

      if (activity.type === "order") {
        const order = activity.data;
        const driver = await DB.getDriverById(order.driverId);
        if (!driver) continue;

        li.innerHTML = `
          <i class="fas fa-clipboard-list activity-icon"></i>
          <div class="activity-details">
            <strong>Order: $${order.totalAmount.toFixed(2)}</strong>
            <span class="status-badge status-${
              order.status
            }">${order.status.toUpperCase()}</span><br>
            <span>Driver: ${driver.name}</span><br>
            <small>${formattedDate}</small>
          </div>
        `;
      } else if (activity.type === "assignment") {
        const assignment = activity.data;
        const driver = await DB.getDriverById(assignment.driverId);
        const product = await DB.getProductById(assignment.productId);

        if (!driver || !product) continue;

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
    }

    this.addActivityListStyles();
  },

  // Add styles for activity list
  addActivityListStyles() {
    if (document.getElementById("activity-styles")) return;

    const styles = document.createElement("style");
    styles.id = "activity-styles";
    styles.textContent = `
      .activity-icon {
        margin-right: 1rem;
        font-size: 1.2rem;
        color: var(--primary-color);
        flex-shrink: 0;
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
        min-width: 0;
      }
      .status-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: bold;
        text-transform: uppercase;
        margin-left: 0.5rem;
      }
      .status-pending {
        background: #fff3cd;
        color: #856404;
        border: 1px solid #ffeaa7;
      }
      .status-completed {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
      }
      .status-cancelled {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
      }
      
      /* Mobile optimizations */
      @media (max-width: 768px) {
        #recent-activity-list li {
          padding: 0.6rem 0;
        }
        .activity-icon {
          margin-right: 0.75rem;
          font-size: 1rem;
        }
        .activity-details {
          font-size: 0.9rem;
        }
        .status-badge {
          font-size: 0.7rem;
          padding: 0.15rem 0.4rem;
        }
      }
    `;
    document.head.appendChild(styles);
  },
};

// Export modules for other modules to import
export { AppModule, DashboardModule };

// Make modules globally accessible for backward compatibility
window.AppModule = AppModule;
window.DashboardModule = DashboardModule;

// Note: App initialization is now handled by AuthModule after authentication
// The AppModule.init() will be called from AuthModule.showApp() after successful login
