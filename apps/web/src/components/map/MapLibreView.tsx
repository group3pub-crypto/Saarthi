import React, { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LocateFixed, Minus, Plus } from 'lucide-react'
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
  /** When false (the default), markers of the same evidence state within a short map distance are grouped into a cluster, like Google Maps. */
  disableClustering?: boolean
}

/** Short, legible category abbreviations shown under each marker glyph. No icon sprite pipeline exists yet, so this is the category cue. */
const TYPE_ABBR: Record<string, string> = {
  hospital: 'HOSP',
  municipal_office: 'OFFICE',
  court: 'COURT',
  bus_stop: 'BUS',
  transport_hub: 'TRANSIT',
  aadhaar_centre: 'AADHAAR',
  ration_centre: 'RATION'
}

function typeAbbr(type: string): string {
  return TYPE_ABBR[type] ?? type.slice(0, 6).toUpperCase()
}

interface PlaceFeature {
  type: 'Feature'
  id: string
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { id: string; name: string; type: string; typeAbbr: string; state: EvidenceState; glyph: string; label: string }
}

interface PlaceFeatureCollection {
  type: 'FeatureCollection'
  features: PlaceFeature[]
}

function placesToGeoJSON(places: PlaceSummary[]): PlaceFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places.map(place => {
      const state: EvidenceState = place.evidence?.state ?? 'unknown'
      return {
        type: 'Feature',
        id: place.id,
        geometry: { type: 'Point', coordinates: [place.longitude, place.latitude] },
        properties: {
          id: place.id,
          name: place.name,
          type: place.type,
          typeAbbr: typeAbbr(place.type),
          state,
          glyph: EVIDENCE_STATE_INFO[state].glyph,
          label: EVIDENCE_STATE_INFO[state].label
        }
      }
    })
  }
}

const EVIDENCE_COLOR_MATCH: (string | string[])[] = [
  'match',
  ['get', 'state'],
  'verified', 'var(--status-verified-solid)',
  'reported', 'var(--status-reported-solid)',
  'known_barrier', 'var(--status-barrier-solid)',
  'var(--status-unknown-solid)'
]

// MapLibre paint expressions can't read CSS custom properties, so resolve them once to hex/rgb at setup time.
function resolveCssColor(token: string): string {
  const probe = document.createElement('div')
  probe.style.color = token
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved || '#999'
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
  destination,
  disableClustering = false
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<Marker[]>([])
  const placesRef = useRef<PlaceSummary[]>(places)
  const onSelectRef = useRef(onSelectPlace)
  const { theme } = useAccessibility()
  const [isStyleReady, setIsStyleReady] = useState(false)

  placesRef.current = places
  onSelectRef.current = onSelectPlace

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
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
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
      center,
      zoom,
      attributionControl: false
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }),
      'top-right'
    )
    mapRef.current = map

    map.once('load', () => setIsStyleReady(true))

    return () => {
      map.remove()
      mapRef.current = null
      setIsStyleReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update center when prop changes (does nothing while a place result set is driving the view — see below)
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.easeTo({ center, zoom, duration: 700 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom])

  // Update Route GeoJSON Layer
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const updateRoute = () => {
      const sourceId = 'route-source'
      const layerId = 'route-layer'
      const layerCasing = 'route-layer-casing'

      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getLayer(layerCasing)) map.removeLayer(layerCasing)
      if (map.getSource(sourceId)) map.removeSource(sourceId)

      if (routeGeometry && routeGeometry.coordinates && routeGeometry.coordinates.length > 0) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeGeometry.coordinates } }
        })

        const routeColor = theme === 'high_contrast' ? '#ffff00' : '#533afd'

        map.addLayer({
          id: layerCasing,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#fff', 'line-width': 9, 'line-opacity': 0.9 }
        })
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': routeColor,
            'line-width': 5,
            'line-opacity': 0.95,
            ...(routeKind === 'straight_line' ? { 'line-dasharray': [1.5, 2] } : {})
          }
        })

        const bounds = new maplibregl.LngLatBounds()
        routeGeometry.coordinates.forEach(coord => bounds.extend([coord[0], coord[1]]))
        map.fitBounds(bounds, { padding: 56, maxZoom: 17 })
      }
    }

    if (map.isStyleLoaded()) updateRoute()
    else map.once('load', updateRoute)
  }, [routeGeometry, routeKind, theme])

  // Origin / destination DOM markers (there are only ever one or two of these, so plain Markers are fine)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (origin) {
      const el = document.createElement('div')
      el.className = 'map-marker origin-marker'
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', 'Start of journey')
      el.textContent = 'A'
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([origin.longitude, origin.latitude]).addTo(map))
    }

    if (destination) {
      const el = document.createElement('div')
      el.className = 'map-marker destination-marker'
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', `Destination: ${destination.name || 'Selected place'}`)
      el.textContent = 'B'
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([destination.longitude, destination.latitude]).addTo(map))
    }
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude, destination?.name])

  // Clustered place source + layers (created once the style has loaded)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    const sourceId = 'places-source'
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: placesToGeoJSON(placesRef.current) as any,
        cluster: !disableClustering,
        clusterRadius: 48,
        clusterMaxZoom: 15,
        promoteId: 'id'
      } as any)

      const verified = resolveCssColor('var(--status-verified-solid)')
      const reported = resolveCssColor('var(--status-reported-solid)')
      const unknown = resolveCssColor('var(--status-unknown-solid)')
      const barrier = resolveCssColor('var(--status-barrier-solid)')
      const resolvedMatch = EVIDENCE_COLOR_MATCH.map(token => {
        if (token === 'var(--status-verified-solid)') return verified
        if (token === 'var(--status-reported-solid)') return reported
        if (token === 'var(--status-unknown-solid)') return unknown
        if (token === 'var(--status-barrier-solid)') return barrier
        return token
      })

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': resolveCssColor('var(--accent-primary)'),
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff'
        }
      } as any)
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 13, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#fff' }
      } as any)

      map.addLayer({
        id: 'place-circle',
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': resolvedMatch,
          'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 16, 11],
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, 2],
          'circle-stroke-color': '#fff'
        }
      } as any)
      map.addLayer({
        id: 'place-glyph',
        type: 'symbol',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'glyph'],
          'text-size': ['case', ['boolean', ['feature-state', 'selected'], false], 15, 12],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true
        },
        paint: { 'text-color': '#fff' }
      } as any)
      map.addLayer({
        id: 'place-type-label',
        type: 'symbol',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        minzoom: 13,
        layout: {
          'text-field': ['get', 'typeAbbr'],
          'text-size': 9,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-optional': true
        },
        paint: { 'text-color': resolveCssColor('var(--text-secondary)'), 'text-halo-color': '#fff', 'text-halo-width': 1.4 }
      } as any)

      const cursorPointer = () => (map.getCanvas().style.cursor = 'pointer')
      const cursorDefault = () => (map.getCanvas().style.cursor = '')

      map.on('mouseenter', 'clusters', cursorPointer)
      map.on('mouseleave', 'clusters', cursorDefault)
      map.on('mouseenter', 'place-circle', cursorPointer)
      map.on('mouseleave', 'place-circle', cursorDefault)

      map.on('click', 'clusters', e => {
        const feature = e.features?.[0]
        if (!feature) return
        const clusterId = feature.properties?.cluster_id
        const source = map.getSource(sourceId) as GeoJSONSource
        source.getClusterExpansionZoom(clusterId).then(targetZoom => {
          const geometry = feature.geometry as { type: string; coordinates: [number, number] }
          map.easeTo({ center: geometry.coordinates, zoom: targetZoom + 0.2, duration: 500 })
        })
      })

      map.on('click', 'place-circle', e => {
        const feature = e.features?.[0]
        const id = feature?.properties?.id
        if (!id) return
        const place = placesRef.current.find(p => p.id === id)
        if (place && onSelectRef.current) onSelectRef.current(place)
      })
    } else {
      const source = map.getSource(sourceId) as GeoJSONSource
      source.setData(placesToGeoJSON(places) as any)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, isStyleReady, disableClustering])

  // Selected-place highlight, driven by feature-state so the whole source need not be redrawn.
  const previousSelectedRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !map.getSource('places-source')) return
    const prior = previousSelectedRef.current
    if (prior && prior !== selectedPlaceId) {
      map.setFeatureState({ source: 'places-source', id: prior }, { selected: false })
    }
    if (selectedPlaceId) {
      map.setFeatureState({ source: 'places-source', id: selectedPlaceId }, { selected: true })
    }
    previousSelectedRef.current = selectedPlaceId
  }, [selectedPlaceId, isStyleReady, places])

  // Fit to all results when nothing specific is selected, so the whole result set is visible at once.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || selectedPlaceId || origin || destination) return
    if (places.length < 2) return
    const bounds = new maplibregl.LngLatBounds()
    places.forEach(p => bounds.extend([p.longitude, p.latitude]))
    map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 500 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, isStyleReady])

  const recenter = () => {
    mapRef.current?.easeTo({ center, zoom, duration: 500 })
  }
  const zoomIn = () => mapRef.current?.zoomIn({ duration: 300 })
  const zoomOut = () => mapRef.current?.zoomOut({ duration: 300 })

  return (
    <div className="map-canvas-wrap">
      <div ref={mapContainerRef} className="map-canvas" role="region" aria-label="Interactive map of Pune public services and pedestrian network" />
      <div className="map-controls" role="group" aria-label="Map controls">
        <button type="button" className="map-control-btn" onClick={zoomIn} aria-label="Zoom in">
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="map-control-btn" onClick={zoomOut} aria-label="Zoom out">
          <Minus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="map-control-btn" onClick={recenter} aria-label="Recenter the map">
          <LocateFixed size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
