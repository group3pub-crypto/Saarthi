import React from 'react'
import { FlaskConical, X } from 'lucide-react'
import { useDemoMode } from '../../context/DemoModeContext'

/** A persistent, unmissable notice: everything on screen is invented demo data, never real evidence. */
export const DemoModeBanner: React.FC = () => {
  const { isOn, setDemoMode } = useDemoMode()
  if (!isOn) return null

  return (
    <div className="demo-banner" role="status">
      <FlaskConical size={16} aria-hidden="true" />
      <span>
        <strong>Demo mode.</strong> Every place and evidence record on screen is invented sample data for a demonstration. None of it is real, audited
        evidence.
      </span>
      <button type="button" className="btn btn-ghost btn-sm demo-banner-exit" onClick={() => setDemoMode(false)}>
        <X size={14} aria-hidden="true" />
        <span>Exit demo mode</span>
      </button>
    </div>
  )
}
