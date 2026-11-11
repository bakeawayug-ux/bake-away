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
      <UpdateBanner />
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
        <div className="space-y-3">
          <Field label="Email">
            <TextInput type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" busy={busy}>
            Sign in
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
    </NoticeProvider>
  );
}
