// Modern Firebase v9+ Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
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

