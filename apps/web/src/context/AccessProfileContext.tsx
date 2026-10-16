import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { clearAccessProfile, loadAccessProfile, saveAccessProfile } from '../services/idb'
import {
  createDefaultProfile,
  createProfile,
  parseImportedProfile,
  serializeProfile,
  thresholdPreferences,
  type AccessProfile,
  type CustomThresholds,
  type ThresholdPreferences
} from '../services/profile'

export interface ProfileDraft {
  presets: string[]
  customThresholds: CustomThresholds
}

interface AccessProfileContextType {
  profile: AccessProfile
  isLoading: boolean
  /** True once the person has saved a profile (the starting default does not count). */
  hasSavedProfile: boolean
  /** Plain numbers that may be sent with an evaluation request. Never the profile itself. */
  thresholds: ThresholdPreferences
  saveProfile: (draft: ProfileDraft) => Promise<void>
  /** Removes the stored profile from this device and returns to the unsaved default. */
  deleteProfile: () => Promise<void>
  /** Kept for existing callers: identical to deleteProfile. */
  resetProfile: () => Promise<void>
  exportProfileJSON: () => string
  importProfileJSON: (text: string) => Promise<{ ok: true; warnings: string[] } | { ok: false; error: string }>
}

const AccessProfileContext = createContext<AccessProfileContextType | undefined>(undefined)

export const AccessProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<AccessProfile>(() => createDefaultProfile())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadAccessProfile()
      .then(p => {
        if (!cancelled) setProfile(p)
      })
      .catch(() => {
        // Storage can be blocked (private windows); the app still works with the default.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveProfile = useCallback(async (draft: ProfileDraft) => {
    const next = createProfile(draft.presets, draft.customThresholds, true)
    try {
      setProfile(await saveAccessProfile(next))
    } catch {
      // Storage unavailable: keep it for this session only.
      setProfile(next)
    }
  }, [])

  const deleteProfile = useCallback(async () => {
    try {
      await clearAccessProfile()
    } finally {
      setProfile(createDefaultProfile())
    }
  }, [])

  const importProfileJSON = useCallback(
    async (text: string) => {
      const result = parseImportedProfile(text)
      if (!result.ok) return result
      await saveProfile(result.profile)
      return { ok: true as const, warnings: result.warnings }
    },
    [saveProfile]
  )

  const exportProfileJSON = useCallback(() => serializeProfile(profile), [profile])

  const value = useMemo<AccessProfileContextType>(
    () => ({
      profile,
      isLoading,
      hasSavedProfile: profile.savedByUser,
      thresholds: thresholdPreferences(profile.customThresholds),
      saveProfile,
      deleteProfile,
      resetProfile: deleteProfile,
      exportProfileJSON,
      importProfileJSON
    }),
    [profile, isLoading, saveProfile, deleteProfile, exportProfileJSON, importProfileJSON]
  )

  return <AccessProfileContext.Provider value={value}>{children}</AccessProfileContext.Provider>
}

export function useAccessProfile() {
  const context = useContext(AccessProfileContext)
  if (!context) {
    throw new Error('useAccessProfile must be used within an AccessProfileProvider')
  }
  return context
}
