import React from 'react'
import { AlertCircle, AlertTriangle, Calendar, CheckCircle2, Flag, HelpCircle, Info, Minus, Phone, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReadinessCardResponse } from '../../services/api'
import { describeAge, formatDate } from '../../services/evidence'
import { describeIgnoredThresholds, featureLabel, groupRequirements, needLabel } from '../../services/requirements'
import { StatusChip } from '../common/StatusChip'
import { NextActionButton } from '../common/NextActionButton'

interface ServiceReadinessCardProps {
  card: ReadinessCardResponse
  onReportIssue?: (featureId?: string) => void
}

export const ServiceReadinessCard: React.FC<ServiceReadinessCardProps> = ({ card, onReportIssue }) => {
  const { t } = useTranslation()

  const isConfirmed = card.overall_status === 'confirmed'
  const applicable = card.features.filter(f => f.applicable)
  const confirmed = applicable.filter(f => f.status === 'verified' || f.status === 'reported').length
  const groups = groupRequirements(card.requirements)
  const ignored = describeIgnoredThresholds(card.ignored_thresholds)
  const evaluatedOn = formatDate(card.evaluated_at)

  return (
    <article className="saarthi-card readiness-card">
      <header className="readiness-head">
        <div className="readiness-title">
          <span className="eyebrow">{t(`place.categories.${card.place_type}`, { defaultValue: card.place_type.replace(/_/g, ' ') })}</span>
          <h2>{card.name}</h2>
          <p className="text-secondary">{card.address}</p>
          {card.phone && (
            <a href={`tel:${card.phone}`} className="inline-link" aria-label={`Call facility at ${card.phone}`}>
              <Phone size={15} aria-hidden="true" />
              <span>{card.phone}</span>
            </a>
          )}
        </div>

        <div className="readiness-verdict">
          <span className={`status-chip ${isConfirmed ? 'verified' : 'unknown'} status-chip-lg`}>
            {isConfirmed ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
            <span>{isConfirmed ? 'Readiness Confirmed' : 'Not Confirmed'}</span>
          </span>
          {applicable.length > 0 ? (
            <p className="text-muted text-sm">
              {confirmed} of {applicable.length} applicable check{applicable.length === 1 ? '' : 's'} have current evidence
            </p>
          ) : (
            <p className="text-muted text-sm">No check could be made</p>
          )}
        </div>
      </header>

      <p className={`verdict-summary ${isConfirmed ? 'is-confirmed' : 'is-unconfirmed'}`}>{card.summary_text}</p>

      {card.unevaluated_needs.length > 0 && (
        <p className="callout callout-warn">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            No rules exist yet for {card.unevaluated_needs.map(needLabel).join(', ')}, so those needs did not affect this result.
          </span>
        </p>
      )}
      {ignored.length > 0 && (
        <p className="callout callout-note">
          <Info size={16} aria-hidden="true" />
          <span>Your {ignored.join(', ')} limit was not applied because no matching rule is active.</span>
        </p>
      )}

      <section aria-labelledby={`features-${card.place_id}`}>
        <div className="section-header">
          <h3 id={`features-${card.place_id}`} className="section-title">
            {t('place.features')} ({card.features.length})
          </h3>
          {onReportIssue && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReportIssue()}>
              <Flag size={14} aria-hidden="true" />
              <span>Report Discrepancy</span>
            </button>
          )}
        </div>

        {card.features.length === 0 ? (
          <div className="empty-state empty-state-warn">
            <HelpCircle size={32} aria-hidden="true" className="empty-state-icon" />
            <p className="empty-state-title">{t('place.no_audits')}</p>
            <p className="empty-state-desc">
              No accessibility features are recorded for this place yet. Unknown is never treated as accessible, so this place cannot be confirmed
              until it is audited.
            </p>
          </div>
        ) : (
          <ul className="feature-list">
            {card.features.map(f => (
              <li key={f.feature_id} className={`feature-item${f.applicable ? '' : ' is-neutral'}`}>
                <div className="feature-head">
                  <div className="feature-name">
                    <strong>{f.name}</strong>
                    <span className="tag">{featureLabel(f.feature_type)}</span>
                  </div>
                  {f.applicable ? (
                    <StatusChip status={f.status} label={f.label} ageDays={f.age_days} expiresAt={f.expires_at} />
                  ) : (
                    <span className="status-chip neutral" title="None of your selected needs has a rule for this kind of feature, so it does not affect the result.">
                      <Minus size={16} aria-hidden="true" />
                      <span>No requirement for your needs</span>
                    </span>
                  )}
                </div>

                <p className="text-secondary text-sm">{f.reason}</p>

                <div className="evidence-meta">
                  {f.source && (
                    <span className="evidence-meta-item">
                      <Shield size={12} aria-hidden="true" />
                      <span>Source: {f.source.replace(/_/g, ' ')}</span>
                    </span>
                  )}
                  {f.observed_at && (
                    <span className="evidence-meta-item">
                      <Calendar size={12} aria-hidden="true" />
                      <span>
                        Observed {describeAge(f.observed_at)} ({formatDate(f.observed_at)})
                      </span>
                    </span>
                  )}
                  {f.expires_at && <span>Valid until {formatDate(f.expires_at)}</span>}
                  {onReportIssue && (
                    <button type="button" className="link-btn" onClick={() => onReportIssue(f.feature_id)}>
                      Report an issue with this feature
                    </button>
                  )}
                </div>

                {f.next_actions.length > 0 && (
                  <div className="next-actions">
                    {f.next_actions.map((act, i) => (
                      <NextActionButton key={i} action={act} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {groups.length > 0 && (
        <details className="disclosure">
          <summary>Rules this result was checked against</summary>
          <ul className="requirement-list">
            {groups.map(group => (
              <li key={group.needCode}>
                <strong>{group.label}</strong>
                <ul>
                  {group.rows.map((row, i) => (
                    <li key={i}>
                      {row.text}
                      {row.customised && <span className="pill pill-brand">your value{row.standard ? ` (standard ${row.standard})` : ''}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="readiness-foot text-muted text-sm">
        {evaluatedOn && <p>Checked on {evaluatedOn} against current evidence. Evidence expires, so check again before you travel.</p>}
        {card.limits_notice && <p>{card.limits_notice}</p>}
      </footer>
    </article>
  )
}
