import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileUp, Info } from 'lucide-react'
import { JourneyPassportCard } from '../components/passport/JourneyPassportCard'
import type { JourneyPlanResponse } from '../services/api'
import { parsePassportFile } from '../services/passport'

/**
 * SAARTHI does not host shared passport links. A passport is shared as a file
 * (Export file on the passport) or as a text summary, and can be opened here.
 */
export const SharedPassportPage: React.FC = () => {
  const [passport, setPassport] = useState<JourneyPlanResponse | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const result = parsePassportFile(await file.text())
    if (result.ok) {
      setPassport(result.plan)
      setError('')
    } else {
      setPassport(null)
      setError(result.error)
    }
  }

  return (
    <div className="page narrow">
      <div className="detail-actions">
        <Link to="/" className="btn btn-secondary btn-sm">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to Explore</span>
        </Link>
      </div>

      <section className="saarthi-card">
        <h1 className="page-title">Open a journey passport</h1>
        <p className="text-secondary">
          Online shared links are not available on this server. If someone sent you a passport file exported from SAARTHI, open it here to read it. It
          is shown read-only and never uploaded.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleFile} aria-label="Choose a passport file" />
        <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          <FileUp size={16} aria-hidden="true" />
          <span>Choose passport file</span>
        </button>
        {error && (
          <p className="callout callout-danger" role="alert">
            <Info size={16} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </section>

      {passport && <JourneyPassportCard plan={passport} readOnly />}
    </div>
  )
}
