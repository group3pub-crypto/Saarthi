import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  type AccessProfile,
  loadAccessProfile,
  saveAccessProfile,
  clearAccessProfile,
  DEFAULT_PROFILE
} from '../services/idb'

interface AccessProfileContextType {
  profile: AccessProfile
  isLoading: boolean
  togglePreset: (presetKey: string) => Promise<void>
  updateCustomThresholds: (thresholds: Partial<AccessProfile['customThresholds']>) => Promise<void>
  resetProfile: () => Promise<void>
  exportProfileJSON: () => string
}

const PRESET_NEED_MAPPINGS: Record<string, string[]> = {
  wheelchair: ['step_free', 'wheelchair_door_width', 'lift_required_if_multistorey'],
  low_vision: ['tactile_path', 'audio_signal', 'high_contrast_signage'],
  hearing: ['visual_signage', 'digital_display'],
  cognitive: ['plain_language', 'pictorial_steps'],
  elderly: ['step_free', 'resting_points', 'handrails'],
  pregnant: ['step_free', 'lift_required_if_multistorey', 'resting_points'],
  low_stamina: ['low_incline', 'resting_points'],
  caregiver: ['step_free', 'companion_access']
}

const AccessProfileContext = createContext<AccessProfileContextType | undefined>(undefined)

export const AccessProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<AccessProfile>(DEFAULT_PROFILE)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadAccessProfile()
      .then(p => {
        setProfile(p)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  const deriveNeedCodes = (presets: string[], thresholds: AccessProfile['customThresholds']) => {
    const codes = new Set<string>()
    for (const preset of presets) {
      const mapped = PRESET_NEED_MAPPINGS[preset] || []
      mapped.forEach(c => codes.add(c))
    }
    if (thresholds.requireTactile) codes.add('tactile_path')
    if (thresholds.requireAudioSignal) codes.add('audio_signal')
    if (thresholds.requireLift) codes.add('lift_required_if_multistorey')
    if (thresholds.maxStepCount === 0) codes.add('step_free')
    return Array.from(codes)
  }

  const togglePreset = async (presetKey: string) => {
    const nextPresets = profile.presets.includes(presetKey)
      ? profile.presets.filter(p => p !== presetKey)
      : [...profile.presets, presetKey]

    const nextCodes = deriveNeedCodes(nextPresets, profile.customThresholds)
    const updated: AccessProfile = {
      ...profile,
      presets: nextPresets,
      activeNeedCodes: nextCodes
    }
    setProfile(updated)
    await saveAccessProfile(updated)
  }

  const updateCustomThresholds = async (thresholds: Partial<AccessProfile['customThresholds']>) => {
    const mergedThresholds = { ...profile.customThresholds, ...thresholds }
    const nextCodes = deriveNeedCodes(profile.presets, mergedThresholds)
    const updated: AccessProfile = {
      ...profile,
      customThresholds: mergedThresholds,
      activeNeedCodes: nextCodes
    }
    setProfile(updated)
    await saveAccessProfile(updated)
  }

  const resetProfile = async () => {
    await clearAccessProfile()
    setProfile(DEFAULT_PROFILE)
    await saveAccessProfile(DEFAULT_PROFILE)
  }

  const exportProfileJSON = () => {
    return JSON.stringify(profile, null, 2)
  }

  return (
    <AccessProfileContext.Provider
      value={{
        profile,
        isLoading,
        togglePreset,
        updateCustomThresholds,
        resetProfile,
        exportProfileJSON
      }}
    >
      {children}
    </AccessProfileContext.Provider>
  )
}

export function useAccessProfile() {
  const context = useContext(AccessProfileContext)
  if (!context) {
    throw new Error('useAccessProfile must be used within an AccessProfileProvider')
  }
  return context
}
