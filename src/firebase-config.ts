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

export const firebaseConfig: FirebaseConfig | null = null;

/** Local test copy only ("npm run emulators" + VITE_EMULATOR=1): never talks to the real cloud. */
export const useEmulator = import.meta.env.DEV && import.meta.env.VITE_EMULATOR === '1';

export const cloudConfig: FirebaseConfig | null = useEmulator
  ? { apiKey: 'demo-key', authDomain: 'demo-bake-away.firebaseapp.com', projectId: 'demo-bake-away', appId: 'demo' }
  : firebaseConfig;
