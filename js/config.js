/**
 * Configuration loader for environment variables
 * Handles fallbacks for different deployment scenarios
 */

/**
 * Get environment variable with fallback
 * @param {string} key - Environment variable key
 * @param {string} fallback - Fallback value if env var not found
 * @returns {string} Environment variable value or fallback
 */
function getEnvVar(key, fallback = '') {
  // Check for Vite-style environment variables (for build tools)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || fallback;
  }

  // Check for Node.js-style environment variables (for server-side)
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }

  // Check for custom window.env (can be set by build process)
  if (typeof window !== 'undefined' && window.env) {
    return window.env[key] || fallback;
  }

  // Return fallback for client-side without env setup
  return fallback;
}

/**
 * Environment Detection
 * Determines if running locally or in production
 */
const isLocalEnvironment = () => {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname;
  return hostname === 'localhost' ||
         hostname === '127.0.0.1' ||
         hostname === '0.0.0.0' ||
         hostname.includes('192.168.'); // Local network IPs
};

/**
 * Development Firebase Configuration
 * Used when running on localhost
 */
const DEV_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAYtiwQmZcEs8YQqNbYRWOf2poYaMoMCy8",
  authDomain: "chong-dev-aa98a.firebaseapp.com",
  projectId: "chong-dev-aa98a",
  storageBucket: "chong-dev-aa98a.firebasestorage.app",
  messagingSenderId: "992860157593",
  appId: "1:992860157593:web:a4bb6ac91753c883d16a08"
};

/**
 * Production Firebase Configuration
 * Used when deployed to Firebase Hosting
 */
const PROD_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAFcbgTrdkC6HEw6cYrYnJwOSFuXmeGITY",
  authDomain: "chong-918f9.firebaseapp.com",
  projectId: "chong-918f9",
  storageBucket: "chong-918f9.firebasestorage.app",
  messagingSenderId: "90026447698",
  appId: "1:90026447698:web:616336add43a855d8f608b"
};

/**
 * Firebase configuration with automatic environment detection
 * Automatically uses DEV config on localhost, PROD config when deployed
 */
export const firebaseConfig = isLocalEnvironment() ? DEV_FIREBASE_CONFIG : PROD_FIREBASE_CONFIG;

/**
 * Application configuration
 */
export const appConfig = {
  // Session configuration
  session: {
    timeoutMinutes: parseInt(getEnvVar('VITE_SESSION_TIMEOUT_MINUTES', '480')), // 8 hours
    tokenLength: parseInt(getEnvVar('VITE_SESSION_TOKEN_LENGTH', '32')),
    secureCookies: getEnvVar('VITE_SECURE_COOKIES', 'true') === 'true'
  },

  // Security configuration
  security: {
    pbkdf2Iterations: parseInt(getEnvVar('VITE_PBKDF2_ITERATIONS', '100000')),
    saltLength: parseInt(getEnvVar('VITE_SALT_LENGTH', '16'))
  },

  // Environment detection
  isDevelopment: isLocalEnvironment(),
  isProduction: !isLocalEnvironment(),
  currentEnvironment: isLocalEnvironment() ? 'development' : 'production',
  currentProject: isLocalEnvironment() ? 'chong-dev-aa98a' : 'chong-918f9'
};

// Validation helper
export function validateConfig() {
  const requiredKeys = [
    'apiKey', 'authDomain', 'projectId',
    'storageBucket', 'messagingSenderId', 'appId'
  ];

  const missing = requiredKeys.filter(key => !firebaseConfig[key]);

  if (missing.length > 0) {
    console.warn('Missing Firebase configuration keys:', missing);
    return false;
  }

  return true;
}

// Log configuration status
console.log('🔥 Firebase Configuration:', {
  environment: appConfig.currentEnvironment,
  project: appConfig.currentProject,
  isLocal: appConfig.isDevelopment,
  hasValidConfig: validateConfig(),
  sessionTimeout: appConfig.session.timeoutMinutes + ' minutes'
});