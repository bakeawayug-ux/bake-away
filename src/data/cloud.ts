// Cloud records: the one Bake Away account, opened with the PIN, and Firestore, kept at
// users/{uid}/{collection}/{id}. firestore.rules lets only that account read and write them.
// This file is loaded only when cloud sync is configured, so the device-only app stays small.
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
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
import { cloudConfig, ownerEmail, useEmulator } from '../firebase-config';
import { clean, type Op, type Row, type Store } from './store';

if (!cloudConfig) throw new Error('Cloud sync is not set up.');
const OWNER_EMAIL = ownerEmail;

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

/**
 * PIN only. There is one Bake Away account (OWNER_EMAIL) and the PIN is its password, so the PIN is
 * checked by Firebase's servers (which also slow down guessing), not just by the screen. The
 * records stay protected by firestore.rules even from someone who has the app's address.
 * Firebase needs at least 6 characters, hence a 6-digit PIN.
 */
export async function unlockWithPin(pin: string): Promise<void> {
  await signInWithEmailAndPassword(auth, OWNER_EMAIL, pin);
}

/** Changes the PIN everywhere. Other devices are signed out by Firebase and ask for the new PIN. */
export async function changePin(oldPin: string, newPin: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('Not unlocked'), { code: 'auth/no-current-user' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(OWNER_EMAIL, oldPin));
  await updatePassword(user, newPin);
}

/** Forgotten PIN: Firebase emails a link to the Bake Away email to set a new one. */
export async function sendPinReset(): Promise<void> {
  await sendPasswordResetEmail(auth, OWNER_EMAIL);
}

/** Removes the account from this device (it then asks for the PIN, with a connection, to open again). */
export async function forgetDevice(): Promise<void> {
  await fbSignOut(auth);
  window.location.reload();
}

/** Plain words for what Firebase reports. */
export function pinMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('invalid-login')) return 'That PIN is not right.';
  if (code.includes('too-many-requests')) return 'Too many wrong tries. Wait a few minutes, then try again.';
  if (code.includes('network')) return 'No connection. The first time on a device needs the internet.';
  if (code.includes('user-not-found') || code.includes('user-disabled')) return 'The Bake Away account is not set up. Ask Denis.';
  if (code.includes('weak-password')) return 'Choose a PIN of 6 digits.';
  if (code.includes('requires-recent-login')) return 'Type the current PIN again, then the new one.';
  return 'Could not open. Try again.';
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
