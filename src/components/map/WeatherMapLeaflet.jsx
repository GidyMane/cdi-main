import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  addLeafletProtocolSupport,
  defaultOmProtocolSettings,
  domainOptions,
  getColorScale,
  getValueFromLatLong,
  omProtocol,
  variableOptions
} from '@openmeteo/weather-map-layer';

const UGANDA_GEOJSON_URL =
  'https://map-assets.open-meteo.com/world-geojson/countries/uganda.json';

const DEFAULT_DOMAIN = 'dwd_icon';
const DEFAULT_VARIABLE = 'temperature_2m';
const DEFAULT_CENTER = [1.37, 32.29];
const WEATHER_DOMAINS = [
  'dwd_icon',
  'ncep_gfs013'
];
const WEATHER_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'wind_u_component_10m'
];
const VARIABLE_SHORT_LABELS = {
  temperature_2m: 'Temperature',
  relative_humidity_2m: 'Humidity',
  precipitation: 'Rain',
  wind_u_component_10m: 'Wind'
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const PLAYBACK_DAYS = 7;
const ANIMATION_MIN_ZOOM = 8;
const UGANDA_BOUNDS = {
  south: -1.55,
  west: 29.45,
  north: 4.35,
  east: 35.15
};
const UGANDA_OM_BOUNDS = [
  UGANDA_BOUNDS.west,
  UGANDA_BOUNDS.south,
  UGANDA_BOUNDS.east,
  UGANDA_BOUNDS.north
];

const pad = (value) => String(value).padStart(2, '0');

const getDomain = (value) =>
  domainOptions.find((domain) => domain.value === value) ?? domainOptions[0];

const labelForVariable = (value) =>
  VARIABLE_SHORT_LABELS[value] ??
  variableOptions.find((variable) => variable.value === value)?.label ??
  value;

const selectedVariableOptions = () =>
  variableOptions.filter((option) => WEATHER_VARIABLES.includes(option.value));

const formatUtcDate = (date) => `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}`;
const formatUtcTime = (date) => `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
const formatTimelineLabel = (date) => `${DAY_NAMES[date.getUTCDay()]} ${formatUtcDate(date)}`;
const formatMonthYear = (date) =>
  date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

const formatOmModelRun = (date) =>
  `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${pad(
    date.getUTCHours()
  )}00Z`;

const formatOmValidTime = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(
    date.getUTCHours()
  )}00.om`;

const resolveValidTime = (metadata, timeStep) => {
  if (!metadata?.valid_times?.length) return null;
  const indexMatch = timeStep?.match(/^valid_times_(\d+)$/);
  const index = indexMatch ? Number(indexMatch[1]) : 0;
  return new Date(metadata.valid_times[Math.min(Math.max(index, 0), metadata.valid_times.length - 1)]);
};

const buildOmUrl = ({
  domain,
  variable,
  timeStep,
  overlays,
  tileSize,
  darkMode,
  clipHash,
  metadata
}) => {
  const modelRun = metadata?.reference_time ? new Date(metadata.reference_time) : null;
  const validTime = resolveValidTime(metadata, timeStep);
  const filePath =
    modelRun && validTime && Number.isFinite(modelRun.getTime()) && Number.isFinite(validTime.getTime())
      ? `${formatOmModelRun(modelRun)}/${formatOmValidTime(validTime)}`
      : 'latest.json';

  const url = new URL(
    `https://map-tiles.open-meteo.com/data_spatial/${domain}/${filePath}`
  );

  url.searchParams.set('variable', variable);
  url.searchParams.set('tile_size', tileSize);

  if (filePath === 'latest.json') {
    url.searchParams.set('time_step', timeStep);
  }

  if (darkMode) url.searchParams.set('dark', 'true');
  if (overlays.grid) url.searchParams.set('grid', 'true');
  if (overlays.arrows) url.searchParams.set('arrows', 'true');
  if (overlays.contours) url.searchParams.set('contours', 'true');
  if (clipHash) url.searchParams.set('clipping_options_hash', clipHash);

  return url.href;
};

const rgbaToCss = ([r, g, b, a = 1]) => `rgba(${r}, ${g}, ${b}, ${a})`;

const colorScaleToGradient = (scale) => {
  if (scale.type === 'rgba') {
    return scale.colors.map(rgbaToCss).join(', ');
  }

  return scale.colors
    .map((color, index) => {
      const pct = (index / Math.max(scale.colors.length - 1, 1)) * 100;
      return `${rgbaToCss(color)} ${pct}%`;
    })
    .join(', ');
};

const getBoundsFromGeoJson = (geojson) => {
  const bounds = L.geoJSON(geojson).getBounds();
  return bounds.isValid() ? bounds : null;
};

const forEachGeoJsonRing = (geojson, callback) => {
  const visitGeometry = (geometry) => {
    if (!geometry) return;
    if (geometry.type === 'Polygon') {
      geometry.coordinates.forEach(callback);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon) => polygon.forEach(callback));
    } else if (geometry.type === 'GeometryCollection') {
      geometry.geometries.forEach(visitGeometry);
    }
  };

  if (geojson.type === 'FeatureCollection') {
    geojson.features.forEach((feature) => visitGeometry(feature.geometry));
  } else if (geojson.type === 'Feature') {
    visitGeometry(geojson.geometry);
  } else {
    visitGeometry(geojson);
  }
};

const pointInRing = (lat, lng, ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const intersects =
      y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1;
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInGeoJson = (lat, lng, geojson) => {
  if (!geojson) return true;
  let inside = false;
  forEachGeoJsonRing(geojson, (ring) => {
    if (pointInRing(lat, lng, ring)) inside = !inside;
  });
  return inside;
};

const formatReading = (value, unit) => {
  if (!Number.isFinite(value)) return 'No data';

  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)}${unit ?? ''}`;
};

const vectorStyle = (properties, layerName) => {
  const value = Number(properties.value) || 0;

  if (layerName === 'grid') {
    return {
      strokeStyle: 'rgba(255, 154, 46, 0.95)',
      lineWidth: 3,
      globalAlpha: 0.9
    };
  }

  if (layerName === 'contours') {
    return {
      strokeStyle: value % 50 === 0 ? 'rgba(23, 37, 84, 0.8)' : 'rgba(23, 37, 84, 0.42)',
      lineWidth: value % 50 === 0 ? 2.2 : 1.2,
      lineCap: 'round'
    };
  }

  return {
    strokeStyle:
      value > 10
        ? 'rgba(8, 47, 73, 0.75)'
        : value > 5
          ? 'rgba(8, 47, 73, 0.58)'
          : 'rgba(8, 47, 73, 0.38)',
    lineWidth: value > 10 ? 3 : value > 5 ? 2.4 : 1.8,
    lineCap: 'round'
  };
};

const mapToolLabels = [
  { value: 'temperature_2m', label: 'T' },
  { value: 'precipitation', label: 'R' },
  { value: 'relative_humidity_2m', label: 'H' },
  { value: 'wind_u_component_10m', label: 'W' }
];

export default function WeatherMapLeaflet() {
  const mapElRef = useRef(null);
  const windCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const protocolRef = useRef(null);
  const rasterLayerRef = useRef(null);
  const vectorLayerRef = useRef(null);
  const ugandaLayerRef = useRef(null);
  const ugandaGeoJsonRef = useRef(null);
  const ugandaBoundsRef = useRef(null);
  const tooltipRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const hoverRequestRef = useRef(0);
  const windAnimationRef = useRef(null);
  const currentOmUrlRef = useRef('');
  const readingMetaRef = useRef({ label: labelForVariable(DEFAULT_VARIABLE), unit: '' });
  const protocolSettingsRef = useRef({
    ...defaultOmProtocolSettings,
    clippingOptions: undefined
  });

  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [variable, setVariable] = useState(DEFAULT_VARIABLE);
  const [timeStep, setTimeStep] = useState('current_time_1H');
  const [opacity, setOpacity] = useState(76);
  const [clipUganda, setClipUganda] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [tileSize, setTileSize] = useState('512');
  const [clipRevision, setClipRevision] = useState(0);
  const [overlays, setOverlays] = useState({
    contours: false,
    grid: false,
    arrows: false
  });
  const [metadata, setMetadata] = useState(null);
  const [clipStatus, setClipStatus] = useState('Loading Uganda clip');
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [rangeMode, setRangeMode] = useState('hourly');
  const [showLayers, setShowLayers] = useState(false);

  const selectedDomain = getDomain(domain);
  const availableVariables = useMemo(() => {
    const selectedVariables = selectedVariableOptions();

    if (!metadata?.variables) return selectedVariables;

    const available = new Set(metadata.variables);
    return selectedVariables.filter((option) => available.has(option.value));
  }, [metadata]);

  const visibleDomains = useMemo(() => {
    return WEATHER_DOMAINS.map(getDomain).filter(Boolean);
  }, []);

  const colorScale = useMemo(() => getColorScale(variable, darkMode), [variable, darkMode]);
  const playbackTimes = useMemo(() => {
    const validTimes = metadata?.valid_times ?? [];
    if (validTimes.length === 0) return [];

    const parsed = validTimes
      .map((validTime, index) => ({
        date: new Date(validTime),
        index,
        value: `valid_times_${index}`
      }))
      .filter((item) => Number.isFinite(item.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (parsed.length === 0) return [];

    const start = parsed[0].date.getTime();
    const end = start + PLAYBACK_DAYS * MILLISECONDS_PER_DAY;
    return parsed.filter((item) => item.date.getTime() < end);
  }, [metadata]);
  const selectedPlaybackIndex = playbackTimes.findIndex((item) => item.value === timeStep);
  const activePlaybackIndex = selectedPlaybackIndex >= 0 ? selectedPlaybackIndex : 0;
  const activePlaybackTime = playbackTimes[activePlaybackIndex];
  const dayMarkers = useMemo(() => {
    const seen = new Set();
    return playbackTimes.filter((item) => {
      const key = item.date.toISOString().slice(0, 10);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playbackTimes]);
  const activeVariableLabel = VARIABLE_SHORT_LABELS[variable] ?? labelForVariable(variable);
  const activeModelLabel = domain.includes('gfs') ? 'GFS' : 'ICON';

  const selectVariable = (nextVariable) => {
    hoverRequestRef.current += 1;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    tooltipRef.current?.remove();
    currentOmUrlRef.current = '';
    setVariable(nextVariable);
    if (nextVariable.startsWith('wind_')) {
      setOverlays((current) => ({ ...current, arrows: true }));
    }
  };

  useEffect(() => {
    readingMetaRef.current = {
      label: labelForVariable(variable),
      unit: colorScale.unit
    };
  }, [variable, colorScale]);

  useEffect(() => {
    if (playbackTimes.length === 0) {
      setIsPlaying(false);
      return;
    }

    if (timeStep === 'current_time_1H' || !playbackTimes.some((item) => item.value === timeStep)) {
      setTimeStep(playbackTimes[0].value);
    }
  }, [playbackTimes, timeStep]);

  useEffect(() => {
    if (!isPlaying || playbackTimes.length < 2) return undefined;

    const interval = window.setInterval(() => {
      setTimeStep((current) => {
        const currentIndex = playbackTimes.findIndex((item) => item.value === current);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % playbackTimes.length : 0;
        return playbackTimes[nextIndex].value;
      });
    }, 900);

    return () => window.clearInterval(interval);
  }, [isPlaying, playbackTimes]);

  const stepPlayback = (direction) => {
    if (playbackTimes.length === 0) return;
    const nextIndex =
      (activePlaybackIndex + direction + playbackTimes.length) % playbackTimes.length;
    setTimeStep(playbackTimes[nextIndex].value);
  };

  const handleTimelineScrub = (event) => {
    if (playbackTimes.length === 0) return;
    setTimeStep(playbackTimes[Number(event.target.value)].value);
  };

  const zoomBy = (delta) => {
    const map = mapRef.current;
    if (!map) return;
    if (delta > 0) map.zoomIn();
    else map.zoomOut();
  };

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return undefined;

    const protocol = addLeafletProtocolSupport(L);
    protocol.addProtocol('om', omProtocol, protocolSettingsRef.current);

    const map = L.map(mapElRef.current, {
      zoomControl: false,
      attributionControl: false,
      maxZoom: 12
    }).setView(DEFAULT_CENTER, 12);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control
      .attribution({ position: 'bottomleft', prefix: false })
      .addAttribution('&copy; OpenStreetMap contributors')
      .addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 12,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    mapRef.current = map;
    protocolRef.current = protocol;
    tooltipRef.current = L.tooltip({
      className: 'reading-tooltip',
      direction: 'top',
      offset: [0, -14],
      opacity: 0.96
    });

    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      map.remove();
      protocol.removeProtocol('om');
      mapRef.current = null;
      protocolRef.current = null;
      tooltipRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const closeTooltip = () => {
      hoverRequestRef.current += 1;
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      tooltipRef.current?.remove();
    };

    const handleMouseMove = (event) => {
      const omUrl = currentOmUrlRef.current;
      if (!omUrl || !tooltipRef.current) return;

      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);

      const requestId = hoverRequestRef.current + 1;
      hoverRequestRef.current = requestId;
      const { lat, lng } = event.latlng;
      const ugandaGeoJson = ugandaGeoJsonRef.current;
      const isInsideUganda = Boolean(ugandaGeoJson) && pointInGeoJson(lat, lng, ugandaGeoJson);

      if (clipUganda && !isInsideUganda) {
        tooltipRef.current.remove();
        return;
      }

      tooltipRef.current
        .setLatLng(event.latlng)
        .setContent('<div class="reading-title">Loading reading</div>')
        .addTo(map);

      hoverTimerRef.current = window.setTimeout(async () => {
        try {
          const result = await getValueFromLatLong(lat, lng, omUrl);
          if (hoverRequestRef.current !== requestId || !tooltipRef.current) return;

          const { label, unit } = readingMetaRef.current;
          tooltipRef.current
            .setLatLng(event.latlng)
            .setContent(
              `<div class="reading-title">${label}</div>
               <div class="reading-value">${formatReading(result.value, unit)}</div>
               <div class="reading-coords">${lat.toFixed(3)}, ${lng.toFixed(3)}</div>`
            )
            .addTo(map);
        } catch {
          if (hoverRequestRef.current !== requestId || !tooltipRef.current) return;
          tooltipRef.current
            .setLatLng(event.latlng)
            .setContent(
              `<div class="reading-title">${readingMetaRef.current.label}</div>
               <div class="reading-value">Loading data</div>
               <div class="reading-coords">${lat.toFixed(3)}, ${lng.toFixed(3)}</div>`
            )
            .addTo(map);
        }
      }, 120);
    };

    map.on('mousemove', handleMouseMove);
    map.on('mouseout', closeTooltip);
    map.on('dragstart', closeTooltip);
    map.on('zoomstart', closeTooltip);

    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', closeTooltip);
      map.off('dragstart', closeTooltip);
      map.off('zoomstart', closeTooltip);
      closeTooltip();
    };
  }, [clipUganda, clipRevision]);

  useEffect(() => {
    let cancelled = false;

    const loadMetadata = async () => {
      setError('');

      try {
        const response = await fetch(
          `https://map-tiles.open-meteo.com/data_spatial/${domain}/latest.json`
        );
        if (!response.ok) throw new Error(`Metadata request failed (${response.status})`);
        const nextMetadata = await response.json();
        if (cancelled) return;

        setMetadata(nextMetadata);
      } catch (nextError) {
        if (!cancelled) setError(nextError.message);
      }
    };

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [domain]);

  useEffect(() => {
    if (!metadata?.variables?.length || metadata.variables.includes(variable)) return;

    const fallback = selectedVariableOptions().find((option) =>
      metadata.variables?.includes(option.value)
    );
    if (fallback) selectVariable(fallback.value);
  }, [metadata, variable]);

  useEffect(() => {
    let cancelled = false;

    const loadClip = async () => {
      const map = mapRef.current;
      if (!map) return;

      if (!clipUganda) {
        protocolSettingsRef.current.clippingOptions = undefined;
        ugandaLayerRef.current?.remove();
        ugandaLayerRef.current = null;
        ugandaGeoJsonRef.current = null;
        ugandaBoundsRef.current = null;
        map.setMaxBounds(null);
        setClipStatus('Uganda clip off');
        setClipRevision((current) => current + 1);
        return;
      }

      try {
        setClipStatus('Loading Uganda clip');
        const response = await fetch(UGANDA_GEOJSON_URL);
        if (!response.ok) throw new Error(`Uganda GeoJSON failed (${response.status})`);
        const geojson = await response.json();
        if (cancelled) return;

        protocolSettingsRef.current.clippingOptions = {
          geojson,
          bounds: UGANDA_OM_BOUNDS,
          fillRule: 'evenodd'
        };
        ugandaGeoJsonRef.current = geojson;

        ugandaLayerRef.current?.remove();
        ugandaLayerRef.current = L.geoJSON(geojson, {
          interactive: false,
          style: {
            color: '#113f67',
            weight: 2,
            opacity: 0.95,
            fillColor: '#f8fafc',
            fillOpacity: 0.02
          }
        }).addTo(map);

        const bounds = getBoundsFromGeoJson(geojson);
        ugandaBoundsRef.current = bounds;
        if (bounds) {
          map.setMaxBounds(bounds.pad(0.45));
          map.fitBounds(bounds.pad(0.12));
        }
        setClipStatus('Clipped to Uganda');
        setClipRevision((current) => current + 1);
      } catch (nextError) {
        if (!cancelled) {
          protocolSettingsRef.current.clippingOptions = undefined;
          ugandaGeoJsonRef.current = null;
          ugandaBoundsRef.current = null;
          map.setMaxBounds(null);
          setClipStatus('Uganda clip unavailable');
          setError(nextError.message);
          setClipRevision((current) => current + 1);
        }
      }
    };

    loadClip();

    return () => {
      cancelled = true;
    };
  }, [clipUganda]);

  useEffect(() => {
    const map = mapRef.current;
    const protocol = protocolRef.current;
    if (!map || !protocol) return;

    if (clipUganda && !ugandaGeoJsonRef.current) {
      rasterLayerRef.current?.remove();
      vectorLayerRef.current?.remove();
      rasterLayerRef.current = null;
      vectorLayerRef.current = null;
      currentOmUrlRef.current = '';
      return;
    }

    currentOmUrlRef.current = '';
    hoverRequestRef.current += 1;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    tooltipRef.current?.remove();

    const clipHash = clipUganda ? `uganda-${clipRevision}` : '';
    const omUrl = buildOmUrl({
      domain,
      variable,
      timeStep,
      overlays,
      tileSize,
      darkMode,
      clipHash,
      metadata
    });
    const vectorOmUrl =
      variable === 'precipitation'
        ? buildOmUrl({
            domain,
            variable,
            timeStep,
            overlays: { ...overlays, grid: true },
            tileSize,
            darkMode,
            clipHash,
            metadata
          })
        : omUrl;
    const layerBounds = clipUganda && ugandaBoundsRef.current ? ugandaBoundsRef.current : undefined;

    rasterLayerRef.current?.remove();
    vectorLayerRef.current?.remove();

    rasterLayerRef.current = protocol
      .createTileLayer(`om://${omUrl}`, {
        opacity: opacity / 100,
        maxZoom: 12,
        bounds: layerBounds
      })
      .addTo(map);

    if (overlays.contours || overlays.grid || overlays.arrows || variable === 'precipitation') {
      vectorLayerRef.current = protocol
        .createVectorTileLayer(`om://${vectorOmUrl}`, {
          opacity: variable === 'precipitation' && !overlays.grid ? 0 : 1,
          maxZoom: 12,
          bounds: layerBounds,
          style: vectorStyle
        })
        .addTo(map);
    } else {
      vectorLayerRef.current = null;
    }

    const readyTimer = window.setTimeout(() => {
      currentOmUrlRef.current = `om://${omUrl}`;
    }, 0);

    return () => {
      window.clearTimeout(readyTimer);
    };
  }, [domain, variable, timeStep, overlays, tileSize, darkMode, clipUganda, clipRevision, metadata]);

  useEffect(() => {
    rasterLayerRef.current?.setOpacity(opacity / 100);
  }, [opacity]);

  useEffect(() => {
    const canvas = windCanvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const particles = [];
    const isRainMode = variable === 'precipitation';
    const isWindMode = variable === 'wind_u_component_10m';
    const activeAnimation = isWindMode || isRainMode;
    const particleCount = isRainMode ? 760 : 520;
    const ugandaGeoJson = ugandaGeoJsonRef.current;
    const rainCells = [];
    let rainMaskReady = !isRainMode;
    let rainMaskLoading = false;
    let cancelled = false;

    const resizeCanvas = () => {
      const { clientWidth, clientHeight } = canvas;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const randomPosition = () => {
      if (isRainMode) {
        if (rainCells.length === 0) return null;
        const totalWeight = rainCells.reduce((sum, cell) => sum + cell.weight, 0);
        let pick = Math.random() * totalWeight;
        const cell =
          rainCells.find((candidate) => {
            pick -= candidate.weight;
            return pick <= 0;
          }) ?? rainCells[rainCells.length - 1];
        return {
          lat: cell.lat + (Math.random() - 0.5) * cell.latSize,
          lng: cell.lng + (Math.random() - 0.5) * cell.lngSize,
          cell
        };
      }

      for (let attempt = 0; attempt < 80; attempt += 1) {
        const lat = UGANDA_BOUNDS.south + Math.random() * (UGANDA_BOUNDS.north - UGANDA_BOUNDS.south);
        const lng = UGANDA_BOUNDS.west + Math.random() * (UGANDA_BOUNDS.east - UGANDA_BOUNDS.west);
        if (pointInGeoJson(lat, lng, ugandaGeoJson)) return { lat, lng };
      }
      return { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
    };

    const randomParticle = () => {
      const position = randomPosition();
      if (!position) return null;

      return {
        ...position,
        cell: position.cell ?? null,
        age: Math.random() * 80,
        life: 70 + Math.random() * 90,
        speed: isRainMode ? 0.018 + Math.random() * 0.034 : 0.006 + Math.random() * 0.014,
        length: isRainMode ? 6 + Math.random() * 13 : 0,
        drift: isRainMode ? -0.16 + Math.random() * 0.22 : 0,
        alpha: isRainMode ? 0.2 + Math.random() * 0.5 : 1
      };
    };

    const resetParticle = (particle) => {
      const next = randomParticle();
      if (!next) {
        particle.age = Number.POSITIVE_INFINITY;
        return;
      }
      particle.lat = next.lat;
      particle.lng = next.lng;
      particle.cell = next.cell ?? null;
      particle.age = 0;
      particle.life = next.life;
      particle.speed = next.speed;
      particle.length = next.length;
      particle.drift = next.drift;
      particle.alpha = next.alpha;
    };

    const vectorAt = (lat, lng, elapsed) => {
      const wave = Math.sin(lng * 1.8 + elapsed * 0.00028) * 0.42;
      const shear = Math.cos(lat * 2.6 - elapsed * 0.00022) * 0.34;
      const basinTurn = Math.sin((lat + lng) * 1.2) * 0.22;
      const angle = 0.86 + wave + shear + basinTurn;
      const strength = 0.75 + Math.sin(lat * 4.2 + lng * 0.7) * 0.25;

      return {
        dLat: Math.sin(angle) * strength,
        dLng: Math.cos(angle) * strength
      };
    };

    const clipToUganda = () => {
      if (!ugandaGeoJson) return false;
      context.beginPath();
      forEachGeoJsonRing(ugandaGeoJson, (ring) => {
        ring.forEach(([lng, lat], index) => {
          const point = map.latLngToContainerPoint([lat, lng]);
          if (index === 0) {
            context.moveTo(point.x, point.y);
          } else {
            context.lineTo(point.x, point.y);
          }
        });
        context.closePath();
      });
      context.clip('evenodd');
      return true;
    };

    const waitForActiveOmUrl = async () => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        if (cancelled) return '';
        if (currentOmUrlRef.current) return currentOmUrlRef.current;
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      }
      return '';
    };

    const isAnimationZoomReady = () => map.getZoom() >= ANIMATION_MIN_ZOOM;

    const waitForRasterTiles = async () => {
      for (let attempt = 0; attempt < 18; attempt += 1) {
        if (cancelled) return [];
        const container = rasterLayerRef.current?._container;
        const canvases = Array.from(container?.querySelectorAll('canvas') ?? []).filter(
          (tile) => tile.width > 0 && tile.height > 0
        );
        if (canvases.length > 0) return canvases;
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      return [];
    };

    const precipitationPatchScore = (lat, lng, canvases) => {
      const point = map.latLngToContainerPoint([lat, lng]);
      const mapRect = map.getContainer().getBoundingClientRect();
      const viewportX = mapRect.left + point.x;
      const viewportY = mapRect.top + point.y;

      for (const tile of canvases) {
        const rect = tile.getBoundingClientRect();
        if (
          viewportX < rect.left ||
          viewportX > rect.right ||
          viewportY < rect.top ||
          viewportY > rect.bottom
        ) {
          continue;
        }

        const localX = Math.floor(((viewportX - rect.left) / Math.max(rect.width, 1)) * tile.width);
        const localY = Math.floor(((viewportY - rect.top) / Math.max(rect.height, 1)) * tile.height);

        try {
          const tileContext = tile.getContext('2d');
          if (!tileContext) return 0;
          const [red, green, blue, alpha] = tileContext.getImageData(localX, localY, 1, 1).data;
          const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
          const isBluePatch = blue > 118 && blue > red + 36 && alpha > 70;
          const isTealPatch = green > 118 && blue > 118 && red < 100 && saturation > 36 && alpha > 70;
          if (!isBluePatch && !isTealPatch) return 0;
          return Math.min(8, 1 + saturation / 28 + alpha / 90);
        } catch {
          return 0;
        }
      }

      return 0;
    };

    const loadRainMask = async () => {
      if (!isRainMode || rainMaskLoading || !isAnimationZoomReady()) return;
      rainMaskLoading = true;
      const omUrl = await waitForActiveOmUrl();
      if (!omUrl || cancelled) {
        rainMaskLoading = false;
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 240));
      const precipCanvases = await waitForRasterTiles();

      const rows = 44;
      const columns = 38;
      const latSize = (UGANDA_BOUNDS.north - UGANDA_BOUNDS.south) / rows;
      const lngSize = (UGANDA_BOUNDS.east - UGANDA_BOUNDS.west) / columns;
      const candidates = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const lat = UGANDA_BOUNDS.south + (row + 0.5) * latSize;
          const lng = UGANDA_BOUNDS.west + (column + 0.5) * lngSize;
          if (pointInGeoJson(lat, lng, ugandaGeoJson)) {
            candidates.push({ lat, lng, latSize, lngSize });
          }
        }
      }

      const sampled = [];
      for (let index = 0; index < candidates.length; index += 8) {
        if (cancelled) {
          rainMaskLoading = false;
          return;
        }
        const batch = candidates.slice(index, index + 8);
        const values = await Promise.all(
          batch.map(async (cell) => {
            try {
              const result = await getValueFromLatLong(cell.lat, cell.lng, omUrl);
              return { ...cell, value: Number(result.value) || 0 };
            } catch {
              return { ...cell, value: 0 };
            }
          })
        );
        sampled.push(...values);
      }

      if (cancelled) {
        rainMaskLoading = false;
        return;
      }
      const rainy = sampled
        .filter((cell) => cell.value >= 0.05)
        .map((cell) => ({
          ...cell,
          weight: Math.min(8, 1 + Math.sqrt(cell.value) * 3)
        }))
        .sort((a, b) => b.value - a.value);
      const rainByKey = new Map(
        rainy.map((cell) => [`${cell.lat.toFixed(5)},${cell.lng.toFixed(5)}`, cell])
      );
      if (precipCanvases.length > 0) {
        for (const cell of candidates) {
          const visualWeight = precipitationPatchScore(cell.lat, cell.lng, precipCanvases);
          if (visualWeight <= 0) continue;
          const key = `${cell.lat.toFixed(5)},${cell.lng.toFixed(5)}`;
          const existing = rainByKey.get(key);
          rainByKey.set(key, {
            ...cell,
            value: Math.max(existing?.value ?? 0, visualWeight / 10),
            weight: Math.max(existing?.weight ?? 0, visualWeight)
          });
        }
      }
      rainCells.splice(
        0,
        rainCells.length,
        ...Array.from(rainByKey.values()).sort((a, b) => b.weight - a.weight)
      );
      rainMaskReady = true;
      particles.splice(0, particles.length);
      const targetParticles = rainCells.length === 0 ? 0 : Math.min(particleCount, Math.max(80, rainCells.length * 28));
      for (let index = 0; index < targetParticles; index += 1) {
        const particle = randomParticle();
        if (particle) particles.push(particle);
      }
      rainMaskLoading = false;
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };

    resizeCanvas();
    if (isRainMode && isAnimationZoomReady()) {
      loadRainMask();
    } else {
      for (let index = 0; index < particleCount; index += 1) {
        const particle = randomParticle();
        if (particle) particles.push(particle);
      }
    }

    const draw = (elapsed) => {
      if (!activeAnimation) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (!isAnimationZoomReady()) {
        context.clearRect(0, 0, width, height);
        windAnimationRef.current = window.requestAnimationFrame(draw);
        return;
      }

      if (isRainMode && (!rainMaskReady || rainCells.length === 0)) {
        loadRainMask();
        context.clearRect(0, 0, width, height);
        windAnimationRef.current = window.requestAnimationFrame(draw);
        return;
      }

      context.save();
      const hasBoundaryClip = clipToUganda();
      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = isRainMode ? 'rgba(0, 0, 0, 0.82)' : 'rgba(0, 0, 0, 0.9)';
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      context.lineCap = 'round';

      for (const particle of particles) {
        const start = map.latLngToContainerPoint([particle.lat, particle.lng]);
        if (isRainMode) {
          particle.lat -= particle.speed;
          particle.lng += particle.drift * particle.speed;
        } else {
          const vector = vectorAt(particle.lat, particle.lng, elapsed);
          particle.lat += vector.dLat * particle.speed;
          particle.lng += vector.dLng * particle.speed;
        }
        particle.age += 1;

        const end = map.latLngToContainerPoint([particle.lat, particle.lng]);
        const staysInRainCell =
          !isRainMode ||
          (particle.cell &&
            particle.lat >= particle.cell.lat - particle.cell.latSize / 2 &&
            particle.lat <= particle.cell.lat + particle.cell.latSize / 2 &&
            particle.lng >= particle.cell.lng - particle.cell.lngSize / 2 &&
            particle.lng <= particle.cell.lng + particle.cell.lngSize / 2);
        const visible =
          end.x >= -40 &&
          end.x <= width + 40 &&
          end.y >= -40 &&
          end.y <= height + 40 &&
          particle.lat >= UGANDA_BOUNDS.south &&
          particle.lat <= UGANDA_BOUNDS.north &&
          particle.lng >= UGANDA_BOUNDS.west &&
          particle.lng <= UGANDA_BOUNDS.east &&
          staysInRainCell &&
          pointInGeoJson(particle.lat, particle.lng, ugandaGeoJson);

        if (!visible || particle.age > particle.life) {
          resetParticle(particle);
          continue;
        }

        const fade = Math.max(0, 1 - particle.age / particle.life);
        if (isRainMode) {
          const cell = particle.cell;
          const northWest = map.latLngToContainerPoint([
            cell.lat + cell.latSize / 2,
            cell.lng - cell.lngSize / 2
          ]);
          const southEast = map.latLngToContainerPoint([
            cell.lat - cell.latSize / 2,
            cell.lng + cell.lngSize / 2
          ]);
          context.save();
          context.beginPath();
          context.rect(
            Math.min(northWest.x, southEast.x),
            Math.min(northWest.y, southEast.y),
            Math.abs(southEast.x - northWest.x),
            Math.abs(southEast.y - northWest.y)
          );
          context.clip();
          const rainAngle = -0.28 + Math.sin(elapsed * 0.0014 + particle.lng) * 0.08;
          const tailX = end.x - Math.sin(rainAngle) * particle.length;
          const tailY = end.y - Math.cos(rainAngle) * particle.length;
          context.lineWidth = 0.75 + particle.alpha * 0.8;
          context.strokeStyle = `rgba(190, 229, 255, ${(0.1 + fade * 0.34) * particle.alpha})`;
          context.beginPath();
          context.moveTo(tailX, tailY);
          context.lineTo(end.x, end.y);
          context.stroke();
          context.restore();
          continue;
        }

        context.lineWidth = 1.15;
        context.strokeStyle = `rgba(235, 248, 255, ${0.16 + fade * 0.42})`;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }

      context.restore();
      if (!hasBoundaryClip && clipUganda) {
        context.clearRect(0, 0, width, height);
      }
      windAnimationRef.current = window.requestAnimationFrame(draw);
    };

    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    const handleMapChange = () => {
      resizeCanvas();
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      particles.forEach(resetParticle);
      if (isRainMode && !rainMaskReady && isAnimationZoomReady()) {
        loadRainMask();
      }
    };

    map.on('moveend', handleMapChange);
    map.on('zoomend', handleMapChange);
    map.on('resize', handleMapChange);

    if (activeAnimation) {
      windAnimationRef.current = window.requestAnimationFrame(draw);
    }

    return () => {
      map.off('moveend', handleMapChange);
      map.off('zoomend', handleMapChange);
      map.off('resize', handleMapChange);
      cancelled = true;
      if (windAnimationRef.current) {
        window.cancelAnimationFrame(windAnimationRef.current);
        windAnimationRef.current = null;
      }
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };
  }, [variable, domain, timeStep, clipRevision, clipUganda]);

  const formattedReferenceTime = metadata?.reference_time
    ? `${formatUtcDate(new Date(metadata.reference_time))} ${formatUtcTime(
        new Date(metadata.reference_time)
      )}Z`
    : 'Loading latest model';
  const playbackStatus = activePlaybackTime
    ? `${formatTimelineLabel(activePlaybackTime.date)} ${formatUtcTime(activePlaybackTime.date)}Z`
    : 'Loading timeline';
  const playbackMonth = activePlaybackTime ? formatMonthYear(activePlaybackTime.date) : 'Loading';
  const playbackHour = activePlaybackTime ? pad(activePlaybackTime.date.getUTCHours()) : '--';
  const scaleMin =
    colorScale.type === 'rgba' ? Math.round(colorScale.min) : Math.round(colorScale.breakpoints[0]);
  const scaleMax =
    colorScale.type === 'rgba'
      ? Math.round(colorScale.max)
      : Math.round(colorScale.breakpoints[colorScale.breakpoints.length - 1]);

  return (
    <main className="app-shell dark forecast-shell">
      <div ref={mapElRef} className="weather-map" />
      <canvas
        ref={windCanvasRef}
        className={[
          'wind-canvas',
          variable === 'wind_u_component_10m' || variable === 'precipitation' ? 'active' : '',
          variable === 'precipitation' ? 'rain' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      />

      <header className="forecast-topbar">
        <div className="brand-lockup">
          <span className="brand-icon">M</span>
          <strong>{activeVariableLabel} Forecast</strong>
        </div>

        <div className="range-toggle" aria-label="Playback range">
          <button
            type="button"
            className={rangeMode === 'hourly' ? 'active' : ''}
            onClick={() => setRangeMode('hourly')}
          >
            Hourly
          </button>
          <button
            type="button"
            className={rangeMode === '7day' ? 'active' : ''}
            onClick={() => setRangeMode('7day')}
          >
            7-Day
          </button>
        </div>

        <button
          type="button"
          className="top-model-chip"
          onClick={() => setDomain(domain.includes('gfs') ? 'dwd_icon' : 'ncep_gfs013')}
        >
          {activeModelLabel}
        </button>
      </header>

      <div className="layer-chip">
        {activeModelLabel} - {activeVariableLabel}
      </div>

      <nav className="tool-rail" aria-label="Weather layer shortcuts">
        {mapToolLabels.map((tool) => {
          const enabled = availableVariables.some((option) => option.value === tool.value);
          return (
            <button
              key={tool.value}
              type="button"
              className={variable === tool.value ? 'active' : ''}
              disabled={!enabled}
              onClick={() => selectVariable(tool.value)}
              title={VARIABLE_SHORT_LABELS[tool.value]}
            >
              {tool.label}
            </button>
          );
        })}
      </nav>

      <section className="layers-panel" aria-label="Layer controls">
        <button type="button" className="layers-button" onClick={() => setShowLayers((value) => !value)}>
          Layers
        </button>
        {showLayers && (
          <div className="layers-menu">
            <label>
              <input
                type="checkbox"
                checked={clipUganda}
                onChange={(event) => setClipUganda(event.target.checked)}
              />
              Uganda clip
            </label>
            <label>
              <input
                type="checkbox"
                checked={overlays.contours}
                onChange={(event) =>
                  setOverlays((current) => ({ ...current, contours: event.target.checked }))
                }
              />
              Contours
            </label>
            <label>
              <input
                type="checkbox"
                checked={overlays.grid}
                onChange={(event) =>
                  setOverlays((current) => ({ ...current, grid: event.target.checked }))
                }
              />
              Grid
            </label>
            <label>
              <input
                type="checkbox"
                checked={overlays.arrows}
                onChange={(event) =>
                  setOverlays((current) => ({ ...current, arrows: event.target.checked }))
                }
              />
              Wind arrows
            </label>
            <label>
              Opacity
              <input
                type="range"
                min="10"
                max="100"
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </label>
          </div>
        )}
      </section>

      <div className="zoom-panel" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out">
          -
        </button>
      </div>

      <aside className="temperature-legend" aria-label={`${activeVariableLabel} color scale`}>
        <div className="legend-unit">deg C</div>
        <div
          className="legend-ramp"
          style={{
            background: `linear-gradient(90deg, ${colorScaleToGradient(colorScale)})`
          }}
        />
        <div className="legend-ticks">
          <span>{scaleMin}</span>
          <span>20</span>
          <span>30</span>
          <span>35</span>
          <span>{scaleMax}</span>
        </div>
      </aside>

      <div className="city-reading">
        <span className="reading-pin">T</span>
        <strong>Kampala</strong>
        <span>20C</span>
        <em>Mild</em>
      </div>

      <section className="compact-panel" aria-label="Weather map controls">
        <details>
          <summary>Details</summary>
          <div>
            <p className="eyebrow">Open-Meteo Maps</p>
            <h1>Uganda Weather Layers</h1>
          </div>
          <label>
            Domain
            <select value={domain} onChange={(event) => setDomain(event.target.value)}>
              {visibleDomains.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label ?? option.value}
                </option>
              ))}
            </select>
          </label>

          <label>
            Variable
            <select value={variable} onChange={(event) => selectVariable(event.target.value)}>
              {availableVariables.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <footer>
            <span>{selectedDomain.label ?? selectedDomain.value}</span>
            <span>{clipStatus}</span>
          </footer>
          <footer>
            <span>Source</span>
            <span>{metadata ? 'Resolved .om file' : 'Resolving latest.json'}</span>
          </footer>
          {error && <p className="error">{error}</p>}
        </details>
      </section>

      <section className="timeline-panel" aria-label="7 day weather playback">
        <div className="timeline-controls">
          <button type="button" onClick={() => stepPlayback(-1)} aria-label="Previous timestep">
            &lt;
          </button>
          <button
            type="button"
            className="play-button"
            onClick={() => setIsPlaying((current) => !current)}
            disabled={playbackTimes.length < 2}
            aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
          >
            {isPlaying ? '||' : '>'}
          </button>
          <button type="button" onClick={() => stepPlayback(1)} aria-label="Next timestep">
            &gt;
          </button>
        </div>

        <div className="timeline-body">
          <div className="timeline-current">
            <span>{formatUtcDate(activePlaybackTime?.date ?? new Date())}</span>
            <strong>{playbackMonth}</strong>
            <span>{playbackHour}</span>
            <em>h</em>
          </div>

          <input
            className="timeline-range"
            type="range"
            min="0"
            max={Math.max(playbackTimes.length - 1, 0)}
            value={activePlaybackIndex}
            onChange={handleTimelineScrub}
            disabled={playbackTimes.length === 0}
          />

          <div className="timeline-days" aria-hidden="true">
            {dayMarkers.map((item) => (
              <span key={item.value}>{formatTimelineLabel(item.date)}</span>
            ))}
          </div>
        </div>
      </section>

      <div className="map-model-switch" aria-label="Map model">
        {visibleDomains.map((option) => (
          <button
            type="button"
            key={option.value}
            className={domain === option.value ? 'active' : ''}
            onClick={() => setDomain(option.value)}
          >
            {option.value.includes('gfs') ? 'GFS' : 'ICON'}
          </button>
        ))}
        <button type="button" disabled>
          Satellite
        </button>
      </div>
    </main>
  );
}
