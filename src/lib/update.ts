// A new version of the app is fetched in the background. It is applied only when the person taps
// "Update", so a half-typed form is never reloaded away.
type Apply = () => void;

let ready: Apply | null = null;
const listeners = new Set<(apply: Apply) => void>();

export function announceUpdate(apply: Apply) {
  ready = apply;
  listeners.forEach((fn) => fn(apply));
}

export function onUpdateReady(fn: (apply: Apply) => void): () => void {
  listeners.add(fn);
  if (ready) fn(ready);
  return () => {
    listeners.delete(fn);
  };
}
