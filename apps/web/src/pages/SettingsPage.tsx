import React, { useState } from 'react'
import {
  Settings,
  Sun,
  Moon,
  Contrast,
  Type,
  Download,
  Trash2,
  Shield,
  Check
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccessibility, type TextScale } from '../context/AccessibilityContext'
import { useAccessProfile } from '../context/AccessProfileContext'

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation()
  const {
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
  } = useAccessibility()

  const { resetProfile, exportProfileJSON } = useAccessProfile()
  const [copiedNotification, setCopiedNotification] = useState(false)
  const [resetNotification, setResetNotification] = useState(false)

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(exportProfileJSON())
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', 'saarthi_access_profile.json')
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
    setCopiedNotification(true)
    setTimeout(() => setCopiedNotification(false), 3000)
  }

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to delete your on-device access profile?')) {
      await resetProfile()
      setResetNotification(true)
      setTimeout(() => setResetNotification(false), 3000)
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Settings size={28} color="var(--accent-primary)" aria-hidden="true" />
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800 }}>
            {t('settings.title')}
          </h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          Customize display, typography, speech guidance, and manage your on-device privacy settings.
        </p>
      </header>

      {/* Display & Contrast Settings */}
      <section className="saarthi-card" aria-labelledby="theme-heading">
        <h2 id="theme-heading" style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Contrast size={20} aria-hidden="true" />
          <span>{t('settings.theme')}</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <button
            type="button"
            className={theme === 'default_dark' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTheme('default_dark')}
            aria-pressed={theme === 'default_dark'}
          >
            <Moon size={18} aria-hidden="true" />
            <span>{t('settings.theme_dark')}</span>
          </button>

          <button
            type="button"
            className={theme === 'high_contrast' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTheme('high_contrast')}
            aria-pressed={theme === 'high_contrast'}
          >
            <Contrast size={18} aria-hidden="true" />
            <span>{t('settings.theme_high_contrast')}</span>
          </button>

          <button
            type="button"
            className={theme === 'light' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
          >
            <Sun size={18} aria-hidden="true" />
            <span>{t('settings.theme_light')}</span>
          </button>
        </div>
      </section>

      {/* Typography & Scaling */}
      <section className="saarthi-card" aria-labelledby="typography-heading">
        <h2 id="typography-heading" style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Type size={20} aria-hidden="true" />
          <span>{t('settings.text_size')} (WCAG Scaling up to 200%)</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
          {(['100', '125', '150', '200'] as TextScale[]).map(scale => (
            <button
              key={scale}
              type="button"
              className={textScale === scale ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setTextScale(scale)}
              aria-pressed={textScale === scale}
            >
              <span>{scale}%</span>
            </button>
          ))}
        </div>
      </section>

      {/* Motion & Interaction Settings */}
      <section className="saarthi-card" aria-labelledby="motion-heading">
        <h2 id="motion-heading" style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem' }}>
          Motion & Audio Cues
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Reduced Motion */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, display: 'block' }}>{t('settings.reduced_motion')}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Disables all non-essential UI animations and transitions
              </span>
            </div>
            <input
              type="checkbox"
              id="reduced-motion-toggle"
              checked={reducedMotion}
              onChange={e => setReducedMotion(e.target.checked)}
              style={{ width: '24px', height: '24px' }}
              aria-label="Toggle reduced motion"
            />
          </div>

          {/* Spoken Directions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, display: 'block' }}>{t('settings.speech_directions')}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Automatically announces next step directions using Text-to-Speech
              </span>
            </div>
            <input
              type="checkbox"
              id="speech-toggle"
              checked={speechDirections}
              onChange={e => setSpeechDirections(e.target.checked)}
              style={{ width: '24px', height: '24px' }}
              aria-label="Toggle spoken audio navigation"
            />
          </div>

          {/* Helper Mode */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, display: 'block' }}>{t('settings.helper_mode')}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Simplified pictorial steps, extra high contrast badges, and voice-first interaction
              </span>
            </div>
            <input
              type="checkbox"
              id="helper-mode-toggle"
              checked={helperMode}
              onChange={e => setHelperMode(e.target.checked)}
              style={{ width: '24px', height: '24px' }}
              aria-label="Toggle helper mode"
            />
          </div>
        </div>
      </section>

      {/* On-Device Privacy Management */}
      <section className="saarthi-card" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Shield size={20} color="var(--accent-primary)" aria-hidden="true" />
          <span>On-Device Privacy & Data Ownership</span>
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Your access needs profile is stored exclusively in your browser's local IndexedDB. No government ID, certificate, or personally identifiable data is ever collected or transmitted.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExport}
          >
            <Download size={18} aria-hidden="true" />
            <span>Export Profile (JSON)</span>
          </button>

          <button
            type="button"
            className="btn-danger"
            onClick={handleReset}
          >
            <Trash2 size={18} aria-hidden="true" />
            <span>Delete On-Device Profile</span>
          </button>
        </div>

        {copiedNotification && (
          <div role="alert" style={{ marginTop: '0.75rem', color: 'var(--status-verified-text)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Check size={16} aria-hidden="true" />
            <span>Profile exported successfully to local file.</span>
          </div>
        )}

        {resetNotification && (
          <div role="alert" style={{ marginTop: '0.75rem', color: 'var(--status-temp-barrier-text)', fontSize: '0.85rem' }}>
            On-device profile deleted and reset to default preset.
          </div>
        )}
      </section>
    </div>
  )
}
