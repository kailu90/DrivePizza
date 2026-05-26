// firebaseConfig.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";

import { config } from "./config.js";

const app = initializeApp(config.everestCentralDB);

// ── APP CHECK con reCAPTCHA v3 ──────────────────────────────────
// En localhost se usa debug token (imprime el token en consola la primera vez)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
}
initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LdErYcsAAAAAFvx9xdPBl1PcQubLpuog9CMTIAc'),
    isTokenAutoRefreshEnabled: true,
});
const db = initializeFirestore(app, {
    cache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const plantaDB = { db, auth: getAuth(app) };