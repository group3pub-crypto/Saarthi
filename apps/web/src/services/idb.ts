import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { PROFILE_ID, createDefaultProfile, normalizeProfile, type AccessProfile } from './profile.ts'

export type { AccessProfile } from './profile.ts'

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

/**
 * Load the stored profile, upgrading older versions. If nothing was ever saved the
 * default is returned but NOT written: a default is not the person's choice, and
 * deleting a profile must stay deleted.
 */
export async function loadAccessProfile(): Promise<AccessProfile> {
  const db = await getDB()
  const stored = await db.get('profile', PROFILE_ID)
  return stored ? normalizeProfile(stored) : createDefaultProfile()
}

export async function saveAccessProfile(profile: AccessProfile): Promise<AccessProfile> {
  const db = await getDB()
  const toSave: AccessProfile = { ...profile, savedByUser: true, updatedAt: new Date().toISOString() }
  await db.put('profile', toSave, PROFILE_ID)
  return toSave
}

export async function clearAccessProfile(): Promise<void> {
  const db = await getDB()
  await db.delete('profile', PROFILE_ID)
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

