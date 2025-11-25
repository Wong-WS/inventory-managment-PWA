/**
 * Database manager using Firebase Firestore
 * Handles CRUD operations for products, drivers, assignments and sales
 */

// Import Firebase services and configuration
import { db } from './firebase-config.js';
import { appConfig } from './config.js';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
  onSnapshot
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
    DIRECT_PAYMENTS: 'directPayments',
    BUSINESS_DAYS: 'businessDays',
    SETTINGS: 'settings',
    INVENTORY_SNAPSHOTS: 'inventorySnapshots',
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

  // Direct payment type enumeration
  PAYMENT_TYPES: {
    BONUS: 'Bonus',
    ADVANCE: 'Advance',
    REIMBURSEMENT: 'Reimbursement',
    DEDUCTION: 'Deduction',
    OTHER: 'Other'
  },

  // Session configuration (from app config)
  SESSION_CONFIG: {
    TIMEOUT_MINUTES: appConfig.session.timeoutMinutes,
    TOKEN_LENGTH: appConfig.session.tokenLength
  },

  // Real-time listener management
  listeners: new Map(), // Track active listeners

  // Initialize database
  async init() {
    try {
      // Set up localStorage for sessions (Firebase doesn't handle client sessions)
      if (!localStorage.getItem('inventory_session')) {
        localStorage.setItem('inventory_session', JSON.stringify(null));
      }

      // Note: Default admin user should be created manually using create-admin.html
      // Removed automatic admin creation to prevent race condition duplicates
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  },

  // ===============================
  // REAL-TIME LISTENER MANAGEMENT
  // ===============================

  /**
   * Cleanup a specific listener
   * @param {string} listenerId - Unique identifier for the listener
   */
  cleanupListener(listenerId) {
    const unsubscribe = this.listeners.get(listenerId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(listenerId);
    }
  },

  /**
   * Cleanup all active listeners
   */
  cleanupAllListeners() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  },

  /**
   * Listen to orders in real-time
   * @param {Function} callback - Callback function to handle order updates
   * @param {Object} filters - Optional filters for orders
   * @param {string} filters.driverId - Filter by driver ID
   * @param {string} filters.salesRepId - Filter by sales rep ID
   * @param {string} filters.status - Filter by order status
   * @returns {Function} Unsubscribe function to cleanup the listener
   */
  listenToOrders(callback, filters = {}) {
    const listenerId = 'orders' + (filters.driverId ? '_driver_' + filters.driverId : '') +
                      (filters.salesRepId ? '_salesrep_' + filters.salesRepId : '') +
                      (filters.status ? '_status_' + filters.status : '') +
                      (filters.todayOnly ? '_today' : '') +
                      (filters.daysBack ? '_daysback_' + filters.daysBack : '') +
                      (filters.businessDayId ? '_bizday_' + filters.businessDayId : '');

    this.cleanupListener(listenerId);

    let q = collection(db, this.COLLECTIONS.ORDERS);

    // Apply filters
    if (filters.driverId) {
      q = query(q, where("driverId", "==", filters.driverId));
    }
    if (filters.salesRepId) {
      q = query(q, where("salesRepId", "==", filters.salesRepId));
    }
    if (filters.status) {
      q = query(q, where("status", "==", filters.status));
    }
    // Business day filter (takes priority over date filters)
    if (filters.businessDayId) {
      q = query(q, where("businessDayId", "==", filters.businessDayId));
    }
    // Add date filter for daysBack (last N days)
    else if (filters.daysBack) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - (filters.daysBack - 1)); // -1 to include today
      daysAgo.setHours(0, 0, 0, 0); // Start of that day
      q = query(q, where("createdAt", ">=", daysAgo));
    }
    // Add date filter to only fetch today's orders (if requested)
    // BUT if showAllPending is true and no specific status filter, don't apply date filter
    // (we'll filter client-side to show all pending + today's completed/cancelled)
    else if (filters.todayOnly && !(filters.showAllPending && !filters.status)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      q = query(q, where("createdAt", ">=", today));
    }

    // Add ordering by creation date (newest first) - only if no other filters to avoid index issues
    if (!filters.driverId && !filters.salesRepId && !filters.status && !filters.businessDayId) {
      q = query(q, orderBy("createdAt", "desc"));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filter client-side if showAllPending is enabled (for todayOnly or daysBack)
      if (filters.showAllPending && !filters.status) {
        if (filters.todayOnly) {
          // Today only: show all pending + today's completed/cancelled
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Start of today
          const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);

          orders = orders.filter(order => {
            // Always show PENDING orders regardless of date
            if (order.status === this.ORDER_STATUS.PENDING) {
              return true;
            }
            // For COMPLETED/CANCELLED, only show today's
            const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
            return orderDate >= today && orderDate < todayEnd;
          });
        } else if (filters.daysBack) {
          // Last N days: show all pending + last N days completed/cancelled
          const daysAgo = new Date();
          daysAgo.setDate(daysAgo.getDate() - (filters.daysBack - 1)); // -1 to include today
          daysAgo.setHours(0, 0, 0, 0); // Start of that day

          orders = orders.filter(order => {
            // Always show PENDING orders regardless of date
            if (order.status === this.ORDER_STATUS.PENDING) {
              return true;
            }
            // For COMPLETED/CANCELLED, only show orders within date range
            const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
            return orderDate >= daysAgo;
          });
        }
      }

      // Sort in memory if we couldn't sort in the query due to composite index requirements
      if (filters.driverId || filters.salesRepId || filters.status || filters.businessDayId) {
        orders.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB - dateA;
        });
      }

      callback(orders);
    }, (error) => {
      console.error('Error listening to orders:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);

    // Return a cleanup function that removes the listener from both Firebase and internal tracking
    return () => {
      this.cleanupListener(listenerId);
    };
  },

  /**
   * Listen to recent orders in real-time (for Recent Activity)
   * @param {Object} options - Query options
   * @param {number} options.recentDays - Number of recent days to fetch
   * @param {number} options.limit - Maximum number of orders to fetch
   * @param {Function} callback - Callback function to handle order updates
   * @returns {Function} Unsubscribe function to cleanup the listener
   */
  listenToRecentOrders(options, callback) {
    const listenerId = `recent_orders_${options.recentDays}_${options.limit}`;
    this.cleanupListener(listenerId);

    // Calculate date range
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - (options.recentDays - 1));
    daysAgo.setHours(0, 0, 0, 0);

    let q = query(
      collection(db, this.COLLECTIONS.ORDERS),
      where("createdAt", ">=", daysAgo),
      orderBy("createdAt", "desc")
    );

    if (options.limit) {
      q = query(q, limit(options.limit));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(orders);
    }, (error) => {
      console.error('Error listening to recent orders:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);

    return () => {
      this.cleanupListener(listenerId);
    };
  },

  /**
   * Listen to recent assignments in real-time (for Recent Activity)
   * @param {Object} options - Query options
   * @param {number} options.recentDays - Number of recent days to fetch
   * @param {string} options.driverId - Optional driver ID filter
   * @param {number} options.limit - Maximum number of assignments to fetch
   * @param {Function} callback - Callback function to handle assignment updates
   * @returns {Function} Unsubscribe function to cleanup the listener
   */
  listenToRecentAssignments(options, callback) {
    const listenerId = `recent_assignments_${options.recentDays}_${options.driverId || 'all'}_${options.limit}`;
    this.cleanupListener(listenerId);

    // Calculate date range
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - (options.recentDays - 1));
    daysAgo.setHours(0, 0, 0, 0);

    let q = query(
      collection(db, this.COLLECTIONS.ASSIGNMENTS),
      where("assignedAt", ">=", daysAgo)
    );

    // Add driver filter if specified
    if (options.driverId) {
      q = query(q, where("driverId", "==", options.driverId));
    }

    q = query(q, orderBy("assignedAt", "desc"));

    if (options.limit) {
      q = query(q, limit(options.limit));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(assignments);
    }, (error) => {
      console.error('Error listening to recent assignments:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);

    return () => {
      this.cleanupListener(listenerId);
    };
  },

  /**
   * Listen to recent driver orders in real-time (for Driver Recent Activity)
   * @param {string} driverId - Driver ID
   * @param {Object} options - Query options
   * @param {number} options.recentDays - Number of recent days to fetch
   * @param {number} options.limit - Maximum number of orders to fetch
   * @param {Function} callback - Callback function to handle order updates
   * @returns {Function} Unsubscribe function to cleanup the listener
   */
  listenToRecentDriverOrders(driverId, options, callback) {
    const listenerId = `recent_driver_orders_${driverId}_${options.recentDays}_${options.limit}`;
    this.cleanupListener(listenerId);

    // Calculate date range
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - (options.recentDays - 1));
    daysAgo.setHours(0, 0, 0, 0);

    let q = query(
      collection(db, this.COLLECTIONS.ORDERS),
      where("driverId", "==", driverId),
      where("createdAt", ">=", daysAgo),
      orderBy("createdAt", "desc")
    );

    if (options.limit) {
      q = query(q, limit(options.limit));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(orders);
    }, (error) => {
      console.error('Error listening to recent driver orders:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);

    return () => {
      this.cleanupListener(listenerId);
    };
  },

  /**
   * Listen to products in real-time
   * @param {Function} callback - Callback function to handle product updates
   * @returns {string} Listener ID for cleanup
   */
  listenToProducts(callback) {
    const listenerId = 'products';
    this.cleanupListener(listenerId);

    // Simple collection query without orderBy to avoid index issues
    const q = collection(db, this.COLLECTIONS.PRODUCTS);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Sort in memory by creation date (newest first)
      products.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB - dateA;
      });

      callback(products);
    }, (error) => {
      console.error('Error listening to products:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);
    return listenerId;
  },

  /**
   * Listen to drivers in real-time
   * @param {Function} callback - Callback function to handle driver updates
   * @returns {string} Listener ID for cleanup
   */
  listenToDrivers(callback) {
    const listenerId = 'drivers';
    this.cleanupListener(listenerId);

    // Simple collection query without orderBy to avoid index issues
    const q = collection(db, this.COLLECTIONS.DRIVERS);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Sort in memory by creation date (newest first)
      drivers.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB - dateA;
      });

      callback(drivers);
    }, (error) => {
      console.error('Error listening to drivers:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);
    return listenerId;
  },

  /**
   * Listen to users in real-time
   * @param {Function} callback - Callback function to handle user updates
   * @returns {string} Listener ID for cleanup
   */
  listenToUsers(callback) {
    const listenerId = 'users';
    this.cleanupListener(listenerId);

    // Simple collection query without orderBy to avoid index issues
    const q = collection(db, this.COLLECTIONS.USERS);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Remove sensitive data for real-time updates
        passwordHash: undefined,
        salt: undefined
      }));

      // Sort in memory by creation date (newest first)
      users.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB - dateA;
      });

      callback(users);
    }, (error) => {
      console.error('Error listening to users:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);
    return listenerId;
  },

  /**
   * Listen to assignments in real-time
   * @param {Function} callback - Callback function to handle assignment updates
   * @param {Object} filters - Optional filters
   * @param {string} filters.driverId - Filter by driver ID
   * @param {string} filters.productId - Filter by product ID
   * @returns {string} Listener ID for cleanup
   */
  listenToAssignments(callback, filters = {}) {
    const listenerId = 'assignments' + (filters.driverId ? '_driver_' + filters.driverId : '') +
                      (filters.productId ? '_product_' + filters.productId : '');

    this.cleanupListener(listenerId);

    let q = collection(db, this.COLLECTIONS.ASSIGNMENTS);

    if (filters.driverId) {
      q = query(q, where("driverId", "==", filters.driverId));
    }
    if (filters.productId) {
      q = query(q, where("productId", "==", filters.productId));
    }

    // Only add orderBy if no filters to avoid composite index issues
    if (!filters.driverId && !filters.productId) {
      q = query(q, orderBy("assignedAt", "desc"));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Sort in memory if we couldn't sort in the query
      if (filters.driverId || filters.productId) {
        assignments.sort((a, b) => {
          const dateA = a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(a.assignedAt);
          const dateB = b.assignedAt?.toDate ? b.assignedAt.toDate() : new Date(b.assignedAt);
          return dateB - dateA;
        });
      }

      callback(assignments);
    }, (error) => {
      console.error('Error listening to assignments:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);
    return listenerId;
  },

  /**
   * Listen to stock transfers in real-time
   * @param {Function} callback - Callback function to handle transfer updates
   * @param {Object} filters - Optional filters
   * @param {string} filters.driverId - Filter by driver ID (from or to)
   * @returns {string} Listener ID for cleanup
   */
  listenToStockTransfers(callback, filters = {}) {
    const listenerId = 'stock_transfers' + (filters.driverId ? '_driver_' + filters.driverId : '');

    this.cleanupListener(listenerId);

    let q = collection(db, this.COLLECTIONS.STOCK_TRANSFERS);

    // Simple collection query without orderBy to avoid index issues
    // Note: For driver filters, we'll filter in-memory since Firestore doesn't support OR queries easily

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let transfers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Apply driver filter in-memory
      if (filters.driverId) {
        transfers = transfers.filter(transfer =>
          transfer.fromDriverId === filters.driverId || transfer.toDriverId === filters.driverId
        );
      }

      // Sort in memory by transfer date (newest first)
      transfers.sort((a, b) => {
        const dateA = a.transferredAt?.toDate ? a.transferredAt.toDate() : new Date(a.transferredAt);
        const dateB = b.transferredAt?.toDate ? b.transferredAt.toDate() : new Date(b.transferredAt);
        return dateB - dateA;
      });

      callback(transfers);
    }, (error) => {
      console.error('Error listening to stock transfers:', error);
      callback([]);
    });

    this.listeners.set(listenerId, unsubscribe);
    return listenerId;
  },

  // Generate a unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  },

  /**
   * Calculate date range for period filtering
   * @param {string} period - Period type (day, week, month, year)
   * @param {string|Date} date - Target date
   * @returns {Object} {startDate, endDate} for filtering
   */
  calculateDateRange(period, date) {
    if (!period || !date) {
      return null;
    }

    let targetDate;
    try {
      targetDate = typeof date === 'string' ? new Date(date) : new Date(date);
      if (isNaN(targetDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      console.error('Invalid date provided to calculateDateRange:', date);
      return null;
    }

    const startDate = new Date(targetDate);
    const endDate = new Date(targetDate);

    switch(period) {
      case 'day':
        // Start of day: 00:00:00.000
        startDate.setHours(0, 0, 0, 0);
        // End of day: 23:59:59.999
        endDate.setHours(23, 59, 59, 999);
        break;

      case 'week':
        // Start of week (Sunday)
        startDate.setDate(targetDate.getDate() - targetDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        // End of week (Saturday)
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;

      case 'month':
        // First day of month
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        // Last day of month
        endDate.setMonth(targetDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;

      case 'year':
        // January 1st
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        // December 31st
        endDate.setMonth(11, 31);
        endDate.setHours(23, 59, 59, 999);
        break;

      default:
        console.warn('Unknown period type:', period);
        return null;
    }

    return { startDate, endDate };
  },

  /**
   * Convert Firebase Timestamp or date string to Date object
   * @param {*} timestamp - Firebase Timestamp, Date object, or ISO string
   * @returns {Date} Date object
   */
  toDate(timestamp) {
    if (!timestamp) return null;

    // Firebase Timestamp object
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }

    // Already a Date object
    if (timestamp instanceof Date) {
      return timestamp;
    }

    // String representation
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }

    // Fallback
    return new Date(timestamp);
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
    return btoa(String.fromCharCode.apply(null, array))
      .replace(/[+/]/g, c => c == '+' ? '-' : '_')
      .replace(/=/g, ''); // URL-safe base64
  },

  /**
   * Generate secure session ID
   * @returns {string} Unique session identifier
   */
  generateSessionId() {
    return this.generateSecureToken() + '-' + Date.now().toString(36);
  },

  /**
   * Get client IP address (best effort)
   * @returns {string} Client IP or unknown
   */
  getClientIP() {
    // This is limited in browsers due to privacy, but we can try
    return 'client-side'; // Browsers don't expose real IP
  },

  /**
   * Simple session data obfuscation (not true encryption)
   * @param {Object} sessionData - Session data to obfuscate
   * @returns {string} Obfuscated session string
   */
  encryptSessionData(sessionData) {
    try {
      const jsonStr = JSON.stringify(sessionData);
      // Simple obfuscation - not cryptographically secure but better than plain text
      const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
      return 'enc_' + encoded;
    } catch (error) {
      throw new Error('Failed to obfuscate session data');
    }
  },

  /**
   * Decode obfuscated session data
   * @param {string} encryptedData - Obfuscated session string
   * @returns {Object} Session data
   */
  decryptSessionData(encryptedData) {
    try {
      if (encryptedData.startsWith('enc_')) {
        const encoded = encryptedData.substring(4);
        const jsonStr = decodeURIComponent(escape(atob(encoded)));
        return JSON.parse(jsonStr);
      } else {
        // Fallback for non-obfuscated data
        return JSON.parse(encryptedData);
      }
    } catch (error) {
      throw new Error('Failed to decode session data');
    }
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

      // Create secure session
      const sessionToken = this.generateSecureToken();
      const sessionId = this.generateSessionId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (this.SESSION_CONFIG.TIMEOUT_MINUTES * 60 * 1000));

      const sessionData = {
        sessionId: sessionId,
        token: sessionToken,
        userId: user.id,
        username: user.username,
        role: user.role,
        driverId: user.driverId,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        lastActivity: now.toISOString(),
        ipAddress: this.getClientIP(), // For security logging
        userAgent: navigator.userAgent.substring(0, 200) // Truncated for storage
      };

      // Save session to localStorage with additional security
      try {
        const encryptedSession = this.encryptSessionData(sessionData);
        localStorage.setItem('inventory_session', encryptedSession);

        // Also set a session flag for quick checks
        localStorage.setItem('inventory_session_active', 'true');
      } catch (error) {
        console.error('Failed to save session securely:', error);
        // Fallback to basic storage
        localStorage.setItem('inventory_session', JSON.stringify(sessionData));
      }

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
    try {
      // Quick check if session exists
      if (!localStorage.getItem('inventory_session_active')) {
        return null;
      }

      const sessionData = localStorage.getItem('inventory_session');
      if (!sessionData) {
        return null;
      }

      // Decrypt/decode session data
      const session = this.decryptSessionData(sessionData);

      if (!session || !session.token || !session.sessionId) {
        this.logout();
        return null;
      }

      // Check if session has expired
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);

      if (now >= expiresAt) {
        console.log('Session expired, logging out');
        this.logout();
        return null;
      }

      // Update last activity for session tracking
      if (now.getTime() - new Date(session.lastActivity).getTime() > 5 * 60 * 1000) { // 5 minutes
        session.lastActivity = now.toISOString();
        try {
          const encryptedSession = this.encryptSessionData(session);
          localStorage.setItem('inventory_session', encryptedSession);
        } catch (error) {
          console.error('Failed to update session activity:', error);
        }
      }

      return session;
    } catch (error) {
      console.error('Error retrieving session:', error);
      this.logout(); // Clear corrupted session
      return null;
    }
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
    // Clear all session-related data
    localStorage.removeItem('inventory_session');
    localStorage.removeItem('inventory_session_active');

    // Clear any other potentially sensitive cached data
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('inventory_') || key.includes('session'))) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));

    console.log('Session cleared securely');
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

  async restockProduct(productId, additionalQuantity) {
    try {
      const product = await this.getProductById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const newQuantity = product.totalQuantity + parseInt(additionalQuantity);
      await this.updateProduct(productId, { totalQuantity: newQuantity });

      return await this.getProductById(productId);
    } catch (error) {
      console.error('Error restocking product:', error);
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

  async updateDriverProductOrder(driverId, productOrder) {
    try {
      const docRef = doc(db, this.COLLECTIONS.DRIVERS, driverId);
      await updateDoc(docRef, {
        productOrder: productOrder // Array of product IDs in custom order
      });
      // No need to fetch document again - just return success
    } catch (error) {
      console.error('Error updating driver product order:', error);
      throw error;
    }
  },

  // Assignments (Firebase versions)
  async getAllAssignments(options = {}) {
    // Support for recent days filter (e.g., last 3 days)
    if (options.recentDays) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - (options.recentDays - 1)); // -1 because we include today
      daysAgo.setHours(0, 0, 0, 0);

      let q = query(
        collection(db, this.COLLECTIONS.ASSIGNMENTS),
        where("assignedAt", ">=", daysAgo)
      );

      // Add driver filter if specified
      if (options.driverId) {
        q = query(q, where("driverId", "==", options.driverId));
      }

      // Add ordering if requested
      if (options.orderBy) {
        q = query(q, orderBy("assignedAt", "desc"));
      }

      // Add limit if specified
      if (options.limit) {
        q = query(q, limit(options.limit));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // Legacy support for todayOnly
    if (options.todayOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const q = query(
        collection(db, this.COLLECTIONS.ASSIGNMENTS),
        where("assignedAt", ">=", today)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

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
    const orders = await this.getOrdersByDriver(driverId);
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

    // Subtract inventory from pending and completed orders only
    // All cancelled orders should have inventory restored regardless of payment status
    orders.forEach(order => {
      // Skip ALL cancelled orders - inventory only deducted for pending/completed
      if (order.status === this.ORDER_STATUS.CANCELLED) {
        return; // Inventory not deducted for cancelled orders
      }

      order.lineItems.forEach(item => {
        if (inventory[item.productId]) {
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

    let inventoryArray = Object.values(inventory).filter(item => item.assigned > 0);

    // Get driver's custom product order if available
    const driver = await this.getDriverById(driverId);
    if (driver && driver.productOrder && driver.productOrder.length > 0) {
      // Sort by custom product order
      inventoryArray.sort((a, b) => {
        const indexA = driver.productOrder.indexOf(a.id);
        const indexB = driver.productOrder.indexOf(b.id);

        // Items in custom order come first, sorted by their position
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        // Items in custom order come before items not in order
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        // Items not in custom order fall back to alphabetical
        return a.name.localeCompare(b.name);
      });
    } else {
      // Default alphabetical sort
      inventoryArray.sort((a, b) => a.name.localeCompare(b.name));
    }

    return inventoryArray;
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
  // ORDER MANAGEMENT METHODS
  // ===============================

  /**
   * Get all orders
   * @returns {Array} Array of order objects
   */
  async getAllOrders(options = {}) {
    // Support for recent days filter (e.g., last 3 days)
    if (options.recentDays) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - (options.recentDays - 1)); // -1 because we include today
      daysAgo.setHours(0, 0, 0, 0);

      let q = query(
        collection(db, this.COLLECTIONS.ORDERS),
        where("createdAt", ">=", daysAgo)
      );

      // Add ordering if requested
      if (options.orderBy) {
        q = query(q, orderBy("createdAt", "desc"));
      }

      // Add limit if specified
      if (options.limit) {
        q = query(q, limit(options.limit));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // Legacy support for todayOnly
    if (options.todayOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const q = query(
        collection(db, this.COLLECTIONS.ORDERS),
        where("createdAt", ">=", today)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

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
   * @param {Object} options - Query options (recentDays, orderBy, limit)
   * @returns {Array} Array of orders for the driver
   */
  async getOrdersByDriver(driverId, options = {}) {
    try {
      let q = query(
        collection(db, this.COLLECTIONS.ORDERS),
        where("driverId", "==", driverId)
      );

      // Add date filter if recentDays specified
      if (options.recentDays) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - (options.recentDays - 1)); // -1 because we include today
        daysAgo.setHours(0, 0, 0, 0);
        q = query(q, where("createdAt", ">=", daysAgo));
      }

      // Add ordering if requested
      if (options.orderBy) {
        q = query(q, orderBy("createdAt", "desc"));
      }

      // Add limit if specified
      if (options.limit) {
        q = query(q, limit(options.limit));
      }

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
   * @param {string} filters.period - Filter by period (day, week, month, year)
   * @param {string|Date} filters.date - Target date for period filtering
   * @returns {Array} Filtered orders
   */
  async getOrdersWithFilters(filters = {}) {
    let orders = await this.getAllOrders();

    // Filter by sales rep
    if (filters.salesRepId) {
      orders = orders.filter(order => order.salesRepId === filters.salesRepId);
    }

    // Filter by driver
    if (filters.driverId) {
      orders = orders.filter(order => order.driverId === filters.driverId);
    }

    // Filter by status
    if (filters.status) {
      orders = orders.filter(order => order.status === filters.status);
    }

    // PRIORITY 1: Business Day filtering (new system)
    if (filters.businessDayId) {
      orders = orders.filter(order => order.businessDayId === filters.businessDayId);
    }
    // PRIORITY 2: Period and date filtering (legacy + new hybrid)
    else if (filters.period && filters.date) {
      const dateRange = this.calculateDateRange(filters.period, filters.date);

      if (dateRange) {
        orders = orders.filter(order => {
          // Orders WITH businessDayId - filter by business day's date
          if (order.businessDayId) {
            // Skip for now - will be filtered by specific businessDayId when needed
            return false;
          }

          // Orders WITHOUT businessDayId (legacy) - filter by createdAt timestamp
          const orderDate = this.toDate(order.createdAt);
          if (!orderDate) return false;

          return orderDate >= dateRange.startDate && orderDate <= dateRange.endDate;
        });
      }
    } else {
      // Fallback to individual startDate/endDate filtering if no period specified
      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        orders = orders.filter(order => {
          // Only apply to legacy orders without businessDayId
          if (order.businessDayId) return false;

          const orderDate = this.toDate(order.createdAt);
          return orderDate && orderDate >= startDate;
        });
      }

      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        orders = orders.filter(order => {
          // Only apply to legacy orders without businessDayId
          if (order.businessDayId) return false;

          const orderDate = this.toDate(order.createdAt);
          return orderDate && orderDate <= endDate;
        });
      }
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

    // Check if business day is active
    const activeBusinessDay = await this.getActiveBusinessDay();
    if (!activeBusinessDay) {
      throw new Error('No active business day. Please open a business day first.');
    }

    // Validate required fields
    if (!orderData.driverId || !orderData.customerAddress || !orderData.lineItems || orderData.lineItems.length === 0) {
      throw new Error('Missing required order fields');
    }

    // Validate inventory availability for all line items (including free gifts)
    for (const item of orderData.lineItems) {
      const driverInventory = await this.getDriverInventory(orderData.driverId);
      const productInventory = driverInventory.find(inv => inv.id === item.productId);

      if (!productInventory || productInventory.remaining < item.actualQuantity) {
        const product = await this.getProductById(item.productId);
        const giftNote = item.isFreeGift ? ' (free gift)' : '';
        throw new Error(`Insufficient inventory for ${product ? product.name : 'unknown product'}${giftNote}`);
      }
    }

    try {
      const newOrderData = {
        driverId: orderData.driverId,
        salesRepId: session.userId, // Track who created the order
        customerAddress: orderData.customerAddress.trim(),
        customerDescription: orderData.customerDescription ? orderData.customerDescription.trim() : '',
        remark: orderData.remark ? orderData.remark.trim() : '',
        driverSalary: parseFloat(orderData.driverSalary) || 0,
        deliveryMethod: orderData.deliveryMethod || 'Paid',
        totalAmount: parseFloat(orderData.totalAmount) || 0,
        status: this.ORDER_STATUS.PENDING,
        lineItems: orderData.lineItems || [],
        businessDayId: activeBusinessDay.id, // Assign to current active business day
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null
      };

      const docRef = await addDoc(collection(db, this.COLLECTIONS.ORDERS), newOrderData);
      const newOrder = { id: docRef.id, ...newOrderData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

      // NOTE: Inventory is automatically tracked via orders.
      // The getDriverInventory method now uses orders instead of the legacy 'sales' collection
      // to prevent double inventory deduction.

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
        // Validate inventory availability for the new line items
        const driverId = updates.driverId || currentOrder.driverId;
        const driverInventory = await this.getDriverInventory(driverId);

        // Calculate old quantities by product
        const oldQuantities = {};
        currentOrder.lineItems.forEach(item => {
          oldQuantities[item.productId] = (oldQuantities[item.productId] || 0) + item.actualQuantity;
        });

        // Calculate new quantities by product
        const newQuantities = {};
        updates.lineItems.forEach(item => {
          newQuantities[item.productId] = (newQuantities[item.productId] || 0) + item.actualQuantity;
        });

        // Find all products involved (old and new)
        const allProductIds = new Set([...Object.keys(oldQuantities), ...Object.keys(newQuantities)]);

        // Validate each product's inventory
        for (const productId of allProductIds) {
          const oldQty = oldQuantities[productId] || 0;
          const newQty = newQuantities[productId] || 0;
          const netChange = newQty - oldQty; // Positive = need more, Negative = freeing up

          // Only validate if we need MORE inventory
          if (netChange > 0) {
            const productInventory = driverInventory.find(inv => inv.id === productId);

            if (!productInventory) {
              const product = await this.getProductById(productId);
              throw new Error(`Driver does not have ${product?.name || 'this product'} in inventory`);
            }

            // Available = current remaining + what we're freeing from this order
            const available = productInventory.remaining + oldQty;

            if (newQty > available) {
              const product = await this.getProductById(productId);
              throw new Error(`Insufficient inventory for ${product?.name || 'product'}. Available: ${available}, Required: ${newQty}`);
            }
          }
        }
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

    // Update order status and payment method based on driver payment choice
    const updateData = {
      status: this.ORDER_STATUS.CANCELLED,
      cancelledAt: new Date().toISOString()
    };

    // If not paying driver, change delivery method to 'Free' for earnings/reporting
    // Note: Inventory is automatically restored for ALL cancelled orders regardless of payment
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
      status: this.ORDER_STATUS.COMPLETED
      // completedAt timestamp is automatically handled by updateOrder method
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
   * Delete an order completely from the database
   * SAFE OPERATION: Driver inventory and earnings are automatically recalculated
   * - Driver inventory auto-restores (order no longer counted in "sold")
   * - Driver earnings auto-update (order no longer counted)
   * - All reports auto-update (order excluded from calculations)
   *
   * @param {string} orderId - Order ID to delete
   * @returns {Promise<Object|null>} Deleted order data or null if not found
   */
  async deleteOrder(orderId) {
    try {
      // Get order data before deletion (for return value)
      const order = await this.getOrderById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Delete the order document
      await deleteDoc(doc(db, this.COLLECTIONS.ORDERS, orderId));

      // NO manual inventory restoration needed!
      // Driver inventory is calculated on-the-fly via getDriverInventory()
      // which automatically excludes deleted orders from the "sold" calculation

      return order;
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  },

  /**
   * Get orders with advanced filtering options (now uses enhanced getOrdersWithFilters)
   * @param {Object} filters - Filter options (same as getOrdersWithFilters)
   * @returns {Array} Filtered orders
   */
  async getOrdersWithAdvancedFilters(filters = {}) {
    // Use the enhanced getOrdersWithFilters method which now handles all filtering logic
    return await this.getOrdersWithFilters(filters);
  },

  /**
   * Get orders by period (for reports compatibility)
   * @param {string} driverId - Driver ID (optional)
   * @param {string} period - Period type
   * @param {string} date - Target date
   * @returns {Array} Filtered orders (includes completed and cancelled orders)
   */
  getOrdersByPeriod(driverId, period, date) {
    return this.getOrdersWithFilters({
      driverId: driverId,
      period: period,
      date: date
      // Note: No status filter - returns ALL orders (completed, cancelled, pending)
      // Calling code can filter by status as needed
    });
  },

  /**
   * Get order statistics
   * @param {Object} filters - Optional filters (same as getOrdersWithFilters)
   * @returns {Promise<Object>} Order statistics
   */
  async getOrderStats(filters = {}) {
    const orders = await this.getOrdersWithFilters(filters);

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
   * Get inventory for all drivers with alert flags
   * @param {number} threshold - Low stock threshold (default: 5)
   * @returns {Array} Array of {driver, inventory} objects with alert flags
   */
  async getAllDriversInventory(threshold = 5) {
    const drivers = await this.getAllDrivers();

    const inventoryPromises = drivers.map(async driver => ({
      driver: driver,
      inventory: await this.getDriverInventoryWithAlerts(driver.id, threshold)
    }));

    return await Promise.all(inventoryPromises);
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
  },

  /**
   * Reset the entire database - DELETE ALL DATA
   * WARNING: This action is irreversible!
   * @returns {Promise<Object>} Result with counts of deleted items
   */
  async resetDatabase() {
    try {
      const batch = writeBatch(db);
      const result = {
        products: 0,
        drivers: 0,
        assignments: 0,
        orders: 0,
        sales: 0,
        stockTransfers: 0,
        users: 0,
        sessions: 0
      };

      // Delete all products
      const productsSnapshot = await getDocs(collection(db, this.COLLECTIONS.PRODUCTS));
      productsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        result.products++;
      });

      // Delete all drivers
      const driversSnapshot = await getDocs(collection(db, this.COLLECTIONS.DRIVERS));
      driversSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        result.drivers++;
      });

      // Delete all assignments
      const assignmentsSnapshot = await getDocs(collection(db, this.COLLECTIONS.ASSIGNMENTS));
      assignmentsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        result.assignments++;
      });

      // Delete all orders
      const ordersSnapshot = await getDocs(collection(db, this.COLLECTIONS.ORDERS));
      ordersSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        result.orders++;
      });

      // Delete all sales
      const salesSnapshot = await getDocs(collection(db, this.COLLECTIONS.SALES));
      salesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        result.sales++;
      });

      // Delete all stock transfers
      const transfersSnapshot = await getDocs(collection(db, this.COLLECTIONS.STOCK_TRANSFERS));
      transfersSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        result.stockTransfers++;
      });

      // Delete all users
      const usersSnapshot = await getDocs(collection(db, this.COLLECTIONS.USERS));
      usersSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        result.users++;
      });

      // Delete all sessions
      const sessionsSnapshot = await getDocs(collection(db, this.COLLECTIONS.SESSIONS));
      sessionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        result.sessions++;
      });

      // Commit the batch delete
      await batch.commit();

      // Clear local session
      this.logout();

      // Recreate default admin user
      await this.createDefaultAdmin();

      return result;
    } catch (error) {
      console.error('Error resetting database:', error);
      throw error;
    }
  },

  // ===================================
  // DIRECT PAYMENT METHODS
  // ===================================

  /**
   * Create a direct payment to a driver
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Created payment object
   */
  async createDirectPayment(paymentData) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Validate required fields
    if (!paymentData.driverId) {
      throw new Error('Driver ID is required');
    }
    if (paymentData.amount === undefined || paymentData.amount === null || paymentData.amount === 0) {
      throw new Error('Amount is required and cannot be zero');
    }
    if (!paymentData.paymentType) {
      throw new Error('Payment type is required');
    }
    if (!paymentData.reason || paymentData.reason.trim().length < 5) {
      throw new Error('Reason is required (minimum 5 characters)');
    }

    // Verify driver exists
    const driver = await this.getDriverById(paymentData.driverId);
    if (!driver) {
      throw new Error('Driver not found');
    }

    try {
      const newPaymentData = {
        driverId: paymentData.driverId,
        amount: parseFloat(paymentData.amount),
        paymentType: paymentData.paymentType,
        reason: paymentData.reason.trim(),
        createdBy: session.userId,
        createdAt: serverTimestamp(),
        date: paymentData.date ? new Date(paymentData.date) : serverTimestamp()
      };

      const docRef = await addDoc(collection(db, this.COLLECTIONS.DIRECT_PAYMENTS), newPaymentData);
      const newPayment = {
        id: docRef.id,
        ...newPaymentData,
        createdAt: new Date().toISOString(),
        date: paymentData.date ? new Date(paymentData.date).toISOString() : new Date().toISOString()
      };

      return newPayment;
    } catch (error) {
      console.error('Error creating direct payment:', error);
      throw error;
    }
  },

  /**
   * Get all direct payments for a driver (ADMIN-TO-DRIVER only)
   * @param {string} driverId - Driver ID
   * @returns {Promise<Array>} Array of payment objects
   */
  async getDirectPaymentsByDriver(driverId) {
    try {
      const paymentsQuery = query(
        collection(db, this.COLLECTIONS.DIRECT_PAYMENTS),
        where('driverId', '==', driverId)
      );

      const snapshot = await getDocs(paymentsQuery);
      const allPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // IMPORTANT: Filter out driver-to-boss payments (only return admin-to-driver)
      const payments = allPayments.filter(payment => payment.direction !== 'driver_to_boss');

      // Sort by date in JavaScript (descending)
      payments.sort((a, b) => {
        const aDate = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const bDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return bDate - aDate;
      });

      return payments;
    } catch (error) {
      console.error('Error getting direct payments by driver:', error);
      return [];
    }
  },

  /**
   * Get direct payments filtered by period (ADMIN-TO-DRIVER only)
   * @param {string} driverId - Driver ID (optional, null for all drivers)
   * @param {string} period - Period type (day/week/month/year)
   * @param {string} date - Target date
   * @returns {Promise<Array>} Filtered payment objects
   */
  async getDirectPaymentsByPeriod(driverId, period, date) {
    try {
      const targetDate = new Date(date);
      let startDate, endDate;

      // Calculate date range based on period
      switch (period) {
        case 'day':
          startDate = new Date(targetDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(targetDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'week': {
          const dayOfWeek = targetDate.getDay();
          startDate = new Date(targetDate);
          startDate.setDate(targetDate.getDate() - dayOfWeek);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        }
        case 'month':
          startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
          endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        case 'year':
          startDate = new Date(targetDate.getFullYear(), 0, 1);
          endDate = new Date(targetDate.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
        default:
          throw new Error('Invalid period');
      }

      // Fetch all payments and filter in JavaScript to avoid composite index requirement
      let paymentsQuery;
      if (driverId) {
        // Only filter by driver ID in the query
        paymentsQuery = query(
          collection(db, this.COLLECTIONS.DIRECT_PAYMENTS),
          where('driverId', '==', driverId)
        );
      } else {
        // Get all payments
        paymentsQuery = query(
          collection(db, this.COLLECTIONS.DIRECT_PAYMENTS)
        );
      }

      const snapshot = await getDocs(paymentsQuery);
      const allPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filter by date range AND exclude driver-to-boss payments in JavaScript
      const payments = allPayments.filter(payment => {
        const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
        const inDateRange = paymentDate >= startDate && paymentDate <= endDate;
        // IMPORTANT: Only include admin-to-driver payments (exclude driver-to-boss)
        const isAdminToDriver = payment.direction !== 'driver_to_boss';
        return inDateRange && isAdminToDriver;
      });

      // Sort by date in JavaScript (descending)
      payments.sort((a, b) => {
        const aDate = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const bDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return bDate - aDate;
      });

      return payments;
    } catch (error) {
      console.error('Error getting direct payments by period:', error);
      return [];
    }
  },

  /**
   * Get all direct payments (admin view, ADMIN-TO-DRIVER only)
   * @returns {Promise<Array>} Array of all payment objects
   */
  async getAllDirectPayments() {
    try {
      const paymentsQuery = query(
        collection(db, this.COLLECTIONS.DIRECT_PAYMENTS)
      );

      const snapshot = await getDocs(paymentsQuery);
      const allPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // IMPORTANT: Filter out driver-to-boss payments (only return admin-to-driver)
      const payments = allPayments.filter(payment => payment.direction !== 'driver_to_boss');

      // Sort by date in JavaScript (descending)
      payments.sort((a, b) => {
        const aDate = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const bDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return bDate - aDate;
      });

      return payments;
    } catch (error) {
      console.error('Error getting all direct payments:', error);
      return [];
    }
  },

  /**
   * Delete a direct payment
   * @param {string} paymentId - Payment ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteDirectPayment(paymentId) {
    try {
      await deleteDoc(doc(db, this.COLLECTIONS.DIRECT_PAYMENTS, paymentId));
      return true;
    } catch (error) {
      console.error('Error deleting direct payment:', error);
      throw error;
    }
  },

  /**
   * Listen to direct payments changes (ADMIN-TO-DRIVER only)
   * @param {Function} callback - Callback function to handle updates
   * @param {Object} filters - Optional filters (driverId, etc.)
   * @returns {string} Listener ID
   */
  listenToDirectPayments(callback, filters = {}) {
    try {
      let paymentsQuery;

      if (filters.driverId) {
        paymentsQuery = query(
          collection(db, this.COLLECTIONS.DIRECT_PAYMENTS),
          where('driverId', '==', filters.driverId),
          orderBy('date', 'desc')
        );
      } else {
        paymentsQuery = query(
          collection(db, this.COLLECTIONS.DIRECT_PAYMENTS),
          orderBy('date', 'desc')
        );
      }

      const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
        const allPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // IMPORTANT: Filter out driver-to-boss payments (only return admin-to-driver)
        const payments = allPayments.filter(payment => payment.direction !== 'driver_to_boss');
        callback(payments);
      });

      const listenerId = `directPayments_${Date.now()}`;
      this.listeners.set(listenerId, unsubscribe);

      return listenerId;
    } catch (error) {
      console.error('Error listening to direct payments:', error);
      throw error;
    }
  },

  // ==================== DRIVER TO BOSS PAYMENT METHODS ====================

  /**
   * Create a driver-to-boss payment (driver-initiated, requires approval)
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} Created payment object
   */
  async createDriverToBossPayment(paymentData) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Validate required fields
    if (!paymentData.driverId) {
      throw new Error('Driver ID is required');
    }
    if (paymentData.amount === undefined || paymentData.amount === null || paymentData.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    if (!paymentData.reason || paymentData.reason.trim().length < 5) {
      throw new Error('Reason is required (minimum 5 characters)');
    }

    // Verify driver exists
    const driver = await this.getDriverById(paymentData.driverId);
    if (!driver) {
      throw new Error('Driver not found');
    }

    try {
      const newPaymentData = {
        driverId: paymentData.driverId,
        amount: parseFloat(paymentData.amount),
        paymentType: 'Boss Payment', // Fixed type for driver-to-boss payments
        reason: paymentData.reason.trim(),
        direction: 'driver_to_boss', // NEW: Distinguish from admin-to-driver payments
        status: 'pending',            // NEW: Requires approval
        createdBy: session.userId,    // Driver who created it
        createdAt: serverTimestamp(),
        date: serverTimestamp()       // Use current date
      };

      const docRef = await addDoc(collection(db, this.COLLECTIONS.DIRECT_PAYMENTS), newPaymentData);
      const newPayment = {
        id: docRef.id,
        ...newPaymentData,
        createdAt: new Date().toISOString(),
        date: new Date().toISOString()
      };

      return newPayment;
    } catch (error) {
      console.error('Error creating driver-to-boss payment:', error);
      throw error;
    }
  },

  /**
   * Update an existing payment
   * @param {string} paymentId - Payment ID to update
   * @param {Object} updates - Fields to update (date, amount, reason)
   * @returns {Promise<void>}
   */
  async updatePayment(paymentId, updates) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    try {
      const updateData = {};

      // Update date if provided
      if (updates.date) {
        updateData.date = Timestamp.fromDate(new Date(updates.date));
      }

      // Update amount if provided
      if (updates.amount !== undefined) {
        if (updates.amount <= 0) {
          throw new Error('Amount must be greater than zero');
        }
        updateData.amount = parseFloat(updates.amount);
      }

      // Update reason if provided
      if (updates.reason) {
        if (updates.reason.trim().length < 5) {
          throw new Error('Reason must be at least 5 characters');
        }
        updateData.reason = updates.reason.trim();
      }

      // Add update timestamp
      updateData.updatedAt = serverTimestamp();
      updateData.updatedBy = session.userId;

      await updateDoc(doc(db, this.COLLECTIONS.DIRECT_PAYMENTS, paymentId), updateData);

    } catch (error) {
      console.error('Error updating payment:', error);
      throw error;
    }
  },

  /**
   * Create driver-to-boss payment by admin (auto-approved)
   * This is used when admin submits payment on behalf of driver (e.g., cash payment in real life)
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} The created payment object
   */
  async createDriverToBossPaymentByAdmin(paymentData) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Validate required fields
    if (!paymentData.driverId) {
      throw new Error('Driver ID is required');
    }
    if (!paymentData.driverName) {
      throw new Error('Driver name is required');
    }
    if (paymentData.amount === undefined || paymentData.amount === null || paymentData.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    if (!paymentData.reason || paymentData.reason.trim().length < 5) {
      throw new Error('Reason is required (minimum 5 characters)');
    }

    // Verify driver exists
    const driver = await this.getDriverById(paymentData.driverId);
    if (!driver) {
      throw new Error('Driver not found');
    }

    try {
      const now = serverTimestamp();
      // Use provided payment date or default to now
      const paymentDate = paymentData.paymentDate
        ? Timestamp.fromDate(new Date(paymentData.paymentDate))
        : now;

      const newPaymentData = {
        driverId: paymentData.driverId,
        driverName: paymentData.driverName,
        amount: parseFloat(paymentData.amount),
        paymentType: 'Boss Payment', // Fixed type for driver-to-boss payments
        reason: paymentData.reason.trim(),
        direction: 'driver_to_boss', // Distinguish from admin-to-driver payments
        status: 'approved',           // AUTO-APPROVED since admin is submitting
        createdBy: session.userId,    // Admin who created it
        createdAt: now,              // When entered into system
        approvedBy: session.userId,   // Same admin who created it
        approvedAt: now,
        date: paymentDate            // Actual payment date (can be backdated)
      };

      const docRef = await addDoc(collection(db, this.COLLECTIONS.DIRECT_PAYMENTS), newPaymentData);
      const newPayment = {
        id: docRef.id,
        ...newPaymentData,
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        date: new Date().toISOString()
      };

      console.log('Admin created driver-to-boss payment (auto-approved):', newPayment);
      return newPayment;
    } catch (error) {
      console.error('Error creating driver-to-boss payment by admin:', error);
      throw error;
    }
  },

  /**
   * Get all pending driver-to-boss payments (for admin approval)
   * @param {string} driverId - Optional driver ID to filter by specific driver
   * @returns {Promise<Array>} Array of pending payment objects
   */
  async getPendingDriverPayments(driverId = null) {
    try {
      let paymentsQuery;

      if (driverId) {
        // Get pending payments for specific driver
        paymentsQuery = query(
          collection(db, this.COLLECTIONS.DIRECT_PAYMENTS),
          where('driverId', '==', driverId),
          where('direction', '==', 'driver_to_boss'),
          where('status', '==', 'pending')
        );
      } else {
        // Get all pending payments (for admin)
        paymentsQuery = query(
          collection(db, this.COLLECTIONS.DIRECT_PAYMENTS),
          where('direction', '==', 'driver_to_boss'),
          where('status', '==', 'pending')
        );
      }

      const snapshot = await getDocs(paymentsQuery);
      const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Sort by creation date (newest first)
      payments.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return bDate - aDate;
      });

      return payments;
    } catch (error) {
      console.error('Error getting pending driver payments:', error);
      return [];
    }
  },

  /**
   * Get approved driver-to-boss payments for a period (for holding calculation)
   * @param {string} driverId - Driver ID
   * @param {string} period - Period type ('day', 'week', 'month', 'year', null for all-time)
   * @param {Date} date - Target date (null for all-time)
   * @returns {Promise<Array>} Array of approved payment objects
   */
  async getApprovedDriverPayments(driverId, period, date) {
    try {
      const paymentsQuery = query(
        collection(db, this.COLLECTIONS.DIRECT_PAYMENTS),
        where('driverId', '==', driverId),
        where('direction', '==', 'driver_to_boss'),
        where('status', '==', 'approved')
      );

      const snapshot = await getDocs(paymentsQuery);
      const allPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // If no period/date specified, return all-time approved payments
      if (!period || !date) {
        return allPayments;
      }

      // Calculate date range based on period
      const targetDate = new Date(date);
      let startDate, endDate;

      switch (period) {
        case 'day':
          startDate = new Date(targetDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(targetDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'week': {
          const dayOfWeek = targetDate.getDay();
          startDate = new Date(targetDate);
          startDate.setDate(targetDate.getDate() - dayOfWeek);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        }
        case 'month':
          startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
          endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        case 'year':
          startDate = new Date(targetDate.getFullYear(), 0, 1);
          endDate = new Date(targetDate.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
        default:
          throw new Error('Invalid period');
      }

      // Filter by date range in JavaScript
      const payments = allPayments.filter(payment => {
        const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
        return paymentDate >= startDate && paymentDate <= endDate;
      });

      return payments;
    } catch (error) {
      console.error('Error getting approved driver payments:', error);
      return [];
    }
  },

  /**
   * Approve a driver-to-boss payment
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Updated payment object
   */
  async approveDriverPayment(paymentId) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Only admins can approve
    if (session.role !== this.ROLES.ADMIN) {
      throw new Error('Only admins can approve payments');
    }

    try {
      const paymentRef = doc(db, this.COLLECTIONS.DIRECT_PAYMENTS, paymentId);
      const paymentDoc = await getDoc(paymentRef);

      if (!paymentDoc.exists()) {
        throw new Error('Payment not found');
      }

      const payment = paymentDoc.data();
      if (payment.status !== 'pending') {
        throw new Error('Payment is not pending');
      }

      const updateData = {
        status: 'approved',
        approvedBy: session.userId,
        approvedAt: serverTimestamp()
      };

      await updateDoc(paymentRef, updateData);

      return {
        id: paymentId,
        ...payment,
        ...updateData,
        approvedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error approving driver payment:', error);
      throw error;
    }
  },

  /**
   * Cancel a driver-to-boss payment
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Updated payment object
   */
  async cancelDriverPayment(paymentId) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Only admins can cancel
    if (session.role !== this.ROLES.ADMIN) {
      throw new Error('Only admins can cancel payments');
    }

    try {
      const paymentRef = doc(db, this.COLLECTIONS.DIRECT_PAYMENTS, paymentId);
      const paymentDoc = await getDoc(paymentRef);

      if (!paymentDoc.exists()) {
        throw new Error('Payment not found');
      }

      const payment = paymentDoc.data();
      if (payment.status !== 'pending') {
        throw new Error('Payment is not pending');
      }

      const updateData = {
        status: 'cancelled',
        cancelledBy: session.userId,
        cancelledAt: serverTimestamp()
      };

      await updateDoc(paymentRef, updateData);

      return {
        id: paymentId,
        ...payment,
        ...updateData,
        cancelledAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error cancelling driver payment:', error);
      throw error;
    }
  },

  /**
   * Get all driver-to-boss payment history for a driver (all statuses)
   * @param {string} driverId - Driver ID
   * @returns {Promise<Array>} Array of payment objects
   */
  async getDriverPaymentHistory(driverId) {
    try {
      const paymentsQuery = query(
        collection(db, this.COLLECTIONS.DIRECT_PAYMENTS),
        where('driverId', '==', driverId),
        where('direction', '==', 'driver_to_boss')
      );

      const snapshot = await getDocs(paymentsQuery);
      const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Sort by creation date (newest first)
      payments.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return bDate - aDate;
      });

      return payments;
    } catch (error) {
      console.error('Error getting driver payment history:', error);
      return [];
    }
  },

  // ===============================
  // BUSINESS DAY MANAGEMENT
  // ===============================

  /**
   * Hash a PIN using PBKDF2 (same as password hashing)
   * @param {string} pin - 4-digit PIN to hash
   * @returns {Promise<string>} Hashed PIN
   */
  async hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + appConfig.security.hashSalt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Get the current active business day
   * @returns {Promise<Object|null>} Active business day or null
   */
  async getActiveBusinessDay() {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.BUSINESS_DAYS),
        where('status', '==', 'active'),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error getting active business day:', error);
      return null;
    }
  },

  /**
   * Get business day by date string
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Object|null>} Business day or null
   */
  async getBusinessDayByDate(dateStr) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.BUSINESS_DAYS),
        where('date', '==', dateStr),
        orderBy('dayNumber', 'asc') // Get all business days for this date, ordered chronologically
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      // Return array of all business days for this date (supports multiple sessions per day)
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting business day by date:', error);
      return null;
    }
  },

  /**
   * Get all business days ordered by day number
   * @returns {Promise<Array>} Array of business days
   */
  async getAllBusinessDays() {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.BUSINESS_DAYS),
        orderBy('dayNumber', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting all business days:', error);
      return [];
    }
  },

  /**
   * Get business days up to a specific date (for cumulative calculations)
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of business days up to date
   */
  async getBusinessDaysUpToDate(dateStr) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.BUSINESS_DAYS),
        where('date', '<=', dateStr),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting business days up to date:', error);
      return [];
    }
  },

  /**
   * Verify business day PIN
   * @param {string} pin - PIN to verify
   * @returns {Promise<boolean>} True if PIN is correct
   */
  async verifyBusinessDayPin(pin) {
    try {
      // Check rate limiting
      const failedAttempts = parseInt(sessionStorage.getItem('pinFailedAttempts') || '0');
      const lockoutUntil = parseInt(sessionStorage.getItem('pinLockoutUntil') || '0');

      if (Date.now() < lockoutUntil) {
        const remainingSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
        throw new Error(`Too many failed attempts. Try again in ${remainingSeconds} seconds.`);
      }

      // Get stored PIN hash
      const settingsRef = doc(db, this.COLLECTIONS.SETTINGS, 'businessDayPin');
      const settingsDoc = await getDoc(settingsRef);

      if (!settingsDoc.exists()) {
        throw new Error('PIN not configured. Contact administrator.');
      }

      const storedHash = settingsDoc.data().pinHash;
      const inputHash = await this.hashPin(pin);

      if (inputHash === storedHash) {
        // Success - reset attempts
        sessionStorage.setItem('pinFailedAttempts', '0');
        sessionStorage.removeItem('pinLockoutUntil');
        return true;
      } else {
        // Failed - increment attempts
        const newFailedAttempts = failedAttempts + 1;
        sessionStorage.setItem('pinFailedAttempts', newFailedAttempts.toString());

        if (newFailedAttempts >= 3) {
          // Lockout for 5 minutes
          const lockout = Date.now() + (5 * 60 * 1000);
          sessionStorage.setItem('pinLockoutUntil', lockout.toString());
          throw new Error('Too many failed attempts. Locked out for 5 minutes.');
        }

        throw new Error(`Invalid PIN. ${3 - newFailedAttempts} attempts remaining.`);
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      throw error;
    }
  },

  /**
   * Set or update business day PIN (admin only)
   * @param {string} newPin - New 4-digit PIN
   * @param {string} adminUserId - Admin user ID
   * @returns {Promise<void>}
   */
  async setBusinessDayPin(newPin, adminUserId) {
    try {
      // Verify user is admin
      const session = this.getCurrentSession();
      if (!session || session.role !== this.ROLES.ADMIN) {
        throw new Error('Only administrators can set PIN');
      }

      // Validate PIN format
      if (!/^\d{4}$/.test(newPin)) {
        throw new Error('PIN must be exactly 4 digits');
      }

      // Hash the PIN
      const pinHash = await this.hashPin(newPin);

      // Store in settings collection with fixed document ID
      const settingsRef = doc(db, this.COLLECTIONS.SETTINGS, 'businessDayPin');

      // Use setDoc with merge to create or update
      await setDoc(settingsRef, {
        pinHash: pinHash,
        updatedAt: serverTimestamp(),
        updatedBy: adminUserId
      }, { merge: true });

      console.log('Business day PIN set successfully');
    } catch (error) {
      console.error('Error setting PIN:', error);
      throw error;
    }
  },

  /**
   * Check if business day PIN has been configured
   * @returns {Promise<boolean>} True if PIN is set
   */
  async isBusinessDayPinConfigured() {
    try {
      const settingsRef = doc(db, this.COLLECTIONS.SETTINGS, 'businessDayPin');
      const settingsDoc = await getDoc(settingsRef);
      return settingsDoc.exists();
    } catch (error) {
      console.error('Error checking PIN configuration:', error);
      return false;
    }
  },

  /**
   * Open a new business day
   * @param {string} userId - User ID opening the day
   * @param {string} userName - User name opening the day
   * @param {string} pin - 4-digit PIN for authorization
   * @returns {Promise<Object>} Created business day
   */
  async openBusinessDay(userId, userName, pin) {
    try {
      // 1. Verify PIN
      await this.verifyBusinessDayPin(pin);

      // 2. Check for existing active day
      const existingActive = await this.getActiveBusinessDay();
      if (existingActive) {
        throw new Error(`Day #${existingActive.dayNumber} is already active. Close it first.`);
      }

      // 3. Get next day number
      const allDays = await this.getAllBusinessDays();
      const dayNumber = allDays.length + 1;

      // 4. Create new business day
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`; // Local timezone date

      const businessDayData = {
        dayNumber: dayNumber,
        date: dateStr,
        displayLabel: `Day #${dayNumber} (${today.toLocaleDateString()})`,
        status: 'active',
        openedAt: serverTimestamp(),
        openedBy: userId,
        openedByName: userName,
        closedAt: null,
        closedBy: null,
        closedByName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, this.COLLECTIONS.BUSINESS_DAYS), businessDayData);

      console.log(`Business day #${dayNumber} opened successfully`);
      return { id: docRef.id, ...businessDayData };
    } catch (error) {
      console.error('Error opening business day:', error);
      throw error;
    }
  },

  /**
   * Close the current active business day
   * @param {string} userId - User ID closing the day
   * @param {string} userName - User name closing the day
   * @param {string} pin - 4-digit PIN for authorization
   * @returns {Promise<Object>} Closed business day
   */
  async closeBusinessDay(userId, userName, pin) {
    try {
      // 1. Verify PIN
      await this.verifyBusinessDayPin(pin);

      // 2. Get active business day
      const activeDay = await this.getActiveBusinessDay();
      if (!activeDay) {
        throw new Error('No active business day to close');
      }

      // 3. Save inventory snapshots for all drivers BEFORE closing
      await this.saveInventorySnapshots(activeDay.id, activeDay.date);

      // 4. Update business day to closed
      const dayRef = doc(db, this.COLLECTIONS.BUSINESS_DAYS, activeDay.id);
      await updateDoc(dayRef, {
        status: 'closed',
        closedAt: serverTimestamp(),
        closedBy: userId,
        closedByName: userName,
        updatedAt: serverTimestamp()
      });

      console.log(`Business day #${activeDay.dayNumber} closed successfully`);
      return { ...activeDay, status: 'closed', closedBy: userId, closedByName: userName };
    } catch (error) {
      console.error('Error closing business day:', error);
      throw error;
    }
  },

  /**
   * Get orders for a specific business day
   * @param {string} businessDayId - Business day ID
   * @returns {Promise<Array>} Array of orders
   */
  async getBusinessDayOrders(businessDayId) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.ORDERS),
        where('businessDayId', '==', businessDayId)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting business day orders:', error);
      return [];
    }
  },

  /**
   * Get orders by period (intelligently uses business day or legacy date filtering)
   * @param {string} driverId - Optional driver ID
   * @param {string} period - Period type (day, week, month, year)
   * @param {string|Date} date - Target date
   * @returns {Promise<Array>} Filtered orders
   */
  async getOrdersByPeriod(driverId, period, date) {
    try {
      // For 'day' period, check if there's a business day for this date
      if (period === 'day') {
        let dateStr;
        if (typeof date === 'string') {
          dateStr = date;
        } else {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`; // Local timezone date
        }
        const businessDays = await this.getBusinessDayByDate(dateStr);

        if (businessDays && businessDays.length > 0) {
          // getBusinessDayByDate now returns an array of business days
          // Get orders from all business day sessions for this date
          const businessDayIds = businessDays.map(day => day.id);

          const allOrdersArrays = await Promise.all(
            businessDayIds.map(dayId =>
              this.getOrdersWithFilters({
                driverId: driverId || undefined,
                businessDayId: dayId
              })
            )
          );

          // Flatten array of arrays into single array
          return allOrdersArrays.flat();
        }

        // No business day found - fall back to calendar date filtering for backward compatibility
        // This allows viewing old orders from before the business day feature was implemented
        return await this.getOrdersWithFilters({
          driverId: driverId || undefined,
          period: 'day',
          date: date
        });
      }

      // Fall back to timestamp filtering for week/month/year periods
      return await this.getOrdersWithFilters({
        driverId: driverId || undefined,
        period: period,
        date: date
      });
    } catch (error) {
      console.error('Error getting orders by period:', error);
      return [];
    }
  },

  /**
   * Listen to active business day changes
   * @param {Function} callback - Callback function to handle updates
   * @returns {Function} Unsubscribe function
   */
  listenToActiveBusinessDay(callback) {
    const listenerId = 'activeBusinessDay';

    // Cleanup existing listener if any
    this.cleanupListener(listenerId);

    const q = query(
      collection(db, this.COLLECTIONS.BUSINESS_DAYS),
      where('status', '==', 'active'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
      } else {
        const doc = snapshot.docs[0];
        callback({ id: doc.id, ...doc.data() });
      }
    }, (error) => {
      console.error('Error in active business day listener:', error);
      callback(null);
    });

    // Store listener
    this.listeners.set(listenerId, unsubscribe);

    return unsubscribe;
  },

  // ===============================
  // INVENTORY SNAPSHOT METHODS
  // ===============================

  /**
   * Save inventory snapshot for all drivers when closing a business day
   * @param {string} businessDayId - Business day ID
   * @param {string} businessDayDate - Business day date (YYYY-MM-DD)
   * @returns {Promise<void>}
   */
  async saveInventorySnapshots(businessDayId, businessDayDate) {
    try {
      const drivers = await this.getAllDrivers();

      for (const driver of drivers) {
        const inventory = await this.getDriverInventory(driver.id);

        // Create snapshot with only productId, productName, and remaining
        const snapshot = inventory.map(item => ({
          productId: item.id,
          productName: item.name,
          remaining: item.remaining
        }));

        const snapshotData = {
          businessDayId,
          businessDayDate,
          driverId: driver.id,
          driverName: driver.name,
          snapshot,
          createdAt: serverTimestamp()
        };

        await addDoc(collection(db, this.COLLECTIONS.INVENTORY_SNAPSHOTS), snapshotData);
      }

      console.log(`Inventory snapshots saved for ${drivers.length} drivers`);
    } catch (error) {
      console.error('Error saving inventory snapshots:', error);
      throw error;
    }
  },

  /**
   * Get inventory snapshot for a driver on a specific date
   * @param {string} driverId - Driver ID
   * @param {string} date - Date string (YYYY-MM-DD)
   * @returns {Promise<Object|null>} Snapshot data or null if not found
   */
  async getInventorySnapshot(driverId, date) {
    try {
      const q = query(
        collection(db, this.COLLECTIONS.INVENTORY_SNAPSHOTS),
        where('driverId', '==', driverId),
        where('businessDayDate', '==', date),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error getting inventory snapshot:', error);
      return null;
    }
  }
};

// Make DB globally accessible for testing
window.DB = DB;

// Initialize the database when script loads
DB.init().catch(error => {
  console.error('Database initialization failed:', error);
});
