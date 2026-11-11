// How the app is put together:
//   notices and confirms > where the records live (this device, or the cloud after sign-in)
//   > the records themselves (loaded once) > windows > pages.
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SheetProvider } from './components/SheetHost';
import { Button, ConfirmProvider, Field, FormError, NoticeProvider, TextInput, useNotice } from './components/ui';
import { DataProvider } from './data/DataContext';
import { makeLocalStore } from './data/localStore';
import type { Store } from './data/store';
import { cloudConfig } from './firebase-config';
import { sectionForPath } from './lib/sections';
import type { Section } from './lib/types';
import { onUpdateReady } from './lib/update';
import { BakeOverview, Orders } from './pages/BakePages';
import { BakeReports, Products } from './pages/BakeProfit';
import { HardwareOverview, HardwareReports, MoneyInvested, Sales, Stock, StockIn } from './pages/HardwarePages';
import { Home } from './pages/Home';
import { ManualPage } from './pages/Manual';
import { SettingsPage } from './pages/Settings';
import { Customers, Expenses, Notes } from './pages/SharedPages';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <img src="./brand/mark.png" alt="" className="h-16 w-16" />
        <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
        <p className="max-w-sm text-muted">Your records are safe. Reload the app to carry on.</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}

function UpdateBanner() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => onUpdateReady((fn) => setApply(() => fn)), []);
  if (!apply) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-4 md:bottom-6">
      <div className="flex items-center gap-3 rounded-2xl bg-choc py-2 pr-2 pl-4 text-sm font-medium text-white shadow-xl">
        A new version is ready
        <button type="button" className="btn btn-sm bg-white text-choc" onClick={apply}>
          Update
        </button>
      </div>
    </div>
  );
}

function InSection({ section, children }: { section: Section; children: ReactNode }) {
  return <Layout section={section}>{children}</Layout>;
}

function Pages() {
  const { pathname } = useLocation();
  const section = sectionForPath(pathname) ?? 'bake';
  const page = (s: Section, el: ReactNode) => <InSection section={s}>{el}</InSection>;
  return (
    // data-section sets the accent colour (pink in Bake Away, caramel in Hardware) for pages and windows alike.
    <div data-section={section} className="h-full">
      <SheetProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/bake" element={page('bake', <BakeOverview />)} />
            <Route path="/bake/orders" element={page('bake', <Orders />)} />
            <Route path="/bake/customers" element={page('bake', <Customers section="bake" />)} />
            <Route path="/bake/expenses" element={page('bake', <Expenses section="bake" />)} />
            <Route path="/bake/products" element={page('bake', <Products />)} />
            <Route path="/bake/reports" element={page('bake', <BakeReports />)} />
            <Route path="/bake/notes" element={page('bake', <Notes section="bake" />)} />
            <Route path="/hardware" element={page('hardware', <HardwareOverview />)} />
            <Route path="/hardware/stock" element={page('hardware', <Stock />)} />
            <Route path="/hardware/sales" element={page('hardware', <Sales />)} />
            <Route path="/hardware/stock-in" element={page('hardware', <StockIn />)} />
            <Route path="/hardware/customers" element={page('hardware', <Customers section="hardware" />)} />
            <Route path="/hardware/expenses" element={page('hardware', <Expenses section="hardware" />)} />
            <Route path="/hardware/money" element={page('hardware', <MoneyInvested />)} />
            <Route path="/hardware/reports" element={page('hardware', <HardwareReports />)} />
            <Route path="/hardware/notes" element={page('hardware', <Notes section="hardware" />)} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<ManualPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </SheetProvider>
    </div>
  );
}

function WithRecords({ store, account, signOut }: { store: Store; account?: string; signOut?: () => void }) {
  const notify = useNotice();
  return (
    <DataProvider store={store} account={account} signOut={signOut} onWriteError={(m) => notify(m, 'bad')}>
      <HashRouter>
        <Pages />
      </HashRouter>
    </DataProvider>
  );
}

function Splash({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <img src="./brand/logo.jpg" alt="Bake Away" className="h-28 w-28 rounded-3xl border border-line bg-white" />
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

type Cloud = typeof import('./data/cloud');

function SignIn({ cloud }: { cloud: Cloud }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const google = async () => {
    if (googleBusy || busy) return;
    setGoogleBusy(true);
    setError('');
    setInfo('');
    try {
      await cloud.signInWithGoogle();
    } catch (e) {
      setError(cloud.signInMessage(e));
    } finally {
      setGoogleBusy(false);
    }
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await cloud.signIn(email, password);
    } catch (e) {
      setError(cloud.signInMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const forgot = async () => {
    setError('');
    if (!email.trim()) {
      setError('Type your email first, then tap Forgot password.');
      return;
    }
    try {
      await cloud.resetPassword(email);
    } catch {
      /* say the same thing either way, so nobody can test which emails have an account */
    }
    setInfo('If that email has an account, a message with a link to set a new password is on its way.');
  };
  return (
    <div className="pt-safe pb-safe flex h-full items-center justify-center overflow-y-auto px-6">
      <form
        className="w-full max-w-sm py-8"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <img src="./brand/logo.jpg" alt="Bake Away: quality is our recipe" className="mx-auto h-36 w-36 rounded-3xl border border-line bg-white" />
        <h1 className="mt-5 text-center text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 mb-5 text-center text-sm text-muted">Your records are kept in your account and show on every device you sign in on.</p>
        <FormError message={error} />
        {info && <p className="mb-3 rounded-xl bg-leaf-soft px-3 py-2 text-sm font-medium text-leaf">{info}</p>}
        <button type="button" onClick={google} disabled={googleBusy || busy} className="btn btn-plain w-full !min-h-12 text-[16px]">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {googleBusy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <div className="my-5 flex items-center gap-3 text-sm text-muted">
          <span className="h-px flex-1 bg-line" />
          or with email and password
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="space-y-3">
          <Field label="Email">
            <TextInput type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" variant="soft" className="w-full" busy={busy} disabled={googleBusy}>
            Sign in with email
          </Button>
          <button type="button" className="mx-auto block min-h-11 text-sm font-medium text-accent-dark underline" onClick={forgot}>
            Forgot password
          </button>
        </div>
      </form>
    </div>
  );
}

function CloudApp() {
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [user, setUser] = useState<{ uid: string; email: string } | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stop = () => {};
    import('./data/cloud')
      .then((m) => {
        setCloud(m);
        stop = m.watchUser(setUser);
      })
      .catch(() => setFailed(true));
    return () => stop();
  }, []);
  const store = useMemo(() => (cloud && user ? cloud.makeCloudStore(user.uid) : null), [cloud, user]);
  if (failed)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-semibold">The app could not start</p>
        <p className="max-w-sm text-muted">Check the connection and try again.</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  if (!cloud || user === undefined) return <Splash text="Opening…" />;
  if (!user || !store) return <SignIn cloud={cloud} />;
  return <WithRecords store={store} account={user.email} signOut={() => void cloud.signOut()} />;
}

export default function App() {
  const local = useMemo(() => (cloudConfig ? null : makeLocalStore()), []);
  return (
    <NoticeProvider>
      <ConfirmProvider>{local ? <WithRecords store={local} /> : <CloudApp />}</ConfirmProvider>
      {/* Here, outside the records, so a new version is offered on the sign-in page too. */}
      <UpdateBanner />
    </NoticeProvider>
  );
}
