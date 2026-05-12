// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Create a Firebase project at https://console.firebase.google.com
// STEP 2: Enable Authentication (Email/Password), Firestore, Storage, and
//         Cloud Messaging in the Firebase console.
// STEP 3: Copy your project's web app config here (Project Settings → Your apps).
// STEP 4: For push notifications, copy your VAPID key from
//         Project Settings → Cloud Messaging → Web Push certificates.
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
  vapidKey:          "YOUR_VAPID_KEY",  // Web Push VAPID key (for push notifications)
};
