import React, { useState, useEffect } from 'react'
import { X, Check, Download, Trash2, Shield, Sliders } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccessProfile } from '../../context/AccessProfileContext'

interface AccessProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

const PRESET_KEYS = [
  'wheelchair',
  'low_vision',
  'hearing',
  'cognitive',
  'elderly',
  'pregnant',
  'low_stamina',
  'caregiver'
]

export const AccessProfileModal: React.FC<AccessProfileModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const { profile, togglePreset, updateCustomThresholds, resetProfile, exportProfileJSON } = useAccessProfile()
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets')
  const [copiedNotification, setCopiedNotification] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

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

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-profile-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        className="saarthi-card"
        style={{
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-card)',
          border: '2px solid var(--border-strong)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={24} color="var(--accent-primary)" aria-hidden="true" />
              <h2 id="access-profile-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                {t('profile.title')}
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {t('profile.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Access Profile modal"
            style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        {/* On-Device Privacy Guarantee Banner */}
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.65rem 0.85rem',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)'
          }}
        >
          <Shield size={16} color="var(--accent-primary)" aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>
            <strong>100% On-Device Privacy:</strong> Your accessibility needs and custom thresholds are stored strictly on-device and never uploaded. Only anonymous requirement codes are evaluated for journey readiness.
          </span>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
          <button
            type="button"
            className={activeTab === 'presets' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('presets')}
            style={{ flex: 1, padding: '0.5rem' }}
          >
            {t('profile.selectPresets')} ({profile.presets.length})
          </button>
          <button
            type="button"
            className={activeTab === 'custom' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('custom')}
            style={{ flex: 1, padding: '0.5rem' }}
          >
            <Sliders size={16} aria-hidden="true" />
            <span>{t('profile.customThresholds')}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
          {activeTab === 'presets' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {PRESET_KEYS.map(key => {
                const isActive = profile.presets.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePreset(key)}
                    style={{
                      textAlign: 'left',
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      backgroundColor: isActive ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s'
                    }}
                    aria-pressed={isActive}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        {t(`presets.${key}.name`)}
                      </span>
                      {isActive && (
                        <span style={{ background: 'var(--accent-primary)', color: '#000', borderRadius: '50%', padding: '2px' }}>
                          <Check size={14} aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {t(`presets.${key}.desc`)}
                    </p>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
              {/* Max Ramp Slope */}
              <div>
                <label htmlFor="ramp-slope" style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Maximum Acceptable Ramp Slope: {profile.customThresholds.maxRampSlopePct || 8}%
                </label>
                <input
                  id="ramp-slope"
                  type="range"
                  min="4"
                  max="15"
                  step="0.5"
                  value={profile.customThresholds.maxRampSlopePct || 8}
                  onChange={e => updateCustomThresholds({ maxRampSlopePct: parseFloat(e.target.value) })}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Standard ADA/BIS threshold is 8% (1:12)</span>
              </div>

              {/* Minimum Door Width */}
              <div>
                <label htmlFor="door-width" style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Minimum Door Width: {profile.customThresholds.minDoorWidthCm || 90} cm
                </label>
                <input
                  id="door-width"
                  type="range"
                  min="70"
                  max="120"
                  step="2"
                  value={profile.customThresholds.minDoorWidthCm || 90}
                  onChange={e => updateCustomThresholds({ minDoorWidthCm: parseFloat(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Require Lifts for Multi-Storey */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  id="require-lift"
                  type="checkbox"
                  checked={profile.customThresholds.requireLift ?? true}
                  onChange={e => updateCustomThresholds({ requireLift: e.target.checked })}
                  style={{ width: '20px', height: '20px' }}
                />
                <label htmlFor="require-lift" style={{ fontWeight: 600 }}>
                  Require working elevator / lift for multi-storey destinations
                </label>
              </div>

              {/* Require Tactile Guidance */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  id="require-tactile"
                  type="checkbox"
                  checked={profile.customThresholds.requireTactile ?? false}
                  onChange={e => updateCustomThresholds({ requireTactile: e.target.checked })}
                  style={{ width: '20px', height: '20px' }}
                />
                <label htmlFor="require-tactile" style={{ fontWeight: 600 }}>
                  Require tactile guidance paving on walkways and crossings
                </label>
              </div>

              {/* Require Audio Crossing Signals */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  id="require-audio"
                  type="checkbox"
                  checked={profile.customThresholds.requireAudioSignal ?? false}
                  onChange={e => updateCustomThresholds({ requireAudioSignal: e.target.checked })}
                  style={{ width: '20px', height: '20px' }}
                />
                <label htmlFor="require-audio" style={{ fontWeight: 600 }}>
                  Require audible traffic signals at pedestrian crossings
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '1rem',
            marginTop: '1rem',
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExport}
              style={{ fontSize: '0.85rem' }}
            >
              <Download size={16} aria-hidden="true" />
              <span>{t('profile.export')}</span>
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={resetProfile}
              style={{ fontSize: '0.85rem' }}
            >
              <Trash2 size={16} aria-hidden="true" />
              <span>{t('profile.clear')}</span>
            </button>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={onClose}
          >
            <Check size={18} aria-hidden="true" />
            <span>{t('profile.save')}</span>
          </button>
        </div>

        {copiedNotification && (
          <div
            role="alert"
            style={{
              padding: '0.5rem',
              marginTop: '0.5rem',
              backgroundColor: 'var(--status-verified-bg)',
              color: 'var(--status-verified-text)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              textAlign: 'center'
            }}
          >
            Profile exported successfully as JSON file.
          </div>
        )}
      </div>
    </div>
  )
}
