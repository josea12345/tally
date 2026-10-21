/**
 * Web Push subscription plumbing. The VAPID public key is baked in at build
 * time; the private key lives in the push edge function (never in the app).
 */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const pushConfigured = pushSupported && !!VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on' | 'busy'

export async function getPushState(): Promise<PushState> {
  if (!pushSupported) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/** Ask permission, subscribe, and return the subscription JSON (or null). */
export async function subscribePush(): Promise<PushSubscriptionJSON | null> {
  if (!VAPID_PUBLIC_KEY) return null
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return null
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  return sub.toJSON()
}

export async function unsubscribePush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    return true
  } catch {
    return false
  }
}
