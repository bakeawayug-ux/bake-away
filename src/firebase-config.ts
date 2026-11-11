// Cloud sync (so the iPhone and the laptop share the same records) is switched on by pasting the
// Firebase web config here. Leave it as null and the app keeps records on each device only.
//
// This config is NOT a secret: it only names the project. What protects the records is the sign-in
// (email and password) and the rules in firestore.rules. Never put a password or a private key here.

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

// Firebase project "Bake Away" (bake-away-e1a96), owned by bakeawayug@gmail.com. Set up 11 Nov 2026.
export const firebaseConfig: FirebaseConfig | null = {
  apiKey: 'AIzaSyAapUUNi5l9idtqHZZHiKR67I2jQXtRJqk',
  authDomain: 'bake-away-e1a96.firebaseapp.com',
  projectId: 'bake-away-e1a96',
  storageBucket: 'bake-away-e1a96.firebasestorage.app',
  messagingSenderId: '824763835953',
  appId: '1:824763835953:web:7ee2106c06378421cf1710',
};

/** Local test copy only ("npm run emulators" + VITE_EMULATOR=1): never talks to the real cloud. */
export const useEmulator = import.meta.env.DEV && import.meta.env.VITE_EMULATOR === '1';

/**
 * Which records the app uses:
 * - the published app: Evelyn's real records in the cloud;
 * - "npm run dev:emulator": the local test copy;
 * - "npm run dev": records kept in this browser only, so work on this computer never touches her real records.
 */
export const cloudConfig: FirebaseConfig | null = useEmulator
  ? { apiKey: 'demo-key', authDomain: 'demo-bake-away.firebaseapp.com', projectId: 'demo-bake-away', appId: 'demo' }
  : import.meta.env.DEV
    ? null
    : firebaseConfig;
