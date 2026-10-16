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

  const THEME_LABEL: Record<string, string> = {
    light: 'Light',
    default_dark: 'Dark',
    high_contrast: 'High contrast'
  }

  const needCount = profile.activeNeedCodes.length
  const profileSummary = profile.savedByUser
    ? `${profile.presets.length} need${profile.presets.length === 1 ? '' : 's'} saved`
    : 'Not set up'

  const navLink = (to: string, icon: React.ReactNode, label: string) => (
    <Link
      to={to}
      className={`nav-link ${location.pathname === to ? 'active' : ''}`}
      aria-current={location.pathname === to ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )

  return (
    <header className="header-bar" role="banner">
      <a href="#main-content" className="skip-link">
        {t('nav.skipLink')}
      </a>

      <div className="nav-inner">
        <Link to="/" className="brand-link" aria-label="SAARTHI Access home">
          <Navigation className="brand-icon" size={22} aria-hidden="true" />
          <span>
            SAARTHI <span className="brand-accent">Access</span>
          </span>
        </Link>

        <nav id="primary-nav" aria-label="Primary navigation" className={`nav-panel ${mobileOpen ? 'mobile-open' : ''}`}>
          <ul className="nav-links nav-links-primary">
            <li>{navLink('/', <Search size={16} aria-hidden="true" />, t('nav.search'))}</li>
            <li>{navLink('/plan', <ShieldCheck size={16} aria-hidden="true" />, t('nav.plan'))}</li>
          </ul>
          <ul className="nav-links nav-links-secondary">
            <li>{navLink('/auditor', <ClipboardCheck size={16} aria-hidden="true" />, 'Auditor')}</li>
            <li>{navLink('/settings', <Settings size={16} aria-hidden="true" />, t('nav.settings'))}</li>
          </ul>
        </nav>

        <div className="quick-controls">
          <button
            type="button"
            className="profile-chip"
            onClick={() => {
              setMobileOpen(false)
              onOpenProfileModal()
            }}
            aria-label={`${t('nav.profile')}: ${profileSummary}${needCount > 0 ? `, ${needCount} checked` : ''}. Open to edit.`}
          >
            <UserCheck size={16} aria-hidden="true" />
            <span className="profile-chip-text">
              <span className="profile-chip-title">{t('nav.profile')}</span>
              <span className="profile-chip-sub">{profileSummary}</span>
            </span>
          </button>

          <label className="lang-wrap">
            <Globe size={15} aria-hidden="true" />
            <span className="sr-only">Language</span>
            <select className="lang-select" value={i18n.language.slice(0, 2)} onChange={handleLanguageChange}>
              <option value="en">EN</option>
              <option value="hi">हिन्दी</option>
              <option value="mr">मराठी</option>
            </select>
          </label>

          <button
            type="button"
            className="icon-btn"
            onClick={cycleTextScale}
            aria-label={`Text size ${textScale} percent. Activate to change.`}
            title="Text size: 100% / 125% / 150% / 200%"
          >
            <span aria-hidden="true">A± {textScale}%</span>
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={cycleTheme}
            aria-label={`Theme: ${THEME_LABEL[theme] ?? theme}. Activate to change.`}
            title={`Theme: ${THEME_LABEL[theme] ?? theme}`}
          >
            {theme === 'high_contrast' && <Contrast size={16} aria-hidden="true" />}
            {theme === 'default_dark' && <Moon size={16} aria-hidden="true" />}
            {theme === 'light' && <Sun size={16} aria-hidden="true" />}
          </button>

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
