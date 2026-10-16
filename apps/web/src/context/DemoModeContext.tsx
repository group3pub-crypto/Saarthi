import React, { createContext, useContext, useSyncExternalStore } from 'react'
import { isDemoModeAllowed, isDemoModeOn, setDemoMode, subscribeDemoMode } from '../services/demoMode.ts'

interface DemoModeContextValue {
  /** Whether this build permits demo mode to be switched on at all. */
  allowed: boolean
  /** Whether demo mode is on right now. Always false when `allowed` is false. */
  isOn: boolean
  setDemoMode: (on: boolean) => void
}

const DemoModeContext = createContext<DemoModeContextValue>({
  allowed: false,
  isOn: false,
  setDemoMode: () => {}
})

export const DemoModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOn = useSyncExternalStore(subscribeDemoMode, isDemoModeOn, () => false)
  const value: DemoModeContextValue = {
    allowed: isDemoModeAllowed(),
    isOn,
    setDemoMode
  }
  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>
}

export function useDemoMode(): DemoModeContextValue {
  return useContext(DemoModeContext)
}
