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
    SALES: 'inventory_sales', // Kept for backward compatibility
    ORDERS: 'inventory_orders',
    USERS: 'inventory_users',
    SESSION: 'inventory_session',
    STOCK_TRANSFERS: 'inventory_stock_transfers',
  },

  // User roles enumeration
  ROLES: {
    ADMIN: 'admin',
    SALES_REP: 'sales_rep',
    DRIVER: 'driver'
  },

  // Order status enumeration
  ORDER_STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
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
    if (!localStorage.getItem(this.KEYS.ORDERS)) {
      localStorage.setItem(this.KEYS.ORDERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.USERS)) {
      localStorage.setItem(this.KEYS.USERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.KEYS.SESSION)) {
      localStorage.setItem(this.KEYS.SESSION, JSON.stringify(null));
    }
    if (!localStorage.getItem(this.KEYS.STOCK_TRANSFERS)) {
      localStorage.setItem(this.KEYS.STOCK_TRANSFERS, JSON.stringify([]));
    }
    
    // Create default admin user if no users exist
    await this.createDefaultAdmin();
    
    // Migrate sales to orders if needed
    await this.migrateSalesToOrders();
    
    // Migrate driver-user links if needed
    await this.migrateDriverUserLinks();
    
    // Fix existing driver users with missing driverId
    await this.fixDriverUserIds();
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
      driverId: user.driverId,
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
      driverId: user.driverId,
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
      driverId: userData.driverId || null,
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
      driverId: newUser.driverId,
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
          role: user.role,
          driverId: user.driverId
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
        // Update the session in storage to include the user object
        this.save(this.KEYS.SESSION, session);
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

  async addDriver(name, phone, options = {}) {
    const drivers = this.getAllDrivers();
    const newDriver = {
      id: this.generateId(),
      name,
      phone,
      linkedUserId: options.linkedUserId || null,
      createdAt: new Date().toISOString()
    };
    drivers.push(newDriver);
    this.save(this.KEYS.DRIVERS, drivers);

    // If creating a driver and requesting user account creation
    if (options.createUser && !options.linkedUserId) {
      try {
        // Generate a username based on the driver's name
        const baseUsername = name.toLowerCase().replace(/\s+/g, '');
        let username = baseUsername;
        let counter = 1;
        
        // Ensure username is unique
        while (this.getUserByUsername(username)) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        // Create user account with a default password
        const defaultPassword = 'Driver123!';
        const newUser = await this.createUser({
          username: username,
          password: defaultPassword,
          name: name,
          role: this.ROLES.DRIVER,
          driverId: newDriver.id
        });

        // Update driver with linked user ID
        newDriver.linkedUserId = newUser.id;
        this.save(this.KEYS.DRIVERS, drivers);

        return {
          driver: newDriver,
          user: newUser,
          credentials: { username, password: defaultPassword }
        };
      } catch (error) {
        // If user creation fails, the driver profile is still created
        console.error('Failed to create user account for driver:', error);
        return newDriver;
      }
    }

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

  // Sales reporting (kept for backward compatibility)
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
  },

  // ===============================
  // DRIVER-USER LINKING HELPER METHODS
  // ===============================

  /**
   * Get user by driver ID
   * @param {string} driverId - Driver ID
   * @returns {Object|null} User object or null
   */
  getUserByDriverId(driverId) {
    const users = this.getAll(this.KEYS.USERS);
    const user = users.find(u => u.driverId === driverId);
    return user ? this.getUserById(user.id) : null;
  },

  /**
   * Get driver by user ID
   * @param {string} userId - User ID
   * @returns {Object|null} Driver object or null
   */
  getDriverByUserId(userId) {
    const user = this.getUserById(userId);
    return user && user.driverId ? this.getDriverById(user.driverId) : null;
  },

  /**
   * Link existing user to existing driver
   * @param {string} userId - User ID
   * @param {string} driverId - Driver ID
   * @returns {boolean} Success status
   */
  async linkUserToDriver(userId, driverId) {
    const user = this.getUserById(userId);
    const driver = this.getDriverById(driverId);

    if (!user || !driver) {
      throw new Error('User or driver not found');
    }

    if (user.role !== this.ROLES.DRIVER) {
      throw new Error('User must have driver role to be linked to a driver profile');
    }

    // Check if driver is already linked
    const existingUser = this.getUserByDriverId(driverId);
    if (existingUser && existingUser.id !== userId) {
      throw new Error('Driver is already linked to another user');
    }

    // Check if user is already linked to another driver
    if (user.driverId && user.driverId !== driverId) {
      throw new Error('User is already linked to another driver');
    }

    // Update user with driver link
    await this.updateUser(userId, { driverId: driverId });

    // Update driver with user link
    this.updateDriver(driverId, { linkedUserId: userId });

    return true;
  },

  /**
   * Unlink user from driver
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  async unlinkUserFromDriver(userId) {
    const user = this.getUserById(userId);
    if (!user || !user.driverId) {
      return false;
    }

    const driverId = user.driverId;

    // Remove link from user
    await this.updateUser(userId, { driverId: null });

    // Remove link from driver
    this.updateDriver(driverId, { linkedUserId: null });

    return true;
  },

  // ===============================
  // DATA MIGRATION METHODS
  // ===============================

  /**
   * Migrate existing sales data to orders format
   * This method converts legacy sales to completed orders
   */
  async migrateSalesToOrders() {
    const orders = this.getAll(this.KEYS.ORDERS);
    const sales = this.getAll(this.KEYS.SALES);
    
    // Skip migration if orders already exist or no sales to migrate
    if (orders.length > 0 || sales.length === 0) {
      return;
    }
    
    console.log(`Migrating ${sales.length} sales records to orders...`);
    
    const migratedOrders = sales.map(sale => ({
      id: sale.id, // Keep original ID
      driverId: sale.driverId,
      salesRepId: sale.salesRepId || null, // If salesRepId exists in old data
      customerAddress: sale.customerAddress,
      customerDescription: sale.customerDescription || '',
      deliveryMethod: sale.deliveryMethod || 'Paid',
      totalAmount: sale.totalAmount,
      status: this.ORDER_STATUS.COMPLETED, // All existing sales become completed orders
      lineItems: sale.lineItems || [],
      createdAt: sale.saleDate, // Use original sale date as creation date
      updatedAt: sale.saleDate,
      completedAt: sale.saleDate // Mark as completed at the same time
    }));
    
    // Save migrated orders
    this.save(this.KEYS.ORDERS, migratedOrders);
    console.log(`Successfully migrated ${migratedOrders.length} orders`);
  },

  /**
   * Migrate existing driver-user links
   * This method adds driverId fields to existing users and linkedUserId to drivers
   */
  async migrateDriverUserLinks() {
    const users = this.getAll(this.KEYS.USERS);
    const drivers = this.getAll(this.KEYS.DRIVERS);
    
    let migratedUsers = 0;
    let migratedDrivers = 0;
    
    // Add driverId field to existing users if not present
    users.forEach(user => {
      if (user.driverId === undefined) {
        user.driverId = null;
        migratedUsers++;
      }
    });
    
    // Add linkedUserId field to existing drivers if not present
    drivers.forEach(driver => {
      if (driver.linkedUserId === undefined) {
        driver.linkedUserId = null;
        migratedDrivers++;
      }
    });
    
    // Save updated data if any migrations occurred
    if (migratedUsers > 0) {
      this.save(this.KEYS.USERS, users);
      console.log(`Migrated ${migratedUsers} user records with driverId field`);
    }
    
    if (migratedDrivers > 0) {
      this.save(this.KEYS.DRIVERS, drivers);
      console.log(`Migrated ${migratedDrivers} driver records with linkedUserId field`);
    }
    
    // Auto-link users and drivers with matching names (best effort)
    await this.autoLinkDriverUsers();
  },

  /**
   * Attempt to automatically link users and drivers with matching names
   */
  async autoLinkDriverUsers() {
    const users = this.getAll(this.KEYS.USERS);
    const drivers = this.getAll(this.KEYS.DRIVERS);
    
    const driverUsers = users.filter(user => 
      user.role === this.ROLES.DRIVER && 
      !user.driverId
    );
    
    const unlinkedDrivers = drivers.filter(driver => !driver.linkedUserId);
    
    let linkedCount = 0;
    
    for (const user of driverUsers) {
      // Try to find a driver with matching or similar name
      const matchingDriver = unlinkedDrivers.find(driver => {
        const userNameNormalized = user.name.toLowerCase().trim();
        const driverNameNormalized = driver.name.toLowerCase().trim();
        
        // Exact match or user name contains driver name or vice versa
        return userNameNormalized === driverNameNormalized ||
               userNameNormalized.includes(driverNameNormalized) ||
               driverNameNormalized.includes(userNameNormalized);
      });
      
      if (matchingDriver) {
        try {
          await this.linkUserToDriver(user.id, matchingDriver.id);
          linkedCount++;
          
          // Remove from unlinked list to prevent duplicate linking
          const index = unlinkedDrivers.indexOf(matchingDriver);
          if (index > -1) {
            unlinkedDrivers.splice(index, 1);
          }
        } catch (error) {
          console.warn(`Failed to auto-link user ${user.username} to driver ${matchingDriver.name}:`, error.message);
        }
      }
    }
    
    if (linkedCount > 0) {
      console.log(`Auto-linked ${linkedCount} driver users to driver profiles`);
    }
  },

  /**
   * Fix existing driver users that may have broken driverId fields
   * This method ensures all driver role users have proper driverId links
   */
  async fixDriverUserIds() {
    const users = this.getAll(this.KEYS.USERS);
    const drivers = this.getAll(this.KEYS.DRIVERS);
    
    let fixedCount = 0;
    let updated = false;
    
    // Check each user with driver role
    users.forEach(user => {
      if (user.role === this.ROLES.DRIVER) {
        // If user doesn't have driverId but a driver is linked to this user
        if (!user.driverId) {
          const linkedDriver = drivers.find(driver => driver.linkedUserId === user.id);
          if (linkedDriver) {
            user.driverId = linkedDriver.id;
            fixedCount++;
            updated = true;
            console.log(`Fixed missing driverId for user ${user.username}, linked to driver ${linkedDriver.name}`);
          }
        }
        
        // If user has driverId but the driver doesn't exist or isn't properly linked back
        if (user.driverId) {
          const driver = drivers.find(driver => driver.id === user.driverId);
          if (!driver) {
            // Driver doesn't exist, clear the driverId
            user.driverId = null;
            fixedCount++;
            updated = true;
            console.log(`Cleared invalid driverId for user ${user.username}`);
          } else if (driver.linkedUserId !== user.id) {
            // Driver exists but isn't properly linked back, fix the link
            driver.linkedUserId = user.id;
            updated = true;
            console.log(`Fixed driver link for driver ${driver.name} to user ${user.username}`);
          }
        }
      }
    });
    
    // Save if any updates were made
    if (updated) {
      this.save(this.KEYS.USERS, users);
      this.save(this.KEYS.DRIVERS, drivers);
      console.log(`Fixed ${fixedCount} driver user ID links`);
    }
  },

  // ===============================
  // ORDER MANAGEMENT METHODS
  // ===============================

  /**
   * Get all orders
   * @returns {Array} Array of order objects
   */
  getAllOrders() {
    return this.getAll(this.KEYS.ORDERS);
  },

  /**
   * Get order by ID
   * @param {string} id - Order ID
   * @returns {Object|null} Order object or null
   */
  getOrderById(id) {
    const orders = this.getAllOrders();
    return orders.find(order => order.id === id) || null;
  },

  /**
   * Get orders by driver ID
   * @param {string} driverId - Driver ID
   * @returns {Array} Array of orders for the driver
   */
  getOrdersByDriver(driverId) {
    const orders = this.getAllOrders();
    return orders.filter(order => order.driverId === driverId);
  },

  /**
   * Get orders by sales rep ID
   * @param {string} salesRepId - Sales rep ID
   * @returns {Array} Array of orders created by the sales rep
   */
  getOrdersBySalesRep(salesRepId) {
    const orders = this.getAllOrders();
    return orders.filter(order => order.salesRepId === salesRepId);
  },

  /**
   * Get orders by status
   * @param {string} status - Order status
   * @returns {Array} Array of orders with the specified status
   */
  getOrdersByStatus(status) {
    const orders = this.getAllOrders();
    return orders.filter(order => order.status === status);
  },

  /**
   * Get orders with filtering options
   * @param {Object} filters - Filter options
   * @param {string} filters.salesRepId - Filter by sales rep
   * @param {string} filters.driverId - Filter by driver
   * @param {string} filters.status - Filter by status
   * @param {Date} filters.startDate - Filter by start date
   * @param {Date} filters.endDate - Filter by end date
   * @returns {Array} Filtered orders
   */
  getOrdersWithFilters(filters = {}) {
    let orders = this.getAllOrders();
    
    if (filters.salesRepId) {
      orders = orders.filter(order => order.salesRepId === filters.salesRepId);
    }
    
    if (filters.driverId) {
      orders = orders.filter(order => order.driverId === filters.driverId);
    }
    
    if (filters.status) {
      orders = orders.filter(order => order.status === filters.status);
    }
    
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      orders = orders.filter(order => new Date(order.createdAt) >= startDate);
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      orders = orders.filter(order => new Date(order.createdAt) <= endDate);
    }
    
    return orders;
  },

  /**
   * Create a new order
   * @param {Object} orderData - Order data
   * @returns {Object} Created order object
   */
  createOrder(orderData) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active session found');
    }

    // Validate required fields
    if (!orderData.driverId || !orderData.customerAddress || !orderData.lineItems || orderData.lineItems.length === 0) {
      throw new Error('Missing required order fields');
    }

    // Validate inventory availability for all line items
    orderData.lineItems.forEach(item => {
      if (!item.isFreeGift) {
        const driverInventory = this.getDriverInventory(orderData.driverId);
        const productInventory = driverInventory.find(inv => inv.id === item.productId);
        
        if (!productInventory || productInventory.remaining < item.actualQuantity) {
          const product = this.getProductById(item.productId);
          throw new Error(`Insufficient inventory for ${product ? product.name : 'unknown product'}`);
        }
      }
    });

    const orders = this.getAllOrders();
    const newOrder = {
      id: this.generateId(),
      driverId: orderData.driverId,
      salesRepId: session.userId, // Track who created the order
      customerAddress: orderData.customerAddress.trim(),
      customerDescription: orderData.customerDescription ? orderData.customerDescription.trim() : '',
      deliveryMethod: orderData.deliveryMethod || 'Paid',
      totalAmount: parseFloat(orderData.totalAmount) || 0,
      status: this.ORDER_STATUS.PENDING,
      lineItems: orderData.lineItems || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    };

    orders.push(newOrder);
    this.save(this.KEYS.ORDERS, orders);

    // Update inventory by creating temporary sales entry for inventory calculation
    // This affects driver inventory immediately when order is created
    this.addSale({
      driverId: orderData.driverId,
      customerAddress: orderData.customerAddress,
      customerDescription: orderData.customerDescription,
      deliveryMethod: orderData.deliveryMethod,
      totalAmount: orderData.totalAmount,
      lineItems: orderData.lineItems,
      orderId: newOrder.id // Link to order for reference
    });

    return newOrder;
  },

  /**
   * Update an existing order
   * @param {string} id - Order ID
   * @param {Object} updates - Update data
   * @returns {Object|null} Updated order or null
   */
  updateOrder(id, updates) {
    const orders = this.getAllOrders();
    const index = orders.findIndex(order => order.id === id);
    
    if (index === -1) {
      return null;
    }

    const currentOrder = orders[index];
    
    // Prevent updating completed or cancelled orders unless changing status
    if ((currentOrder.status === this.ORDER_STATUS.COMPLETED || currentOrder.status === this.ORDER_STATUS.CANCELLED) 
        && !updates.hasOwnProperty('status')) {
      throw new Error('Cannot update completed or cancelled orders');
    }

    // Validate status transitions
    if (updates.status && !this.isValidStatusTransition(currentOrder.status, updates.status)) {
      throw new Error(`Invalid status transition from ${currentOrder.status} to ${updates.status}`);
    }

    // Handle inventory changes if line items are updated
    if (updates.lineItems && currentOrder.status === this.ORDER_STATUS.PENDING) {
      // This would require more complex inventory rollback logic
      // For now, we'll prevent line item updates on existing orders
      throw new Error('Line item updates not supported for existing orders. Cancel and create a new order instead.');
    }

    const updatedOrder = {
      ...currentOrder,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Set completion timestamp when marking as completed
    if (updates.status === this.ORDER_STATUS.COMPLETED && currentOrder.status !== this.ORDER_STATUS.COMPLETED) {
      updatedOrder.completedAt = new Date().toISOString();
    }

    orders[index] = updatedOrder;
    this.save(this.KEYS.ORDERS, orders);

    return updatedOrder;
  },

  /**
   * Cancel an order and restore inventory
   * @param {string} id - Order ID
   * @param {boolean} payDriver - Whether to pay the driver (default: false)
   * @returns {boolean} Success status
   */
  cancelOrder(id, payDriver = false) {
    const order = this.getOrderById(id);
    if (!order) {
      return false;
    }

    if (order.status !== this.ORDER_STATUS.PENDING) {
      throw new Error('Only pending orders can be cancelled');
    }

    // Remove the associated sale to restore inventory
    const sales = this.getAllSales();
    const saleIndex = sales.findIndex(sale => sale.orderId === id);
    if (saleIndex !== -1) {
      sales.splice(saleIndex, 1);
      this.save(this.KEYS.SALES, sales);
    }

    // Update order status and payment method based on driver payment choice
    const updateData = { 
      status: this.ORDER_STATUS.CANCELLED,
      cancelledAt: new Date().toISOString()
    };
    
    // If not paying driver, change delivery method to 'Free' for earnings calculation
    if (!payDriver) {
      updateData.deliveryMethod = 'Free';
    }
    
    this.updateOrder(id, updateData);

    return true;
  },

  /**
   * Complete an order
   * @param {string} id - Order ID
   * @returns {boolean} Success status
   */
  completeOrder(id) {
    const order = this.getOrderById(id);
    if (!order) {
      return false;
    }

    if (order.status !== this.ORDER_STATUS.PENDING) {
      throw new Error('Only pending orders can be completed');
    }

    this.updateOrder(id, { status: this.ORDER_STATUS.COMPLETED });
    return true;
  },

  /**
   * Validate order status transitions
   * @param {string} currentStatus - Current order status
   * @param {string} newStatus - New order status
   * @returns {boolean} True if transition is valid
   */
  isValidStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      [this.ORDER_STATUS.PENDING]: [this.ORDER_STATUS.COMPLETED, this.ORDER_STATUS.CANCELLED],
      [this.ORDER_STATUS.COMPLETED]: [], // Completed orders cannot change status
      [this.ORDER_STATUS.CANCELLED]: []  // Cancelled orders cannot change status
    };

    return validTransitions[currentStatus] && validTransitions[currentStatus].includes(newStatus);
  },

  /**
   * Get orders with advanced filtering options
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered orders
   */
  getOrdersWithFilters(filters = {}) {
    let orders = this.getAllOrders();
    
    // Filter by driver
    if (filters.driverId) {
      orders = orders.filter(order => order.driverId === filters.driverId);
    }
    
    // Filter by sales rep
    if (filters.salesRepId) {
      orders = orders.filter(order => order.salesRepId === filters.salesRepId);
    }
    
    // Filter by status
    if (filters.status) {
      orders = orders.filter(order => order.status === filters.status);
    }
    
    // Filter by period
    if (filters.period && filters.date) {
      const targetDate = new Date(filters.date);
      
      orders = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        
        switch(filters.period) {
          case 'day':
            return orderDate.toDateString() === targetDate.toDateString();
          case 'week':
            const weekStart = new Date(targetDate);
            weekStart.setDate(targetDate.getDate() - targetDate.getDay());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            return orderDate >= weekStart && orderDate <= weekEnd;
          case 'month':
            return orderDate.getMonth() === targetDate.getMonth() && 
                   orderDate.getFullYear() === targetDate.getFullYear();
          case 'year':
            return orderDate.getFullYear() === targetDate.getFullYear();
          default:
            return true;
        }
      });
    }
    
    return orders;
  },

  /**
   * Get orders by period (for reports compatibility)
   * @param {string} driverId - Driver ID (optional)
   * @param {string} period - Period type
   * @param {string} date - Target date
   * @returns {Array} Filtered orders
   */
  getOrdersByPeriod(driverId, period, date) {
    return this.getOrdersWithFilters({
      driverId: driverId,
      period: period,
      date: date,
      status: this.ORDER_STATUS.COMPLETED // Only show completed orders in reports
    });
  },

  /**
   * Get order statistics
   * @param {Object} filters - Optional filters (same as getOrdersWithFilters)
   * @returns {Object} Order statistics
   */
  getOrderStats(filters = {}) {
    const orders = this.getOrdersWithFilters(filters);
    
    const stats = {
      total: orders.length,
      pending: orders.filter(order => order.status === this.ORDER_STATUS.PENDING).length,
      completed: orders.filter(order => order.status === this.ORDER_STATUS.COMPLETED).length,
      cancelled: orders.filter(order => order.status === this.ORDER_STATUS.CANCELLED).length,
      totalAmount: orders.reduce((sum, order) => sum + order.totalAmount, 0),
      completedAmount: orders
        .filter(order => order.status === this.ORDER_STATUS.COMPLETED)
        .reduce((sum, order) => sum + order.totalAmount, 0)
    };

    return stats;
  },

  /**
   * Get today's order amount (for dashboard compatibility)
   * @returns {number} Total amount of today's completed orders
   */
  getTodayOrderAmount() {
    const today = new Date();
    const todayStr = today.toDateString();
    
    const todayOrders = this.getAllOrders().filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate.toDateString() === todayStr && order.status === this.ORDER_STATUS.COMPLETED;
    });
    
    return todayOrders.reduce((total, order) => total + order.totalAmount, 0);
  },

  // ===============================
  // DRIVER-SPECIFIC HELPER METHODS
  // ===============================

  /**
   * Get all orders assigned to a specific driver
   * @param {string} driverId - Driver ID to filter by
   * @returns {Array} Array of orders for the specified driver
   */
  getOrdersByDriver(driverId) {
    const orders = this.getAllOrders();
    return orders.filter(order => order.driverId === driverId);
  },

  /**
   * Get driver inventory with low stock alerts
   * @param {string} driverId - Driver ID
   * @param {number} threshold - Low stock threshold (default: 5)
   * @returns {Array} Driver inventory with alert flags
   */
  getDriverInventoryWithAlerts(driverId, threshold = 5) {
    const inventory = this.getDriverInventory(driverId);
    
    return inventory.map(item => ({
      ...item,
      isLowStock: item.remaining <= threshold && item.remaining > 0,
      isOutOfStock: item.remaining <= 0,
      alertLevel: item.remaining <= 0 ? 'critical' : 
                  item.remaining <= threshold ? 'warning' : 'normal'
    }));
  },

  /**
   * Get summary of driver's orders for today
   * @param {string} driverId - Driver ID
   * @returns {Object} Order summary with counts and totals
   */
  getDriverOrderSummary(driverId) {
    const today = new Date();
    const todayStr = today.toDateString();
    
    const driverOrders = this.getOrdersByDriver(driverId);
    const todayOrders = driverOrders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate.toDateString() === todayStr;
    });
    
    const pending = todayOrders.filter(order => order.status === this.ORDER_STATUS.PENDING);
    const completed = todayOrders.filter(order => order.status === this.ORDER_STATUS.COMPLETED);
    const cancelled = todayOrders.filter(order => order.status === this.ORDER_STATUS.CANCELLED);
    
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
        count: cancelled.length,
        totalAmount: cancelled.reduce((sum, order) => sum + order.totalAmount, 0)
      },
      totalAmount: todayOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      completedAmount: completed.reduce((sum, order) => sum + order.totalAmount, 0)
    };
  },

  // ============ STOCK TRANSFER METHODS ============

  // Transfer stock between drivers or collect back to main inventory
  transferStock(fromDriverId, toDriverId, productId, quantity) {
    if (!fromDriverId || !productId || !quantity || quantity <= 0) {
      throw new Error('Invalid transfer parameters');
    }

    // Check if source driver has sufficient stock
    const driverInventory = this.getDriverInventory(fromDriverId);
    const productInventory = driverInventory.find(item => item.id === productId);
    
    if (!productInventory || productInventory.remaining < quantity) {
      const product = this.getProductById(productId);
      const availableQty = productInventory ? productInventory.remaining : 0;
      throw new Error(`Insufficient stock. ${product?.name || 'Product'} has only ${availableQty} units available.`);
    }

    const transferId = this.generateId();
    const transferData = {
      id: transferId,
      fromDriverId,
      toDriverId: toDriverId === 'main-inventory' ? null : toDriverId,
      productId,
      quantity,
      transferType: toDriverId === 'main-inventory' ? 'collect' : 'transfer',
      transferredAt: new Date().toISOString(),
      createdBy: this.getCurrentSession()?.userId || null
    };

    // Record the transfer
    const transfers = this.getStockTransfers();
    transfers.push(transferData);
    localStorage.setItem(this.KEYS.STOCK_TRANSFERS, JSON.stringify(transfers));

    // Handle the actual stock movement
    if (toDriverId === 'main-inventory') {
      // Collect stock back to main inventory
      this.collectStockToMain(productId, quantity);
    } else {
      // Transfer to another driver (create new assignment)
      this.addAssignmentFromTransfer(toDriverId, productId, quantity);
    }

    return transferData;
  },

  // Collect stock back to main inventory
  collectStockToMain(productId, quantity) {
    const products = this.getAllProducts();
    const productIndex = products.findIndex(p => p.id === productId);
    
    if (productIndex === -1) {
      throw new Error('Product not found');
    }

    products[productIndex].totalQuantity += quantity;
    localStorage.setItem(this.KEYS.PRODUCTS, JSON.stringify(products));
  },

  // Add assignment from transfer (doesn't deduct from main inventory)
  addAssignmentFromTransfer(driverId, productId, quantity) {
    const assignmentId = this.generateId();
    const assignmentData = {
      id: assignmentId,
      driverId,
      productId,
      quantity,
      assignedAt: new Date().toISOString(),
      source: 'transfer' // Mark as transfer source
    };

    const assignments = this.getAllAssignments();
    assignments.push(assignmentData);
    localStorage.setItem(this.KEYS.ASSIGNMENTS, JSON.stringify(assignments));

    return assignmentData;
  },

  // Get all stock transfers
  getStockTransfers() {
    const transfers = localStorage.getItem(this.KEYS.STOCK_TRANSFERS);
    return transfers ? JSON.parse(transfers) : [];
  },

  // Get transfers filtered by driver (either from or to)
  getTransfersByDriver(driverId) {
    const transfers = this.getStockTransfers();
    return transfers.filter(transfer => 
      transfer.fromDriverId === driverId || transfer.toDriverId === driverId
    );
  }
};

// Initialize the database when script loads
DB.init().catch(error => {
  console.error('Database initialization failed:', error);
});
