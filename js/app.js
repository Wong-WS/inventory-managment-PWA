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
    // Cleanup listeners from previous tab (if leaving dashboard)
    if (this.currentTab !== tabId && typeof DashboardModule !== "undefined") {
      // Clean up all Firebase listeners to prevent memory leaks and unnecessary reads
      DB.cleanupAllListeners();
    }

    // Store current tab
    this.currentTab = tabId;

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
  // Listener tracking variables
  ordersListenerUnsubscribe: null,
  assignmentsListenerUnsubscribe: null,
  productsListenerUnsubscribe: null,
  driversListenerUnsubscribe: null,
  dashboardListenersInitialized: false,

  // Cached data from listeners
  cachedOrders: [],
  cachedAssignments: [],

  // Initialize the dashboard
  async init() {
    await this.updateDashboard();

    // Setup real-time listeners for recent activity
    await this.loadRecentActivity();

    // Setup dashboard listeners (for stats)
    await this.setupDashboardListeners();

    // If listeners are already initialized (returning to dashboard tab),
    // manually trigger recent activity update with cached data
    if (this.dashboardListenersInitialized) {
      await this.updateRecentActivityDisplay();
    }
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
    console.log('updateDriverDashboard called');
    const dashboardContainer = document.querySelector(".dashboard-container");
    if (!dashboardContainer) {
      console.log('Dashboard container not found');
      return;
    }

    // Get driver data
    const user = await DB.getCurrentUser();
    const driverId = user ? user.driverId : null;
    console.log('Driver data:', { user, driverId });

    if (!driverId) {
      dashboardContainer.innerHTML =
        '<div class="error-message">Driver profile not properly configured. Please contact administrator.</div>';
      return;
    }

    // Get driver-specific data
    console.log('Getting driver inventory and order summary...');
    const inventoryWithAlerts = await this.getDriverInventoryWithAlerts(driverId);
    const orderSummary = await this.getDriverOrderSummary(driverId);
    console.log('Got data:', { inventoryWithAlerts, orderSummary });

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
                  <strong>${item.name}</strong>
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

    // Update today's sales
    const todaySales = document.getElementById("today-sales");
    if (todaySales) {
      const todayOrders = await this.getTodayCompletedOrders();
      const totalSales = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0);
      todaySales.textContent = `$${totalSales.toFixed(2)}`;
    }

    // Update total inventory
    const totalInventory = document.getElementById("total-inventory");
    if (totalInventory) {
      const products = await DB.getAllProducts();
      const total = products.reduce((sum, product) => sum + (product.totalQuantity || 0), 0);
      totalInventory.textContent = total;
    }
  },

  // Get driver inventory with low stock alerts
  async getDriverInventoryWithAlerts(driverId) {
    try {
      const inventory = await DB.getDriverInventory(driverId);

      return inventory.map(item => {
        const isOutOfStock = item.remaining <= 0;
        const isLowStock = item.remaining > 0 && item.remaining <= 5; // Consider low stock if 5 or fewer

        return {
          ...item,
          isOutOfStock,
          isLowStock,
          alertLevel: isOutOfStock ? 'critical' : (isLowStock ? 'warning' : 'normal')
        };
      });
    } catch (error) {
      console.error('Error getting driver inventory with alerts:', error);
      return [];
    }
  },

  // Get driver order summary for today
  async getDriverOrderSummary(driverId) {
    try {
      console.log('Dashboard - Getting orders for driver:', driverId);
      const orders = await DB.getOrdersByDriver(driverId);
      console.log('Dashboard - Found orders:', orders);

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      // Filter orders for today
      const todayOrders = orders.filter(order => {
        // Handle Firebase Timestamp properly
        const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        const isToday = orderDate >= todayStart && orderDate < todayEnd;
        console.log('Dashboard - Order date check:', {
          orderId: order.id,
          orderDate: orderDate,
          isToday: isToday
        });
        return isToday;
      });

      console.log('Dashboard - Today orders:', todayOrders);

      // Calculate summary
      const pending = todayOrders.filter(order => order.status === DB.ORDER_STATUS.PENDING);
      const completed = todayOrders.filter(order => order.status === DB.ORDER_STATUS.COMPLETED);
      const cancelled = todayOrders.filter(order => order.status === DB.ORDER_STATUS.CANCELLED);

      console.log('Dashboard - Order status counts:', {
        total: todayOrders.length,
        pending: pending.length,
        completed: completed.length,
        cancelled: cancelled.length
      });

      const pendingAmount = pending.reduce((sum, order) => sum + order.totalAmount, 0);
      const completedAmount = completed.reduce((sum, order) => sum + order.totalAmount, 0);

      const summary = {
        total: todayOrders.length,
        pending: {
          count: pending.length,
          totalAmount: pendingAmount
        },
        completed: {
          count: completed.length,
          totalAmount: completedAmount
        },
        cancelled: {
          count: cancelled.length
        }
      };

      console.log('Dashboard - Final summary:', summary);
      return summary;
    } catch (error) {
      console.error('Error getting driver order summary:', error);
      return {
        total: 0,
        pending: { count: 0, totalAmount: 0 },
        completed: { count: 0, totalAmount: 0 },
        cancelled: { count: 0 }
      };
    }
  },

  // Get today's completed orders for admin dashboard
  async getTodayCompletedOrders() {
    try {
      const allOrders = await DB.getAllOrders();
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      // Filter to today's completed orders
      const todayCompletedOrders = allOrders.filter(order => {
        if (order.status !== DB.ORDER_STATUS.COMPLETED) return false;

        // Use completedAt if available, otherwise createdAt
        const orderDate = order.completedAt?.toDate ? order.completedAt.toDate() :
                         (order.completedAt ? new Date(order.completedAt) :
                         (order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt)));

        return orderDate >= todayStart && orderDate < todayEnd;
      });

      return todayCompletedOrders;
    } catch (error) {
      console.error('Error getting today\'s completed orders:', error);
      return [];
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

  // Load recent activity for drivers (their own orders and assignments) - using real-time listeners
  async loadDriverRecentActivity(activityList) {
    const user = await DB.getCurrentUser();
    const driverId = user ? user.driverId : null;

    if (!driverId) {
      activityList.innerHTML =
        '<li class="empty-list">Driver profile not configured.</li>';
      return;
    }

    // Temporary storage for orders and assignments
    let ordersData = [];
    let assignmentsData = [];
    let updateTimeout = null;

    // Function to combine and display activities (debounced)
    const updateActivitiesDisplay = () => {
      // Clear any pending update
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }

      // Debounce to wait for both listeners to fire
      updateTimeout = setTimeout(async () => {
        const activities = [
          ...ordersData.map((order) => ({
            type: "order",
            date: order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt),
            data: order,
          })),
          ...assignmentsData.map((assignment) => ({
            type: "assignment",
            date: assignment.assignedAt?.toDate ? assignment.assignedAt.toDate() : new Date(assignment.assignedAt),
            data: assignment,
          })),
        ];

        // Sort by date, newest first
        activities.sort((a, b) => b.date - a.date);

        // Store all activities for load more functionality
        this.allActivities = activities;
        this.displayedActivityCount = Math.min(5, activities.length);

        // Use shared display method
        await this.displayActivities(activityList, true);
      }, 100); // Wait 100ms for both listeners to fire
    };

    // Setup real-time listener for driver orders
    DB.listenToRecentDriverOrders(driverId, { recentDays: 3, limit: 30 }, (orders) => {
      ordersData = orders;
      updateActivitiesDisplay();
    });

    // Setup real-time listener for driver assignments
    DB.listenToRecentAssignments({ recentDays: 3, driverId: driverId, limit: 30 }, (assignments) => {
      assignmentsData = assignments;
      updateActivitiesDisplay();
    });
  },

  // Load recent activity for admin/sales rep users (all activities) - using real-time listeners
  async loadAdminRecentActivity(activityList) {
    const session = DB.getCurrentSession();
    const isAdmin = session && session.role === DB.ROLES.ADMIN;

    // Temporary storage for orders and assignments
    let ordersData = [];
    let assignmentsData = [];
    let updateTimeout = null;

    // Function to combine and display activities (debounced)
    const updateActivitiesDisplay = () => {
      // Clear any pending update
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }

      // Debounce to wait for both listeners to fire
      updateTimeout = setTimeout(async () => {
        const activities = [
          ...ordersData.map((order) => ({
            type: "order",
            date: order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt),
            data: order,
          }))
        ];

        if (isAdmin) {
          activities.push(...assignmentsData.map((assignment) => ({
            type: "assignment",
            date: assignment.assignedAt?.toDate ? assignment.assignedAt.toDate() : new Date(assignment.assignedAt),
            data: assignment,
          })));
        }

        // Sort by date, newest first
        activities.sort((a, b) => b.date - a.date);

        // Store all activities for load more functionality
        this.allActivities = activities;
        this.displayedActivityCount = Math.min(5, activities.length);

        // Use shared display method
        await this.displayActivities(activityList, false);
      }, 100); // Wait 100ms for both listeners to fire
    };

    // Setup real-time listener for orders
    DB.listenToRecentOrders({ recentDays: 3, limit: 50 }, (orders) => {
      ordersData = orders;
      updateActivitiesDisplay();
    });

    // Setup real-time listener for assignments (admins only)
    if (isAdmin) {
      DB.listenToRecentAssignments({ recentDays: 3, limit: 50 }, (assignments) => {
        assignmentsData = assignments;
        updateActivitiesDisplay();
      });
    }
  },

  // Update load more button visibility and handler
  updateLoadMoreButton() {
    const loadMoreBtn = document.getElementById('load-more-activities');
    if (!loadMoreBtn) return;

    // Show button if there are more activities to display
    if (this.allActivities && this.displayedActivityCount < this.allActivities.length) {
      loadMoreBtn.style.display = 'block';
      loadMoreBtn.textContent = `Load More (${this.allActivities.length - this.displayedActivityCount} remaining)`;

      // Remove old event listener and add new one
      const newBtn = loadMoreBtn.cloneNode(true);
      loadMoreBtn.parentNode.replaceChild(newBtn, loadMoreBtn);

      newBtn.addEventListener('click', () => {
        this.loadMoreActivities();
      });
    } else {
      loadMoreBtn.style.display = 'none';
    }
  },

  // Load more activities when button is clicked
  async loadMoreActivities() {
    if (!this.allActivities) return;

    // Increase displayed count by 10 (or remaining amount)
    const remainingCount = this.allActivities.length - this.displayedActivityCount;
    this.displayedActivityCount += Math.min(10, remainingCount);

    // Re-render the activities with updated count
    const activityList = document.getElementById('recent-activity-list');
    if (!activityList) return;

    const session = DB.getCurrentSession();
    if (!session) return;

    // Re-display activities without resetting the count
    await this.displayActivities(activityList, session.role === DB.ROLES.DRIVER);
  },

  // Display activities in the list (shared by driver and admin)
  async displayActivities(activityList, isDriver = false) {
    if (!this.allActivities || this.allActivities.length === 0) {
      activityList.innerHTML = '<li class="empty-list">No recent activity.</li>';
      this.updateLoadMoreButton();
      return;
    }

    // Slice activities based on current displayed count
    const activitiesToShow = this.allActivities.slice(0, this.displayedActivityCount);

    activityList.innerHTML = "";

    // Collect all unique driver and product IDs for bulk fetching
    const driverIds = new Set();
    const productIds = new Set();

    activitiesToShow.forEach(activity => {
      if (activity.type === "order" && !isDriver) {
        driverIds.add(activity.data.driverId);
      } else if (activity.type === "assignment") {
        productIds.add(activity.data.productId);
        if (!isDriver) {
          driverIds.add(activity.data.driverId);
        }
      }
    });

    // Bulk fetch all needed data in parallel
    const [drivers, products] = await Promise.all([
      driverIds.size > 0 ? Promise.all([...driverIds].map(id => DB.getDriverById(id))) : Promise.resolve([]),
      productIds.size > 0 ? Promise.all([...productIds].map(id => DB.getProductById(id))) : Promise.resolve([])
    ]);

    // Create lookup maps for instant access
    const driverMap = new Map(drivers.filter(d => d).map(d => [d.id, d]));
    const productMap = new Map(products.filter(p => p).map(p => [p.id, p]));

    // Display activities
    for (const activity of activitiesToShow) {
      const li = document.createElement("li");
      const formattedDate = `${activity.date.toLocaleDateString()} ${activity.date.toLocaleTimeString()}`;

      if (activity.type === "order") {
        const order = activity.data;

        // Generate short order ID (last 6 characters)
        const orderId = order.id.slice(-6).toUpperCase();

        if (isDriver) {
          // Driver view - show customer info
          li.innerHTML = `
            <i class="fas fa-clipboard-list activity-icon"></i>
            <div class="activity-details">
              <strong>Order #${orderId}: $${order.totalAmount.toFixed(2)}</strong>
              <span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span><br>
              <span>Customer: ${order.customerAddress}</span><br>
              <small>${formattedDate}</small>
            </div>
          `;
        } else {
          // Admin view - show driver info
          const driver = driverMap.get(order.driverId);
          if (!driver) continue;

          li.innerHTML = `
            <i class="fas fa-clipboard-list activity-icon"></i>
            <div class="activity-details">
              <strong>Order #${orderId}: $${order.totalAmount.toFixed(2)}</strong>
              <span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span><br>
              <span>Driver: ${driver.name}</span><br>
              <small>${formattedDate}</small>
            </div>
          `;
        }
      } else if (activity.type === "assignment") {
        const assignment = activity.data;
        const product = productMap.get(assignment.productId);
        if (!product) continue;

        if (isDriver) {
          // Driver view - show received items
          li.innerHTML = `
            <i class="fas fa-truck-loading activity-icon"></i>
            <div class="activity-details">
              <strong>Received: ${product.name} (${assignment.quantity})</strong><br>
              <span>Added to your inventory</span><br>
              <small>${formattedDate}</small>
            </div>
          `;
        } else {
          // Admin view - show driver and product
          const driver = driverMap.get(assignment.driverId);
          if (!driver) continue;

          li.innerHTML = `
            <i class="fas fa-truck-loading activity-icon"></i>
            <div class="activity-details">
              <strong>Assignment: ${product.name} (${assignment.quantity})</strong><br>
              <span>Driver: ${driver.name}</span><br>
              <small>${formattedDate}</small>
            </div>
          `;
        }
      }

      activityList.appendChild(li);
    }

    // Update load more button
    this.updateLoadMoreButton();
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

  // Cleanup dashboard listeners
  cleanupDashboardListeners() {
    if (this.ordersListenerUnsubscribe) {
      this.ordersListenerUnsubscribe();
      this.ordersListenerUnsubscribe = null;
    }
    if (this.assignmentsListenerUnsubscribe) {
      this.assignmentsListenerUnsubscribe();
      this.assignmentsListenerUnsubscribe = null;
    }
    if (this.productsListenerUnsubscribe) {
      this.productsListenerUnsubscribe();
      this.productsListenerUnsubscribe = null;
    }
    if (this.driversListenerUnsubscribe) {
      this.driversListenerUnsubscribe();
      this.driversListenerUnsubscribe = null;
    }
    this.dashboardListenersInitialized = false;
  },

  // Setup real-time dashboard listeners
  async setupDashboardListeners() {
    // Guard: Only set up listeners once per session
    if (this.dashboardListenersInitialized) {
      return;
    }

    const session = DB.getCurrentSession();
    if (!session) return;

    // Listen to orders for dashboard stats only
    // NOTE: Recent activity now has its own dedicated listeners via loadRecentActivity()
    this.ordersListenerUnsubscribe = DB.listenToOrders(async (orders) => {
      // Cache orders data
      this.cachedOrders = orders;

      // Update dashboard stats when orders change
      await this.updateDashboardFromOrders(orders);
    });

    // Listen to assignments for caching only
    // NOTE: Recent activity now has its own dedicated listeners via loadRecentActivity()
    this.assignmentsListenerUnsubscribe = DB.listenToAssignments(async (assignments) => {
      // Cache assignments data
      this.cachedAssignments = assignments;
    });

    // For admin/sales rep dashboards, also listen to products and drivers
    if (session.role !== DB.ROLES.DRIVER) {
      this.productsListenerUnsubscribe = DB.listenToProducts(async (products) => {
        this.updateProductCountFromProducts(products);
      });

      this.driversListenerUnsubscribe = DB.listenToDrivers(async (drivers) => {
        this.updateDriverCountFromDrivers(drivers);
      });
    }

    // Mark listeners as initialized
    this.dashboardListenersInitialized = true;
  },

  // Update dashboard statistics from real-time orders data
  async updateDashboardFromOrders(orders) {
    const session = DB.getCurrentSession();
    if (!session) return;

    if (session.role === DB.ROLES.DRIVER) {
      // For drivers, recalculate and update their dashboard
      const user = await DB.getCurrentUser();
      const driverId = user ? user.driverId : null;

      if (driverId) {
        const driverOrders = orders.filter(order => order.driverId === driverId);
        const orderSummary = this.calculateDriverOrderSummary(driverOrders);
        this.updateDriverDashboardCards(orderSummary);
      }
    } else {
      // For admin/sales rep, update order-related stats
      this.updateAdminOrderStats(orders);
    }
  },

  // Calculate driver order summary from orders array
  calculateDriverOrderSummary(orders) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Filter orders for today
    const todayOrders = orders.filter(order => {
      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      return orderDate >= todayStart && orderDate < todayEnd;
    });

    // Calculate summary
    const pending = todayOrders.filter(order => order.status === DB.ORDER_STATUS.PENDING);
    const completed = todayOrders.filter(order => order.status === DB.ORDER_STATUS.COMPLETED);
    const cancelled = todayOrders.filter(order => order.status === DB.ORDER_STATUS.CANCELLED);

    return {
      total: todayOrders.length,
      pending: {
        count: pending.length,
        totalAmount: pending.reduce((sum, order) => sum + order.totalAmount, 0)
      },
      completed: {
        count: completed.length,
        totalAmount: completed.reduce((sum, order) => sum + order.totalAmount, 0)
      },
      cancelled: {
        count: cancelled.length
      }
    };
  },

  // Update driver dashboard cards with new order summary
  updateDriverDashboardCards(orderSummary) {
    // Update today's orders card
    const orderCards = document.querySelectorAll('.dashboard-cards .card');
    if (orderCards.length >= 2) {
      const todayOrdersCard = orderCards[1];
      const orderCountElement = todayOrdersCard.querySelector('p');
      const orderDetailsElement = todayOrdersCard.querySelector('small');

      if (orderCountElement) orderCountElement.textContent = orderSummary.total;
      if (orderDetailsElement) {
        orderDetailsElement.textContent = `${orderSummary.pending.count} pending, ${orderSummary.completed.count} completed`;
      }
    }

    // Update pending revenue card
    if (orderCards.length >= 3) {
      const pendingCard = orderCards[2];
      const pendingAmountElement = pendingCard.querySelector('p');
      const pendingDetailsElement = pendingCard.querySelector('small');

      if (pendingAmountElement) pendingAmountElement.textContent = `$${orderSummary.pending.totalAmount.toFixed(2)}`;
      if (pendingDetailsElement) {
        pendingDetailsElement.textContent = `From ${orderSummary.pending.count} pending orders`;
      }

      // Update card styling based on pending count
      pendingCard.className = `card ${orderSummary.pending.count > 0 ? 'pending-card' : ''}`;
    }

    // Update completed today card
    if (orderCards.length >= 4) {
      const completedCard = orderCards[3];
      const completedAmountElement = completedCard.querySelector('p');
      const completedDetailsElement = completedCard.querySelector('small');

      if (completedAmountElement) completedAmountElement.textContent = `$${orderSummary.completed.totalAmount.toFixed(2)}`;
      if (completedDetailsElement) {
        completedDetailsElement.textContent = `From ${orderSummary.completed.count} orders`;
      }
    }

    // Update delivery status section
    const statusGrid = document.querySelector('.status-grid');
    if (statusGrid) {
      const statusItems = statusGrid.querySelectorAll('.status-item span');
      if (statusItems.length >= 3) {
        statusItems[0].textContent = `Pending: ${orderSummary.pending.count}`;
        statusItems[1].textContent = `Completed: ${orderSummary.completed.count}`;
        statusItems[2].textContent = `Cancelled: ${orderSummary.cancelled.count}`;
      }
    }
  },

  // Update admin dashboard order stats
  updateAdminOrderStats(orders) {
    // Calculate today's completed order total
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayCompletedOrders = orders.filter(order => {
      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      return orderDate >= todayStart && orderDate < todayEnd && order.status === DB.ORDER_STATUS.COMPLETED;
    });

    const todayTotal = todayCompletedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Update today's sales display
    const todaySalesElement = document.getElementById("today-sales");
    if (todaySalesElement) {
      todaySalesElement.textContent = `$${todayTotal.toFixed(2)}`;
    }
  },

  // Update product count from real-time products data
  updateProductCountFromProducts(products) {
    const productCount = document.getElementById("product-count");
    if (productCount) {
      productCount.textContent = products.length;
    }
  },

  // Update driver count from real-time drivers data
  updateDriverCountFromDrivers(drivers) {
    const driverCount = document.getElementById("driver-count");
    if (driverCount) {
      driverCount.textContent = drivers.length;
    }
  },

  // Update recent activity from real-time orders data
  updateRecentActivityFromOrders(orders) {
    // Debounce the update to avoid too many calls
    clearTimeout(this.updateRecentActivityTimeout);
    this.updateRecentActivityTimeout = setTimeout(() => this.updateRecentActivityDisplay(), 500);
  },

  // Update recent activity from real-time assignments data
  updateRecentActivityFromAssignments(assignments) {
    // Debounce the update to avoid too many calls
    clearTimeout(this.updateRecentActivityTimeout);
    this.updateRecentActivityTimeout = setTimeout(() => this.updateRecentActivityDisplay(), 500);
  },

  // Update recent activity display with real-time data
  async updateRecentActivityDisplay() {
    // Prevent concurrent updates
    if (this.isUpdatingActivity) return;
    this.isUpdatingActivity = true;

    const activityList = document.getElementById("recent-activity-list");
    if (!activityList) {
      this.isUpdatingActivity = false;
      return;
    }

    const session = DB.getCurrentSession();
    if (!session) {
      this.isUpdatingActivity = false;
      return;
    }

    // Always clear the list first to prevent duplicates
    activityList.innerHTML = "";

    // Use cached data from listeners (much faster than fetching from Firebase)
    let activities = [];

    if (session.role === DB.ROLES.DRIVER) {
      const user = await DB.getCurrentUser();
      const driverId = user ? user.driverId : null;

      if (driverId) {
        // Filter cached data for this driver
        const driverOrders = this.cachedOrders.filter(order => order.driverId === driverId);
        const driverAssignments = this.cachedAssignments.filter(assignment => assignment.driverId === driverId);

        activities = [
          ...driverOrders.map((order) => ({
            type: "order",
            date: order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt),
            data: order,
          })),
          ...driverAssignments.map((assignment) => ({
            type: "assignment",
            date: assignment.assignedAt?.toDate ? assignment.assignedAt.toDate() : new Date(assignment.assignedAt),
            data: assignment,
          })),
        ];
      }
    } else {
      // Admin/sales rep sees activities (sales reps: orders only, admins: orders + assignments)
      const isAdmin = session.role === DB.ROLES.ADMIN;

      // Filter cached orders for today only
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      const todayOrders = this.cachedOrders.filter(order => {
        const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        return orderDate >= todayStart && orderDate < todayEnd;
      });

      activities = [
        ...todayOrders.map((order) => ({
          type: "order",
          date: order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt),
          data: order,
        }))
      ];

      // Only admins see assignments in recent activity
      if (isAdmin) {
        const todayAssignments = this.cachedAssignments.filter(assignment => {
          const assignmentDate = assignment.assignedAt?.toDate ? assignment.assignedAt.toDate() : new Date(assignment.assignedAt);
          return assignmentDate >= todayStart && assignmentDate < todayEnd;
        });

        activities.push(...todayAssignments.map((assignment) => ({
          type: "assignment",
          date: assignment.assignedAt?.toDate ? assignment.assignedAt.toDate() : new Date(assignment.assignedAt),
          data: assignment,
        })));
      }
    }

    // Sort by date, newest first
    activities.sort((a, b) => b.date - a.date);

    // Store all activities for load more functionality
    this.allActivities = activities;

    // Initialize displayed count if not set, or keep existing value
    if (!this.displayedActivityCount || this.displayedActivityCount > activities.length) {
      this.displayedActivityCount = Math.min(5, activities.length);
    }

    // Take only the activities to display based on displayedActivityCount
    const recentActivities = activities.slice(0, this.displayedActivityCount);

    if (recentActivities.length === 0) {
      activityList.innerHTML = '<li class="empty-list">No recent activity.</li>';
      this.isUpdatingActivity = false;
      return;
    }

    // Collect all unique driver and product IDs for bulk fetching
    const driverIds = new Set();
    const productIds = new Set();

    recentActivities.forEach(activity => {
      if (activity.type === "order") {
        driverIds.add(activity.data.driverId);
      } else if (activity.type === "assignment") {
        driverIds.add(activity.data.driverId);
        productIds.add(activity.data.productId);
      }
    });

    // Bulk fetch all needed data in parallel (much faster than sequential queries)
    const [drivers, products] = await Promise.all([
      Promise.all([...driverIds].map(id => DB.getDriverById(id))),
      Promise.all([...productIds].map(id => DB.getProductById(id)))
    ]);

    // Create lookup maps for instant access (O(1) vs O(n) database query)
    const driverMap = new Map(drivers.filter(d => d).map(d => [d.id, d]));
    const productMap = new Map(products.filter(p => p).map(p => [p.id, p]));

    // Display activities
    for (const activity of recentActivities) {
      const li = document.createElement("li");
      const formattedDate = `${activity.date.toLocaleDateString()} ${activity.date.toLocaleTimeString()}`;

      if (activity.type === "order") {
        const order = activity.data;

        if (session.role === DB.ROLES.DRIVER) {
          li.innerHTML = `
            <i class="fas fa-clipboard-list activity-icon"></i>
            <div class="activity-details">
              <strong>Order: $${order.totalAmount.toFixed(2)}</strong>
              <span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span><br>
              <span>Customer: ${order.customerAddress}</span><br>
              <small>${formattedDate}</small>
            </div>
          `;
        } else {
          const driver = driverMap.get(order.driverId);
          if (driver) {
            li.innerHTML = `
              <i class="fas fa-clipboard-list activity-icon"></i>
              <div class="activity-details">
                <strong>Order: $${order.totalAmount.toFixed(2)}</strong>
                <span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span><br>
                <span>Driver: ${driver.name}</span><br>
                <small>${formattedDate}</small>
              </div>
            `;
          }
        }
      } else if (activity.type === "assignment") {
        const assignment = activity.data;
        const product = productMap.get(assignment.productId);

        if (product) {
          if (session.role === DB.ROLES.DRIVER) {
            li.innerHTML = `
              <i class="fas fa-truck-loading activity-icon"></i>
              <div class="activity-details">
                <strong>Received: ${product.name} (${assignment.quantity})</strong><br>
                <span>Added to your inventory</span><br>
                <small>${formattedDate}</small>
              </div>
            `;
          } else {
            const driver = driverMap.get(assignment.driverId);
            if (driver) {
              li.innerHTML = `
                <i class="fas fa-truck-loading activity-icon"></i>
                <div class="activity-details">
                  <strong>Assignment: ${product.name} (${assignment.quantity})</strong><br>
                  <span>Driver: ${driver.name}</span><br>
                  <small>${formattedDate}</small>
                </div>
              `;
            }
          }
        }
      }

      if (li.innerHTML.trim()) {
        activityList.appendChild(li);
      }
    }

    // Show/hide load more button
    this.updateLoadMoreButton();

    this.addActivityListStyles();

    // Release the lock
    this.isUpdatingActivity = false;
  },
};

// Export modules for other modules to import
export { AppModule, DashboardModule };

// Make modules globally accessible for backward compatibility
window.AppModule = AppModule;
window.DashboardModule = DashboardModule;

// Note: App initialization is now handled by AuthModule after authentication
// The AppModule.init() will be called from AuthModule.showApp() after successful login
