import React, { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AccessibilityProvider } from './context/AccessibilityContext'
import { AccessProfileProvider } from './context/AccessProfileContext'
import { AuthProvider } from './context/AuthContext'
import { Navbar } from './components/common/Navbar'
import { AccessProfileModal } from './components/profile/AccessProfileModal'
import { HomePage } from './pages/HomePage'
import { JourneyPlanPage } from './pages/JourneyPlanPage'
import { SettingsPage } from './pages/SettingsPage'
import { SharedPassportPage } from './pages/SharedPassportPage'
import { AuditorPage } from './pages/AuditorPage'

import { ProfileModalContext } from './context/ProfileModalContext'

import './styles/index.css'
import './styles/ui.css'

export const AppContent: React.FC = () => {
  const { t } = useTranslation()
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  return (
    <ProfileModalContext.Provider value={{ openProfileModal: () => setIsProfileModalOpen(true) }}>
    <div className="app-container">
      {/* DESIGN.md signature: gradient-mesh wash behind the top of every page */}
      <div className="mesh-backdrop" aria-hidden="true" />
      <Navbar onOpenProfileModal={() => setIsProfileModalOpen(true)} />

      <main id="main-content" className="main-content" role="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/plan" element={<JourneyPlanPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/auditor" element={<AuditorPage />} />
          <Route path="/passport/:token" element={<SharedPassportPage />} />
        </Routes>
      </main>

      {/* Global Access Profile Modal */}
      <AccessProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* Accessible Footer with ODbL Attribution & Disclaimer */}
      <footer className="footer-bar" role="contentinfo">
        <div className="footer-inner">
          <p className="footer-disclaimer">{t('app.disclaimer')}</p>
          <p>{t('app.attribution')}</p>
        </div>
      </footer>
    </div>
    </ProfileModalContext.Provider>
  )
}

export const App: React.FC = () => {
  return (
    <AccessibilityProvider>
      <AccessProfileProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </AuthProvider>
      </AccessProfileProvider>
    </AccessibilityProvider>
  )
}

export default App
