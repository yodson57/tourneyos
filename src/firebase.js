// Configuration Firebase — lue depuis les variables d'environnement Vite
// (VITE_FIREBASE_* à définir dans les "Environment Variables" du projet Vercel,
// ou dans un fichier .env.local en local — jamais commité).
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Garde-fou : si une variable manque, on le signale clairement dans la console
// au lieu de laisser Firebase échouer silencieusement plus tard.
const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(
    "[firebase.js] Variables d'environnement manquantes :", missing,
    "— vérifie les Environment Variables du projet Vercel (ou ton .env.local)."
  );
}
