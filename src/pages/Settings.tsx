// Settings: names, the editable lists (ingredients, kinds of expense...), and the records
// themselves (backup, restore, delete everything, sign out).
import { Download, Lock, LogOut, Plus, Trash2, Upload, X } from 'lucide-react';
import { PIN_LENGTH } from '../lib/pinLock';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlainLayout } from '../components/Layout';
import { Button, Field, FormError, SectionTitle, TextInput, useConfirm, useNotice, useSaver } from '../components/ui';
import { useData } from '../data/DataContext';
import { readDeviceRecords } from '../data/localStore';
import { backupFileName, countRows, deleteAllOps, giveFile, makeBackup, readBackup, restoreOps } from '../lib/backup';
import { DEFAULT_SETTINGS, type Settings as SettingsType } from '../lib/types';

type ListKey = 'ingredients' | 'bakeCategories' | 'hardwareCategories' | 'methods' | 'itemCategories' | 'units';

function ListEditor({ title, hint, field }: { title: string; hint: string; field: ListKey }) {
  const d = useData();
  const notify = useNotice();
  const [text, setText] = useState('');
  const list = d.settings[field];
  const save = (next: string[]) => d.actions.saveSettings({ [field]: next } as Partial<SettingsType>).catch((e: Error) => notify(e.message, 'bad'));
  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) {
      notify(`${v} is already on the list`, 'info');
      return;
    }
    save([...list, v]);
    setText('');
  };
  const remove = (v: string) => {
    if (list.length <= 1) {
      notify('Keep at least one on the list', 'info');
      return;
    }
    save(list.filter((x) => x !== v));
  };
  return (
    <div className="card p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-0.5 text-sm text-muted">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {list.map((v) => (
          <span key={v} className="inline-flex items-center rounded-full bg-accent-soft pl-3 text-sm font-medium text-accent-dark">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => remove(v)} className="flex h-9 w-9 items-center justify-center rounded-full">
              <X size={15} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Add your own" aria-label={`Add to ${title}`} autoCapitalize="sentences" enterKeyHint="done" />
        <Button variant="soft" icon={Plus} onClick={add}>
          Add
        </Button>
      </form>
      {list.join('|') !== DEFAULT_SETTINGS[field].join('|') && (
        <button type="button" className="mt-2 text-sm font-medium text-muted underline" onClick={() => save(DEFAULT_SETTINGS[field])}>
          Put back the starting list
        </button>
      )}
    </div>
  );
}

function Details() {
  const d = useData();
  const notify = useNotice();
  const saver = useSaver();
  const s = d.settings;
  const [f, setF] = useState({ ownerName: s.ownerName, phone: s.phone, bakeName: s.bakeName, hardwareName: s.hardwareName });
  const changed = (Object.keys(f) as (keyof typeof f)[]).filter((k) => f[k].trim() !== s[k]);
  const save = () =>
    saver.run(
      async () => {
        // Only the fields that changed are written.
        const fields: Partial<SettingsType> = {};
        for (const k of changed) fields[k] = f[k].trim();
        if (fields.ownerName === '' || fields.bakeName === '' || fields.hardwareName === '') throw new Error('The names cannot be blank.');
        await d.actions.saveSettings(fields);
      },
      () => notify('Saved'),
    );
  return (
    <div className="card space-y-3 p-4">
      <FormError message={saver.error} />
      <Field label="Your name" hint="Used in the greeting on Home.">
        <TextInput value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} autoCapitalize="words" />
      </Field>
      <Field label="Business phone" hint="For your own reference.">
        <TextInput type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name of the baking business" hint="Shown on Home and in WhatsApp messages to customers.">
          <TextInput value={f.bakeName} onChange={(e) => setF({ ...f, bakeName: e.target.value })} autoCapitalize="words" />
        </Field>
        <Field label="Name of the hardware shop">
          <TextInput value={f.hardwareName} onChange={(e) => setF({ ...f, hardwareName: e.target.value })} autoCapitalize="words" />
        </Field>
      </div>
      <Button onClick={save} busy={saver.busy} disabled={changed.length === 0}>
        Save
      </Button>
    </div>
  );
}

function RecordsCard() {
  const d = useData();
  const notify = useNotice();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const total = d.customers.length + d.orders.length + d.products.length + d.payments.length + d.expenses.length + d.notes.length + d.items.length + d.purchases.length + d.sales.length + d.adjustments.length + d.capital.length;
  const deviceRecords = d.storeKind === 'cloud' ? readDeviceRecords() : {};
  const deviceCount = countRows(deviceRecords);

  const backup = async () => {
    if (!d.ready || d.loadError) {
      notify('The records have not finished loading, so a backup now could be incomplete. Try again in a moment.', 'bad');
      return false;
    }
    await giveFile(backupFileName(), JSON.stringify(makeBackup(d, d.settingsRow), null, 1), 'application/json');
    return true;
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const b = readBackup(await file.text());
      const n = countRows(b.data);
      const ok = await confirm({
        title: 'Restore this backup?',
        body: `It holds ${n} records, made on ${new Date(b.madeAt).toLocaleDateString('en-GB')}. Records in the backup are put back; a record changed since then goes back to how it was in the backup. Records added since then are kept.`,
        yes: 'Restore',
      });
      if (!ok) return;
      setBusy(true);
      await d.actions.commitRaw(restoreOps(b.data));
      notify(`Restored ${n} records`);
    } catch (e) {
      notify((e as Error).message, 'bad');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const bringDevice = async () => {
    const ok = await confirm({ title: 'Add the records saved on this device?', body: `${deviceCount} records were saved on this device before the PIN was set up. They will be added to the Bake Away records so every device sees them.`, yes: 'Add them' });
    if (!ok) return;
    try {
      setBusy(true);
      await d.actions.commitRaw(restoreOps(deviceRecords));
      notify(`${deviceCount} records added`);
    } catch (e) {
      notify((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    if (!d.ready || d.loadError) {
      notify('The records have not finished loading. Try again in a moment.', 'bad');
      return;
    }
    const first = await confirm({ title: 'Delete all records?', body: `This removes all ${total} records of both Bake Away and Hardware${d.storeKind === 'cloud' ? ' from every device' : ''}. Your settings and lists stay. A backup file will be made first.`, yes: 'Make the backup and continue', danger: true });
    if (!first) return;
    if (!(await backup())) return;
    const sure = await confirm({ title: 'Last check', body: 'The backup has been handed to you. Deleting cannot be undone except by restoring that backup.', yes: 'Delete everything', danger: true, typeWord: 'DELETE' });
    if (!sure) return;
    try {
      setBusy(true);
      await d.actions.commitRaw(deleteAllOps(d));
      notify('All records deleted');
    } catch (e) {
      notify(`Nothing was deleted: ${(e as Error).message}`, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-4 p-4">
      <div>
        <h3 className="font-semibold">{d.storeKind === 'cloud' ? 'Kept in your account' : 'Kept on this device only'}</h3>
        <p className="mt-0.5 text-sm text-muted">
          {d.storeKind === 'cloud'
            ? 'The one set of Bake Away records, opened with the PIN. The same records show on every phone or computer where the PIN has been entered, and changes made with no signal are sent when the connection returns.'
            : 'The records live in this browser on this device. They are not shared with your other devices, and clearing the browser data or losing the device loses them. Download a backup often until cloud sync is switched on.'}
        </p>
        <p className="num mt-1 text-sm font-medium">{total} records</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" icon={Download} onClick={backup} disabled={busy}>
          Download a backup
        </Button>
        <Button variant="plain" icon={Upload} onClick={() => fileRef.current?.click()} disabled={busy}>
          Restore from a backup
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
      </div>
      <p className="text-xs text-muted">A backup is one file holding every record and your settings. On the iPhone, choose Save to Files or send it to yourself.</p>
      {deviceCount > 0 && (
        <div className="rounded-xl bg-butter-soft p-3">
          <p className="text-sm">{deviceCount} records were saved on this device before the PIN was set up.</p>
          <Button small variant="plain" className="mt-2" onClick={bringDevice} disabled={busy}>
            Add them to the Bake Away records
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button small variant="danger" icon={Trash2} onClick={wipe} disabled={busy || total === 0}>
          Delete all records
        </Button>
      </div>
    </div>
  );
}

function PinInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <TextInput
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
        className="num tracking-[0.4em]"
      />
    </Field>
  );
}

function PinCard() {
  const d = useData();
  const notify = useNotice();
  const confirm = useConfirm();
  const saver = useSaver();
  const [f, setF] = useState({ old: '', next: '', again: '' });
  if (!d.changePin || !d.lock) return null;
  const change = () =>
    saver.run(
      async () => {
        if (f.old.length !== PIN_LENGTH) throw new Error(`Type the current PIN (${PIN_LENGTH} digits).`);
        if (f.next.length !== PIN_LENGTH) throw new Error(`The new PIN must be ${PIN_LENGTH} digits.`);
        if (f.next !== f.again) throw new Error('The two new PINs are not the same.');
        if (/^(\d)\1+$/.test(f.next) || '0123456789'.includes(f.next) || '9876543210'.includes(f.next)) throw new Error('Choose a PIN that is harder to guess than 111111 or 123456.');
        const message = await d.changePin!(f.old, f.next);
        if (message) throw new Error(message);
      },
      () => {
        setF({ old: '', next: '', again: '' });
        notify('PIN changed. Other phones and computers will ask for the new PIN.');
      },
    );
  const forget = async () => {
    if (await confirm({ title: 'Remove Bake Away from this device?', body: 'The records stay safe in the cloud. This device will ask for the PIN again, with the internet, the next time it opens. Use this on a phone you are giving away or no longer use.', yes: 'Remove from this device', danger: true }))
      d.signOut?.();
  };
  return (
    <div className="card space-y-3 p-4">
      <p className="text-sm text-muted">The PIN opens the app. It locks by itself after 5 minutes in the background.</p>
      <Button variant="soft" icon={Lock} onClick={d.lock}>
        Lock now
      </Button>
      <div className="border-t border-line pt-3">
        <h3 className="mb-2 font-semibold">Change the PIN</h3>
        <FormError message={saver.error} />
        <div className="grid gap-3 md:grid-cols-3">
          <PinInput label="Current PIN" value={f.old} onChange={(old) => setF({ ...f, old })} />
          <PinInput label="New PIN" value={f.next} onChange={(next) => setF({ ...f, next })} />
          <PinInput label="New PIN again" value={f.again} onChange={(again) => setF({ ...f, again })} />
        </div>
        <Button className="mt-3" onClick={change} busy={saver.busy}>
          Change PIN
        </Button>
        <p className="mt-2 text-xs text-muted">Changing the PIN needs the internet. Every other phone or computer will then ask for the new PIN.</p>
      </div>
      <div className="border-t border-line pt-3">
        <Button small variant="plain" icon={LogOut} onClick={forget}>
          Remove from this device
        </Button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const d = useData();
  return (
    <PlainLayout title="Settings">
      {d.storeKind === 'cloud' && (
        <>
          <SectionTitle>PIN</SectionTitle>
          <PinCard />
        </>
      )}

      <SectionTitle>Your details</SectionTitle>
      <Details />

      <SectionTitle>Your records</SectionTitle>
      <RecordsCard />

      <SectionTitle>Bake Away lists</SectionTitle>
      <div className="space-y-3" data-section="bake">
        <ListEditor title="Ingredients" hint="Chosen when you add an expense of the kind Ingredients. Profit and reports shows what you spend on each." field="ingredients" />
        <ListEditor title="Kinds of expense" hint="Keep one with the word Ingredients in it: that is the kind that asks which ingredient was bought." field="bakeCategories" />
      </div>

      <SectionTitle>Hardware lists</SectionTitle>
      <div className="space-y-3" data-section="hardware">
        <ListEditor title="Item groups" hint="For sorting the stock list." field="itemCategories" />
        <ListEditor title="Units" hint="What items are sold by: piece, bag, kilogram..." field="units" />
        <ListEditor title="Kinds of expense" hint="For the shop's running costs." field="hardwareCategories" />
      </div>

      <SectionTitle>Both</SectionTitle>
      <ListEditor title="Ways of paying" hint="Offered whenever you record a payment." field="methods" />

      <p className="mt-6 text-sm text-muted">
        Removing a name from a list does not change records already saved with it. Products are edited on their own page:{' '}
        <Link to="/bake/products" className="font-semibold text-accent-dark underline">
          Products
        </Link>
        .
      </p>
      <p className="mt-4 text-xs text-faint">Bake Away records, version {__APP_VERSION__}</p>
    </PlainLayout>
  );
}
