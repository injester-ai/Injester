// Runtime API + WebSocket base URLs.
// In dev, Vite proxies /api and /ws to localhost:8000 (see vite.config.js),
// so leaving VITE_API_BASE empty makes same-origin relative fetches work.
// In production, set VITE_API_BASE to the deployed backend URL (Railway).

const API_BASE_RAW = import.meta.env.VITE_API_BASE?.replace(/\/+$/, '') || ''

// HTTP base — used for fetch() calls. Empty string = same-origin.
export const API_BASE = API_BASE_RAW

// WebSocket base — converts http(s) → ws(s). Empty = same-origin.
export const WS_BASE = API_BASE_RAW
  ? API_BASE_RAW.replace(/^http/, 'ws')
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

// Pull the demo key from localStorage (set by PasswordGate) so every
// fetch/websocket call carries the backend X-Demo-Key credential.
export function demoKey() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('injester-demo-key') || ''
}

export function authHeaders(extra = {}) {
  const k = demoKey()
  return k ? { ...extra, 'X-Demo-Key': k } : extra
}

export function wsUrlWithKey(path) {
  const k = demoKey()
  const suffix = k ? `${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(k)}` : ''
  return `${WS_BASE}${path}${suffix}`
}
