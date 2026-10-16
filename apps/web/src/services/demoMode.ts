// Demo mode: an isolated, explicit switch for showing sample Pune fixtures instead of
// the real API. It is OFF by default everywhere, and can only ever be turned on when
// VITE_ENABLE_DEMO_MODE=true was set at build time (or in a local `npm run dev`), so a
// production deployment that never sets that flag can never show demo data, however a
// person fiddles with the page. When it is on, every place/evidence/journey screen must
// say so in plain words — demo records are never to be read as real verified evidence.

const STORAGE_KEY = 'saarthi_demo_mode'

type Env = { DEV?: boolean; VITE_ENABLE_DEMO_MODE?: string }

function env(): Env {
  try {
    // import.meta.env is replaced at build time by Vite; guarded for the plain Node test runner.
    return (import.meta as unknown as { env?: Env }).env ?? {}
  } catch {
    return {}
  }
}

/** Whether this build permits demo mode at all. A production build without the flag never does. */
export function isDemoModeAllowed(): boolean {
  const e = env()
  return e.DEV === true || e.VITE_ENABLE_DEMO_MODE === 'true'
}

function readStoredFlag(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function isDemoModeOn(): boolean {
  if (!isDemoModeAllowed()) return false
  return readStoredFlag()
}

const listeners = new Set<() => void>()

export function subscribeDemoMode(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setDemoMode(on: boolean): void {
  if (!isDemoModeAllowed() && on) return
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false')
  } catch {
    // best-effort only; demo mode simply will not persist across reloads
  }
  listeners.forEach(fn => fn())
}

/** Reads `?demo=1` once, for sharing a ready-to-present demo link. Only takes effect where allowed. */
export function applyDemoModeFromUrl(search: string): void {
  if (!isDemoModeAllowed()) return
  const params = new URLSearchParams(search)
  if (params.get('demo') === '1') setDemoMode(true)
  if (params.get('demo') === '0') setDemoMode(false)
}
