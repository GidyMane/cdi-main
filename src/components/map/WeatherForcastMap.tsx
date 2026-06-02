import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AnimatePresence, motion } from "framer-motion";
import { waterAreas } from "../../utils/waterAreas";
import { capitalize } from "../../utils/capitalize";
import type { FeatureCollection } from "geojson";
import { useAppStore } from "@/store/useAppStore";
import {
  X,
  Layers,
  Maximize2,
  Minimize2,
  Thermometer,
  CloudRain,
  Sun,
  Droplets,
  Wind,
  Plus,
  Minus,
} from "lucide-react";
import {
  getValueColor,
  isPointInPolygon,
  isValidGeoJSON,
  makeMarkerHtml,
  PARAM_LEGENDS,
} from "@/utils/woker_fn";
import { geoData } from "@/utils/geodata";
// @ts-ignore — the Open-Meteo weather map layer ships no type declarations
import {
  addLeafletProtocolSupport,
  defaultOmProtocolSettings,
  getValueFromLatLong,
  omProtocol,
} from "@openmeteo/weather-map-layer";
import type { district, UgandaBoundaryMapProps } from "@/types/data_types";

const FAO_BLUE = "#318DDE";

// ── Open-Meteo configuration ──────────────────────────────────────────────────
const UGANDA_GEOJSON_URL =
  "https://map-assets.open-meteo.com/world-geojson/countries/uganda.json";
const OM_TILES_BASE = "https://map-tiles.open-meteo.com/data_spatial";

const DOMAIN_NOWCAST = "dwd_icon"; // ICON
const DOMAIN_FORECAST = "ncep_gfs013"; // GFS

/** Map the app's `selectedParameter` to an Open-Meteo variable name */
const VARIABLE_MAP: Record<string, string> = {
  temperature: "temperature_2m",
  rainfall: "precipitation",
  precipitation: "precipitation",
  humidity: "relative_humidity_2m",
  wind: "wind_u_component_10m",
};

const UGANDA_BOUNDS = { south: -1.55, west: 29.45, north: 4.35, east: 35.15 };
const UGANDA_OM_BOUNDS = [
  UGANDA_BOUNDS.west,
  UGANDA_BOUNDS.south,
  UGANDA_BOUNDS.east,
  UGANDA_BOUNDS.north,
];
const DEFAULT_CENTER: [number, number] = [1.37, 32.29];
const ANIMATION_MIN_ZOOM = 8;

// ── GeoJSON point-in-polygon helpers (for the rain/wind animation mask) ───────
function forEachGeoJsonRing(
  geojson: any,
  callback: (ring: number[][]) => void,
) {
  const visitGeometry = (geometry: any) => {
    if (!geometry) return;
    if (geometry.type === "Polygon") {
      geometry.coordinates.forEach(callback);
    } else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon: any) => polygon.forEach(callback));
    } else if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(visitGeometry);
    }
  };

  if (geojson.type === "FeatureCollection") {
    geojson.features.forEach((feature: any) => visitGeometry(feature.geometry));
  } else if (geojson.type === "Feature") {
    visitGeometry(geojson.geometry);
  } else {
    visitGeometry(geojson);
  }
}

function pointInRing(lat: number, lng: number, ring: number[][]) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const intersects =
      y1 > lat !== y2 > lat &&
      lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeoJson(lat: number, lng: number, geojson: any) {
  if (!geojson) return true;
  let inside = false;
  forEachGeoJsonRing(geojson, (ring) => {
    if (pointInRing(lat, lng, ring)) inside = !inside;
  });
  return inside;
}

const pad = (value: number) => String(value).padStart(2, "0");

const formatOmModelRun = (date: Date) =>
  `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(
    date.getUTCDate(),
  )}/${pad(date.getUTCHours())}00Z`;

const formatOmValidTime = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}T${pad(date.getUTCHours())}00.om`;

const resolveValidTime = (metadata: any, timeStep: string): Date | null => {
  if (!metadata?.valid_times?.length) return null;
  const indexMatch = timeStep?.match(/^valid_times_(\d+)$/);
  const index = indexMatch ? Number(indexMatch[1]) : 0;
  return new Date(
    metadata.valid_times[
      Math.min(Math.max(index, 0), metadata.valid_times.length - 1)
    ],
  );
};

/** Build a data_spatial .om tile URL (ported from the standalone weather map) */
function buildOmUrl({
  domain,
  variable,
  timeStep,
  overlays,
  tileSize,
  darkMode,
  clipHash,
  metadata,
}: {
  domain: string;
  variable: string;
  timeStep: string;
  overlays: { grid: boolean; arrows: boolean; contours: boolean };
  tileSize: string;
  darkMode: boolean;
  clipHash: string;
  metadata: any;
}) {
  const modelRun = metadata?.reference_time
    ? new Date(metadata.reference_time)
    : null;
  const validTime = resolveValidTime(metadata, timeStep);
  const filePath =
    modelRun &&
    validTime &&
    Number.isFinite(modelRun.getTime()) &&
    Number.isFinite(validTime.getTime())
      ? `${formatOmModelRun(modelRun)}/${formatOmValidTime(validTime)}`
      : "latest.json";

  const url = new URL(`${OM_TILES_BASE}/${domain}/${filePath}`);
  url.searchParams.set("variable", variable);
  url.searchParams.set("tile_size", tileSize);
  if (filePath === "latest.json") url.searchParams.set("time_step", timeStep);
  if (darkMode) url.searchParams.set("dark", "true");
  if (overlays.grid) url.searchParams.set("grid", "true");
  if (overlays.arrows) url.searchParams.set("arrows", "true");
  if (overlays.contours) url.searchParams.set("contours", "true");
  if (clipHash) url.searchParams.set("clipping_options_hash", clipHash);

  return url.href;
}

/** Convert a meteorological wind direction (degrees) into a compass label.
 *  Open-Meteo reports the direction the wind blows FROM. */
function degreesToCompass(deg: number): string {
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx];
}

/** Resolve a slider date + hour to the nearest Open-Meteo valid_times index */
function resolveTimeStep(metadata: any, dateRange: string, hour: number) {
  const validTimes: string[] = metadata?.valid_times ?? [];
  if (!validTimes.length) return "current_time_1H";

  const targetDate = dateRange || new Date().toISOString().slice(0, 10);
  const target = new Date(
    `${targetDate}T${pad(hour)}:00:00Z`,
  ).getTime();

  let bestIdx = 0;
  let bestDiff = Infinity;
  validTimes.forEach((vt, i) => {
    const diff = Math.abs(new Date(vt).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  });
  return `valid_times_${bestIdx}`;
}

function clearLayer<T extends L.Layer>(
  map: L.Map,
  ref: React.RefObject<T | null>,
) {
  if (ref.current) {
    map.removeLayer(ref.current);
    ref.current = null;
  }
}

function ParamIcon({
  param,
  className = "w-3.5 h-3.5",
  color,
}: {
  param: string;
  className?: string;
  color?: string;
}) {
  const p = { className, color };
  switch (param?.toLowerCase()) {
    case "temperature":
      return <Thermometer {...p} />;
    case "rainfall":
    case "precipitation":
      return <CloudRain {...p} />;
    case "drought":
      return <Sun {...p} />;
    case "humidity":
      return <Droplets {...p} />;
    case "wind":
      return <Wind {...p} />;
    default:
      return <Layers {...p} />;
  }
}

export default function WeatherForcastMap({
  className = "",
  isDarkMode,
  getTheBounds,
  zoom = 6.8,
  minZoom = 6.8,
  district_list,
}: UgandaBoundaryMapProps) {
  const {
    selectedParameter,
    dateRange,
    sliderhourIndexValue,
    setSelectedDistrictId,
    layerMode,
    setMapInteractionMetric,
  } = useAppStore((state) => state);

  // Derived Open-Meteo selection
  const domain = layerMode === "forecast" ? DOMAIN_FORECAST : DOMAIN_NOWCAST;
  const variable =
    VARIABLE_MAP[selectedParameter?.toLowerCase() ?? ""] ?? "temperature_2m";

  // Clean districts for click → store matching
  const unique: district[] = district_list
    ? Array.from(
        new Map((district_list as district[]).map((d) => [d.id, d])).values(),
      ).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // ── Refs ────────────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const mapWeatherforcastContainerRef = useRef<HTMLDivElement>(null);
  const windCanvasRef = useRef<HTMLCanvasElement>(null);
  const windAnimationRef = useRef<number | null>(null);
  const weatherforcastMapRef = useRef<L.Map | null>(null);
  const weatherforcastdistrictLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcastboundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcastriverLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcasttileLayerRef = useRef<L.TileLayer | null>(null);
  const rasterLayerRef = useRef<L.Layer | null>(null);
  const protocolRef = useRef<any>(null);
  const ugandaLayerRef = useRef<L.GeoJSON | null>(null);
  const ugandaGeoJsonRef = useRef<any>(null);
  const ugandaBoundsRef = useRef<L.LatLngBounds | null>(null);
  const weatherMarkersRef = useRef<L.Marker[]>([]);
  const currentOmUrlRef = useRef<string>("");
  const variableRef = useRef<string>("temperature_2m");
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverReqRef = useRef(0);
  const protocolSettingsRef = useRef<any>({
    ...defaultOmProtocolSettings,
    clippingOptions: undefined,
  });

  // Keep the latest variable available inside long-lived map event handlers
  variableRef.current = variable;

  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [isRasterLoading, setRasterIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredDistrictName, setHoveredDistrictName] = useState<string | null>(
    null,
  );
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [hoverDirection, setHoverDirection] = useState<number | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [currentOmUrl, setCurrentOmUrl] = useState<string>("");
  const [clipRevision, setClipRevision] = useState(0);

  // Open-Meteo overlay controls (drive the "Layers" panel)
  const [clipUganda, setClipUganda] = useState(true);
  const [opacity, setOpacity] = useState(85);
  const [overlays, setOverlays] = useState({
    contours: false,
    grid: false,
    arrows: false,
  });

  const paramKey = selectedParameter?.toLowerCase() ?? "temperature";
  const legendConfig = PARAM_LEGENDS[paramKey];
  const legendUnit = legendConfig?.unit ?? "";

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // Check whether a district label fits inside its polygon at current zoom
  const doesNameFitInLeafletBoundary = (
    layer: any,
    name: string,
    fontSize = 14,
    fontFamily = "sans-serif",
    padding = 5,
  ): boolean => {
    if (!weatherforcastMapRef.current) return false;
    const bounds = layer.getBounds();
    const topLeft = weatherforcastMapRef.current.latLngToLayerPoint(
      bounds.getNorthWest(),
    );
    const bottomRight = weatherforcastMapRef.current.latLngToLayerPoint(
      bounds.getSouthEast(),
    );
    const availableWidth = bottomRight.x - topLeft.x;
    const availableHeight = bottomRight.y - topLeft.y;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.font = `${fontSize}px ${fontFamily}`;
    const textWidth = ctx.measureText(name).width;
    const textHeight = fontSize;
    const paddedW = textWidth + padding * 2;
    const paddedH = textHeight + padding * 2;

    return paddedW <= availableWidth && paddedH <= availableHeight;
  };

  // ── Initialise map once geoData arrives ────────────────────────────────────
  useEffect(() => {
    if (!mapWeatherforcastContainerRef.current || !geoData) return;
    if (!isValidGeoJSON(geoData)) {
      console.error("WeatherForcastMap: invalid GeoJSON:", geoData);
      return;
    }

    if (weatherforcastMapRef.current) {
      weatherforcastMapRef.current.remove();
      weatherforcastMapRef.current = null;
    }

    // ── Register the Open-Meteo `om://` protocol ──────────────────────────
    const protocol = addLeafletProtocolSupport(L as any);
    protocol.addProtocol("om", omProtocol as any, protocolSettingsRef.current);
    protocolRef.current = protocol;

    // ── CartoDB base tile (same style as the rest of the app) ─────────────
    weatherforcasttileLayerRef.current = L.tileLayer(
      isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 12, attribution: "© CartoDB" },
    );

    weatherforcastMapRef.current = L.map(
      mapWeatherforcastContainerRef.current,
      {
        center: [1.3733, 32.2903],
        zoom,
        minZoom,
        maxZoom: 12,
        layers: [weatherforcasttileLayerRef.current],
        zoomControl: false,
        attributionControl: false,
      },
    );

    // ── District boundary polygons — gray thin borders ────────────────────
    weatherforcastdistrictLayerRef.current = L.geoJSON(geoData, {
      style: { color: "gray", weight: 0.3, fill: false },
    }).addTo(weatherforcastMapRef.current);

    // ── District name labels ──────────────────────────────────────────────
    const updateLabelVisibility = () => {
      if (
        !weatherforcastMapRef.current ||
        !weatherforcastdistrictLayerRef.current
      )
        return;

      weatherforcastdistrictLayerRef.current.eachLayer((layer: any) => {
        layer.closeTooltip();
        const name = layer.feature?.properties?.name;
        if (!name) return;
        if (doesNameFitInLeafletBoundary(layer, name)) {
          layer
            .bindTooltip(name, {
              permanent: true,
              direction: "center",
              className: "district-label",
            })
            .openTooltip();
          layer.bringToFront();
        }
      });
    };

    weatherforcastMapRef.current.on("zoomend", updateLabelVisibility);
    updateLabelVisibility();

    // ── Click → highlight clicked district (ray-casting) ──────────────────
    weatherforcastMapRef.current.on("click", (ev: L.LeafletMouseEvent) => {
      const paramMap: Record<string, "temp" | "rain" | "wind"> = {
        temperature: "temp",
        rainfall: "rain",
        precipitation: "rain",
        wind: "wind",
      };
      const param = selectedParameter?.toLowerCase() || "temperature";
      setMapInteractionMetric(paramMap[param] || "temp");

      let clickedFeature: any = null;
      weatherforcastdistrictLayerRef.current?.eachLayer((layer: any) => {
        if (clickedFeature) return;
        if (isPointInPolygon(ev.latlng, layer.getLatLngs())) {
          clickedFeature = layer.feature;
        }
      });
      if (!clickedFeature) return;

      if (setSelectedDistrictId) {
        const clickedName: string =
          clickedFeature.properties.name?.trim().toLowerCase() ?? "";
        const filtered = unique.find(
          (item) => item?.name?.trim().toLowerCase() === clickedName,
        );
        setSelectedDistrictId(filtered);
      }

      clearLayer(weatherforcastMapRef.current!, weatherforcastboundaryLayerRef);
      weatherforcastboundaryLayerRef.current = L.geoJSON(clickedFeature, {
        style: { color: "#308DE0", weight: 4, fill: false },
      })
        .addTo(weatherforcastMapRef.current!)
        .bringToFront();
    });

    // ── Water / lake overlay ──────────────────────────────────────────────
    clearLayer(weatherforcastMapRef.current, weatherforcastriverLayerRef);
    if (waterAreas) {
      weatherforcastriverLayerRef.current = L.geoJSON(waterAreas as any, {
        style: {
          color: "#d2efff",
          weight: 0.1,
          fillColor: "#d2efff",
          fillOpacity: 0.3,
        },
        onEachFeature(feature, layer: any) {
          const waterName = feature.properties?.NAME;
          if (waterName) {
            layer.bindTooltip(waterName, {
              permanent: true,
              direction: "center",
              className: "waterAreas-label",
            });
          }
        },
      }).addTo(weatherforcastMapRef.current);
      weatherforcastriverLayerRef.current.bringToBack();
    }

    // ── Hover: district detection + value sampling ────────────────────────
    weatherforcastMapRef.current.on(
      "mousemove",
      (ev: L.LeafletMouseEvent) => {
        setMousePos({ x: ev.containerPoint.x, y: ev.containerPoint.y });
        let found: string | null = null;
        weatherforcastdistrictLayerRef.current?.eachLayer((layer: any) => {
          if (found) return;
          if (isPointInPolygon(ev.latlng, layer.getLatLngs()))
            found = layer.feature?.properties?.name ?? null;
        });
        setHoveredDistrictName(found);

        const omUrl = currentOmUrlRef.current;
        if (!found || !omUrl) {
          setHoverValue(null);
          setHoverDirection(null);
          setHoverLoading(false);
          return;
        }

        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        const requestId = hoverReqRef.current + 1;
        hoverReqRef.current = requestId;
        setHoverLoading(true);
        const { lat, lng } = ev.latlng;
        hoverTimerRef.current = setTimeout(async () => {
          try {
            const result = await getValueFromLatLong(lat, lng, omUrl);
            if (hoverReqRef.current !== requestId) return;
            setHoverValue(
              Number.isFinite(result?.value) ? Number(result.value) : null,
            );
            const isWind = variableRef.current.startsWith("wind_");
            setHoverDirection(
              isWind && Number.isFinite(result?.direction)
                ? Number(result.direction)
                : null,
            );
            setHoverLoading(false);
          } catch {
            if (hoverReqRef.current !== requestId) return;
            setHoverValue(null);
            setHoverDirection(null);
            setHoverLoading(false);
          }
        }, 120);
      },
    );
    weatherforcastMapRef.current.on("mouseout", () => {
      setHoveredDistrictName(null);
      setHoverValue(null);
      setHoverDirection(null);
      setHoverLoading(false);
    });

    const ro = new ResizeObserver(() => {
      weatherforcastMapRef.current?.invalidateSize();
    });
    ro.observe(mapWeatherforcastContainerRef.current);

    setMapReady(true);

    return () => {
      ro.disconnect();
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      try {
        protocol.removeProtocol("om");
      } catch {}
      protocolRef.current = null;
      weatherforcastMapRef.current?.remove();
      weatherforcastMapRef.current = null;
      setMapReady(false);
    };
  }, [geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap CartoDB tile on dark/light toggle ───────────────────────────────────
  useEffect(() => {
    if (!weatherforcastMapRef.current || !weatherforcasttileLayerRef.current)
      return;
    weatherforcastMapRef.current.removeLayer(
      weatherforcasttileLayerRef.current,
    );
    weatherforcasttileLayerRef.current = L.tileLayer(
      isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 12, attribution: "© CartoDB" },
    ).addTo(weatherforcastMapRef.current);
    weatherforcasttileLayerRef.current.bringToBack();
  }, [isDarkMode]);

  // ── Focus / highlight a district when getTheBounds changes ───────────────────
  useEffect(() => {
    if (!weatherforcastMapRef.current || !geoData || !isValidGeoJSON(geoData))
      return;

    if (
      !getTheBounds ||
      getTheBounds.trim() === "" ||
      getTheBounds.trim().toLowerCase() === "all"
    ) {
      clearLayer(weatherforcastMapRef.current, weatherforcastboundaryLayerRef);
      weatherforcastMapRef.current.setView([1.3733, 32.2903], zoom);
      return;
    }

    const matched = (geoData as any).features.filter(
      (f: any) =>
        f?.properties?.name === capitalize(getTheBounds.toLowerCase()),
    );
    if (!matched.length) return;

    clearLayer(weatherforcastMapRef.current, weatherforcastboundaryLayerRef);
    weatherforcastboundaryLayerRef.current = L.geoJSON(
      { ...(geoData as any), features: matched } as FeatureCollection,
      { style: { color: FAO_BLUE, weight: 2, fill: false } },
    )
      .addTo(weatherforcastMapRef.current)
      .bringToFront();

    const bounds = weatherforcastboundaryLayerRef.current.getBounds();
    if (bounds.isValid()) {
      weatherforcastMapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [getTheBounds, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch Open-Meteo metadata when the model (domain) changes ────────────────
  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;
    setRasterIsLoading(true);
    fetch(`${OM_TILES_BASE}/${domain}/latest.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (!cancelled) setMetadata(data);
      })
      .catch(() => {
        if (!cancelled) setMetadata(null);
      });
    return () => {
      cancelled = true;
    };
  }, [domain, mapReady]);

  // ── Load / remove the Uganda clip outline ────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = weatherforcastMapRef.current;
    if (!map) return;
    let cancelled = false;

    if (!clipUganda) {
      protocolSettingsRef.current.clippingOptions = undefined;
      clearLayer(map, ugandaLayerRef);
      ugandaGeoJsonRef.current = null;
      ugandaBoundsRef.current = null;
      setClipRevision((c) => c + 1);
      return;
    }

    fetch(UGANDA_GEOJSON_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((geojson) => {
        if (cancelled) return;
        protocolSettingsRef.current.clippingOptions = {
          geojson,
          bounds: UGANDA_OM_BOUNDS,
          fillRule: "evenodd",
        };
        ugandaGeoJsonRef.current = geojson;
        clearLayer(map, ugandaLayerRef);
        ugandaLayerRef.current = L.geoJSON(geojson, {
          interactive: false,
          style: {
            color: FAO_BLUE,
            weight: 1.5,
            opacity: 0.9,
            fillOpacity: 0,
          },
        }).addTo(map);
        const bounds = ugandaLayerRef.current.getBounds();
        if (bounds.isValid()) ugandaBoundsRef.current = bounds;
        setClipRevision((c) => c + 1);
      })
      .catch(() => {
        if (!cancelled) setClipRevision((c) => c + 1);
      });

    return () => {
      cancelled = true;
    };
  }, [clipUganda, mapReady]);

  // ── Build & swap the Open-Meteo raster layer ─────────────────────────────────
  useEffect(() => {
    const map = weatherforcastMapRef.current;
    const protocol = protocolRef.current;
    if (!mapReady || !map || !protocol) return;

    const hour =
      sliderhourIndexValue === "000" || sliderhourIndexValue == null
        ? new Date().getHours()
        : parseInt(String(sliderhourIndexValue), 10) || 0;
    const timeStep = resolveTimeStep(metadata, dateRange, hour);

    const clipHash = clipUganda ? `uganda-${clipRevision}` : "";
    const omUrl = buildOmUrl({
      domain,
      variable,
      timeStep,
      overlays,
      tileSize: "512",
      darkMode: !!isDarkMode,
      clipHash,
      metadata,
    });

    const layerBounds =
      clipUganda && ugandaBoundsRef.current
        ? ugandaBoundsRef.current
        : undefined;

    setRasterIsLoading(true);
    if (rasterLayerRef.current) {
      map.removeLayer(rasterLayerRef.current);
      rasterLayerRef.current = null;
    }

    const layer = protocol
      .createTileLayer(`om://${omUrl}`, {
        opacity: opacity / 100,
        maxZoom: 12,
        bounds: layerBounds,
      })
      .addTo(map);
    layer.on?.("load", () => setRasterIsLoading(false));
    layer.on?.("tileerror", () => setRasterIsLoading(false));
    rasterLayerRef.current = layer;
    currentOmUrlRef.current = `om://${omUrl}`;
    setCurrentOmUrl(`om://${omUrl}`);

    // Safety: clear the spinner even if the load event doesn't fire
    const fallback = window.setTimeout(() => setRasterIsLoading(false), 2500);

    return () => {
      window.clearTimeout(fallback);
    };
  }, [
    domain,
    variable,
    metadata,
    overlays,
    clipUganda,
    clipRevision,
    dateRange,
    sliderhourIndexValue,
    isDarkMode,
    mapReady,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live opacity update without rebuilding the layer ─────────────────────────
  useEffect(() => {
    (rasterLayerRef.current as any)?.setOpacity?.(opacity / 100);
  }, [opacity]);

  // ── Rainfall / wind particle animation (ported from the standalone map) ──────
  useEffect(() => {
    if (!mapReady) return undefined;
    const canvas = windCanvasRef.current;
    const map = weatherforcastMapRef.current;
    if (!canvas || !map) return undefined;

    const context = canvas.getContext("2d");
    if (!context) return undefined;

    const particles: any[] = [];
    const isRainMode = variable === "precipitation";
    const isWindMode = variable === "wind_u_component_10m";
    const activeAnimation = isWindMode || isRainMode;
    const particleCount = isRainMode ? 760 : 520;
    const ugandaGeoJson = ugandaGeoJsonRef.current;
    const rainCells: any[] = [];
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

    const randomPosition = (): any => {
      if (isRainMode) {
        if (rainCells.length === 0) return null;
        const totalWeight = rainCells.reduce(
          (sum, cell) => sum + cell.weight,
          0,
        );
        let pick = Math.random() * totalWeight;
        const cell =
          rainCells.find((candidate) => {
            pick -= candidate.weight;
            return pick <= 0;
          }) ?? rainCells[rainCells.length - 1];
        return {
          lat: cell.lat + (Math.random() - 0.5) * cell.latSize,
          lng: cell.lng + (Math.random() - 0.5) * cell.lngSize,
          cell,
        };
      }

      for (let attempt = 0; attempt < 80; attempt += 1) {
        const lat =
          UGANDA_BOUNDS.south +
          Math.random() * (UGANDA_BOUNDS.north - UGANDA_BOUNDS.south);
        const lng =
          UGANDA_BOUNDS.west +
          Math.random() * (UGANDA_BOUNDS.east - UGANDA_BOUNDS.west);
        if (pointInGeoJson(lat, lng, ugandaGeoJson)) return { lat, lng };
      }
      return { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
    };

    const randomParticle = (): any => {
      const position = randomPosition();
      if (!position) return null;
      return {
        ...position,
        cell: position.cell ?? null,
        age: Math.random() * 80,
        life: 70 + Math.random() * 90,
        speed: isRainMode
          ? 0.018 + Math.random() * 0.034
          : 0.006 + Math.random() * 0.014,
        length: isRainMode ? 6 + Math.random() * 13 : 0,
        drift: isRainMode ? -0.16 + Math.random() * 0.22 : 0,
        alpha: isRainMode ? 0.2 + Math.random() * 0.5 : 1,
      };
    };

    const resetParticle = (particle: any) => {
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

    const vectorAt = (lat: number, lng: number, elapsed: number) => {
      const wave = Math.sin(lng * 1.8 + elapsed * 0.00028) * 0.42;
      const shear = Math.cos(lat * 2.6 - elapsed * 0.00022) * 0.34;
      const basinTurn = Math.sin((lat + lng) * 1.2) * 0.22;
      const angle = 0.86 + wave + shear + basinTurn;
      const strength = 0.75 + Math.sin(lat * 4.2 + lng * 0.7) * 0.25;
      return {
        dLat: Math.sin(angle) * strength,
        dLng: Math.cos(angle) * strength,
      };
    };

    const clipToUganda = () => {
      if (!ugandaGeoJson) return false;
      context.beginPath();
      forEachGeoJsonRing(ugandaGeoJson, (ring) => {
        ring.forEach(([lng, lat]: number[], index: number) => {
          const point = map.latLngToContainerPoint([lat, lng]);
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
      });
      (context as any).clip("evenodd");
      return true;
    };

    const waitForActiveOmUrl = async () => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        if (cancelled) return "";
        if (currentOmUrlRef.current) return currentOmUrlRef.current;
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      }
      return "";
    };

    const isAnimationZoomReady = () => map.getZoom() >= ANIMATION_MIN_ZOOM;

    const loadRainMask = async () => {
      if (!isRainMode || rainMaskLoading || !isAnimationZoomReady()) return;
      rainMaskLoading = true;
      const omUrl = await waitForActiveOmUrl();
      if (!omUrl || cancelled) {
        rainMaskLoading = false;
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 240));

      const rows = 44;
      const columns = 38;
      const latSize = (UGANDA_BOUNDS.north - UGANDA_BOUNDS.south) / rows;
      const lngSize = (UGANDA_BOUNDS.east - UGANDA_BOUNDS.west) / columns;
      const candidates: any[] = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const lat = UGANDA_BOUNDS.south + (row + 0.5) * latSize;
          const lng = UGANDA_BOUNDS.west + (column + 0.5) * lngSize;
          if (pointInGeoJson(lat, lng, ugandaGeoJson)) {
            candidates.push({ lat, lng, latSize, lngSize });
          }
        }
      }

      const sampled: any[] = [];
      for (let index = 0; index < candidates.length; index += 8) {
        if (cancelled) {
          rainMaskLoading = false;
          return;
        }
        const batch = candidates.slice(index, index + 8);
        const values = await Promise.all(
          batch.map(async (cell) => {
            try {
              const result = await getValueFromLatLong(
                cell.lat,
                cell.lng,
                omUrl,
              );
              return { ...cell, value: Number(result.value) || 0 };
            } catch {
              return { ...cell, value: 0 };
            }
          }),
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
          weight: Math.min(8, 1 + Math.sqrt(cell.value) * 3),
        }))
        .sort((a, b) => b.value - a.value);

      rainCells.splice(0, rainCells.length, ...rainy);
      rainMaskReady = true;
      particles.splice(0, particles.length);
      const targetParticles =
        rainCells.length === 0
          ? 0
          : Math.min(particleCount, Math.max(80, rainCells.length * 28));
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
    } else if (!isRainMode) {
      for (let index = 0; index < particleCount; index += 1) {
        const particle = randomParticle();
        if (particle) particles.push(particle);
      }
    }

    const draw = (elapsed: number) => {
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
      context.globalCompositeOperation = "destination-in";
      context.fillStyle = isRainMode
        ? "rgba(0, 0, 0, 0.82)"
        : "rgba(0, 0, 0, 0.9)";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";

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
            cell.lng - cell.lngSize / 2,
          ]);
          const southEast = map.latLngToContainerPoint([
            cell.lat - cell.latSize / 2,
            cell.lng + cell.lngSize / 2,
          ]);
          context.save();
          context.beginPath();
          context.rect(
            Math.min(northWest.x, southEast.x),
            Math.min(northWest.y, southEast.y),
            Math.abs(southEast.x - northWest.x),
            Math.abs(southEast.y - northWest.y),
          );
          context.clip();
          const rainAngle =
            -0.28 + Math.sin(elapsed * 0.0014 + particle.lng) * 0.08;
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

    map.on("moveend", handleMapChange);
    map.on("zoomend", handleMapChange);
    map.on("resize", handleMapChange);

    if (activeAnimation) {
      windAnimationRef.current = window.requestAnimationFrame(draw);
    }

    return () => {
      cancelled = true;
      map.off("moveend", handleMapChange);
      map.off("zoomend", handleMapChange);
      map.off("resize", handleMapChange);
      if (windAnimationRef.current) {
        window.cancelAnimationFrame(windAnimationRef.current);
        windAnimationRef.current = null;
      }
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };
  }, [variable, domain, clipUganda, clipRevision, currentOmUrl, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Value marker for the focused district (sampled from Open-Meteo) ──────────
  useEffect(() => {
    const map = weatherforcastMapRef.current;
    if (!map || !geoData || !currentOmUrl) return;

    let cancelled = false;
    const config = PARAM_LEGENDS[paramKey];

    weatherMarkersRef.current.forEach((m) => m.remove());
    weatherMarkersRef.current = [];
    if (!config) return;

    const target =
      getTheBounds?.trim() && getTheBounds.trim().toLowerCase() !== "all"
        ? getTheBounds.trim()
        : "Kampala";

    const feature = (geoData as any).features.find((f: any) =>
      (f?.properties?.name ?? "")
        .toLowerCase()
        .includes(target.toLowerCase()),
    );
    if (!feature) return;

    const center = L.geoJSON(feature).getBounds().getCenter();

    (async () => {
      try {
        const result = await getValueFromLatLong(
          center.lat,
          center.lng,
          currentOmUrl,
        );
        if (cancelled || !Number.isFinite(result?.value)) return;
        const value = Number(result.value);
        const color = getValueColor(value, paramKey);
        const marker = L.marker(center, {
          icon: L.divIcon({
            className: "",
            html: makeMarkerHtml(
              feature.properties.name,
              Math.round(value),
              config.unit,
              color,
              paramKey,
            ),
            iconSize: [1, 1],
            iconAnchor: [0, 0],
          }),
          interactive: false,
          zIndexOffset: 200,
        }).addTo(map);
        weatherMarkersRef.current.push(marker);
      } catch {
        /* sampling failed — no marker */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentOmUrl, getTheBounds, paramKey, geoData]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`}>
      {/* Map container */}
      <div
        ref={mapWeatherforcastContainerRef}
        className="absolute inset-0 z-0"
        style={{
          background: isDarkMode ? "#07111f" : "#dceaf4",
        }}
      />

      {/* Rain / wind particle animation canvas */}
      <canvas
        ref={windCanvasRef}
        aria-hidden="true"
        className="absolute inset-0 z-[350] pointer-events-none w-full h-full"
        style={{
          opacity:
            variable === "wind_u_component_10m" || variable === "precipitation"
              ? 1
              : 0,
          transition: "opacity 0.4s ease",
          mixBlendMode: variable === "precipitation" ? "screen" : "normal",
        }}
      />

      {/* Loading overlay */}
      <AnimatePresence>
        {(!geoData || isRasterLoading) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`absolute inset-0 z-[500] flex items-center justify-center ${isDarkMode ? "bg-slate-900/70" : "bg-white/70"}`}
          >
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{
                  borderColor: `${FAO_BLUE}30`,
                  borderTopColor: FAO_BLUE,
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forecast status — model + parameter badge */}
      <div className="absolute top-2 left-2 z-[500]">
        <span
          className="rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-lg backdrop-blur-md"
          style={{
            background: isDarkMode
              ? "rgba(10,15,30,0.60)"
              : "rgba(255,255,255,0.78)",
            color: isDarkMode
              ? "rgba(255,255,255,0.85)"
              : "rgba(15,23,42,0.75)",
            border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)"}`,
          }}
        >
          {layerMode === "forecast" ? "GFS" : "ICON"} ·{" "}
          {selectedParameter ?? "Temperature"}
        </span>
      </div>

      {/* ── Model Switcher — bottom-right (ICON / GFS) ───────── */}
      <div
        className="absolute bottom-2 right-2 z-[500] flex items-center rounded-full overflow-hidden shadow-sm"
        style={{
          background: isDarkMode
            ? "rgba(10,15,30,0.35)"
            : "rgba(255,255,255,0.45)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`,
        }}
      >
        {(
          [
            { id: "icon", label: "ICON" },
            { id: "gfs", label: "GFS" },
          ] as const
        ).map((model) => {
          const isSelected =
            model.id === "gfs"
              ? layerMode === "forecast"
              : layerMode !== "forecast";
          return (
            <button
              key={model.id}
              onClick={() =>
                useAppStore
                  .getState()
                  .setLayerMode(model.id === "gfs" ? "forecast" : "nowcast")
              }
              className="px-3 py-1 text-[10px] font-bold tracking-wide transition-all whitespace-nowrap"
              style={{
                backgroundColor: isSelected ? FAO_BLUE : "transparent",
                color: isSelected
                  ? "#fff"
                  : isDarkMode
                    ? "rgba(255,255,255,0.70)"
                    : "rgba(15,23,42,0.65)",
              }}
            >
              {model.label}
            </button>
          );
        })}
      </div>

      {/* ── Parameter Quick-Select (vertical toolbar, left side) ───────────── */}
      <div
        className="absolute top-[52px] left-2 z-[500] flex flex-col gap-1 rounded-lg overflow-hidden shadow-lg"
        style={{
          background: isDarkMode
            ? "rgba(10,15,30,0.60)"
            : "rgba(255,255,255,0.78)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)"}`,
        }}
      >
        {(
          [
            { param: "temperature", icon: Thermometer, label: "Temp" },
            { param: "rainfall", icon: CloudRain, label: "Rain" },
            { param: "humidity", icon: Droplets, label: "Humid" },
            { param: "wind", icon: Wind, label: "Wind" },
          ] as const
        ).map(({ param, icon: Icon, label }) => {
          const isActive = selectedParameter?.toLowerCase() === param;
          return (
            <button
              key={param}
              onClick={() => useAppStore.getState().setSelectedParameter(param)}
              title={label}
              className="flex items-center justify-center w-[34px] h-[34px] transition-all"
              style={{
                backgroundColor: isActive ? FAO_BLUE : "transparent",
              }}
            >
              <Icon
                className="w-4 h-4"
                style={{
                  color: isActive
                    ? "#fff"
                    : isDarkMode
                      ? "rgba(255,255,255,0.55)"
                      : "rgba(15,23,42,0.50)",
                }}
              />
            </button>
          );
        })}
        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="flex items-center justify-center w-[34px] h-[34px] transition-all"
          style={{
            borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
          }}
        >
          {isFullscreen ? (
            <Minimize2
              className="w-4 h-4"
              style={{
                color: isDarkMode
                  ? "rgba(255,255,255,0.55)"
                  : "rgba(15,23,42,0.50)",
              }}
            />
          ) : (
            <Maximize2
              className="w-4 h-4"
              style={{
                color: isDarkMode
                  ? "rgba(255,255,255,0.55)"
                  : "rgba(15,23,42,0.50)",
              }}
            />
          )}
        </button>
      </div>

      {/* ── MAP LAYERS toggle (top-right) ──────────────────────────── */}
      <button
        onClick={() => setShowLayerPanel((v) => !v)}
        className="absolute top-2 right-2 z-[500] flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold shadow-md transition-all"
        style={{
          backgroundColor: showLayerPanel
            ? FAO_BLUE
            : isDarkMode
              ? "rgba(10,15,30,0.60)"
              : "rgba(255,255,255,0.78)",
          color: showLayerPanel
            ? "#ffffff"
            : isDarkMode
              ? "rgba(255,255,255,0.85)"
              : "rgba(15,23,42,0.75)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)"}`,
        }}
      >
        <Layers className="w-3.5 h-3.5" />
        Layers
      </button>

      {/* Zoom controls */}
      <div
        className="absolute top-[46px] right-2 z-[500] flex flex-col rounded-lg overflow-hidden shadow-lg"
        style={{
          background: isDarkMode
            ? "rgba(10,15,30,0.60)"
            : "rgba(255,255,255,0.78)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)"}`,
        }}
      >
        {[
          {
            icon: Plus,
            title: "Zoom in",
            action: () => weatherforcastMapRef.current?.zoomIn(),
          },
          {
            icon: Minus,
            title: "Zoom out",
            action: () => weatherforcastMapRef.current?.zoomOut(),
          },
        ].map(({ icon: Icon, title, action }, i) => (
          <button
            key={title}
            onClick={action}
            title={title}
            className="flex items-center justify-center w-[30px] h-[30px] transition-all"
            style={{
              borderTop:
                i > 0
                  ? `1px solid ${isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`
                  : undefined,
            }}
          >
            <Icon
              className="w-3.5 h-3.5"
              style={{
                color: isDarkMode
                  ? "rgba(255,255,255,0.70)"
                  : "rgba(15,23,42,0.55)",
              }}
            />
          </button>
        ))}
      </div>

      {/* Layer panel — Open-Meteo overlay controls */}
      <AnimatePresence>
        {showLayerPanel && (
          <>
            <div
              className="fixed inset-0 z-[600]"
              onClick={() => setShowLayerPanel(false)}
            />
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`absolute top-10 right-2 z-[700] w-64 overflow-y-auto rounded-xl shadow-xl flex flex-col ${
                isDarkMode
                  ? "bg-slate-800 border border-slate-700"
                  : "bg-white border border-slate-200"
              }`}
              style={{ maxHeight: "90%" }}
            >
              <div
                className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 border-b"
                style={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0" }}
              >
                <span
                  className={`text-xs font-bold tracking-wide ${
                    isDarkMode ? "text-white" : "text-slate-800"
                  }`}
                >
                  MAP LAYERS
                </span>
                <button
                  onClick={() => setShowLayerPanel(false)}
                  className={`p-0.5 rounded transition-colors ${
                    isDarkMode
                      ? "hover:bg-slate-700 text-slate-400"
                      : "hover:bg-slate-100 text-slate-500"
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 py-1">
                <p
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest"
                  style={{ color: FAO_BLUE }}
                >
                  OVERLAYS
                </p>
                {(
                  [
                    { id: "clip", label: "Uganda clip", checked: clipUganda },
                    {
                      id: "contours",
                      label: "Contours",
                      checked: overlays.contours,
                    },
                    { id: "grid", label: "Grid", checked: overlays.grid },
                    {
                      id: "arrows",
                      label: "Wind arrows",
                      checked: overlays.arrows,
                    },
                  ] as const
                ).map((row) => (
                  <div
                    key={row.id}
                    onClick={() => {
                      if (row.id === "clip") setClipUganda((v) => !v);
                      else
                        setOverlays((cur) => ({
                          ...cur,
                          [row.id]: !cur[row.id as keyof typeof cur],
                        }));
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors select-none ${
                      isDarkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all"
                      style={{
                        backgroundColor: row.checked ? FAO_BLUE : "transparent",
                        borderColor: row.checked
                          ? FAO_BLUE
                          : isDarkMode
                            ? "#475569"
                            : "#cbd5e1",
                      }}
                    >
                      {row.checked && (
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          viewBox="0 0 10 10"
                          fill="none"
                        >
                          <path
                            d="M1.5 5L4 7.5L8.5 2.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span
                      className={`text-xs ${
                        isDarkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {row.label}
                    </span>
                  </div>
                ))}

                <p
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest"
                  style={{ color: FAO_BLUE }}
                >
                  OPACITY
                </p>
                <div className="px-3 pb-3 pt-1">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: FAO_BLUE }}
                  />
                  <span
                    className={`text-[10px] ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
                  >
                    {opacity}%
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Legend — gradient bar with parameter icon + unit labels */}
      {legendConfig &&
        (() => {
          const gradientStops = legendConfig.stops
            .map(
              (s: any, i: number) =>
                `${s.color} ${Math.round((i / (legendConfig.stops.length - 1)) * 100)}%`,
            )
            .join(", ");
          const accentColor =
            legendConfig.stops[legendConfig.stops.length - 1].color;
          return (
            <div
              className="absolute bottom-4 left-2 z-[400] px-2 py-1.5"
              style={{ minWidth: 160 }}
            >
              <div className="flex items-center gap-1 mb-1.5">
                <ParamIcon
                  param={selectedParameter ?? ""}
                  className="w-3 h-3"
                  color={accentColor}
                />
                <span
                  className="text-[9px] font-bold tracking-widest uppercase"
                  style={{ color: accentColor }}
                >
                  {legendConfig.unit}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full w-full"
                style={{
                  background: `linear-gradient(to right, ${gradientStops})`,
                }}
              />
              <div className="flex justify-between mt-0.5">
                {legendConfig.stops.map((s: any) => (
                  <span
                    key={s.label}
                    className="text-[8px] font-semibold"
                    style={{
                      color: isDarkMode
                        ? "rgba(255,255,255,0.75)"
                        : "rgba(15,23,42,0.70)",
                      textShadow: isDarkMode
                        ? "0 1px 3px rgba(0,0,0,0.9)"
                        : "0 1px 2px rgba(255,255,255,0.9)",
                    }}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

      {/* Hover tooltip — styled glassmorphic reading card */}
      {hoveredDistrictName &&
        (() => {
          const value =
            hoverValue != null ? Math.round(hoverValue * 10) / 10 : null;
          const accentColor =
            legendConfig?.stops?.[legendConfig.stops.length - 1]?.color ??
            FAO_BLUE;
          const tx = mousePos.x > 320 ? mousePos.x - 150 : mousePos.x + 16;
          const ty = Math.max(mousePos.y - 20, 8);
          return (
            <div
              className="absolute pointer-events-none z-[450]"
              style={{
                left: tx,
                top: ty,
                minWidth: 132,
                padding: "8px 11px",
                borderRadius: 12,
                background: isDarkMode
                  ? "rgba(10,15,30,0.72)"
                  : "rgba(255,255,255,0.86)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)"}`,
                boxShadow: "0 6px 22px rgba(0,0,0,0.28)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <ParamIcon
                  param={selectedParameter ?? ""}
                  className="w-3 h-3"
                  color={accentColor}
                />
                <span
                  style={{
                    fontSize: 9.5,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: isDarkMode
                      ? "rgba(255,255,255,0.82)"
                      : "rgba(15,23,42,0.78)",
                  }}
                >
                  {hoveredDistrictName}
                </span>
              </div>
              {value !== null && (
                <div className="flex items-baseline gap-1">
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: accentColor,
                    }}
                  >
                    {value}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isDarkMode
                        ? "rgba(255,255,255,0.65)"
                        : "rgba(15,23,42,0.60)",
                    }}
                  >
                    {legendUnit}
                  </span>
                </div>
              )}
              {value !== null && hoverDirection !== null && (
                <div
                  className="flex items-center gap-1 mt-0.5"
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    color: isDarkMode
                      ? "rgba(255,255,255,0.78)"
                      : "rgba(15,23,42,0.72)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      lineHeight: 1,
                      // Arrow points toward where the wind blows (FROM + 180°)
                      transform: `rotate(${hoverDirection + 180}deg)`,
                      color: accentColor,
                    }}
                  >
                    ↑
                  </span>
                  <span>{degreesToCompass(hoverDirection)}</span>
                  <span
                    style={{
                      fontWeight: 500,
                      color: isDarkMode
                        ? "rgba(255,255,255,0.50)"
                        : "rgba(15,23,42,0.50)",
                    }}
                  >
                    {Math.round(hoverDirection)}°
                  </span>
                </div>
              )}
              {value === null && hoverLoading && (
                <div
                  className="flex items-center gap-1.5"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isDarkMode
                      ? "rgba(255,255,255,0.70)"
                      : "rgba(15,23,42,0.65)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: `2px solid ${accentColor}40`,
                      borderTopColor: accentColor,
                      animation: "spin 0.7s linear infinite",
                    }}
                  />
                  Loading…
                </div>
              )}
            </div>
          );
        })()}

      {/* Leaflet label styles */}
      <style>{`
    .district-label {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
      text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6);
      white-space: nowrap;
      pointer-events: none;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .waterAreas-label {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      font-size: 10px;
      color: #93c5fd;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
      pointer-events: none;
    }
  `}</style>
    </div>
  );
}
