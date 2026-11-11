# Bake Away records

Records app for Evelyn, a friend of Denis Mwanje (MDM), built by Denis with Claude Code from 11 Nov 2026. Two sections: **Bake Away** (her baking business: orders, customers, expenses by ingredient, products, profit, notes) and **Hardware** (a hardware shop: stock, sales, stock in, money invested, reports). Evelyn uses an **iPhone**; the app must be comfortable there first and also work on a laptop.

It was built from the lessons of MANSOL Finance (`D:\COMPANY-MANSOL\My kamoney Application`, its `kamoney/CLAUDE.md` and `reports/MANSOL Finance audit 11 Nov 2026.md`). The rules below are those lessons turned into how this app is built. Keep them.

## Rules that must not be broken

1. **Figures are worked out, never stored.** Paid, balance, pay status, late, quantity in stock, average cost, stock value and profit all come from the pure functions in `src/lib/orders.ts`, `src/lib/stock.ts` and `src/lib/reports.ts`, computed once in `src/data/DataContext.tsx`. Never add a stored `paid`, `balance`, `status` or `onHand` field, and never add up payments inside a page. (MANSOL: two bugs from reading stored status fields; a client balance worked out three ways.)
2. **Every save goes through `src/data/actions.ts`.** A new record is written whole (`set`); an edit writes only its form's named fields (`patch`), so a form can never wipe a field it does not know about. Things that belong together go in one `store.commit([...])`: an order with its customer and deposit, a delete with its payments. (MANSOL: editing a client wiped its TIN; advances saved in several steps drifted.)
3. **Amounts are cleaned once**, in the action, with `cleanAmount()` (whole shillings, above zero) and read with `num()`. Payments above the balance, blank amounts and negatives are refused with a plain message. (MANSOL: "UGX NaN", a blank allocation saved as a payment.)
4. **Forms cannot save twice and never hang.** Use `useSaver()`: the button is off while the save runs and the window closes on success. `store.commit` returns once the change is kept on the device; it does not wait for the network. (MANSOL: double-click duplicates; windows stuck on "Saving…" with no signal.)
5. **Dates are local `YYYY-MM-DD` text** from `src/lib/dates.ts` (`todayYmd()`). Never `toISOString()` for a date: in Kampala it gives yesterday between midnight and 3 am.
6. **Defaults are never written back.** Settings are stored as only the fields Evelyn changed; `DataContext` fills the rest in memory from `DEFAULT_SETTINGS`. (MANSOL: an offline first start overwrote all settings with defaults.)
7. **A failed load is not "no records".** `ready` is false until every list has arrived, and `LoadNotice` shows a failure. Backup and Delete all refuse to run until the records are loaded.
8. **A backup holds every collection** (it is built from `COLLECTIONS` in `src/lib/types.ts`), Restore reads the same file back, and `tests/saving.test.ts` proves the round trip. A new collection goes into `COLLECTIONS`, `Records`, `EMPTY_RECORDS` and the `pick()` list in `DataContext`; the backup then covers it by itself. (MANSOL: "Full Data Export" left out invoices and receipts.)
9. **Records that others point to are archived, not deleted.** A customer with orders or sales and an item with stock movements refuse deletion. Names are shown from the live record through its id (`customerLabel`, `itemsById`, order items' `productId`), so a rename shows everywhere.
10. **Phone first.** No control that appears only on hover; touch targets at least 44px; fields at 16px text (smaller makes the iPhone zoom); windows are bottom sheets that respect the notch and home bar (`pt-safe`, `pb-safe`, `px-safe`); no `alert()`/`confirm()` (use `useConfirm`, `useNotice`).
11. **Plain words.** One name for one thing: Order, Payment, Balance, Expense, Stock in, Sale. Sentence case. No technical or dramatic wording, no raw error text on screen.
12. **No secrets in the repo, ever.** The Firebase web config in `src/firebase-config.ts` is public by design; passwords, service-account keys and tokens are not. Evelyn's records and backups never go into the repo (`backups/` and `*.backup.json` are git-ignored). The repo is public (GitHub Pages on a free account needs that).
13. **Prove before handing over:** `npm run check`, `npm test`, `npm run build`, then open the affected pages in the built-in browser at phone size (375 x 812) and laptop size, compare the figures by hand, and check the console. Show figures or screenshots, not "no errors".
14. **Keep the manual current.** `docs/user-manual.md` is the one copy; the app shows it at Help. Every change Evelyn can see updates the affected chapter, adds a dated line under "What's new" and the "Last updated" date, in the same change.
15. Do not define React components inside another component's render. No page-transition animation library (MANSOL's caused blank pages and double loading). Windows open through `useSheets().open({ t: ... })`, never through a `?new=1` in the address.

## How Denis works

- One logical change at a time: say what will change, make it, build, test in the browser, show figures or screenshots.
- Ask before anything that deletes records, deploys, pushes, or changes how amounts are calculated.
- Show previews in the Claude built-in browser pane (`preview_start` name `bake-away-dev`).
- Keep explanations short and concrete, in plain financial language.

## Facts

- **Stack:** React 19, TypeScript 7 (strict), Vite 8, Tailwind 4, React Router 7 (HashRouter, so it works on GitHub Pages with no server), lucide-react icons, vite-plugin-pwa (service worker; installable; update on a tap of "Update"), Vitest. Cloud: Firebase Auth (email and password) and Firestore, loaded only when configured.
- **iPhone:** it is a home-screen web app: Safari > Share > Add to Home Screen. There is no App Store app and no APK equivalent. Home shows an install tip in iPhone Safari.
- **Sign-in (11 Nov 2026):** Google (pop-up only) and email/password. The redirect method was tried and removed: the app (github.io) and the sign-in helper (firebaseapp.com) are different sites, so the result is lost to storage partitioning (seen in the emulator test; iPhone Safari is stricter still). Pop-up behaviour inside an iPhone Home Screen app was not verified on a device; if it fails there, the reliable fix is to host the app on Firebase Hosting (`bake-away-e1a96.web.app`) with `authDomain` on the same site and use `signInWithRedirect`. The Claude browser pane cannot test pop-ups (it opens them in the same tab: "No matching frame"); test on a real browser. The one account is bakeawayug@gmail.com; Google with that Gmail opens the same uid and records. Sign-up stays off, so other Google accounts get `admin-restricted-operation`. First Google sign-in on an unverified email/password account removes its password (Firebase account-takeover protection); Forgot password restores one.
- **Where records live:** `src/data/store.ts` is the one interface. `localStore.ts` keeps records in the browser's localStorage (`bakeaway.v1.<collection>`), used while `firebaseConfig` in `src/firebase-config.ts` is `null`. `cloud.ts` keeps them at `users/{uid}/{collection}/{id}` in Firestore with an offline copy on each device. `firestore.rules`: a signed-in person reads and writes only their own `users/{uid}` tree. Settings > Your records can bring records saved on a device before sign-in into the account.
- **Collections:** customers (section bake | hardware), orders, products, payments (kind order | sale | purchase, refId), expenses (section; bake ones can carry `ingredient`, `qtyNote`, `orderId`), notes, items, purchases (stock in; `opening: true` = opening stock, nothing owed), sales, adjustments (count corrections), capital (money put in / taken out), settings (one record, id `main`).
- **Numbers:** orders BA-0001..., sales HW-0001..., from `nextNumber()` (highest existing + 1).
- **Rules of the figures:** an order's value = items + delivery charge - discount. A cancelled order owes nothing but keeps its payments. A customer's debt = the sum of each order's own balance. Money in = payments by payment date. Bake profit = money in - expenses. Stock cost = the average of everything ever bought; hardware profit = sales - (quantity x average cost) - stock lost - expenses. Product profit on "Profit and reports" is an estimate from each product's "usual cost to make one", shown beside what was really spent on ingredients.
- **Sections and menus** are defined once in `src/lib/sections.ts` (sidebar, phone tabs, + menu). A new section = an entry there plus a card on Home.
- **Theme:** colours from the logo (`assets/bake-away-logo.jpg`): pink `#E03E87` (accent `#D6307B`), chocolate `#5B2E1B`, caramel `#9A6344` (Hardware's accent), butter `#E8E48B`, cream page `#FFF9F1`. The accent follows `data-section` (`src/index.css`). Icons are made once by `npm run icons` and committed.
- Uganda defaults: UGX without cents, DD/MM/YYYY.

## Commands

```bash
npm run dev      # http://localhost:5180 (records in this browser only)
npm run check    # type check
npm test         # the money and saving rules (tests/)
npm run build    # production build into dist/
npm run emulators            # local Firestore + Auth test copy (needs Java 21, firebase-tools)
npm run dev:emulator         # http://localhost:5182 signed-in mode against that test copy
node scripts/make-emulator-user.mjs   # creates the test sign-in in the Auth emulator
```

Windows: the emulators need `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\jtmp` (create `C:\jtmp` first).

## Open work

1. **GitHub and hosting: done 11 Nov 2026.** Repo `bakeawayug-ux/bake-away` (public), live at https://bakeawayug-ux.github.io/bake-away/. Every push to `main` runs `.github/workflows/deploy.yml` (type check, tests, build, then publish). Commits in this folder are authored as bakeawayug-ux (repo-local git config; the PC's global name is someone else's). Git Credential Manager holds three GitHub accounts; this repo pushes as bakeawayug-ux (`credential.https://github.com.username` set locally). If a push opens a sign-in, use **Sign in with a code** and enter it at github.com/login/device in the Claude browser pane (signed in as bakeawayug-ux): the browser button signs in through Chrome as mwanjemathias5-cell and the push is refused (403).
2. **Cloud sync: switched on 11 Nov 2026.** Firebase project "Bake Away" (`bake-away-e1a96`, Spark plan, no card) owned by **bakeawayug@gmail.com** (Denis: "Evelyn's account"). Authentication: Email/Password only; sign-up and self-delete switched off (Settings > User actions), so accounts are added only in the console (Authentication > Users > Add user). Firestore (default) database in **africa-south1** (Johannesburg; cannot be moved), production mode, rules = `firestore.rules` (published by pasting in the console; there is no CLI login on this PC). Authorised domains include `bakeawayug-ux.github.io`. Scheduled backups need the paid plan, so the in-app backup is the only backup: remind Evelyn. The **published app** uses the cloud; **`npm run dev` deliberately stays on browser-only records** (see `cloudConfig` in `src/firebase-config.ts`), so work on this PC never touches her real records; `npm run dev:emulator` tests the signed-in mode on the local test copy. Never point the dev server at the real project.
3. Ideas not built: printed or shared receipts with the logo, recipes (ingredient quantities per product, for an exact cost), a second sign-in for a shop attendant, dark theme, photos of cakes.
