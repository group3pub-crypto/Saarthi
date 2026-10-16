import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface AccessProfile {
  id: string
  presets: string[] // e.g. ['wheelchair', 'low_vision']
  customThresholds: {
    maxRampSlopePct?: number
    minDoorWidthCm?: number
    maxStepCount?: number
    requireLift?: boolean
    requireTactile?: boolean
    requireAudioSignal?: boolean
  }
  activeNeedCodes: string[] // e.g. ['step_free', 'tactile_path']
  updatedAt: string
}

export interface OfflineAudit {
  id: string
  placeId: string
  featureType: string
  attributes: Record<string, any>
  photos: Blob[]
  createdAt: string
  synced: boolean
}

interface SaarthiDB extends DBSchema {
  profile: {
    key: string
    value: AccessProfile
  }
  offline_audits: {
    key: string
    value: OfflineAudit
  }
  recent_places: {
    key: string
    value: {
      id: string
      name: string
      type: string
      address: string
      timestamp: number
    }
  }
}

const DB_NAME = 'saarthi_access_db'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<SaarthiDB>> | null = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SaarthiDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile')
        }
        if (!db.objectStoreNames.contains('offline_audits')) {
          db.createObjectStore('offline_audits', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('recent_places')) {
          db.createObjectStore('recent_places', { keyPath: 'id' })
        }
      }
    })
  }
  return dbPromise
}

export const DEFAULT_PROFILE: AccessProfile = {
  id: 'current_user_profile',
  presets: ['wheelchair'],
  customThresholds: {
    maxRampSlopePct: 8.0,
    minDoorWidthCm: 90.0,
    maxStepCount: 0,
    requireLift: true,
    requireTactile: false,
    requireAudioSignal: false
  },
  activeNeedCodes: ['step_free'],
  updatedAt: new Date().toISOString()
}

export async function loadAccessProfile(): Promise<AccessProfile> {
  const db = await getDB()
  const profile = await db.get('profile', 'current_user_profile')
  if (!profile) {
    await saveAccessProfile(DEFAULT_PROFILE)
    return DEFAULT_PROFILE
  }
  return profile
}

export async function saveAccessProfile(profile: AccessProfile): Promise<void> {
  const db = await getDB()
  await db.put('profile', { ...profile, updatedAt: new Date().toISOString() }, 'current_user_profile')
}

export async function clearAccessProfile(): Promise<void> {
  const db = await getDB()
  await db.delete('profile', 'current_user_profile')
}

export async function addRecentPlace(place: { id: string; name: string; type: string; address: string }): Promise<void> {
  const db = await getDB()
  await db.put('recent_places', { ...place, timestamp: Date.now() })
}

export async function getRecentPlaces(): Promise<Array<{ id: string; name: string; type: string; address: string }>> {
  const db = await getDB()
  const places = await db.getAll('recent_places')
  return places.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)
}

// ==========================================
// Offline-First Field Auditor Sync Storage
// ==========================================

export async function saveOfflineAudit(audit: OfflineAudit): Promise<void> {
  const db = await getDB()
  await db.put('offline_audits', audit)
}

export async function getOfflineAudits(): Promise<OfflineAudit[]> {
  const db = await getDB()
  return db.getAll('offline_audits')
}

export async function deleteOfflineAudit(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('offline_audits', id)
}

export async function clearOfflineAudits(): Promise<void> {
  const db = await getDB()
  await db.clear('offline_audits')
}

