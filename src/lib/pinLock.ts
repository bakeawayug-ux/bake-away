// The lock on this device. The first time on a device the PIN goes to Firebase (that opens the
// account). After that, a slow salted fingerprint of the PIN kept on this device lets the PIN open
// the app with no signal. The PIN itself is never stored.
// The app locks when it starts and after LOCK_AFTER_MS in the background.

const KEY = 'bakeaway.pinlock';
const HIDDEN_AT = 'bakeaway.hiddenAt';
const TRIES = 'bakeaway.pinTries';
export const PIN_LENGTH = 6;
export const LOCK_AFTER_MS = 5 * 60 * 1000;
const ROUNDS = 150_000;

interface Saved {
  salt: string;
  hash: string;
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));

async function fingerprint(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ROUNDS }, key, 256);
  return toHex(bits);
}

function read(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.salt === 'string' && typeof v.hash === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function hasDevicePin(): boolean {
  return read() !== null;
}

/** Remembers the PIN's fingerprint after Firebase accepted it (first unlock, or a PIN change). */
export async function rememberPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await fingerprint(pin, salt);
  try {
    localStorage.setItem(KEY, JSON.stringify({ salt: toHex(salt.buffer), hash }));
  } catch {
    /* private mode: the PIN then goes to Firebase each time */
  }
}

export function forgetPin(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

/** true = matches; false = wrong; null = this device has no fingerprint yet (ask Firebase). */
export async function checkDevicePin(pin: string): Promise<boolean | null> {
  const saved = read();
  if (!saved) return null;
  return (await fingerprint(pin, fromHex(saved.salt))) === saved.hash;
}

// ---------- wrong tries on this device: 5 free, then a growing wait ----------

export function waitSeconds(): number {
  try {
    const t = JSON.parse(localStorage.getItem(TRIES) ?? '{"n":0,"until":0}');
    return Math.max(0, Math.ceil((Number(t.until) - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

export function noteWrongTry(): number {
  let n = 0;
  try {
    n = Number(JSON.parse(localStorage.getItem(TRIES) ?? '{"n":0}').n) || 0;
  } catch {
    n = 0;
  }
  n += 1;
  const wait = n < 5 ? 0 : Math.min(15 * 60, 30 * 2 ** (n - 5)); // 30 s, 1 min, 2 min ... up to 15 min
  try {
    localStorage.setItem(TRIES, JSON.stringify({ n, until: Date.now() + wait * 1000 }));
  } catch {
    /* ignore */
  }
  return wait;
}

export function clearTries(): void {
  try {
    localStorage.removeItem(TRIES);
  } catch {
    /* ignore */
  }
}

// ---------- background timing ----------

export function noteHidden(): void {
  try {
    sessionStorage.setItem(HIDDEN_AT, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Was the app away long enough to lock again? Clears the mark either way. */
export function awayTooLong(): boolean {
  try {
    const at = Number(sessionStorage.getItem(HIDDEN_AT));
    sessionStorage.removeItem(HIDDEN_AT);
    return at > 0 && Date.now() - at > LOCK_AFTER_MS;
  } catch {
    return false;
  }
}
