// Modern Firebase v9+ Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// Your Firebase configuration object
// Replace these with your actual Firebase project values
const firebaseConfig = {
  apiKey: "AIzaSyAFcbgTrdkC6HEw6cYrYnJwOSFuXmeGITY",
  authDomain: "chong-918f9.firebaseapp.com",
  projectId: "chong-918f9",
  storageBucket: "chong-918f9.firebasestorage.app",
  messagingSenderId: "90026447698",
  appId: "1:90026447698:web:616336add43a855d8f608b",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services and export them
export const db = getFirestore(app);
export const auth = getAuth(app);
export { app as firebaseApp };

