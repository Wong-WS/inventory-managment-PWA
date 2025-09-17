/**
 * My Orders module for drivers
 * Provides a view-only interface for drivers to see their assigned orders
 */

const MyOrdersModule = {
  // Initialize the my orders module
  async init() {
    this.bindEvents();
    await this.loadMyOrders();
  },

  // Bind event listeners
  bindEvents() {
    // Order status filter
    const statusFilter = document.getElementById('my-order-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', this.loadMyOrders.bind(this));
    }
  },

  // Get the current driver's ID from session
  async getCurrentDriverId() {
    const session = DB.getCurrentSession();
    if (!session || session.role !== DB.ROLES.DRIVER) {
      return null;
    }

    try {
      // Get the current user from Firebase
      const user = await DB.getCurrentUser();
      if (!user) return null;

      // If user has a driverId field, use it directly
      if (user.driverId) {
        return user.driverId;
      }

      // Fallback: try to find driver by matching name
      const drivers = await DB.getAllDrivers();
      const matchingDriver = drivers.find(driver =>
        driver.name.toLowerCase() === user.name.toLowerCase()
      );

      return matchingDriver ? matchingDriver.id : null;
    } catch (error) {
      console.error('Error getting current driver ID:', error);
      return null;
    }
  },

  // Load and display driver's orders
  async loadMyOrders() {
    const ordersList = document.getElementById('my-orders-list');
    if (!ordersList) return;

    try {
      const statusFilter = document.getElementById('my-order-status-filter');
      const selectedStatus = statusFilter ? statusFilter.value : '';

      // Get current driver ID
      const driverId = await this.getCurrentDriverId();
      if (!driverId) {
        ordersList.innerHTML = '<li class="empty-list">No driver account linked to your user.</li>';
        return;
      }

      // Get orders for this driver
      let orders = await DB.getOrdersByDriver(driverId);
    
      // Apply status filter
      if (selectedStatus) {
        orders = orders.filter(order => order.status === selectedStatus);
      }

      ordersList.innerHTML = '';

      if (orders.length === 0) {
        const emptyMessage = selectedStatus
          ? `No ${selectedStatus} orders found.`
          : 'No orders assigned to you yet.';
        ordersList.innerHTML = `<li class="empty-list">${emptyMessage}</li>`;
        return;
      }

    // Sort by creation date, newest first
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    for (const order of orders) {
      const li = document.createElement('li');
      li.className = `order-item status-${order.status}`;

      const date = new Date(order.createdAt);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

      // Build line items display
      let lineItemsHtml = '';
      order.lineItems.forEach(item => {
        const giftBadge = item.isFreeGift ? '<span class="badge gift-badge">Free Gift</span>' : '';

        // Determine what to display for quantity
        let displayQuantity;
        if (item.category) {
          displayQuantity = item.category === 'Quantity by pcs' ? item.actualQuantity : item.category;
        } else {
          displayQuantity = item.quantity || item.actualQuantity;
        }

        const displayText = `${item.productName} x ${displayQuantity}`;
        lineItemsHtml += `
          <div class="order-line-item">
            ${displayText} ${giftBadge}
          </div>
        `;
      });

      // Status badge with appropriate styling
      const statusBadge = `<span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span>`;

      // Get sales rep info if available - handle async with fallback
      let salesRepInfo = '';
      try {
        const salesRep = order.salesRepId ? await DB.getUserById(order.salesRepId) : null;
        salesRepInfo = salesRep ? `<br><small>Order by: ${salesRep.name}</small>` : '';
      } catch (error) {
        // Fallback to show unknown if DB call fails
        salesRepInfo = order.salesRepId ? `<br><small>Order by: Unknown</small>` : '';
      }

      li.innerHTML = `
        <div class="order-details">
          <div class="order-header">
            <strong>$${order.totalAmount.toFixed(2)}</strong> ${statusBadge}
            ${salesRepInfo}
          </div>
          <div class="order-info">
            <div class="customer-info">
              <i class="fas fa-map-marker-alt"></i>
              <span>${order.customerAddress}</span>
              ${order.deliveryMethod ? `<span class="delivery-method"> • ${order.deliveryMethod}</span>` : ''}
            </div>
            ${order.customerDescription ? `<div class="customer-description"><small>${order.customerDescription}</small></div>` : ''}
            <div class="order-timestamps">
              <small>Created: ${formattedDate}</small>
              ${order.completedAt ? `<br><small>Completed: ${new Date(order.completedAt).toLocaleDateString()} ${new Date(order.completedAt).toLocaleTimeString()}</small>` : ''}
            </div>
          </div>
          <div class="order-line-items">
            <h4>Items:</h4>
            ${lineItemsHtml}
          </div>
        </div>
      `;

      ordersList.appendChild(li);
    }
    } catch (error) {
      ordersList.innerHTML = '<li class="empty-list">Error loading orders.</li>';
      console.error('Error loading my orders:', error);
    }
  },

  // Show notification (utility method)
  showNotification(message) {
    if (typeof AppModule !== 'undefined') {
      AppModule.showNotification(message);
    } else {
      console.log(message);
    }
  }
};

// Export the module and make it globally available
export default MyOrdersModule;
window.MyOrdersModule = MyOrdersModule;