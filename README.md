# Bake Away records

A records app for two small businesses in one place:

- **Bake Away**: orders, customers, expenses (ingredient by ingredient), products, profit and reports, notes.
- **Hardware**: stock, sales, stock in, money invested, reports.

It is a web app that installs on an iPhone's Home Screen (Safari > Share > Add to Home Screen) and runs in any browser on a laptop. It opens and saves with no signal.

The user manual is `docs/user-manual.md` (also inside the app under **User manual**). The rules for working on the code are in `CLAUDE.md`.

## Run it on a computer

```bash
npm ci
npm run dev
```

Open http://localhost:5180. Records are kept in that browser only.

```bash
npm run check   # type check
npm test        # the money and saving rules
npm run build   # production build into dist/
```

## Hosting: GitHub Pages

`.github/workflows/deploy.yml` type-checks, tests, builds and publishes on every push to `main`.

1. Create a **public** repository on GitHub (Pages on a free account needs a public repository) and push this folder to its `main` branch.
2. On GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. After the workflow finishes, the app is at `https://<account>.github.io/<repository>/`.

Nothing private is in the repository: no passwords, no keys, no records.

## Cloud sync: the same records on the iPhone and the laptop

Out of the box each device keeps its own records. To share them, the app uses a free Firebase project (Spark plan: no card needed).

1. Go to https://console.firebase.google.com, signed in with the Google account that should own the records, and **Add project** (Google Analytics is not needed).
2. **Build > Authentication > Get started > Email/Password: Enable.** Under **Users**, **Add user** with the owner's email and a strong password. Under **Settings > User actions**, untick **Enable create (sign-up)** so nobody else can make an account.
3. **Build > Firestore Database > Create database** (production mode; a location such as `europe-west1`). Open the **Rules** tab, paste the contents of `firestore.rules`, and **Publish**.
4. **Authentication > Settings > Authorised domains > Add domain:** `<account>.github.io`.
5. **Project settings (the cog) > Your apps > Web app (</>)**: register an app and copy the `firebaseConfig` values.
6. Paste them into `src/firebase-config.ts` in place of `null`:

   ```ts
   export const firebaseConfig: FirebaseConfig | null = {
     apiKey: '...',
     authDomain: '...',
     projectId: '...',
     appId: '...',
   };
   ```

   These values only name the project; they are safe in a public repository. The sign-in and `firestore.rules` protect the records.
7. Push. The app now opens on a sign-in page. On a device that already has records, sign in and use **Settings > Your records > Bring them into my account**.

### Trying the signed-in mode without a real project

```bash
npm run emulators                     # needs Java 21 and firebase-tools
node scripts/make-emulator-user.mjs   # creates the test sign-in (printed by the script)
npm run dev:emulator                  # http://localhost:5182
```

On Windows set `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\jtmp` first (and create `C:\jtmp`).

## Backups

**Settings > Your records > Download a backup** makes one file with every record and the settings. **Restore from a backup** reads it back. Keep backups out of this repository (`backups/` is git-ignored).
