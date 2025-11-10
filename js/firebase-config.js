// Modern Firebase v9+ Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { firebaseConfig, validateConfig } from "./config.js";

// Validate configuration before initializing
if (!validateConfig()) {
  throw new Error('Invalid Firebase configuration. Please check your environment variables.');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services and export them
export const db = getFirestore(app);
export const auth = getAuth(app);
export { app as firebaseApp };

// Enable offline persistence to reduce Firebase reads
// This caches data locally and only fetches changes
enableIndexedDbPersistence(db)
  .then(() => {
    console.log('Firestore offline persistence enabled');
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time
      console.warn('Offline persistence: Multiple tabs open, using first tab only');
    } else if (err.code === 'unimplemented') {
      // Browser doesn't support all features required for persistence
      console.warn('Offline persistence: Browser does not support required features');
    } else {
      console.error('Error enabling offline persistence:', err);
    }
  });

