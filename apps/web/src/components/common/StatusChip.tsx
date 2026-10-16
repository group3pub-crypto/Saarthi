import React from 'react'
import { CheckCircle2, Clock, AlertTriangle, XCircle, HelpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type EvidenceStatusType = 'verified' | 'reported' | 'temporary_barrier' | 'barrier' | 'unknown'

interface StatusChipProps {
  status: EvidenceStatusType
  label?: string
  observedAt?: string
  ageDays?: number
  expiresAt?: string
  className?: string
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  ageDays,
  className = ''
}) => {
  const { t } = useTranslation()

  const getStatusConfig = () => {
    switch (status) {
      case 'verified':
        return {
          icon: <CheckCircle2 size={16} aria-hidden="true" />,
          defaultText: t('status.verified'),
          ariaLabel: 'Verified: On-site audit approved by certified verifier'
        }
      case 'reported':
        return {
          icon: <Clock size={16} aria-hidden="true" />,
          defaultText: t('status.reported'),
          ariaLabel: 'Reported: Multiple independent citizen reports agree'
        }
      case 'temporary_barrier':
        return {
          icon: <AlertTriangle size={16} aria-hidden="true" />,
          defaultText: t('status.temporary_barrier'),
          ariaLabel: 'Temporary barrier: Active outage or obstruction with 7-day expiry'
        }
      case 'barrier':
        return {
          icon: <XCircle size={16} aria-hidden="true" />,
          defaultText: t('status.barrier'),
          ariaLabel: 'Known barrier: Fails required accessibility threshold'
        }
      case 'unknown':
      default:
        return {
          icon: <HelpCircle size={16} aria-hidden="true" />,
          defaultText: t('status.unknown'),
          ariaLabel: 'Status unknown: No current evidence recorded; never assumed accessible'
        }
    }
  }

  const config = getStatusConfig()
  const displayLabel = label || config.defaultText

  return (
    <span
      className={`status-chip ${status} ${className}`}
      role="status"
      aria-label={`${config.ariaLabel}${ageDays !== undefined && ageDays !== null ? `, observed ${ageDays} days ago` : ''}`}
      title={config.ariaLabel}
    >
      {config.icon}
      <span>{displayLabel}</span>
      {ageDays !== undefined && ageDays !== null && (
        <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>({ageDays}d ago)</span>
      )}
    </span>
  )
}
