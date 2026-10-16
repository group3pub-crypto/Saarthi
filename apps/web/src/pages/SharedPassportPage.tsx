import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { JourneyPassportCard } from '../components/passport/JourneyPassportCard'
import type { JourneyPlanResponse } from '../services/api'

export const SharedPassportPage: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [passport, setPassport] = useState<JourneyPlanResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    // In production, GET /api/v1/passport/{token}
    // For now, fetch from localStorage or mock token resolution
    const cached = localStorage.getItem(`passport_${token}`)
    if (cached) {
      try {
        setPassport(JSON.parse(cached))
        setIsLoading(false)
        return
      } catch (e) {}
    }

    // Attempt fetch from API
    fetch(`/api/v1/passport/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Shared passport link has expired or is invalid.')
        return res.json()
      })
      .then(data => {
        setPassport(data)
        setIsLoading(false)
      })
      .catch(err => {
        setErrorMsg(err.message || 'Passport link expired.')
        setIsLoading(false)
      })
  }, [token])

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        Verifying read-only companion passport link...
      </div>
    )
  }

  if (errorMsg || !passport) {
    return (
      <div className="saarthi-card" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <ShieldAlert size={48} color="var(--status-barrier-border)" style={{ margin: '0 auto 1rem' }} aria-hidden="true" />
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Passport Link Unavailable</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          {errorMsg || 'This read-only companion passport has expired or does not exist.'}
        </p>
        <Link to="/" className="btn-primary" style={{ display: 'inline-flex', marginTop: '1.5rem' }}>
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Go to SAARTHI Home</span>
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" className="btn-secondary" style={{ fontSize: '0.85rem' }}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to App</span>
        </Link>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Shared Companion / Caregiver View
        </span>
      </div>

      <JourneyPassportCard plan={passport} />
    </div>
  )
}
