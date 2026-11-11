// Cloud records: Firebase sign-in (email and password) and Firestore, kept at users/{uid}/{collection}/{id}.
// firestore.rules lets a signed-in person read and write only their own records.
// This file is loaded only when cloud sync is configured, so the device-only app stays small.
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  writeBatch,
} from 'firebase/firestore';
import { cloudConfig, useEmulator } from '../firebase-config';
import { clean, type Op, type Row, type Store } from './store';

if (!cloudConfig) throw new Error('Cloud sync is not set up.');

const app = initializeApp(cloudConfig);
const auth = getAuth(app);
// A copy of the records is kept on the device, so the app opens and saves with no signal
// and sends the changes when the connection returns.
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  ...(useEmulator ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
});

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
  console.info('[dev] Using the local test copy (emulators), not the real cloud.');
}

export interface CloudUser {
  uid: string;
  email: string;
}

export function watchUser(cb: (user: CloudUser | null) => void): () => void {
  return onAuthStateChanged(auth, (u: User | null) => cb(u ? { uid: u.uid, email: u.email ?? '' } : null));
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Google sign-in, by pop-up only. The app (github.io) and Firebase's sign-in helper
 * (firebaseapp.com) are on different addresses; the "go to Google's page and come back" method
 * loses its result there because browsers, iPhone Safari most of all, wall off storage between
 * addresses (checked 11 Nov 2026: it came back signed out). The pop-up hands the result straight
 * back, so it works across addresses. If it cannot open, the sign-in page says so and the email
 * and password still work.
 * Only accounts that already exist can sign in (sign-up is switched off in Firebase), so another
 * Google account is refused rather than given an empty account. A Google account with the same
 * Gmail as an existing account opens that same account and its records.
 */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
  // Reload so nothing from the signed-out account stays on screen.
  window.location.reload();
}

/** Plain words for the sign-in errors Firebase reports. */
export function signInMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-email'))
    return 'The email or password is not right.';
  if (code.includes('too-many-requests')) return 'Too many tries. Wait a few minutes and try again.';
  if (code.includes('network')) return 'No connection. Check the internet and try again.';
  if (code.includes('user-disabled')) return 'This account has been switched off.';
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return '';
  if (code.includes('popup-blocked') || code.includes('operation-not-supported-in-this-environment'))
    return 'The Google window could not open here. Sign in with the email and password below.';
  if (code.includes('admin-restricted-operation'))
    return 'This Google account does not have access to Bake Away. Choose the Bake Away Google account, or sign in with the email and password.';
  if (code.includes('account-exists-with-different-credential')) return 'This email already signs in another way. Use the email and password.';
  if (code.includes('unauthorized-domain')) return 'Google sign-in is not allowed from this address yet.';
  return 'Could not sign in. Try again.';
}

export function makeCloudStore(uid: string): Store {
  const store: Store = {
    kind: 'cloud',
    subscribe(col, onRows, onError) {
      return onSnapshot(
        collection(db, 'users', uid, col),
        { includeMetadataChanges: true },
        (snap) => {
          const rows = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Row);
          onRows(rows, { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
        },
        (e) => onError(e),
      );
    },
    async commit(ops: Op[]) {
      // Firestore takes at most 500 changes in one go; only a restore or "delete all" is ever that big.
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        for (const o of ops.slice(i, i + 400)) {
          const ref = doc(db, 'users', uid, o.col, o.id);
          if (o.op === 'delete') batch.delete(ref);
          else if (o.op === 'set') batch.set(ref, clean(o.data));
          else batch.set(ref, clean(o.data), { merge: true });
        }
        // Not awaited: the change is already kept on the device and shows at once. The promise only
        // settles when the cloud answers, which with no signal could be hours away.
        batch.commit().catch((e: Error) => store.onWriteError?.(e));
      }
    },
  };
  return store;
}
