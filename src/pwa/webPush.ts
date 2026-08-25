import { supabase } from '../lib/supabase';

const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '';
export type PushSupportState = 'ready' | 'unsupported' | 'missing_configuration' | 'denied';
export type WebPushWorkerDiagnostic = { state: 'ready' | 'missing' | 'unexpected'; detail: string };
type BackgroundPushSnapshot = { receivedAt: string | null; showAttemptedAt: string | null; showResult: 'fulfilled' | 'rejected' | null; showCompletedAt: string | null; receivedCount: number };
export type BackgroundPushDiagnostic = { state: 'not_received' | 'show_rejected' | 'show_fulfilled'; detail: string };

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padded = value.padEnd(value.length + (4 - value.length % 4) % 4, '=').replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(padded);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function pushSupportState(): PushSupportState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!vapidPublicKey) return 'missing_configuration';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

async function activeFreshGoWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await registration.update();
  return registration;
}

export async function webPushWorkerDiagnostic(): Promise<WebPushWorkerDiagnostic> {
  if (!('serviceWorker' in navigator)) return { state: 'missing', detail: 'Service workers are unavailable.' };
  const registration = await navigator.serviceWorker.getRegistration('/');
  const expectedScript = new URL('/sw.js', window.location.origin).href;
  if (!registration?.active) return { state: 'missing', detail: 'No active FreshGo service worker.' };
  if (registration.scope !== `${window.location.origin}/` || registration.active.scriptURL !== expectedScript) {
    return { state: 'unexpected', detail: 'This installed app is controlled by a different service worker or origin.' };
  }
  const channel = new MessageChannel();
  const response = new Promise<{ version?: unknown } | null>((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), 750);
    channel.port1.onmessage = (event) => { window.clearTimeout(timeout); resolve(event.data); };
  });
  registration.active.postMessage({ type: 'freshgo:service-worker-status' }, [channel.port2]);
  const status = await response;
  return typeof status?.version === 'string'
    ? { state: 'ready', detail: `FreshGo service worker ${status.version} is active.` }
    : { state: 'unexpected', detail: 'An older FreshGo service worker is active; reopen once after the latest deployment.' };
}

async function requestWorkerMessage<T>(type: string): Promise<T | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration?.active) return null;
  const channel = new MessageChannel();
  const response = new Promise<T | null>((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), 1_500);
    channel.port1.onmessage = (event) => { window.clearTimeout(timeout); resolve(event.data as T); };
  });
  registration.active.postMessage({ type }, [channel.port2]);
  return response;
}

export async function backgroundPushDiagnostic(): Promise<BackgroundPushDiagnostic> {
  if (!('serviceWorker' in navigator)) return { state: 'not_received', detail: 'Service workers are unavailable.' };
  const snapshot = await requestWorkerMessage<BackgroundPushSnapshot>('freshgo:background-push-diagnostic');
  if (!snapshot?.receivedAt) return { state: 'not_received', detail: 'No push receipt has reached the FreshGo service worker since this diagnostic was deployed.' };
  if (snapshot.showResult === 'rejected') return { state: 'show_rejected', detail: `Push reached the service worker at ${new Date(snapshot.receivedAt).toLocaleString()}, but the browser rejected its notification request.` };
  if (snapshot.showResult === 'fulfilled') return { state: 'show_fulfilled', detail: `Push reached the service worker at ${new Date(snapshot.receivedAt).toLocaleString()} and Chrome accepted the notification request at ${new Date(snapshot.showCompletedAt ?? snapshot.receivedAt).toLocaleString()}. If it was not visible, Android or Chrome suppressed its display after acceptance.` };
  return { state: 'show_rejected', detail: `Push reached the service worker at ${new Date(snapshot.receivedAt).toLocaleString()}, but the notification attempt did not complete.` };
}

function subscriptionFields(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const { endpoint } = subscription;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint.startsWith('https://') || !p256dh || !auth || p256dh.length > 512 || auth.length > 256) throw new Error('The browser returned an invalid push subscription.');
  return { endpoint, p256dh, auth };
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in before enabling notifications.');
  const fields = subscriptionFields(subscription);
  const { error } = await supabase.rpc('upsert_own_push_subscription', { p_endpoint: fields.endpoint, p_p256dh: fields.p256dh, p_auth: fields.auth });
  if (error) throw error;
}

/** Must only be called from an explicit user gesture; it may open the browser permission prompt. */
export async function enableWebPush(): Promise<void> {
  if (pushSupportState() !== 'ready') throw new Error('Push notifications are not available.');
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');
  const registration = await activeFreshGoWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  await saveSubscription(subscription);
}

export async function disableWebPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const subscription = await (await activeFreshGoWorker()).pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await supabase.rpc('disable_own_push_subscription', { p_endpoint: subscription.endpoint });
  if (error) throw error;
  await subscription.unsubscribe();
}

export async function hasActiveWebPushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  return Boolean(await (await activeFreshGoWorker()).pushManager.getSubscription());
}
