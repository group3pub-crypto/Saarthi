import React, { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlaceSummary } from '../../services/api'
import { useAccessibility } from '../../context/AccessibilityContext'
import { EVIDENCE_STATE_INFO, type EvidenceState } from '../../services/evidence'

interface MapLibreViewProps {
  center?: [number, number] // [lng, lat]
  zoom?: number
  places?: PlaceSummary[]
  selectedPlaceId?: string
  onSelectPlace?: (place: PlaceSummary) => void
  routeGeometry?: {
    type: string
    coordinates: number[][]
  }
  /** A straight line is drawn dashed: it is not a walkable route. */
  routeKind?: 'pedestrian_network' | 'straight_line'
  origin?: { latitude: number; longitude: number }
  destination?: { latitude: number; longitude: number; name?: string }
}

export const MapLibreView: React.FC<MapLibreViewProps> = ({
  center = [73.8567, 18.5204], // Pune central coordinates
  zoom = 13,
  places = [],
  selectedPlaceId,
  onSelectPlace,
  routeGeometry,
  routeKind = 'pedestrian_network',
  origin,
  destination
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<Marker[]>([])
  const { theme } = useAccessibility()

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const isHighContrast = theme === 'high_contrast'

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors (ODbL)'
          }
        },
        layers: [
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
            paint: isHighContrast
              ? {
                  'raster-contrast': 0.8,
                  'raster-brightness-max': 0.7,
                  'raster-saturation': -1
                }
              : {}
          }
        ]
      },
      center: center,
      zoom: zoom
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update center when prop changes
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.easeTo({
        center: center,
        zoom: zoom,
        duration: 800
      })
    }
  }, [center[0], center[1], zoom])

  // Update Route GeoJSON Layer
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const updateRoute = () => {
      const sourceId = 'route-source'
      const layerId = 'route-layer'

      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)

      if (routeGeometry && routeGeometry.coordinates && routeGeometry.coordinates.length > 0) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: routeGeometry.coordinates
            }
          }
        })

        const routeColor = theme === 'high_contrast' ? '#ffff00' : '#533afd'

        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': routeColor,
            'line-width': 6,
            'line-opacity': 0.95,
            ...(routeKind === 'straight_line' ? { 'line-dasharray': [1.5, 2] } : {})
          }
        })

        // Fit bounds to route
        const bounds = new maplibregl.LngLatBounds()
        routeGeometry.coordinates.forEach(coord => {
          bounds.extend([coord[0], coord[1]])
        })
        map.fitBounds(bounds, { padding: 40 })
      }
    }

    if (map.isStyleLoaded()) {
      updateRoute()
    } else {
      map.once('load', updateRoute)
    }
  }, [routeGeometry, routeKind, theme])

  // Update Markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // 1. Origin Marker
    if (origin) {
      const el = document.createElement('div')
      el.className = 'map-marker origin-marker'
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', 'Start of journey')
      el.textContent = 'A'

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([origin.longitude, origin.latitude])
        .addTo(map)
      markersRef.current.push(marker)
    }

    // 2. Destination Marker
    if (destination) {
      const el = document.createElement('div')
      el.className = 'map-marker destination-marker'
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', `Destination: ${destination.name || 'Selected Place'}`)
      el.textContent = 'B'

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([destination.longitude, destination.latitude])
        .addTo(map)
      markersRef.current.push(marker)
    }

    // 3. Place Markers: coloured by evidence state, with a glyph so colour is never the only cue.
    places.forEach(place => {
      const isSelected = place.id === selectedPlaceId
      const state: EvidenceState = place.evidence?.state ?? 'unknown'
      const info = EVIDENCE_STATE_INFO[state]
      const el = document.createElement('div')
      el.className = `map-place-marker state-${state}${isSelected ? ' selected' : ''}`
      el.setAttribute('role', 'button')
      el.setAttribute('tabindex', '0')
      el.setAttribute('aria-label', `${place.name}, ${place.type.replace(/_/g, ' ')}. Evidence: ${info.label}`)
      el.title = `${place.name}: ${info.label}`
      el.textContent = info.glyph

      el.addEventListener('click', () => {
        if (onSelectPlace) onSelectPlace(place)
      })

      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (onSelectPlace) onSelectPlace(place)
        }
      })

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [places, selectedPlaceId, origin, destination])

  return (
    <div
      ref={mapContainerRef}
      className="map-canvas"
      role="region"
      aria-label="Interactive Map of Pune Public Services & Pedestrian Network"
    />
  )
}
