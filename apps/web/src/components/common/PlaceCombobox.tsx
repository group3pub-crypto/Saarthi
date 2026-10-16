import React, { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { searchPlaces, type PlaceSummary } from '../../services/api'

interface PlaceComboboxProps {
  id: string
  label: string
  hint?: string
  placeholder?: string
  /** The place currently chosen, if any. Typing again clears the choice. */
  selected: PlaceSummary | null
  onSelect: (place: PlaceSummary | null) => void
  /** Text to show when `selected` is set from outside (e.g. from the URL). */
  initialText?: string
}

/** Search-as-you-type place picker following the ARIA combobox pattern (arrow keys, Enter, Escape). */
export const PlaceCombobox: React.FC<PlaceComboboxProps> = ({ id, label, hint, placeholder, selected, onSelect, initialText }) => {
  const listId = useId()
  const [text, setText] = useState(initialText ?? '')
  const [results, setResults] = useState<PlaceSummary[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [searched, setSearched] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) setText(selected.name)
  }, [selected])

  useEffect(() => {
    const query = text.trim()
    if (selected || query.length < 2) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    const timer = window.setTimeout(() => {
      searchPlaces({ q: query, limit: 6 }, controller.signal)
        .then(res => {
          setResults(res)
          setSearched(true)
          setActive(-1)
          setLoading(false)
        })
        .catch((err: Error) => {
          if (controller.signal.aborted || err.name === 'AbortError') return
          setError(true)
          setLoading(false)
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [text, selected])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const choose = (place: PlaceSummary) => {
    onSelect(place)
    setText(place.name)
    setOpen(false)
    setResults([])
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive(i => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && open && active >= 0 && results[active]) {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  const showList = open && !selected && text.trim().length >= 2 && (results.length > 0 || searched || error)
  const status = loading
    ? 'Searching…'
    : error
      ? 'Search failed. Try again.'
      : searched && results.length === 0
        ? 'No matching places.'
        : results.length > 0
          ? `${results.length} match${results.length === 1 ? '' : 'es'} found. Use the arrow keys to choose.`
          : ''

  return (
    <div className="field combobox" ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <div className="combobox-input">
        <input
          id={id}
          type="text"
          className="form-input"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={e => {
            setText(e.target.value)
            if (selected) onSelect(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading && <Loader2 size={16} className="spin combobox-spinner" aria-hidden="true" />}
      </div>
      {hint && <span className="text-muted text-sm">{hint}</span>}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>

      {showList && (
        <ul id={listId} role="listbox" aria-label="Matching places" className="combobox-list">
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseDown={e => {
                e.preventDefault()
                choose(p)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="combobox-name">{p.name}</span>
              <span className="text-muted text-sm">
                {p.address ? `${p.address} · ` : ''}
                {p.type.replace(/_/g, ' ')}
              </span>
            </li>
          ))}
          {results.length === 0 && <li className="combobox-empty text-muted text-sm">{error ? 'Search failed. Try again.' : 'No matching places.'}</li>}
        </ul>
      )}
    </div>
  )
}
