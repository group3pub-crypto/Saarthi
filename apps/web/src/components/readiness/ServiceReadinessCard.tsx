import React from 'react'
import { CheckCircle2, AlertCircle, HelpCircle, Phone, Calendar, Shield, AlertTriangle, Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReadinessCardResponse } from '../../services/api'
import { StatusChip } from '../common/StatusChip'
import { NextActionButton } from '../common/NextActionButton'

interface ServiceReadinessCardProps {
  card: ReadinessCardResponse
  onReportIssue?: (featureId?: string) => void
}

export const ServiceReadinessCard: React.FC<ServiceReadinessCardProps> = ({ card, onReportIssue }) => {
  const { t } = useTranslation()

  const isConfirmed = card.overall_status === 'confirmed'

  return (
    <article className="saarthi-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 700, letterSpacing: '0.04em' }}>
            {t(`place.categories.${card.place_type}`) || card.place_type.replace('_', ' ')}
          </span>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.2rem' }}>{card.name}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{card.address}</p>
          {card.phone && (
            <a
              href={`tel:${card.phone}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem',
                color: 'var(--accent-primary)',
                marginTop: '0.4rem',
                textDecoration: 'none',
                fontWeight: 600
              }}
              aria-label={`Call facility at ${card.phone}`}
            >
              <Phone size={15} aria-hidden="true" />
              <span>{card.phone}</span>
            </a>
          )}
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
          <span
            className={`status-chip ${isConfirmed ? 'verified' : 'unknown'}`}
            style={{ fontSize: '0.875rem', padding: '0.4rem 0.85rem' }}
          >
            {isConfirmed ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
            <span>{isConfirmed ? 'Readiness Confirmed' : 'Not Confirmed'}</span>
          </span>
          <div style={{ background: 'var(--bg-elevated)', padding: '0.35rem 0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Evidence Confidence: </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isConfirmed ? 'var(--status-verified-text)' : 'var(--status-unknown-text)' }}>
              {Math.round(card.confidence_score * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', background: 'var(--bg-elevated)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', borderLeft: `4px solid ${isConfirmed ? 'var(--status-verified-border)' : 'var(--status-unknown-border)'}` }}>
        {card.summary_text}
      </div>

      {/* Feature Breakdown */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            {t('place.features')} ({card.features.length})
          </h3>
          {onReportIssue && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onReportIssue()}
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: 'var(--text-secondary)' }}
              title="Report an unlisted barrier or outdated feature"
            >
              <Flag size={14} aria-hidden="true" />
              <span>Report Discrepancy</span>
            </button>
          )}
        </div>

        {card.features.length === 0 ? (
          <div
            style={{
              padding: '1.75rem 1.25rem',
              backgroundColor: 'var(--status-unknown-bg)',
              border: '1px dashed var(--status-unknown-border)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}
          >
            <HelpCircle size={32} color="var(--status-unknown-border)" aria-hidden="true" style={{ margin: '0 auto 0.5rem' }} />
            <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('place.no_audits')}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem', maxWidth: '420px', marginInline: 'auto' }}>
              No verified accessibility features recorded yet for this facility. In accordance with SAARTHI Core Rules, unknown accessibility is never assumed accessible.
            </p>
            {onReportIssue && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => onReportIssue()}
                style={{ marginTop: '1rem', fontSize: '0.85rem' }}
              >
                Submit First Citizen Report
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {card.features.map(f => (
              <div
                key={f.feature_id}
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                {/* Feature Title & Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>{f.name}</span>
                    <span style={{ fontSize: '0.75rem', background: 'var(--bg-elevated)', padding: '2px 7px', borderRadius: '4px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {f.feature_type.replace('_', ' ')}
                    </span>
                  </div>

                  <StatusChip
                    status={f.status}
                    label={f.label}
                    ageDays={f.age_days}
                    expiresAt={f.expires_at}
                  />
                </div>

                {/* Reason */}
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {f.reason}
                </p>

                {/* Limitations notice if specified */}
                {f.limits && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.8rem',
                      color: 'var(--status-temp-barrier-text)',
                      backgroundColor: 'var(--status-temp-barrier-bg)',
                      padding: '0.4rem 0.65rem',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--status-temp-barrier-border)'
                    }}
                  >
                    <AlertTriangle size={14} aria-hidden="true" />
                    <span><strong>Limitation:</strong> {f.limits}</span>
                  </div>
                )}

                {/* Evidence Metadata: Source, Timestamp/Observed, Expiry */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '1rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    paddingTop: '0.4rem',
                    borderTop: '1px solid var(--border-subtle)',
                    marginTop: '0.2rem'
                  }}
                >
                  {f.source && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Shield size={12} aria-hidden="true" />
                      <span>Source: <strong>{f.source.toUpperCase()}</strong></span>
                    </span>
                  )}
                  {f.observed_at && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Calendar size={12} aria-hidden="true" />
                      <span>Observed: {new Date(f.observed_at).toLocaleDateString()}</span>
                    </span>
                  )}
                  {f.expires_at && (
                    <span>
                      Expires: {new Date(f.expires_at).toLocaleDateString()}
                    </span>
                  )}

                  {onReportIssue && (
                    <button
                      type="button"
                      onClick={() => onReportIssue(f.feature_id)}
                      style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        padding: '0 4px',
                        textDecoration: 'underline'
                      }}
                    >
                      Report Issue with this Feature
                    </button>
                  )}
                </div>

                {/* Next Actions */}
                {f.next_actions && f.next_actions.length > 0 && (
                  <div style={{ marginTop: '0.25rem' }}>
                    {f.next_actions.map((act, i) => (
                      <NextActionButton key={i} action={act} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
