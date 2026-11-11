// How the app is put together:
//   notices and confirms > where the records live (this device, or the cloud after the PIN)
//   > the records themselves (loaded once) > windows > pages.
import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SheetProvider } from './components/SheetHost';
import { PinScreen } from './components/PinScreen';
import { Button, ConfirmProvider, NoticeProvider, useConfirm, useNotice } from './components/ui';
import { DataProvider } from './data/DataContext';
import { makeLocalStore } from './data/localStore';
import type { Store } from './data/store';
import { cloudConfig, ownerEmail } from './firebase-config';
import { awayTooLong, checkDevicePin, clearTries, forgetPin, noteHidden, noteWrongTry, rememberPin } from './lib/pinLock';
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

function WithRecords({
  store,
  account,
  signOut,
  lock,
  changePin,
}: {
  store: Store;
  account?: string;
  signOut?: () => void;
  lock?: () => void;
  changePin?: (oldPin: string, newPin: string) => Promise<string>;
}) {
  const notify = useNotice();
  return (
    <DataProvider store={store} account={account} signOut={signOut} lock={lock} changePin={changePin} onWriteError={(m) => notify(m, 'bad')}>
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

function ForgotPin({ cloud }: { cloud: Cloud }) {
  const confirm = useConfirm();
  const notify = useNotice();
  const ask = async () => {
    const ok = await confirm({
      title: 'Forgot the PIN?',
      body: `A link to set a new PIN will be emailed to the Bake Away email (${ownerEmail}). Open it on any phone or computer and type a new PIN of 6 digits as the new password. Then come back here and use the new PIN.`,
      yes: 'Send the link',
    });
    if (!ok) return;
    try {
      await cloud.sendPinReset();
      notify('The link has been sent. Check the Bake Away email.', 'info');
    } catch (e) {
      notify(cloud.pinMessage(e), 'bad');
    }
  };
  return (
    <button type="button" onClick={ask} className="min-h-11 text-sm font-medium text-accent-dark underline">
      Forgot PIN?
    </button>
  );
}

/**
 * Opens the one Bake Away account with the PIN.
 * - No account on this device yet: the PIN goes to Firebase (needs the internet once).
 * - Account already on this device: the PIN is checked here (works with no signal).
 * The app locks when it starts and after 5 minutes in the background.
 */
function CloudApp() {
  const notify = useNotice();
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [user, setUser] = useState<{ uid: string; email: string } | null | undefined>(undefined);
  const [locked, setLocked] = useState(true);
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
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') noteHidden();
      else if (awayTooLong()) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const store = useMemo(() => (cloud && user ? cloud.makeCloudStore(user.uid) : null), [cloud, user]);

  const openWithFirebase = useCallback(
    async (pin: string): Promise<string> => {
      if (!cloud) return 'Still opening. Try again.';
      try {
        await cloud.unlockWithPin(pin);
        await rememberPin(pin);
        clearTries();
        setLocked(false);
        return '';
      } catch (e) {
        const code = (e as { code?: string })?.code ?? '';
        if (code.includes('invalid-credential') || code.includes('wrong-password')) noteWrongTry();
        return cloud.pinMessage(e);
      }
    },
    [cloud],
  );
  const openOnDevice = useCallback(
    async (pin: string): Promise<string> => {
      const ok = await checkDevicePin(pin);
      if (ok === null) return openWithFirebase(pin);
      if (!ok) {
        noteWrongTry();
        return 'That PIN is not right.';
      }
      clearTries();
      setLocked(false);
      return '';
    },
    [openWithFirebase],
  );
  const changePin = useCallback(
    async (oldPin: string, newPin: string): Promise<string> => {
      if (!cloud) return 'Still opening. Try again.';
      try {
        await cloud.changePin(oldPin, newPin);
        await rememberPin(newPin);
        return '';
      } catch (e) {
        return cloud.pinMessage(e);
      }
    },
    [cloud],
  );
  const forgetDevice = useCallback(() => {
    forgetPin();
    void cloud?.forgetDevice();
  }, [cloud]);

  if (failed)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-semibold">The app could not start</p>
        <p className="max-w-sm text-muted">Check the connection and try again.</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  if (!cloud || user === undefined) return <Splash text="Opening…" />;
  if (!user || !store)
    return <PinScreen title="Enter the Bake Away PIN" hint="The first time on a phone or computer needs the internet." onPin={openWithFirebase} footer={<ForgotPin cloud={cloud} />} />;
  if (locked) return <PinScreen title="Enter your PIN" onPin={openOnDevice} footer={<ForgotPin cloud={cloud} />} />;
  return (
    <WithRecords
      store={store}
      account="Bake Away"
      lock={() => {
        notify('Locked', 'info');
        setLocked(true);
      }}
      changePin={changePin}
      signOut={forgetDevice}
    />
  );
}

export default function App() {
  const local = useMemo(() => (cloudConfig ? null : makeLocalStore()), []);
  return (
    <NoticeProvider>
      <ConfirmProvider>{local ? <WithRecords store={local} /> : <CloudApp />}</ConfirmProvider>
      {/* Here, outside the records, so a new version is offered on the PIN screen too. */}
      <UpdateBanner />
    </NoticeProvider>
  );
}
