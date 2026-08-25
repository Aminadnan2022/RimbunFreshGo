import { BellOff, BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { backgroundPushDiagnostic, disableWebPush, enableWebPush, hasActiveWebPushSubscription, pushSupportState, webPushWorkerDiagnostic, type PushSupportState } from '../../pwa/webPush';

export default function PushNotificationControl() {
  const { language } = useLanguage();
  const [state, setState] = useState<PushSupportState>(() => pushSupportState());
  const [enabled, setEnabled] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [workerMessage, setWorkerMessage] = useState<string | null>(null); const [backgroundMessage, setBackgroundMessage] = useState<string | null>(null);
  const malay = language === 'ms';
  useEffect(() => { void hasActiveWebPushSubscription().then(setEnabled).catch(() => setEnabled(false)); }, []);
  const checkWorker = () => void webPushWorkerDiagnostic().then((diagnostic) => setWorkerMessage(diagnostic.detail)).catch(() => setWorkerMessage(malay ? 'Tidak dapat menyemak perkhidmatan notifikasi.' : 'Could not check the notification service.'));
  const checkBackgroundPush = () => void backgroundPushDiagnostic().then((diagnostic) => setBackgroundMessage(diagnostic.detail)).catch(() => setBackgroundMessage(malay ? 'Tidak dapat membaca rekod push latar belakang.' : 'Could not read the background push record.'));
  const toggle = async () => {
    setBusy(true); setMessage(null);
    try {
      if (enabled) { await disableWebPush(); setEnabled(false); setMessage(malay ? 'Notifikasi peranti dimatikan.' : 'Device notifications are off.'); }
      else { await enableWebPush(); setEnabled(true); setState(pushSupportState()); setMessage(malay ? 'Notifikasi peranti dihidupkan.' : 'Device notifications are on.'); }
    } catch (error) { setState(pushSupportState()); setMessage(error instanceof Error ? error.message : (malay ? 'Tidak dapat mengemas kini notifikasi.' : 'Could not update notifications.')); } finally { setBusy(false); }
  };
  const unavailable = state === 'unsupported' ? (malay ? 'Pelayar ini tidak menyokong notifikasi peranti.' : 'This browser does not support device notifications.') : state === 'missing_configuration' ? (malay ? 'Notifikasi peranti belum dikonfigurasikan.' : 'Device notifications are not configured yet.') : state === 'denied' ? (malay ? 'Kebenaran telah disekat. Benarkan notifikasi dalam tetapan pelayar.' : 'Permission is blocked. Allow notifications in browser settings.') : null;
  return <div className="mx-2 mb-2 rounded-xl border border-cream-200 bg-cream-50 p-3"><p className="text-sm font-semibold text-charcoal">{malay ? 'Notifikasi peranti' : 'Device notifications'}</p><p className="mt-1 text-xs leading-5 text-gray-600">{malay ? 'Terima kemas kini pesanan penting pada peranti ini.' : 'Receive important order updates on this device.'}</p>{unavailable ? <p className="mt-2 text-xs text-gray-500" role="status">{unavailable}</p> : <><button type="button" onClick={() => void toggle()} disabled={busy} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-forest-200 bg-white px-3 text-xs font-semibold text-forest-800 disabled:opacity-60">{enabled ? <BellOff size={15} aria-hidden="true" /> : <BellRing size={15} aria-hidden="true" />}{busy ? (malay ? 'Mengemas kini…' : 'Updating…') : enabled ? (malay ? 'Matikan pada peranti ini' : 'Turn off on this device') : (malay ? 'Hidupkan notifikasi' : 'Turn on notifications')}</button><button type="button" onClick={checkWorker} className="ml-2 mt-3 min-h-10 text-xs font-semibold text-forest-800 underline underline-offset-2">{malay ? 'Semak perkhidmatan' : 'Check service'}</button><button type="button" onClick={checkBackgroundPush} className="ml-2 mt-3 min-h-10 text-xs font-semibold text-forest-800 underline underline-offset-2">{malay ? 'Semak push latar belakang' : 'Check background push'}</button></>}{message ? <p className="mt-2 text-xs text-gray-600" role="status">{message}</p> : null}{workerMessage ? <p className="mt-2 text-xs text-gray-600" role="status">{workerMessage}</p> : null}{backgroundMessage ? <p className="mt-2 text-xs text-gray-600" role="status">{backgroundMessage}</p> : null}</div>;
}
