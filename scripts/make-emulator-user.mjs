// Creates the test Bake Away account in the local Auth EMULATOR (never the real cloud), for
// "npm run dev:emulator". The app opens it with the PIN, which is the account's password.
// These are throwaway test values that exist only inside the emulator on this computer.
const AUTH = 'http://127.0.0.1:9099';
export const TEST_EMAIL = 'evelyn.test@bakeaway.test'; // must match ownerEmail in src/firebase-config.ts
export const TEST_PASSWORD = '246810'; // the test PIN

// Hard check: refuse to talk to anything that is not the local emulator.
const probe = await fetch(`${AUTH}/emulator/v1/projects/demo-bake-away/config`).catch(() => null);
if (!probe?.ok) {
  console.error('The Auth emulator is not running on 127.0.0.1:9099. Start it with: npm run emulators');
  process.exit(1);
}

const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, returnSecureToken: true }),
});
const body = await res.json();
if (res.ok) console.log(`Test sign-in created in the emulator.\n  email:    ${TEST_EMAIL}\n  password: ${TEST_PASSWORD}`);
else if (body?.error?.message === 'EMAIL_EXISTS') console.log(`The test sign-in already exists.\n  email:    ${TEST_EMAIL}\n  password: ${TEST_PASSWORD}`);
else {
  console.error('Could not create the test sign-in:', body?.error?.message ?? res.status);
  process.exit(1);
}
