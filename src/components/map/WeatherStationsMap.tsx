import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { waterAreas } from "../../utils/waterAreas";
import { capitalize } from "../../utils/capitalize";
import { useAppStore } from "@/store/useAppStore";
import {
  X,
  Layers,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  Radio,
} from "lucide-react";
import {
  formatDate,
  getLayerGroups,
  isPointInPolygon,
  isValidGeoJSON,
} from "@/utils/woker_fn";
import { geoData } from "@/utils/geodata";
import type { LayerDef, UgandaBoundaryMapProps } from "@/types/data_types";

// ── Constants ─────────────────────────────────────────────────────────────────
const FAO_BLUE = "#318DDE";
const GEO_SERVER_URL =
  "https://multihazard.rosewillbome.com/geoserver/wfews/wms";

const WMS_BASE_OPTIONS = {
  format: "image/png" as const,
  transparent: true,
  version: "1.1.0",
  opacity: 0.85,
};

function clearLayer<T extends L.Layer>(
  map: L.Map,
  ref: React.MutableRefObject<T | null>,
) {
  if (ref.current) {
    map.removeLayer(ref.current);
    ref.current = null;
  }
}

// ── Station type ─────────────────────────────────────────────────────────────
export type StationStatus = "online" | "maintenance" | "offline";

export interface WeatherStation {
  id: string;
  name: string;
  region?: string;
  status: StationStatus;
  lat: number;
  lng: number;
  temp?: number;
  humidity?: number;
  wind?: number;
  pressure?: number;
  rain?: number;
  signal?: number;
  lastUpdate?: string;
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<StationStatus, string> = {
  online: "#22c55e",
  maintenance: "#eab308",
  offline: "#ef4444",
};

const STATUS_LABEL: Record<StationStatus, string> = {
  online: "Online",
  maintenance: "Maintenance",
  offline: "Offline",
};

/** Build the HTML for a station pin marker */
function makeStationMarkerHtml(station: WeatherStation, isDark: boolean): string {
  const color = STATUS_COLOR[station.status];
  const pinBg   = isDark ? "rgba(8,12,24,0.88)"     : "rgba(255,255,255,0.92)";
  const labelBg = isDark ? "rgba(8,12,24,0.82)"     : "rgba(255,255,255,0.90)";
  const labelBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const labelText   = isDark ? "rgba(255,255,255,0.90)" : "rgba(15,23,42,0.85)";
  const caretColor  = isDark ? "rgba(8,12,24,0.82)"    : "rgba(255,255,255,0.90)";
  const pulse =
    station.status === "online"
      ? `<span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.35;animation:stationPulse 2s ease-out infinite;"></span>`
      : "";
  return `
<div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);font-family:ui-sans-serif,system-ui,sans-serif;">
  <div style="position:relative;width:28px;height:28px;border-radius:50%;background:${pinBg};border:2.5px solid ${color};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.4);">
    ${pulse}
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4.9 4.9a10 10 0 0 1 14.14 0M7.76 7.76a6 6 0 0 1 8.49 0M10.6 10.6a2 2 0 0 1 2.83 0"/>
      <circle cx="12" cy="14" r="1" fill="${color}" stroke="none"/>
      <line x1="12" y1="15" x2="12" y2="20"/>
    </svg>
  </div>
  <div style="margin-top:3px;background:${labelBg};backdrop-filter:blur(8px);border-radius:6px;padding:2px 6px;white-space:nowrap;border:1px solid ${labelBorder};">
    <span style="font-size:9px;font-weight:700;color:${labelText};">${station.name}</span>
  </div>
  <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid ${caretColor};"></div>
</div>`;
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface WeatherStationsMapProps extends Omit<
  UgandaBoundaryMapProps,
  "legendTitle" | "legendItems"
> {
  stations?: WeatherStation[];
  onStationClick?: (station: WeatherStation) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WeatherStationsMap({
  className = "",
  isDarkMode,
  badgeText = "Uganda",
  district,
  setDistrict,
  getTheBounds,
  zoom = 6.8,
  minZoom = 6.8,
  stations = [],
  onStationClick,
}: WeatherStationsMapProps) {
  const { currentPage, forecastStep, dateRange } = useAppStore(
    (state) => state,
  );

  const LAYER_GROUPS = getLayerGroups({
    today: formatDate(dateRange),
    forecastStep,
    dateRange,
  });

  // ── Refs ────────────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const districtLayerRef = useRef<L.GeoJSON | null>(null);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const riverLayerRef = useRef<L.GeoJSON | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const wmsLayersRef = useRef<Record<string, L.TileLayer.WMS>>({});
  const stationMarkersRef = useRef<L.Marker[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredStation, setHoveredStation] = useState<WeatherStation | null>(
    null,
  );
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hoveredDistrictName, setHoveredDistrictName] = useState<string | null>(
    null,
  );

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

  // ── Label-fit helper ─────────────────────────────────────────────────────────
  const doesNameFitInLeafletBoundary = (
    layer: any,
    name: string,
    fontSize = 14,
    fontFamily = "sans-serif",
    padding = 5,
  ): boolean => {
    if (!mapRef.current) return false;
    const bounds = layer.getBounds();
    const topLeft = mapRef.current.latLngToLayerPoint(bounds.getNorthWest());
    const bottomRight = mapRef.current.latLngToLayerPoint(
      bounds.getSouthEast(),
    );
    const availableWidth = bottomRight.x - topLeft.x;
    const availableHeight = bottomRight.y - topLeft.y;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.font = `${fontSize}px ${fontFamily}`;
    const textWidth = ctx.measureText(name).width;
    const paddedW = textWidth + padding * 2;
    const paddedH = fontSize + padding * 2;
    return paddedW <= availableWidth && paddedH <= availableHeight;
  };

  // ── Toggle WMS panel layer ───────────────────────────────────────────────────
  const toggleLayer = (layerDef: LayerDef) => {
    if (!mapRef.current) return;
    if (activeLayers.has(layerDef.id)) {
      if (wmsLayersRef.current[layerDef.id]) {
        mapRef.current.removeLayer(wmsLayersRef.current[layerDef.id]);
        delete wmsLayersRef.current[layerDef.id];
      }
      setActiveLayers((prev) => {
        const next = new Set(prev);
        next.delete(layerDef.id);
        return next;
      });
    } else {
      const wmsLayer = L.tileLayer
        .wms(GEO_SERVER_URL, {
          ...WMS_BASE_OPTIONS,
          layers: `wfews:${layerDef.wms}`,
          opacity: 1.0,
        })
        .addTo(mapRef.current);
      wmsLayer.bringToFront();
      wmsLayersRef.current[layerDef.id] = wmsLayer;
      setActiveLayers((prev) => new Set(prev).add(layerDef.id));
    }
  };

  // ── Initialise map ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || !geoData) return;
    if (!isValidGeoJSON(geoData)) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // CartoDB base + optional labels overlay
    tileLayerRef.current = L.tileLayer(
      isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19, attribution: "© CartoDB" },
    );

    mapRef.current = L.map(mapContainerRef.current, {
      center: [1.3733, 32.2903],
      zoom,
      minZoom,
      layers: [tileLayerRef.current],
      zoomControl: false,
      attributionControl: false,
    });

    // District boundary polygons
    districtLayerRef.current = L.geoJSON(geoData, {
      style: {
        color: isDarkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)",
        weight: 0.5,
        fill: false,
      },
    }).addTo(mapRef.current);

    // District name labels
    const updateLabelVisibility = () => {
      if (!mapRef.current || !districtLayerRef.current) return;
      districtLayerRef.current.eachLayer((layer: any) => {
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
    mapRef.current.on("zoomend", updateLabelVisibility);
    updateLabelVisibility();

    // Click → highlight district
    mapRef.current.on("click", (ev: L.LeafletMouseEvent) => {
      let clickedFeature: any = null;
      districtLayerRef.current?.eachLayer((layer: any) => {
        if (clickedFeature) return;
        if (isPointInPolygon(ev.latlng, layer.getLatLngs()))
          clickedFeature = layer.feature;
      });
      if (!clickedFeature) return;
      if (setDistrict)
        setDistrict(clickedFeature.properties.name?.toUpperCase());
      clearLayer(mapRef.current!, boundaryLayerRef);
      boundaryLayerRef.current = L.geoJSON(clickedFeature, {
        style: { color: "#308DE0", weight: 4, fill: false },
      })
        .addTo(mapRef.current!)
        .bringToFront();
    });

    // Water / lake overlay
    clearLayer(mapRef.current, riverLayerRef);
    if (waterAreas) {
      riverLayerRef.current = L.geoJSON(waterAreas as any, {
        style: {
          color: "#d2efff",
          weight: 0.1,
          fillColor: "#d2efff",
          fillOpacity: 0.3,
        },
        onEachFeature(feature, layer: any) {
          const waterName = feature.properties?.NAME;
          if (waterName)
            layer.bindTooltip(waterName, {
              permanent: true,
              direction: "center",
              className: "waterAreas-label",
            });
        },
      }).addTo(mapRef.current);
      riverLayerRef.current.bringToBack();
    }

    // Hover: district detection
    mapRef.current.on("mousemove", (ev: L.LeafletMouseEvent) => {
      setMousePos({ x: ev.containerPoint.x, y: ev.containerPoint.y });
      let found: string | null = null;
      districtLayerRef.current?.eachLayer((layer: any) => {
        if (found) return;
        if (isPointInPolygon(ev.latlng, layer.getLatLngs()))
          found = layer.feature?.properties?.name ?? null;
      });
      setHoveredDistrictName(found);
    });
    mapRef.current.on("mouseout", () => setHoveredDistrictName(null));

    // ResizeObserver
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap base tile on dark/light toggle ──────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    mapRef.current.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(
      isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19, attribution: "© CartoDB" },
    ).addTo(mapRef.current);
    tileLayerRef.current.bringToBack();
  }, [isDarkMode]);

  // ── Highlight district from external prop ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !geoData || !isValidGeoJSON(geoData)) return;
    if (
      !district ||
      district.trim() === "" ||
      district.trim().toLowerCase() === "all"
    ) {
      clearLayer(mapRef.current, boundaryLayerRef);
      return;
    }
    const matched = geoData.features.filter(
      (f: any) => f?.properties?.name === capitalize(district.toLowerCase()),
    );
    if (!matched.length) return;
    clearLayer(mapRef.current, boundaryLayerRef);
    boundaryLayerRef.current = L.geoJSON(
      { type: "FeatureCollection", features: matched } as any,
      { style: { color: FAO_BLUE, weight: 4, fill: false } },
    )
      .addTo(mapRef.current)
      .bringToBack();
  }, [district, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fit viewport to getTheBounds ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !geoData || !isValidGeoJSON(geoData)) return;
    if (!getTheBounds || getTheBounds.trim().length === 0) return;

    if (
      getTheBounds.trim().toLowerCase() === "all" ||
      getTheBounds.trim() === ""
    ) {
      clearLayer(mapRef.current, boundaryLayerRef);
      mapRef.current.setMaxBounds(
        L.latLngBounds([
          [-90, -180],
          [90, 180],
        ]),
      );
      mapRef.current.setMinZoom(minZoom);
      mapRef.current.setView([1.3733, 32.2903], zoom);
      return;
    }

    const matched = geoData.features.filter(
      (f: any) =>
        f?.properties?.name === capitalize(getTheBounds.toLowerCase()),
    );
    if (!matched.length) return;

    clearLayer(mapRef.current, boundaryLayerRef);
    boundaryLayerRef.current = L.geoJSON(
      { ...geoData, features: matched } as any,
      { style: { color: FAO_BLUE, weight: 2, fill: false } },
    )
      .addTo(mapRef.current)
      .bringToBack();

    const bounds = boundaryLayerRef.current.getBounds();
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      mapRef.current.setMaxBounds(bounds.pad(0.3));
    }
  }, [getTheBounds, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Station markers ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers
    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];

    stations.forEach((station) => {
      const marker = L.marker([station.lat, station.lng], {
        icon: L.divIcon({
          className: "",
          html: makeStationMarkerHtml(station, isDarkMode),
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        }),
        zIndexOffset:
          station.status === "online"
            ? 300
            : station.status === "maintenance"
              ? 200
              : 100,
      })
        .on("click", () => onStationClick?.(station))
        .on("mouseover", (e) => {
          setHoveredStation(station);
          setMousePos({ x: e.containerPoint.x, y: e.containerPoint.y });
        })
        .on("mouseout", () => setHoveredStation(null))
        .addTo(mapRef.current!);
      stationMarkersRef.current.push(marker);
    });
  }, [stations, onStationClick, isDarkMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layer panel visibility filter ────────────────────────────────────────────
  const isVisibleOnPage = (layer: LayerDef): boolean => {
    if (!layer.pages || layer.pages.includes("*")) return true;
    return layer.pages.some((route) => (currentPage ?? "").startsWith(route));
  };
  const visibleGroups = LAYER_GROUPS.map((group) => ({
    ...group,
    layers: group.layers.filter(isVisibleOnPage),
  })).filter((group) => group.layers.length > 0);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`}>
      {/* Map container */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 z-0"
        style={{ background: isDarkMode ? "#0f172a" : "#f1f5f9" }}
      />

      {/* Badge */}
      <div className="absolute top-2 left-2 z-[400]">
        <span
          className="rounded px-2 py-0.5 text-[10px] font-medium shadow-sm"
          style={{
            backgroundColor: isDarkMode ? `${FAO_BLUE}33` : `${FAO_BLUE}22`,
            color: FAO_BLUE,
          }}
        >
          {badgeText}
        </span>
      </div>

      {/* Fullscreen button */}
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        className="absolute top-[44px] left-2 z-[400] flex items-center justify-center w-[30px] h-[30px] rounded-lg shadow-md transition-all"
        style={{
          background: isDarkMode ? "rgba(10,15,30,0.65)" : "rgba(255,255,255,0.80)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: `1px solid ${isDarkMode ? `${FAO_BLUE}55` : `${FAO_BLUE}40`}`,
        }}
      >
        {isFullscreen ? (
          <Minimize2 className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
        ) : (
          <Maximize2 className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
        )}
      </button>

      {/* MAP LAYERS toggle button */}
      <button
        onClick={() => setShowLayerPanel((v) => !v)}
        className="absolute top-2 right-2 z-[400] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all"
        style={{
          backgroundColor: showLayerPanel
            ? FAO_BLUE
            : isDarkMode
              ? "#1e293b"
              : "#ffffff",
          color: showLayerPanel ? "#ffffff" : FAO_BLUE,
          border: `1px solid ${FAO_BLUE}55`,
        }}
      >
        <Layers className="w-3.5 h-3.5" />
        MAP LAYERS
      </button>

      {/* Zoom controls */}
      <div className="absolute top-[46px] right-2 z-[400] flex flex-col gap-1">
        {[
          {
            icon: Plus,
            title: "Zoom in",
            action: () => mapRef.current?.zoomIn(),
          },
          {
            icon: Minus,
            title: "Zoom out",
            action: () => mapRef.current?.zoomOut(),
          },
        ].map(({ icon: Icon, title, action }) => (
          <button
            key={title}
            onClick={action}
            title={title}
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg shadow-md transition-all hover:opacity-90"
            style={{
              backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
              border: `1px solid ${FAO_BLUE}55`,
            }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
          </button>
        ))}
      </div>

      {/* Layer panel */}
      {showLayerPanel && (
        <>
          <div
            className="fixed inset-0 z-[600]"
            onClick={() => setShowLayerPanel(false)}
          />
          <div
            className={`absolute top-10 right-2 z-[700] w-64 overflow-y-auto rounded-xl shadow-xl flex flex-col ${
              isDarkMode
                ? "bg-slate-800 border border-slate-700"
                : "bg-white border border-slate-200"
            }`}
            style={{ maxHeight: "90%" }}
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 border-b"
              style={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0" }}
            >
              <span
                className={`text-xs font-bold tracking-wide ${isDarkMode ? "text-white" : "text-slate-800"}`}
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

            {/* Layer list */}
            <div className="overflow-y-auto flex-1 py-1 h-[calc(100%-40px)]">
              {visibleGroups?.map((group) => (
                <div key={group.title} className="mb-1">
                  <p
                    className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest"
                    style={{ color: FAO_BLUE }}
                  >
                    {group.title}
                  </p>
                  {group.layers.map((layerDef) => {
                    const isActive = activeLayers.has(layerDef.id);
                    return (
                      <div
                        key={layerDef.id}
                        onClick={() => toggleLayer(layerDef)}
                        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors select-none ${
                          isDarkMode
                            ? "hover:bg-slate-700/50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all"
                            style={{
                              backgroundColor: isActive
                                ? FAO_BLUE
                                : "transparent",
                              borderColor: isActive
                                ? FAO_BLUE
                                : isDarkMode
                                  ? "#475569"
                                  : "#cbd5e1",
                            }}
                          >
                            {isActive && (
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
                            className={`text-xs ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}
                          >
                            {layerDef.label}
                          </span>
                        </div>
                        {layerDef.date && (
                          <span
                            className={`text-[10px] ml-2 flex-shrink-0 ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}
                          >
                            {layerDef.date}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Station legend */}
      <div
        className="absolute bottom-4 left-2 z-[400] px-3 py-2.5 rounded-xl shadow-lg"
        style={{
          background: isDarkMode ? "rgba(8,12,24,0.68)" : "rgba(255,255,255,0.82)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
          minWidth: 148,
        }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Radio className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: FAO_BLUE }}
          >
            Stations
          </span>
        </div>
        <div className="space-y-1">
          {(Object.entries(STATUS_COLOR) as [StationStatus, string][]).map(
            ([status, color]) => (
              <div key={status} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="text-[10px]"
                  style={{ color: isDarkMode ? "rgba(255,255,255,0.70)" : "rgba(15,23,42,0.70)" }}
                >
                  {STATUS_LABEL[status]}
                </span>
                <span
                  className="ml-auto text-[10px] font-medium"
                  style={{ color }}
                >
                  {stations.filter((s) => s.status === status).length}
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      {/* Hover tooltip — station details or district name */}
      {(hoveredStation || hoveredDistrictName) &&
        (() => {
          const tx = mousePos.x > 360 ? mousePos.x - 168 : mousePos.x + 14;
          const ty = Math.max(mousePos.y - 62, 8);
          return (
            <div
              className="absolute pointer-events-none z-[450]"
              style={{
                left: tx,
                top: ty,
                background: isDarkMode
                  ? "rgba(8,12,24,0.9)"
                  : "rgba(255,255,255,0.92)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
                borderRadius: 10,
                padding: "8px 12px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
                minWidth: 150,
              }}
            >
              {hoveredStation ? (
                <>
                  {/* Station tooltip */}
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: STATUS_COLOR[hoveredStation.status],
                      }}
                    />
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: isDarkMode
                          ? "rgba(255,255,255,0.9)"
                          : "rgba(0,0,0,0.85)",
                      }}
                    >
                      {hoveredStation.name}
                    </p>
                  </div>
                  <p
                    style={{
                      fontSize: 9,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: STATUS_COLOR[hoveredStation.status],
                      marginBottom: 6,
                    }}
                  >
                    {STATUS_LABEL[hoveredStation.status]}
                  </p>
                  {hoveredStation.status !== "offline" && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {hoveredStation.temp !== undefined && (
                        <div>
                          <p
                            style={{
                              fontSize: 8,
                              color: isDarkMode
                                ? "rgba(255,255,255,0.4)"
                                : "rgba(0,0,0,0.4)",
                            }}
                          >
                            TEMP
                          </p>
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: isDarkMode
                                ? "rgba(255,255,255,0.9)"
                                : "rgba(0,0,0,0.85)",
                            }}
                          >
                            {hoveredStation.temp}°C
                          </p>
                        </div>
                      )}
                      {hoveredStation.humidity !== undefined && (
                        <div>
                          <p
                            style={{
                              fontSize: 8,
                              color: isDarkMode
                                ? "rgba(255,255,255,0.4)"
                                : "rgba(0,0,0,0.4)",
                            }}
                          >
                            HUMIDITY
                          </p>
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: isDarkMode
                                ? "rgba(255,255,255,0.9)"
                                : "rgba(0,0,0,0.85)",
                            }}
                          >
                            {hoveredStation.humidity}%
                          </p>
                        </div>
                      )}
                      {hoveredStation.wind !== undefined && (
                        <div>
                          <p
                            style={{
                              fontSize: 8,
                              color: isDarkMode
                                ? "rgba(255,255,255,0.4)"
                                : "rgba(0,0,0,0.4)",
                            }}
                          >
                            WIND
                          </p>
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: isDarkMode
                                ? "rgba(255,255,255,0.9)"
                                : "rgba(0,0,0,0.85)",
                            }}
                          >
                            {hoveredStation.wind} km/h
                          </p>
                        </div>
                      )}
                      {hoveredStation.rain !== undefined && (
                        <div>
                          <p
                            style={{
                              fontSize: 8,
                              color: isDarkMode
                                ? "rgba(255,255,255,0.4)"
                                : "rgba(0,0,0,0.4)",
                            }}
                          >
                            RAIN
                          </p>
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: isDarkMode
                                ? "rgba(255,255,255,0.9)"
                                : "rgba(0,0,0,0.85)",
                            }}
                          >
                            {hoveredStation.rain} mm
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {hoveredStation.lastUpdate && (
                    <p
                      style={{
                        fontSize: 8,
                        color: isDarkMode
                          ? "rgba(255,255,255,0.3)"
                          : "rgba(0,0,0,0.3)",
                        marginTop: 6,
                      }}
                    >
                      Updated {hoveredStation.lastUpdate}
                    </p>
                  )}
                </>
              ) : (
                /* District tooltip */
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isDarkMode
                      ? "rgba(255,255,255,0.8)"
                      : "rgba(0,0,0,0.75)",
                  }}
                >
                  {hoveredDistrictName}
                </p>
              )}
            </div>
          );
        })()}

      {/* Leaflet label styles + station pulse animation */}
      <style>{`
        .district-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          font-size: 11px;
          font-weight: 600;
          color: ${isDarkMode ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.80)"};
          text-shadow: ${isDarkMode
            ? "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)"
            : "0 1px 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.7)"};
          white-space: nowrap;
          pointer-events: none;
        }
        .waterAreas-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          font-size: 10px;
          color: ${isDarkMode ? "#93c5fd" : "#2563eb"};
          text-shadow: ${isDarkMode ? "0 1px 3px rgba(0,0,0,0.8)" : "0 1px 2px rgba(255,255,255,0.8)"};
          pointer-events: none;
        }
        @keyframes stationPulse {
          0%   { transform: scale(1); opacity: 0.35; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
