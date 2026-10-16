import React, { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlaceSummary } from '../../services/api'
import { useAccessibility } from '../../context/AccessibilityContext'

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

        const routeColor = theme === 'high_contrast' ? '#ffff00' : '#38bdf8'

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
            'line-opacity': 0.95
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
  }, [routeGeometry, theme])

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
      el.setAttribute('aria-label', 'Origin Location')
      el.style.backgroundColor = '#10b981'
      el.style.width = '24px'
      el.style.height = '24px'
      el.style.borderRadius = '50%'
      el.style.border = '3px solid #ffffff'
      el.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)'

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([origin.longitude, origin.latitude])
        .addTo(map)
      markersRef.current.push(marker)
    }

    // 2. Destination Marker
    if (destination) {
      const el = document.createElement('div')
      el.className = 'map-marker destination-marker'
      el.setAttribute('aria-label', `Destination: ${destination.name || 'Selected Place'}`)
      el.style.backgroundColor = '#f43f5e'
      el.style.width = '26px'
      el.style.height = '26px'
      el.style.borderRadius = '50%'
      el.style.border = '3px solid #ffffff'
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.6)'

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([destination.longitude, destination.latitude])
        .addTo(map)
      markersRef.current.push(marker)
    }

    // 3. Place Markers
    places.forEach(place => {
      const isSelected = place.id === selectedPlaceId
      const el = document.createElement('div')
      el.className = `map-place-marker ${isSelected ? 'selected' : ''}`
      el.setAttribute('role', 'button')
      el.setAttribute('tabindex', '0')
      el.setAttribute('aria-label', `${place.name} (${place.type})`)
      el.title = place.name

      el.style.width = isSelected ? '34px' : '28px'
      el.style.height = isSelected ? '34px' : '28px'
      el.style.minWidth = '28px'
      el.style.minHeight = '28px'
      el.style.borderRadius = '50%'
      el.style.backgroundColor = isSelected ? 'var(--accent-primary)' : '#6366f1'
      el.style.border = '2px solid #ffffff'
      el.style.cursor = 'pointer'
      el.style.transition = 'all 0.2s'

      el.addEventListener('click', () => {
        if (onSelectPlace) onSelectPlace(place)
      })

      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
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
      style={{
        width: '100%',
        height: '100%',
        minHeight: '360px',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        position: 'relative'
      }}
      role="region"
      aria-label="Interactive Map of Pune Public Services & Pedestrian Network"
    />
  )
}
