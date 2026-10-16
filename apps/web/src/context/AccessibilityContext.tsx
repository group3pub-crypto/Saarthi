import React, { createContext, useContext, useEffect, useState } from 'react'

export type ThemeMode = 'default_dark' | 'high_contrast' | 'light'
export type TextScale = '100' | '125' | '150' | '200'

interface AccessibilityContextType {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  textScale: TextScale
  setTextScale: (s: TextScale) => void
  reducedMotion: boolean
  setReducedMotion: (r: boolean) => void
  speechDirections: boolean
  setSpeechDirections: (s: boolean) => void
  helperMode: boolean
  setHelperMode: (h: boolean) => void
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined)

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('saarthi_theme') as ThemeMode) || 'default_dark'
  })
  const [textScale, setTextScale] = useState<TextScale>(() => {
    return (localStorage.getItem('saarthi_text_scale') as TextScale) || '100'
  })
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    return localStorage.getItem('saarthi_reduced_motion') === 'true'
  })
  const [speechDirections, setSpeechDirections] = useState<boolean>(() => {
    return localStorage.getItem('saarthi_speech') !== 'false'
  })
  const [helperMode, setHelperMode] = useState<boolean>(() => {
    return localStorage.getItem('saarthi_helper_mode') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('saarthi_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('saarthi_text_scale', textScale)
    document.documentElement.setAttribute('data-scale', textScale)
  }, [textScale])

  useEffect(() => {
    localStorage.setItem('saarthi_reduced_motion', String(reducedMotion))
    document.documentElement.setAttribute('data-reduced-motion', String(reducedMotion))
  }, [reducedMotion])

  useEffect(() => {
    localStorage.setItem('saarthi_speech', String(speechDirections))
  }, [speechDirections])

  useEffect(() => {
    localStorage.setItem('saarthi_helper_mode', String(helperMode))
    document.documentElement.setAttribute('data-helper-mode', String(helperMode))
  }, [helperMode])

  return (
    <AccessibilityContext.Provider
      value={{
        theme,
        setTheme,
        textScale,
        setTextScale,
        reducedMotion,
        setReducedMotion,
        speechDirections,
        setSpeechDirections,
        helperMode,
        setHelperMode
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext)
  if (!ctx) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider')
  }
  return ctx
}
