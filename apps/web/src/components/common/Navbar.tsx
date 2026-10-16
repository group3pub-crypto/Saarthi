import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Navigation,
  ShieldCheck,
  Settings,
  Search,
  Sun,
  Moon,
  Contrast,
  Globe,
  UserCheck,
  ClipboardCheck,
  Menu,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccessibility } from '../../context/AccessibilityContext'
import { useAccessProfile } from '../../context/AccessProfileContext'

interface NavbarProps {
  onOpenProfileModal: () => void
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenProfileModal }) => {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { theme, setTheme, textScale, setTextScale } = useAccessibility()
  const { profile } = useAccessProfile()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  const cycleTheme = () => {
    if (theme === 'default_dark') setTheme('high_contrast')
    else if (theme === 'high_contrast') setTheme('light')
    else setTheme('default_dark')
  }

  const cycleTextScale = () => {
    if (textScale === '100') setTextScale('125')
    else if (textScale === '125') setTextScale('150')
    else if (textScale === '150') setTextScale('200')
    else setTextScale('100')
  }

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value)
  }

  return (
    <header className="header-bar" role="banner">
      <a href="#main-content" className="skip-link">
        {t('nav.skipLink')}
      </a>

      <div className="nav-inner">
        {/* Brand */}
        <Link to="/" className="brand-link" aria-label="SAARTHI Access Home">
          <Navigation className="brand-icon" size={24} aria-hidden="true" />
          <span>
            SAARTHI <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>Access</span>
          </span>
        </Link>

        {/* Primary Navigation links */}
        <nav id="primary-nav" aria-label="Primary navigation">
          <ul className={`nav-links ${mobileOpen ? 'mobile-open' : ''}`}>
            <li>
              <Link
                to="/"
                className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
                aria-current={location.pathname === '/' ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Search size={16} aria-hidden="true" />
                <span>{t('nav.search')}</span>
              </Link>
            </li>
            <li>
              <Link
                to="/plan"
                className={`nav-link ${location.pathname === '/plan' ? 'active' : ''}`}
                aria-current={location.pathname === '/plan' ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <ShieldCheck size={16} aria-hidden="true" />
                <span>{t('nav.plan')}</span>
              </Link>
            </li>
            <li>
              <button
                type="button"
                className="nav-link"
                onClick={() => {
                  setMobileOpen(false)
                  onOpenProfileModal()
                }}
                aria-label={`Access Profile: ${profile.presets.length} presets active. Click to customize.`}
              >
                <UserCheck size={16} aria-hidden="true" />
                <span>{t('nav.profile')}</span>
                <span className="nav-badge" aria-label={`${profile.presets.length} active needs`}>
                  {profile.presets.length}
                </span>
              </button>
            </li>
            <li>
              <Link
                to="/auditor"
                className={`nav-link ${location.pathname === '/auditor' ? 'active' : ''}`}
                aria-current={location.pathname === '/auditor' ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <ClipboardCheck size={16} aria-hidden="true" />
                <span>Auditor</span>
              </Link>
            </li>
            <li>
              <Link
                to="/settings"
                className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}
                aria-current={location.pathname === '/settings' ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Settings size={16} aria-hidden="true" />
                <span>{t('nav.settings')}</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* Quick Accessibility & Locale Controls */}
        <div className="quick-controls" aria-label="Quick accessibility settings">
          {/* Language Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <Globe size={15} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
            <select
              className="lang-select"
              value={i18n.language.slice(0, 2)}
              onChange={handleLanguageChange}
              aria-label="Change language (भाषा निवडा / भाषा बदलें)"
            >
              <option value="en">EN</option>
              <option value="hi">हिन्दी</option>
              <option value="mr">मराठी</option>
            </select>
          </div>

          {/* Text Size Cycler */}
          <button
            type="button"
            className="icon-btn"
            onClick={cycleTextScale}
            aria-label={`Current text scale: ${textScale} percent. Click to adjust.`}
            title="Adjust text scale (100% / 125% / 150% / 200%)"
          >
            <span>A± {textScale}%</span>
          </button>

          {/* Theme Mode Cycler */}
          <button
            type="button"
            className="icon-btn"
            onClick={cycleTheme}
            aria-label={`Current theme: ${theme}. Click to cycle themes.`}
            title="Toggle theme (Default / High Contrast / Light)"
          >
            {theme === 'high_contrast' && <Contrast size={16} aria-hidden="true" />}
            {theme === 'default_dark' && <Moon size={16} aria-hidden="true" />}
            {theme === 'light' && <Sun size={16} aria-hidden="true" />}
          </button>

          {/* Mobile Navigation Toggle */}
          <button
            type="button"
            className="nav-mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="primary-nav"
          >
            {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  )
}
