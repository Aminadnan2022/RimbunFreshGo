/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_PUSH_VAPID_PUBLIC_KEY?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
