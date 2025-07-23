/**
 * Database manager using localStorage
 * Handles CRUD operations for products, drivers, assignments and sales
 */

const DB = {
  // Storage keys
  KEYS: {
    PRODUCTS: 'inventory_products',
    DRIVERS: 'inventory_drivers',
    ASSIGNMENTS: 'inventory_assignments',
    SALES: 'inventory_sales',
  },

  // Initialize database
  init() {
    if (!localStorage.getItem(this.KEYS.PRODUCTS)) {
      localStorage.setItem(this.KEYS.PRODUCTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.DRIVERS)) {
      localStorage.setItem(this.KEYS.DRIVERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.ASSIGNMENTS)) {
      localStorage.setItem(this.KEYS.ASSIGNMENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.SALES)) {
      localStorage.setItem(this.KEYS.SALES, JSON.stringify([]));
    }
  },

  // Generate a unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  // Generic methods
  getAll(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
  },

  save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  // Products
  getAllProducts() {
    return this.getAll(this.KEYS.PRODUCTS);
  },

  getProductById(id) {
    const products = this.getAllProducts();
    return products.find(product => product.id === id);
  },

  addProduct(name, quantity) {
    const products = this.getAllProducts();
    const newProduct = {
      id: this.generateId(),
      name,
      totalQuantity: parseInt(quantity),
      createdAt: new Date().toISOString()
    };
    products.push(newProduct);
    this.save(this.KEYS.PRODUCTS, products);
    return newProduct;
  },

  updateProduct(id, updates) {
    const products = this.getAllProducts();
    const index = products.findIndex(product => product.id === id);
    if (index !== -1) {
      products[index] = { ...products[index], ...updates };
      this.save(this.KEYS.PRODUCTS, products);
      return products[index];
    }
    return null;
  },

  deleteProduct(id) {
    const products = this.getAllProducts();
    const filtered = products.filter(product => product.id !== id);
    this.save(this.KEYS.PRODUCTS, filtered);
  },

  // Drivers
  getAllDrivers() {
    return this.getAll(this.KEYS.DRIVERS);
  },

  getDriverById(id) {
    const drivers = this.getAllDrivers();
    return drivers.find(driver => driver.id === id);
  },

  addDriver(name, phone) {
    const drivers = this.getAllDrivers();
    const newDriver = {
      id: this.generateId(),
      name,
      phone,
      createdAt: new Date().toISOString()
    };
    drivers.push(newDriver);
    this.save(this.KEYS.DRIVERS, drivers);
    return newDriver;
  },

  updateDriver(id, updates) {
    const drivers = this.getAllDrivers();
    const index = drivers.findIndex(driver => driver.id === id);
    if (index !== -1) {
      drivers[index] = { ...drivers[index], ...updates };
      this.save(this.KEYS.DRIVERS, drivers);
      return drivers[index];
    }
    return null;
  },

  deleteDriver(id) {
    const drivers = this.getAllDrivers();
    const filtered = drivers.filter(driver => driver.id !== id);
    this.save(this.KEYS.DRIVERS, filtered);
  },

  // Assignments
  getAllAssignments() {
    return this.getAll(this.KEYS.ASSIGNMENTS);
  },

  getAssignmentsByDriver(driverId) {
    const assignments = this.getAllAssignments();
    return assignments.filter(assignment => assignment.driverId === driverId);
  },
  
  getAssignmentsByProduct(productId) {
    const assignments = this.getAllAssignments();
    return assignments.filter(assignment => assignment.productId === productId);
  },

  addAssignment(driverId, productId, quantity) {
    const assignments = this.getAllAssignments();
    const product = this.getProductById(productId);
    const quantityToAssign = parseInt(quantity);
    
    // Validate that the product exists
    if (!product) {
      throw new Error(`Product not found`);
    }
    
    // Validate that we have enough quantity in main inventory
    if (product.totalQuantity < quantityToAssign) {
      throw new Error(`Not enough quantity in stock. Available: ${product.totalQuantity}`);
    }
    
    // Deduct the assigned quantity from main product inventory
    this.updateProduct(productId, { 
      totalQuantity: product.totalQuantity - quantityToAssign 
    });
    
    const newAssignment = {
      id: this.generateId(),
      driverId,
      productId,
      quantity: quantityToAssign,
      assignedAt: new Date().toISOString()
    };
    
    assignments.push(newAssignment);
    this.save(this.KEYS.ASSIGNMENTS, assignments);
    return newAssignment;
  },

  // Sales
  getAllSales() {
    return this.getAll(this.KEYS.SALES);
  },

  getSaleById(id) {
    const sales = this.getAllSales();
    return sales.find(sale => sale.id === id);
  },
  
  getSalesByDriver(driverId) {
    const sales = this.getAllSales();
    return sales.filter(sale => sale.driverId === driverId);
  },
  
  addSale(saleData) {
    const sales = this.getAllSales();
    const newSale = {
      id: this.generateId(),
      ...saleData,
      saleDate: new Date().toISOString()
    };
    
    sales.push(newSale);
    this.save(this.KEYS.SALES, sales);
    return newSale;
  },

  // Inventory calculations
  getDriverInventory(driverId) {
    const assignments = this.getAssignmentsByDriver(driverId);
    const sales = this.getSalesByDriver(driverId);
    const products = this.getAllProducts();
    const inventory = {};
    
    // Initialize inventory with all products at 0
    products.forEach(product => {
      inventory[product.id] = {
        id: product.id,
        name: product.name,
        assigned: 0,
        sold: 0,
        remaining: 0
      };
    });
    
    // Add up all assignments
    assignments.forEach(assignment => {
      if (inventory[assignment.productId]) {
        inventory[assignment.productId].assigned += assignment.quantity;
      }
    });
    
    // Subtract all sales
    sales.forEach(sale => {
      sale.lineItems.forEach(item => {
        if (!item.isFreeGift && inventory[item.productId]) {
          // Use actualQuantity if available (new format), otherwise fall back to quantity (old format)
          const deductionAmount = item.actualQuantity !== undefined ? item.actualQuantity : item.quantity;
          inventory[item.productId].sold += deductionAmount;
        }
      });
    });
    
    // Calculate remaining
    Object.keys(inventory).forEach(productId => {
      inventory[productId].remaining = 
        inventory[productId].assigned - inventory[productId].sold;
    });
    
    return Object.values(inventory).filter(item => item.assigned > 0);
  },
  
  getTotalInventory() {
    const products = this.getAllProducts();
    let total = 0;
    
    products.forEach(product => {
      total += product.totalQuantity;
    });
    
    return total;
  },

  // Sales reporting
  getSalesByPeriod(driverId, period, date) {
    const sales = driverId ? this.getSalesByDriver(driverId) : this.getAllSales();
    const targetDate = date ? new Date(date) : new Date();
    
    // Filter sales based on period and date
    return sales.filter(sale => {
      const saleDate = new Date(sale.saleDate);
      
      switch(period) {
        case 'day':
          return saleDate.toDateString() === targetDate.toDateString();
        case 'week':
          const weekStart = new Date(targetDate);
          weekStart.setDate(targetDate.getDate() - targetDate.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          return saleDate >= weekStart && saleDate <= weekEnd;
        case 'month':
          return saleDate.getMonth() === targetDate.getMonth() && 
                 saleDate.getFullYear() === targetDate.getFullYear();
        case 'year':
          return saleDate.getFullYear() === targetDate.getFullYear();
        default:
          return true;
      }
    });
  },
  
  // Get today's sales total amount
  getTodaySalesAmount() {
    const todaySales = this.getSalesByPeriod(null, 'day');
    return todaySales.reduce((total, sale) => total + sale.totalAmount, 0);
  }
};

// Initialize the database when script loads
DB.init();
