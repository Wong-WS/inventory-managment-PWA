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
 * Firebase configuration with environment variable support
 * Falls back to build-time values if env vars not available
 */
export const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY', 'AIzaSyAFcbgTrdkC6HEw6cYrYnJwOSFuXmeGITY'),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', 'chong-918f9.firebaseapp.com'),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID', 'chong-918f9'),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', 'chong-918f9.firebasestorage.app'),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', '90026447698'),
  appId: getEnvVar('VITE_FIREBASE_APP_ID', '1:90026447698:web:616336add43a855d8f608b')
};

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
  isDevelopment: getEnvVar('NODE_ENV', 'development') === 'development',
  isProduction: getEnvVar('NODE_ENV', 'development') === 'production'
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

// Log configuration status in development
if (appConfig.isDevelopment) {
  console.log('Configuration loaded:', {
    hasValidFirebaseConfig: validateConfig(),
    environment: getEnvVar('NODE_ENV', 'development'),
    sessionTimeout: appConfig.session.timeoutMinutes + ' minutes'
  });
}