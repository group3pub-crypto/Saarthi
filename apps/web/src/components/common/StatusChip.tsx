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
          ariaLabel: 'Verified: confirmed on site by an auditor, and the record has not expired'
        }
      case 'reported':
        return {
          icon: <Clock size={16} aria-hidden="true" />,
          defaultText: t('status.reported'),
          ariaLabel: 'Reported: someone reported this but no auditor has verified it yet'
        }
      case 'temporary_barrier':
        return {
          icon: <AlertTriangle size={16} aria-hidden="true" />,
          defaultText: t('status.temporary_barrier'),
          ariaLabel: 'Temporary barrier: a short-term outage or obstruction that expires'
        }
      case 'barrier':
        return {
          icon: <XCircle size={16} aria-hidden="true" />,
          defaultText: t('status.barrier'),
          ariaLabel: 'Known barrier: current evidence shows this does not meet the requirement'
        }
      case 'unknown':
      default:
        return {
          icon: <HelpCircle size={16} aria-hidden="true" />,
          defaultText: t('status.unknown'),
          ariaLabel: 'Unknown: no current evidence. Unknown is never treated as accessible'
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
        <span className="status-chip-age">({ageDays}d ago)</span>
      )}
    </span>
  )
}
