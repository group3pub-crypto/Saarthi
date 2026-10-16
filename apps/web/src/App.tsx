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

import './styles/index.css'

export const AppContent: React.FC = () => {
  const { t } = useTranslation()
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  return (
    <div className="app-container">
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
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            ⚠️ {t('app.disclaimer')}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span>{t('app.attribution')}</span>
            <span>SAARTHI Access v1.0 • Built with WCAG 2.2 AA Standards</span>
          </div>
        </div>
      </footer>
    </div>
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
