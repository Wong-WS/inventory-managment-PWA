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
    USERS: 'inventory_users',
    SESSION: 'inventory_session',
  },

  // User roles enumeration
  ROLES: {
    ADMIN: 'admin',
    SALES_REP: 'sales_rep',
    DRIVER: 'driver'
  },

  // Session configuration
  SESSION_CONFIG: {
    TIMEOUT_MINUTES: 480, // 8 hours
    TOKEN_LENGTH: 32
  },

  // Initialize database
  async init() {
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
    if (!localStorage.getItem(this.KEYS.USERS)) {
      localStorage.setItem(this.KEYS.USERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.SESSION)) {
      localStorage.setItem(this.KEYS.SESSION, JSON.stringify(null));
    }
    
    // Create default admin user if no users exist
    await this.createDefaultAdmin();
  },

  // Generate a unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  },

  // Generic methods
  getAll(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
  },

  save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  // ===============================
  // SECURITY & CRYPTOGRAPHIC FUNCTIONS
  // ===============================

  /**
   * Generate secure salt for password hashing
   * @returns {string} Base64 encoded salt
   */
  async generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array));
  },

  /**
   * Hash password using PBKDF2 with Web Crypto API
   * @param {string} password - Plain text password
   * @param {string} salt - Base64 encoded salt
   * @returns {Promise<string>} Base64 encoded hash
   */
  async hashPassword(password, salt) {
    try {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      const saltBuffer = new Uint8Array(atob(salt).split('').map(char => char.charCodeAt(0)));
      
      const hashBuffer = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: 100000, // OWASP recommended minimum
          hash: 'SHA-256'
        },
        keyMaterial,
        256 // 32 bytes
      );

      return btoa(String.fromCharCode.apply(null, new Uint8Array(hashBuffer)));
    } catch (error) {
      console.error('Password hashing failed:', error);
      throw new Error('Password hashing failed');
    }
  },

  /**
   * Verify password against stored hash
   * @param {string} password - Plain text password
   * @param {string} salt - Base64 encoded salt
   * @param {string} hash - Base64 encoded stored hash
   * @returns {Promise<boolean>} True if password matches
   */
  async verifyPassword(password, salt, hash) {
    try {
      const newHash = await this.hashPassword(password, salt);
      return newHash === hash;
    } catch (error) {
      console.error('Password verification failed:', error);
      return false;
    }
  },

  /**
   * Generate cryptographically secure session token
   * @returns {string} Base64 encoded token
   */
  generateSecureToken() {
    const array = new Uint8Array(this.SESSION_CONFIG.TOKEN_LENGTH);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array));
  },

  /**
   * Validate user input data
   * @param {Object} userData - User data to validate
   * @returns {Object} Validation result
   */
  validateUserData(userData) {
    const errors = [];
    
    // Username validation
    if (!userData.username || typeof userData.username !== 'string') {
      errors.push('Username is required');
    } else if (userData.username.length < 3 || userData.username.length > 50) {
      errors.push('Username must be between 3 and 50 characters');
    } else if (!/^[a-zA-Z0-9_]+$/.test(userData.username)) {
      errors.push('Username can only contain letters, numbers, and underscores');
    }

    // Password validation (only for new users or password changes)
    if (userData.password !== undefined) {
      if (!userData.password || typeof userData.password !== 'string') {
        errors.push('Password is required');
      } else if (userData.password.length < 8) {
        errors.push('Password must be at least 8 characters long');
      } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(userData.password)) {
        errors.push('Password must contain at least one lowercase letter, one uppercase letter, and one number');
      }
    }

    // Role validation
    if (userData.role && !Object.values(this.ROLES).includes(userData.role)) {
      errors.push('Invalid role specified');
    }

    // Name validation
    if (userData.name !== undefined) {
      if (!userData.name || typeof userData.name !== 'string') {
        errors.push('Name is required');
      } else if (userData.name.length > 100) {
        errors.push('Name must be less than 100 characters');
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  },

  /**
   * Validate user update data (partial validation for updates)
   * @param {Object} updates - Update data to validate
   * @returns {Object} Validation result
   */
  validateUserUpdates(updates) {
    const errors = [];
    
    // Username validation (only if username is being updated)
    if (updates.username !== undefined) {
      if (!updates.username || typeof updates.username !== 'string') {
        errors.push('Username is required');
      } else if (updates.username.length < 3 || updates.username.length > 50) {
        errors.push('Username must be between 3 and 50 characters');
      } else if (!/^[a-zA-Z0-9_]+$/.test(updates.username)) {
        errors.push('Username can only contain letters, numbers, and underscores');
      }
    }

    // Password validation (only if password is being updated)
    if (updates.password !== undefined) {
      if (!updates.password || typeof updates.password !== 'string') {
        errors.push('Password is required');
      } else if (updates.password.length < 8) {
        errors.push('Password must be at least 8 characters long');
      } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(updates.password)) {
        errors.push('Password must contain at least one uppercase letter, one lowercase letter, and one number');
      }
    }

    // Name validation (only if name is being updated)
    if (updates.name !== undefined) {
      if (!updates.name || typeof updates.name !== 'string') {
        errors.push('Name is required');
      } else if (updates.name.length > 100) {
        errors.push('Name must be less than 100 characters');
      }
    }

    // Role validation (only if role is being updated)
    if (updates.role !== undefined) {
      if (!updates.role || !Object.values(this.ROLES).includes(updates.role)) {
        errors.push('Valid role is required');
      }
    }

    // For simple status updates like isActive, no validation needed
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  },

  // ===============================
  // USER MANAGEMENT METHODS
  // ===============================

  /**
   * Get all users (without sensitive data)
   * @returns {Array} Array of user objects without passwords/salts
   */
  getAllUsers() {
    const users = this.getAll(this.KEYS.USERS);
    return users.map(user => ({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    }));
  },

  /**
   * Get user by ID (without sensitive data)
   * @param {string} id - User ID
   * @returns {Object|null} User object or null
   */
  getUserById(id) {
    const users = this.getAll(this.KEYS.USERS);
    const user = users.find(u => u.id === id);
    if (!user) return null;
    
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    };
  },

  /**
   * Get user by username (internal use with sensitive data)
   * @param {string} username - Username
   * @returns {Object|null} Full user object or null
   */
  getUserByUsername(username) {
    const users = this.getAll(this.KEYS.USERS);
    return users.find(u => u.username === username) || null;
  },

  /**
   * Create a new user
   * @param {Object} userData - User data {username, password, name, role}
   * @returns {Promise<Object>} Created user object (without sensitive data)
   */
  async createUser(userData) {
    // Validate input
    const validation = this.validateUserData(userData);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Check if username already exists
    if (this.getUserByUsername(userData.username)) {
      throw new Error('Username already exists');
    }

    // Generate salt and hash password
    const salt = await this.generateSalt();
    const passwordHash = await this.hashPassword(userData.password, salt);

    const users = this.getAll(this.KEYS.USERS);
    const newUser = {
      id: this.generateId(),
      username: userData.username,
      name: userData.name || '',
      passwordHash: passwordHash,
      salt: salt,
      role: userData.role || this.ROLES.SALES_REP,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };

    users.push(newUser);
    this.save(this.KEYS.USERS, users);

    // Return user without sensitive data
    return {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      role: newUser.role,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt,
      lastLoginAt: newUser.lastLoginAt
    };
  },

  /**
   * Update user information
   * @param {string} id - User ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object|null>} Updated user object or null
   */
  async updateUser(id, updates) {
    const users = this.getAll(this.KEYS.USERS);
    const index = users.findIndex(u => u.id === id);
    
    if (index === -1) {
      return null;
    }

    // Validate updates (use partial validation for updates)
    const validation = this.validateUserUpdates(updates);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // If updating password, hash it
    if (updates.password) {
      const salt = await this.generateSalt();
      const passwordHash = await this.hashPassword(updates.password, salt);
      updates.passwordHash = passwordHash;
      updates.salt = salt;
      delete updates.password;
    }

    // Prevent username conflicts
    if (updates.username && updates.username !== users[index].username) {
      if (this.getUserByUsername(updates.username)) {
        throw new Error('Username already exists');
      }
    }

    users[index] = { ...users[index], ...updates };
    this.save(this.KEYS.USERS, users);

    return this.getUserById(id);
  },

  /**
   * Deactivate user (soft delete)
   * @param {string} id - User ID
   */
  deactivateUser(id) {
    const users = this.getAll(this.KEYS.USERS);
    const index = users.findIndex(u => u.id === id);
    
    if (index !== -1) {
      users[index].isActive = false;
      this.save(this.KEYS.USERS, users);
    }
  },

  /**
   * Create default admin user if no users exist
   */
  async createDefaultAdmin() {
    const users = this.getAll(this.KEYS.USERS);
    
    if (users.length === 0) {
      try {
        await this.createUser({
          username: 'admin',
          password: 'Admin123!', // Should be changed on first login
          name: 'System Administrator',
          role: this.ROLES.ADMIN
        });
        console.log('Default admin user created. Username: admin, Password: Admin123!');
      } catch (error) {
        console.error('Failed to create default admin user:', error);
      }
    }
  },

  // ===============================
  // SESSION MANAGEMENT METHODS
  // ===============================

  /**
   * Authenticate user and create session
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} Session data or null if authentication fails
   */
  async login(username, password) {
    try {
      const user = this.getUserByUsername(username);
      
      if (!user || !user.isActive) {
        return null;
      }

      const isValid = await this.verifyPassword(password, user.salt, user.passwordHash);
      
      if (!isValid) {
        return null;
      }

      // Create session
      const sessionToken = this.generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.SESSION_CONFIG.TIMEOUT_MINUTES);

      const sessionData = {
        token: sessionToken,
        userId: user.id,
        username: user.username,
        role: user.role,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString()
      };

      this.save(this.KEYS.SESSION, sessionData);

      // Update last login time
      const users = this.getAll(this.KEYS.USERS);
      const userIndex = users.findIndex(u => u.id === user.id);
      if (userIndex !== -1) {
        users[userIndex].lastLoginAt = new Date().toISOString();
        this.save(this.KEYS.USERS, users);
      }

      return {
        token: sessionToken,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        },
        role: user.role, // Add role directly to session for backward compatibility
        expiresAt: sessionData.expiresAt
      };
    } catch (error) {
      console.error('Login failed:', error);
      return null;
    }
  },

  /**
   * Get current session if valid
   * @returns {Object|null} Current session data or null
   */
  getCurrentSession() {
    const session = JSON.parse(localStorage.getItem(this.KEYS.SESSION));
    
    if (!session || !session.token) {
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    
    if (now >= expiresAt) {
      this.logout();
      return null;
    }

    // Ensure we have user object for compatibility
    if (!session.user && session.userId) {
      const user = this.getUserById(session.userId);
      if (user) {
        session.user = user;
      }
    }

    return session;
  },

  /**
   * Validate session token
   * @param {string} token - Session token
   * @returns {boolean} True if token is valid
   */
  validateSession(token) {
    const session = this.getCurrentSession();
    return session && session.token === token;
  },

  /**
   * Extend current session
   */
  extendSession() {
    const session = this.getCurrentSession();
    
    if (session) {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.SESSION_CONFIG.TIMEOUT_MINUTES);
      
      session.expiresAt = expiresAt.toISOString();
      this.save(this.KEYS.SESSION, session);
    }
  },

  /**
   * Logout and clear session
   */
  logout() {
    this.save(this.KEYS.SESSION, null);
  },

  /**
   * Check if current user has required role
   * @param {string|Array} allowedRoles - Single role or array of roles
   * @returns {boolean} True if user has permission
   */
  hasRole(allowedRoles) {
    const session = this.getCurrentSession();
    
    if (!session) {
      return false;
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return roles.includes(session.role);
  },

  /**
   * Check if current user is admin
   * @returns {boolean} True if user is admin
   */
  isAdmin() {
    return this.hasRole(this.ROLES.ADMIN);
  },

  /**
   * Get current logged-in user
   * @returns {Object|null} Current user or null
   */
  getCurrentUser() {
    const session = this.getCurrentSession();
    return session ? this.getUserById(session.userId) : null;
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
DB.init().catch(error => {
  console.error('Database initialization failed:', error);
});
