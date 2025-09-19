/**
 * Database manager using Firebase Firestore
 * Handles CRUD operations for products, drivers, assignments and sales
 */

// Import Firebase services
import { db } from './firebase-config.js';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

export const DB = {
  // Firestore collection names
  COLLECTIONS: {
    PRODUCTS: 'products',
    DRIVERS: 'drivers',
    ASSIGNMENTS: 'assignments',
    SALES: 'sales', // Kept for backward compatibility
    ORDERS: 'orders',
    USERS: 'users',
    SESSIONS: 'sessions',
    STOCK_TRANSFERS: 'stock_transfers',
  },

  // Legacy keys for backwards compatibility
  KEYS: {
    PRODUCTS: 'products',
    DRIVERS: 'drivers',
    ASSIGNMENTS: 'assignments',
    SALES: 'sales',
    ORDERS: 'orders',
    USERS: 'users',
    SESSION: 'sessions',
    STOCK_TRANSFERS: 'stock_transfers',
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
    try {
      // Set up localStorage for sessions (Firebase doesn't handle client sessions)
      if (!localStorage.getItem('inventory_session')) {
        localStorage.setItem('inventory_session', JSON.stringify(null));
      }

      // Create default admin user if no users exist
      await this.createDefaultAdmin();
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  },

  // Generate a unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  },

  // Generic methods (Firebase versions)
  async getAll(collectionName) {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Error getting ${collectionName}:`, error);
      return [];
    }
  },

  async save(collectionName, data) {
    try {
      // For backwards compatibility, this method is no longer used
      // Individual add/update methods are preferred
      console.warn('save() method is deprecated, use add/update methods instead');
    } catch (error) {
      console.error(`Error saving to ${collectionName}:`, error);
    }
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
  async getAllUsers() {
    const users = await this.getAll(this.COLLECTIONS.USERS);
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
  async getUserById(id) {
    try {
      const docRef = doc(db, this.COLLECTIONS.USERS, id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;
      
      const user = docSnap.data();
      return {
        id: docSnap.id,
        username: user.username,
        name: user.name,
        role: user.role,
        driverId: user.driverId,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      };
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  },

  /**
   * Get user by username (internal use with sensitive data)
   * @param {string} username - Username
   * @returns {Object|null} Full user object or null
   */
  async getUserByUsername(username) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.USERS),
        where("username", "==", username)
      );
      const snapshot = await getDocs(q);
      return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } catch (error) {
      console.error('Error getting user by username:', error);
      return null;
    }
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
    if (await this.getUserByUsername(userData.username)) {
      throw new Error('Username already exists');
    }

    // Generate salt and hash password
    const salt = await this.generateSalt();
    const passwordHash = await this.hashPassword(userData.password, salt);

    // Create user in Firebase
    const newUserData = {
      username: userData.username,
      name: userData.name || '',
      passwordHash: passwordHash,
      salt: salt,
      role: userData.role || this.ROLES.SALES_REP,
      driverId: userData.driverId || null,
      isActive: true,
      createdAt: serverTimestamp(),
      lastLoginAt: null
    };

    const docRef = await addDoc(collection(db, this.COLLECTIONS.USERS), newUserData);
    const newUser = { id: docRef.id, ...newUserData, createdAt: new Date().toISOString() };

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
    try {
      const docRef = doc(db, this.COLLECTIONS.USERS, id);
      await updateDoc(docRef, updates);
      
      // Return updated user
      const updatedDoc = await getDoc(docRef);
      return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } : null;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  async updateUserOld(id, updates) {
    const users = await this.getAll(this.COLLECTIONS.USERS);
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
    const users = await this.getAll(this.COLLECTIONS.USERS);
    
    if (users.length === 0) {
      try {
        await this.createUser({
          username: 'admin',
          password: 'Admin123!', // Should be changed on first login
          name: 'System Administrator',
          role: this.ROLES.ADMIN
        });
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
      const user = await this.getUserByUsername(username);
      
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

      // Save session to localStorage (sessions remain client-side)
      localStorage.setItem('inventory_session', JSON.stringify(sessionData));

      // Update last login time in Firebase
      await this.updateUser(user.id, {
        lastLoginAt: new Date().toISOString()
      });

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
    const session = JSON.parse(localStorage.getItem('inventory_session'));
    
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
        localStorage.setItem('inventory_session', JSON.stringify(session));
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
      localStorage.setItem('inventory_session', JSON.stringify(session));
    }
  },

  /**
   * Logout and clear session
   */
  logout() {
    localStorage.setItem('inventory_session', JSON.stringify(null));
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
  async getCurrentUser() {
    const session = this.getCurrentSession();
    return session ? await this.getUserById(session.userId) : null;
  },

  // Products (Firebase versions)
  async getAllProducts() {
    return await this.getAll(this.COLLECTIONS.PRODUCTS);
  },

  async getProductById(id) {
    try {
      const docRef = doc(db, this.COLLECTIONS.PRODUCTS, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    } catch (error) {
      console.error('Error getting product:', error);
      return null;
    }
  },

  async addProduct(name, quantity) {
    try {
      const newProduct = {
        name,
        totalQuantity: parseInt(quantity),
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, this.COLLECTIONS.PRODUCTS), newProduct);
      return { id: docRef.id, ...newProduct, createdAt: new Date().toISOString() };
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  },

  async updateProduct(id, updates) {
    try {
      const docRef = doc(db, this.COLLECTIONS.PRODUCTS, id);
      await updateDoc(docRef, updates);
      
      // Return updated product
      const updatedDoc = await getDoc(docRef);
      return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } : null;
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  },

  async deleteProduct(id) {
    try {
      const docRef = doc(db, this.COLLECTIONS.PRODUCTS, id);
      
      // Get the product before deleting
      const docSnap = await getDoc(docRef);
      const deletedProduct = docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
      
      await deleteDoc(docRef);
      return deletedProduct;
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  },

  // Drivers (Firebase versions)
  async getAllDrivers() {
    return await this.getAll(this.COLLECTIONS.DRIVERS);
  },

  async getDriverById(id) {
    try {
      const docRef = doc(db, this.COLLECTIONS.DRIVERS, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    } catch (error) {
      console.error('Error getting driver:', error);
      return null;
    }
  },

  async addDriver(name, phone, options = {}) {
    try {
      const newDriver = {
        name,
        phone,
        linkedUserId: options.linkedUserId || null,
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, this.COLLECTIONS.DRIVERS), newDriver);
      const driverWithId = { id: docRef.id, ...newDriver, createdAt: new Date().toISOString() };

      // If creating a driver and requesting user account creation
      if (options.createUser && !options.linkedUserId) {
        try {
          // Generate a username based on the driver's name
          const baseUsername = name.toLowerCase().replace(/\s+/g, '');
          let username = baseUsername;
          let counter = 1;
          
          // Ensure username is unique
          while (await this.getUserByUsername(username)) {
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
            driverId: driverWithId.id
          });

          // Update driver with linked user ID
          await updateDoc(docRef, { linkedUserId: newUser.id });
          driverWithId.linkedUserId = newUser.id;

          return {
            driver: driverWithId,
            user: newUser,
            credentials: { username, password: defaultPassword }
          };
        } catch (error) {
          // If user creation fails, the driver profile is still created
          console.error('Failed to create user account for driver:', error);
          return driverWithId;
        }
      }

      return driverWithId;
    } catch (error) {
      console.error('Error adding driver:', error);
      throw error;
    }
  },

  async updateDriver(id, updates) {
    try {
      const docRef = doc(db, this.COLLECTIONS.DRIVERS, id);
      await updateDoc(docRef, updates);
      
      // Return updated driver
      const updatedDoc = await getDoc(docRef);
      return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } : null;
    } catch (error) {
      console.error('Error updating driver:', error);
      throw error;
    }
  },

  async deleteDriver(id) {
    try {
      const docRef = doc(db, this.COLLECTIONS.DRIVERS, id);
      
      // Get the driver before deleting
      const docSnap = await getDoc(docRef);
      const deletedDriver = docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
      
      await deleteDoc(docRef);
      return deletedDriver;
    } catch (error) {
      console.error('Error deleting driver:', error);
      throw error;
    }
  },

  // Assignments (Firebase versions)
  async getAllAssignments() {
    return await this.getAll(this.COLLECTIONS.ASSIGNMENTS);
  },

  async getAssignmentsByDriver(driverId) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.ASSIGNMENTS),
        where("driverId", "==", driverId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting assignments by driver:', error);
      return [];
    }
  },
  
  async getAssignmentsByProduct(productId) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.ASSIGNMENTS),
        where("productId", "==", productId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting assignments by product:', error);
      return [];
    }
  },

  async addAssignment(driverId, productId, quantity) {
    try {
      const product = await this.getProductById(productId);
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
      await this.updateProduct(productId, { 
        totalQuantity: product.totalQuantity - quantityToAssign 
      });
      
      const newAssignment = {
        driverId,
        productId,
        quantity: quantityToAssign,
        assignedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, this.COLLECTIONS.ASSIGNMENTS), newAssignment);
      return { id: docRef.id, ...newAssignment, assignedAt: new Date().toISOString() };
    } catch (error) {
      console.error('Error adding assignment:', error);
      throw error;
    }
  },

  // Sales
  async getAllSales() {
    return await this.getAll(this.COLLECTIONS.SALES);
  },

  async getSaleById(id) {
    const sales = await this.getAllSales();
    return sales.find(sale => sale.id === id);
  },
  
  async getSalesByDriver(driverId) {
    const sales = await this.getAllSales();
    return sales.filter(sale => sale.driverId === driverId);
  },
  
  async addSale(saleData) {
    try {
      const newSale = {
        ...saleData,
        saleDate: new Date().toISOString(),
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, this.COLLECTIONS.SALES), newSale);
      return { id: docRef.id, ...newSale, saleDate: new Date().toISOString() };
    } catch (error) {
      console.error('Error adding sale:', error);
      throw error;
    }
  },

  // Inventory calculations
  async getDriverInventory(driverId) {
    const assignments = await this.getAssignmentsByDriver(driverId);
    const sales = await this.getSalesByDriver(driverId);
    const transfers = await this.getTransfersByDriver(driverId);
    const products = await this.getAllProducts();
    const inventory = {};

    // Initialize inventory with all products at 0
    products.forEach(product => {
      inventory[product.id] = {
        id: product.id,
        name: product.name,
        assigned: 0,
        sold: 0,
        transferred: 0,
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

    // Subtract transfers out (when this driver is the source)
    transfers.forEach(transfer => {
      if (transfer.fromDriverId === driverId && inventory[transfer.productId]) {
        inventory[transfer.productId].transferred += transfer.quantity;
      }
    });

    // Calculate remaining
    Object.keys(inventory).forEach(productId => {
      inventory[productId].remaining =
        inventory[productId].assigned - inventory[productId].sold - inventory[productId].transferred;
    });

    return Object.values(inventory).filter(item => item.assigned > 0);
  },
  
  async getTotalInventory() {
    const products = await this.getAllProducts();
    let total = 0;

    products.forEach(product => {
      total += product.totalQuantity;
    });

    return total;
  },

  // Sales reporting (kept for backward compatibility)
  async getSalesByPeriod(driverId, period, date) {
    const sales = driverId ? await this.getSalesByDriver(driverId) : await this.getAllSales();
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
  async getUserByDriverId(driverId) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.USERS),
        where("driverId", "==", driverId)
      );
      const snapshot = await getDocs(q);
      return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } catch (error) {
      console.error('Error getting user by driver ID:', error);
      return null;
    }
  },

  /**
   * Get driver by user ID
   * @param {string} userId - User ID
   * @returns {Object|null} Driver object or null
   */
  async getDriverByUserId(userId) {
    const user = await this.getUserById(userId);
    return user && user.driverId ? await this.getDriverById(user.driverId) : null;
  },

  /**
   * Link existing user to existing driver
   * @param {string} userId - User ID
   * @param {string} driverId - Driver ID
   * @returns {boolean} Success status
   */
  async linkUserToDriver(userId, driverId) {
    const user = await this.getUserById(userId);
    const driver = await this.getDriverById(driverId);

    if (!user || !driver) {
      throw new Error('User or driver not found');
    }

    if (user.role !== this.ROLES.DRIVER) {
      throw new Error('User must have driver role to be linked to a driver profile');
    }

    // Check if driver is already linked
    const existingUser = await this.getUserByDriverId(driverId);
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
    await this.updateDriver(driverId, { linkedUserId: userId });

    return true;
  },

  /**
   * Unlink user from driver
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  async unlinkUserFromDriver(userId) {
    const user = await this.getUserById(userId);
    if (!user || !user.driverId) {
      return false;
    }

    const driverId = user.driverId;

    // Remove link from user
    await this.updateUser(userId, { driverId: null });

    // Remove link from driver
    await this.updateDriver(driverId, { linkedUserId: null });

    return true;
  },

  // ===============================
  // DATA MIGRATION METHODS (LEGACY - DISABLED FOR FIREBASE)
  // ===============================

  async migrateSalesToOrders() {
    // Skip migration for Firebase - starting fresh
    return;
  },

  async migrateDriverUserLinks() {
    // Skip migration for Firebase - starting fresh
    return;
  },

  async autoLinkDriverUsers() {
    // Skip for Firebase - starting fresh
    return;
  },

  async fixDriverUserIds() {
    // Skip migration for Firebase - starting fresh
    return;
  },

  // ===============================
  // ORDER MANAGEMENT METHODS
  // ===============================

  /**
   * Get all orders
   * @returns {Array} Array of order objects
   */
  async getAllOrders() {
    return await this.getAll(this.COLLECTIONS.ORDERS);
  },

  /**
   * Get order by ID
   * @param {string} id - Order ID
   * @returns {Object|null} Order object or null
   */
  async getOrderById(id) {
    try {
      const docRef = doc(db, this.COLLECTIONS.ORDERS, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    } catch (error) {
      console.error('Error getting order:', error);
      return null;
    }
  },

  /**
   * Get orders by driver ID
   * @param {string} driverId - Driver ID
   * @returns {Array} Array of orders for the driver
   */
  async getOrdersByDriver(driverId) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.ORDERS),
        where("driverId", "==", driverId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting orders by driver:', error);
      return [];
    }
  },

  /**
   * Get orders by sales rep ID
   * @param {string} salesRepId - Sales rep ID
   * @returns {Array} Array of orders created by the sales rep
   */
  async getOrdersBySalesRep(salesRepId) {
    const orders = await this.getAllOrders();
    return orders.filter(order => order.salesRepId === salesRepId);
  },

  /**
   * Get orders by status
   * @param {string} status - Order status
   * @returns {Array} Array of orders with the specified status
   */
  async getOrdersByStatus(status) {
    const orders = await this.getAllOrders();
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
  async getOrdersWithFilters(filters = {}) {
    let orders = await this.getAllOrders();
    
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
  async createOrder(orderData) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active session found');
    }

    // Validate required fields
    if (!orderData.driverId || !orderData.customerAddress || !orderData.lineItems || orderData.lineItems.length === 0) {
      throw new Error('Missing required order fields');
    }

    // Validate inventory availability for all line items
    for (const item of orderData.lineItems) {
      if (!item.isFreeGift) {
        const driverInventory = await this.getDriverInventory(orderData.driverId);
        const productInventory = driverInventory.find(inv => inv.id === item.productId);

        if (!productInventory || productInventory.remaining < item.actualQuantity) {
          const product = await this.getProductById(item.productId);
          throw new Error(`Insufficient inventory for ${product ? product.name : 'unknown product'}`);
        }
      }
    }

    try {
      const newOrderData = {
        driverId: orderData.driverId,
        salesRepId: session.userId, // Track who created the order
        customerAddress: orderData.customerAddress.trim(),
        customerDescription: orderData.customerDescription ? orderData.customerDescription.trim() : '',
        deliveryMethod: orderData.deliveryMethod || 'Paid',
        totalAmount: parseFloat(orderData.totalAmount) || 0,
        status: this.ORDER_STATUS.PENDING,
        lineItems: orderData.lineItems || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null
      };

      const docRef = await addDoc(collection(db, this.COLLECTIONS.ORDERS), newOrderData);
      const newOrder = { id: docRef.id, ...newOrderData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

      // Update inventory by creating temporary sales entry for inventory calculation
      // This affects driver inventory immediately when order is created
      await this.addSale({
        driverId: orderData.driverId,
        customerAddress: orderData.customerAddress.trim(),
        customerDescription: orderData.customerDescription ? orderData.customerDescription.trim() : '',
        deliveryMethod: orderData.deliveryMethod || 'Paid',
        totalAmount: parseFloat(orderData.totalAmount) || 0,
        lineItems: orderData.lineItems || [],
        orderId: newOrder.id // Link to order for reference
      });

      return newOrder;
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  },

  /**
   * Update an existing order
   * @param {string} id - Order ID
   * @param {Object} updates - Update data
   * @returns {Object|null} Updated order or null
   */
  async updateOrder(id, updates) {
    try {
      const currentOrder = await this.getOrderById(id);
      if (!currentOrder) {
        return null;
      }

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

      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      };

      // Set completion timestamp when marking as completed
      if (updates.status === this.ORDER_STATUS.COMPLETED && currentOrder.status !== this.ORDER_STATUS.COMPLETED) {
        updateData.completedAt = serverTimestamp();
      }

      const docRef = doc(db, this.COLLECTIONS.ORDERS, id);
      await updateDoc(docRef, updateData);

      // Return updated order
      const updatedDoc = await getDoc(docRef);
      return updatedDoc.exists() ? { id: updatedDoc.id, ...updatedDoc.data() } : null;
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  },

  /**
   * Cancel an order and restore inventory
   * @param {string} id - Order ID
   * @param {boolean} payDriver - Whether to pay the driver (default: false)
   * @returns {boolean} Success status
   */
  async cancelOrder(id, payDriver = false) {
    const order = await this.getOrderById(id);
    if (!order) {
      return false;
    }

    if (order.status !== this.ORDER_STATUS.PENDING) {
      throw new Error('Only pending orders can be cancelled');
    }

    // Remove the associated sale to restore inventory
    try {
      const q = query(
        collection(db, this.COLLECTIONS.SALES),
        where("orderId", "==", id)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        await deleteDoc(snapshot.docs[0].ref);
      }
    } catch (error) {
      console.error('Error removing sale record:', error);
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
    
    await this.updateOrder(id, updateData);

    return true;
  },

  /**
   * Complete an order
   * @param {string} id - Order ID
   * @returns {boolean} Success status
   */
  async completeOrder(id) {
    const order = await this.getOrderById(id);
    if (!order) {
      return false;
    }

    if (order.status !== this.ORDER_STATUS.PENDING) {
      throw new Error('Only pending orders can be completed');
    }

    await this.updateOrder(id, {
      status: this.ORDER_STATUS.COMPLETED,
      completedAt: new Date().toISOString()
    });
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
   * Get orders with advanced filtering options (duplicate method - removed)
   * This method was a duplicate and has been consolidated with the method above
   */
  async getOrdersWithAdvancedFilters(filters = {}) {
    let orders = await this.getAllOrders();
    
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
  async getTodayOrderAmount() {
    const today = new Date();
    const todayStr = today.toDateString();

    const todayOrders = (await this.getAllOrders()).filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate.toDateString() === todayStr && order.status === this.ORDER_STATUS.COMPLETED;
    });

    return todayOrders.reduce((total, order) => total + order.totalAmount, 0);
  },

  // ===============================
  // DRIVER-SPECIFIC HELPER METHODS
  // ===============================


  /**
   * Get driver inventory with low stock alerts
   * @param {string} driverId - Driver ID
   * @param {number} threshold - Low stock threshold (default: 5)
   * @returns {Array} Driver inventory with alert flags
   */
  async getDriverInventoryWithAlerts(driverId, threshold = 5) {
    const inventory = await this.getDriverInventory(driverId);

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
  async getDriverOrderSummary(driverId) {
    const today = new Date();
    const todayStr = today.toDateString();

    const driverOrders = await this.getOrdersByDriver(driverId);
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

  /**
   * Get driver earnings from completed orders
   * @param {string} driverId - Driver ID
   * @returns {Object} Earnings summary
   */
  async getDriverEarnings(driverId) {
    const orders = await this.getOrdersByDriver(driverId);
    const completedOrders = orders.filter(order => order.status === this.ORDER_STATUS.COMPLETED);

    const today = new Date();
    const todayStr = today.toDateString();

    const todayEarnings = completedOrders
      .filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate.toDateString() === todayStr;
      })
      .reduce((total, order) => total + order.totalAmount, 0);

    const totalEarnings = completedOrders.reduce((total, order) => total + order.totalAmount, 0);

    return {
      today: todayEarnings,
      total: totalEarnings,
      ordersCount: completedOrders.length,
      todayOrdersCount: completedOrders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate.toDateString() === todayStr;
      }).length
    };
  },

  // ============ STOCK TRANSFER METHODS ============

  // Transfer stock between drivers or collect back to main inventory
  async transferStock(fromDriverId, toDriverId, productId, quantity) {
    if (!fromDriverId || !productId || !quantity || quantity <= 0) {
      throw new Error('Invalid transfer parameters');
    }

    // Check if source driver has sufficient stock
    const driverInventory = await this.getDriverInventory(fromDriverId);
    const productInventory = driverInventory.find(item => item.id === productId);

    if (!productInventory || productInventory.remaining < quantity) {
      const product = await this.getProductById(productId);
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

    // Record the transfer in Firebase
    try {
      const docRef = await addDoc(collection(db, this.COLLECTIONS.STOCK_TRANSFERS), transferData);
      transferData.id = docRef.id;
    } catch (error) {
      console.error('Error recording stock transfer:', error);
      throw error;
    }

    // Handle the actual stock movement
    if (toDriverId === 'main-inventory') {
      // Collect stock back to main inventory
      await this.collectStockToMain(productId, quantity);
    } else {
      // Transfer to another driver (create new assignment)
      await this.addAssignmentFromTransfer(toDriverId, productId, quantity);
    }

    return transferData;
  },

  // Collect stock back to main inventory
  async collectStockToMain(productId, quantity) {
    const product = await this.getProductById(productId);

    if (!product) {
      throw new Error('Product not found');
    }

    await this.updateProduct(productId, {
      totalQuantity: product.totalQuantity + quantity
    });
  },

  // Add assignment from transfer (doesn't deduct from main inventory)
  async addAssignmentFromTransfer(driverId, productId, quantity) {
    const assignmentData = {
      driverId,
      productId,
      quantity,
      assignedAt: new Date().toISOString(),
      source: 'transfer', // Mark as transfer source
      createdAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, this.COLLECTIONS.ASSIGNMENTS), assignmentData);
      return { id: docRef.id, ...assignmentData, assignedAt: new Date().toISOString() };
    } catch (error) {
      console.error('Error creating assignment from transfer:', error);
      throw error;
    }
  },

  // Get all stock transfers
  async getStockTransfers() {
    try {
      const snapshot = await getDocs(collection(db, this.COLLECTIONS.STOCK_TRANSFERS));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting stock transfers:', error);
      return [];
    }
  },

  // Get transfers filtered by driver (either from or to)
  async getTransfersByDriver(driverId) {
    const transfers = await this.getStockTransfers();
    return transfers.filter(transfer =>
      transfer.fromDriverId === driverId || transfer.toDriverId === driverId
    );
  }
};

// Make DB globally accessible for testing
window.DB = DB;

// Initialize the database when script loads
DB.init().catch(error => {
  console.error('Database initialization failed:', error);
});
