import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import { announceUpdate } from './lib/update';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker keeps a copy of the app on the device, so it opens with no signal.
if (import.meta.env.PROD) {
  const update = registerSW({
    onNeedRefresh() {
      announceUpdate(() => void update(true));
    },
  });
  // Look for a new version when the app comes back to the front (an installed phone app can stay open for days).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
  });
}
