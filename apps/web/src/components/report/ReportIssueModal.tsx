import React, { useState } from 'react'
import { X, ShieldCheck, AlertCircle, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { submitUserReport } from '../../services/api'

interface ReportIssueModalProps {
  isOpen: boolean
  onClose: () => void
  placeId?: string
  placeName?: string
  featureId?: string
  initialComment?: string
}

export const ReportIssueModal: React.FC<ReportIssueModalProps> = ({
  isOpen,
  onClose,
  placeId,
  placeName,
  featureId,
  initialComment
}) => {
  const { t } = useTranslation()
  const [selectedFeatureType, setSelectedFeatureType] = useState('entrance')
  const [attributeKey] = useState('barrier_reported')
  const [attributeValue] = useState('yes')
  const [comment, setComment] = useState(initialComment || '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [consentChecked, setConsentChecked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  React.useEffect(() => {
    if (initialComment) {
      setComment(initialComment)
    }
  }, [initialComment])
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!consentChecked) {
      setErrorMessage('Explicit photo and privacy consent is required before submission.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const formData = new FormData()
      if (placeId) formData.append('place_id', placeId)
      if (featureId) formData.append('feature_id', featureId)
      formData.append('feature_type', selectedFeatureType)
      formData.append('attribute_key', attributeKey)
      formData.append('value', JSON.stringify({ value: attributeValue }))
      formData.append('comment', comment)
      formData.append('consent', 'true')
      if (photo) {
        formData.append('photo', photo)
      }

      const res = await submitUserReport(formData)
      setSuccessMessage(res.message || 'Report submitted anonymously and queued for verification.')
      setTimeout(() => {
        setSuccessMessage('')
        onClose()
      }, 2500)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
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
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-card)',
          border: '2px solid var(--border-strong)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
          <div>
            <h2 id="report-modal-title" style={{ fontSize: '1.25rem', fontWeight: 800 }}>
              {t('report.title')}
            </h2>
            {placeName && (
              <p style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', marginTop: '0.2rem' }}>
                📍 {placeName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report modal"
            style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        {/* Privacy Notice Banner */}
        <div
          style={{
            padding: '0.75rem',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem'
          }}
        >
          <ShieldCheck size={20} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <span>{t('report.anonymous_notice')}</span>
        </div>

        {successMessage ? (
          <div
            role="alert"
            style={{
              padding: '1.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--status-verified-bg)',
              color: 'var(--status-verified-text)',
              borderRadius: 'var(--radius-md)'
            }}
          >
            <Check size={36} style={{ margin: '0 auto 0.5rem' }} aria-hidden="true" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Thank You!</h3>
            <p style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Feature Type */}
            <div>
              <label htmlFor="feature-type" style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem' }}>
                Feature / Location Type
              </label>
              <select
                id="feature-type"
                value={selectedFeatureType}
                onChange={e => setSelectedFeatureType(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
              >
                <option value="entrance">Entrance / Main Door</option>
                <option value="ramp">Ramp</option>
                <option value="lift">Elevator / Lift</option>
                <option value="toilet">Accessible Restroom</option>
                <option value="counter">Registration / Service Counter</option>
                <option value="tactile_path">Tactile Guidance Pathway</option>
                <option value="crossing">Pedestrian Crossing</option>
                <option value="kerb">Kerb Ramp</option>
              </select>
            </div>

            {/* Description / Observation */}
            <div>
              <label htmlFor="report-comment" style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem' }}>
                Observation Details
              </label>
              <textarea
                id="report-comment"
                required
                rows={3}
                placeholder="Describe what you encountered (e.g. 4 steps at entrance with no ramp, lift out of service, 5cm kerb lip)"
                value={comment}
                onChange={e => setComment(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
              />
            </div>

            {/* Photo Capture */}
            <div>
              <label htmlFor="report-photo" style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem' }}>
                Evidence Photo (Optional)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  id="report-photo"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => setPhoto(e.target.files?.[0] || null)}
                  style={{ fontSize: '0.85rem' }}
                />
                {photo && <span style={{ fontSize: '0.75rem', color: 'var(--status-verified-text)' }}>✓ Photo attached</span>}
              </div>
            </div>

            {/* Explicit Privacy Consent Checkbox (MANDATORY) */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.75rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <input
                id="photo-consent"
                type="checkbox"
                required
                checked={consentChecked}
                onChange={e => setConsentChecked(e.target.checked)}
                style={{ width: '22px', height: '22px', marginTop: '2px', flexShrink: 0 }}
              />
              <label htmlFor="photo-consent" style={{ fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                {t('report.consent_checkbox')}
              </label>
            </div>

            {errorMessage && (
              <div role="alert" style={{ color: 'var(--status-barrier-text)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={16} aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !consentChecked}
              className="btn-primary"
              style={{ width: '100%', padding: '0.75rem', opacity: (!consentChecked || isSubmitting) ? 0.6 : 1 }}
            >
              {isSubmitting ? 'Submitting...' : t('report.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
