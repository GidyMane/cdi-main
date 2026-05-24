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
  Waves,
  Plus,
  Minus,
} from "lucide-react";
import {
  formatDate,
  getDistrictValue,
  getLayerGroups,
  getValueColor,
  isPointInPolygon,
  isValidGeoJSON,
  mapLayerName,
  PARAM_LEGENDS,
} from "@/utils/woker_fn";
import { geoData } from "@/utils/geodata";
import type { LayerDef, UgandaBoundaryMapProps } from "@/types/data_types";

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

// ── Layer panel definitions (matches screenshot) ──────────────────────────────

export default function FloodMonitorMap({
  className = "",
  isDarkMode,
  badgeText = "Uganda",
  legendTitle,
  legendItems = [],
  district,
  setDistrict,
  getTheBounds,
  zoom = 6.8,
  minZoom = 6.8,
}: UgandaBoundaryMapProps) {
  const {
    selectedParameter,
    dateRange,
    currentPage,
    sliderhourIndexValue,
    layerMode,
    forecastStep,
  } = useAppStore((state) => state);

  const LAYER_GROUPS = getLayerGroups({
    today: formatDate(dateRange),
    forecastStep,
    dateRange,
  });
  // ── Refs ────────────────────────────────────────────────────────────────────
  const floodRootRef = useRef<HTMLDivElement>(null);
  const FloodMonitormapContainerRef = useRef<HTMLDivElement>(null);
  const FloodMonitormapRef = useRef<L.Map | null>(null);
  const FloodMonitordistrictLayerRef = useRef<L.GeoJSON | null>(null);
  const FloodMonitorboundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const FloodMonitorriverLayerRef = useRef<L.GeoJSON | null>(null);
  const FloodMonitortileLayerRef = useRef<L.TileLayer | null>(null);
  const FloodMonitorLabelsLayerRef = useRef<L.TileLayer | null>(null);
  const FloodMonitorrasterLayerRef = useRef<L.TileLayer | null>(null);
  const FloodMonitorwmsLayersRef = useRef<Record<string, L.TileLayer.WMS>>({});

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [selectedFloodForecastData, setSelectedFloodForecastData] = useState<
    string | null
  >(null);
  const [isRasterLoading, setRasterIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredDistrictName, setHoveredDistrictName] = useState<string | null>(
    null,
  );

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement)
      floodRootRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Draw / replace the blue boundary highlight around a district
  const drawBoundary = (geojson: any, color: string) => {
    if (!FloodMonitormapRef.current) return;
    clearLayer(FloodMonitormapRef.current, FloodMonitorboundaryLayerRef);
    FloodMonitorboundaryLayerRef.current = L.geoJSON(geojson, {
      style: { color, weight: 4, fill: false },
    })
      .addTo(FloodMonitormapRef.current)
      .bringToBack();
  };

  // Check whether a district label fits inside its polygon at current zoom
  // (exact port of doesNameFitInLeafletBoundary from reference)
  const doesNameFitInLeafletBoundary = (
    layer: any,
    name: string,
    fontSize = 14,
    fontFamily = "sans-serif",
    padding = 5,
  ): boolean => {
    if (!FloodMonitormapRef.current) return false;
    const bounds = layer.getBounds();
    const topLeft = FloodMonitormapRef.current.latLngToLayerPoint(
      bounds.getNorthWest(),
    );
    const bottomRight = FloodMonitormapRef.current.latLngToLayerPoint(
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

  // Toggle a panel layer on/off
  const toggleLayer = (layerDef: LayerDef) => {
    if (!FloodMonitormapRef.current) return;

    // Track which forecast layer is selected so the raster effect can react
    if (layerDef.id === "flood") {
      setSelectedFloodForecastData(
        activeLayers.has(layerDef.id) ? null : "flood_forecast",
      );
    }

    if (activeLayers.has(layerDef.id)) {
      if (FloodMonitorwmsLayersRef.current[layerDef.id]) {
        FloodMonitormapRef.current.removeLayer(
          FloodMonitorwmsLayersRef.current[layerDef.id],
        );
        delete FloodMonitorwmsLayersRef.current[layerDef.id];
      }
      setActiveLayers((prev) => {
        const next = new Set(prev);
        next.delete(layerDef.id);
        return next;
      });
    } else {
      // flood forecast is handled via the raster effect; skip adding a generic WMS layer
      if (layerDef.id !== "flood") {
        const wmsLayer = L.tileLayer
          .wms(GEO_SERVER_URL, {
            ...WMS_BASE_OPTIONS,
            layers: `wfews:${layerDef.wms}`,
            opacity: 1.0,
          })
          .addTo(FloodMonitormapRef.current);
        wmsLayer.bringToFront();
        FloodMonitorwmsLayersRef.current[layerDef.id] = wmsLayer;
      }
      setActiveLayers((prev) => new Set(prev).add(layerDef.id));
    }
  };

  // ── Initialise map once geoData arrives ────────────────────────────────────
  useEffect(() => {
    if (!FloodMonitormapContainerRef.current || !geoData) return;
    if (!isValidGeoJSON(geoData)) {
      console.error("UgandaBoundaryMap: invalid GeoJSON:", geoData);
      return;
    }

    // Destroy stale instance (StrictMode / hot-reload safetyy)
    if (FloodMonitormapRef.current) {
      FloodMonitormapRef.current.remove();
      FloodMonitormapRef.current = null;
    }

    // ── Satellite base + labels overlay ──────────────────────────────────
    FloodMonitortileLayerRef.current = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/Rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "© Esri" },
    );
    FloodMonitorLabelsLayerRef.current = L.tileLayer(
      isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
      { opacity: 0.9, zIndex: 2 },
    );

    FloodMonitormapRef.current = L.map(FloodMonitormapContainerRef.current, {
      center: [1.3733, 32.2903],
      zoom,
      minZoom,
      layers: [
        FloodMonitortileLayerRef.current,
        FloodMonitorLabelsLayerRef.current,
      ],
      zoomControl: false,
      attributionControl: false,
    });

    // ── District boundary polygons — gray thin borders ────────────────────
    FloodMonitordistrictLayerRef.current = L.geoJSON(geoData, {
      style: { color: "gray", weight: 0.3, fill: false },
    }).addTo(FloodMonitormapRef.current);

    // ── District name labels ──────────────────────────────────────────────
    // Exact port from reference: calls doesNameFitInLeafletBoundary,
    // binds tooltip, opens it, and calls bringToFront() — then chains
    // .addTo(FloodMonitormapRef.current) at the end of eachLayer like the reference does.
    const updateLabelVisibility = () => {
      if (!FloodMonitormapRef.current || !FloodMonitordistrictLayerRef.current)
        return;

      FloodMonitordistrictLayerRef.current.eachLayer((layer: any) => {
        layer.closeTooltip();
        const name = layer.feature?.properties?.name;
        if (!name) return;

        const fits = doesNameFitInLeafletBoundary(layer, name);
        if (fits) {
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

    FloodMonitormapRef.current.on("zoomend", updateLabelVisibility);
    updateLabelVisibility();

    // ── Click → highlight clicked district (ray-casting, not bounding box) ─
    // Reference uses getBounds().contains() which gives rectangles.
    // We use isPointInPolygon() so the highlight matches the actual shape.
    FloodMonitormapRef.current.on("click", (ev: L.LeafletMouseEvent) => {
      let clickedFeature: any = null;

      FloodMonitordistrictLayerRef.current?.eachLayer((layer: any) => {
        if (clickedFeature) return; // stop after first match

        if (layer instanceof L.Polygon || (layer as any)) {
          if (isPointInPolygon(ev.latlng, layer.getLatLngs())) {
            clickedFeature = layer.feature;
          }
        }
      });

      if (!clickedFeature) return;

      if (setDistrict) {
        setDistrict(clickedFeature.properties.name?.toUpperCase());
      }

      // Highlight only the clicked feature
      clearLayer(FloodMonitormapRef.current!, FloodMonitorboundaryLayerRef);
      FloodMonitorboundaryLayerRef.current = L.geoJSON(clickedFeature, {
        style: { color: "#308DE0", weight: 4, fill: false },
      })
        .addTo(FloodMonitormapRef.current!)
        .bringToFront();
    });

    // ── Water / lake overlay ──────────────────────────────────────────────
    clearLayer(FloodMonitormapRef.current, FloodMonitorriverLayerRef);
    if (waterAreas) {
      FloodMonitorriverLayerRef.current = L.geoJSON(waterAreas as any, {
        style: {
          color: "#d2efff",
          weight: 0.1,
          fillColor: "#d2efff",
          fillOpacity: 1.0,
        },
        onEachFeature(feature, layer: any) {
          const waterName = feature.properties?.NAME;
          if (waterName) {
            layer.bindTooltip(waterName, {
              permanent: true,
              direction: "center",
              className: "waterAreas-label",
            });
            // layer.bringToFront();
          }
        },
      }).addTo(FloodMonitormapRef.current);
      FloodMonitorriverLayerRef.current.bringToBack();
    }

    // ── Hover: district detection on mouse move ───────────────────────────
    FloodMonitormapRef.current.on("mousemove", (ev: L.LeafletMouseEvent) => {
      setMousePos({ x: ev.containerPoint.x, y: ev.containerPoint.y });
      let found: string | null = null;
      FloodMonitordistrictLayerRef.current?.eachLayer((layer: any) => {
        if (found) return;
        if (isPointInPolygon(ev.latlng, layer.getLatLngs()))
          found = layer.feature?.properties?.name ?? null;
      });
      setHoveredDistrictName(found);
    });
    FloodMonitormapRef.current.on("mouseout", () =>
      setHoveredDistrictName(null),
    );

    // ── ResizeObserver ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() =>
      FloodMonitormapRef.current?.invalidateSize(),
    );
    ro.observe(FloodMonitormapContainerRef.current);

    return () => {
      ro.disconnect();
      FloodMonitormapRef.current?.remove();
      FloodMonitormapRef.current = null;
    };
  }, [geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap labels overlay on dark/light toggle ─────────────────────────────────
  useEffect(() => {
    if (!FloodMonitormapRef.current) return;
    clearLayer(FloodMonitormapRef.current, FloodMonitorLabelsLayerRef);
    FloodMonitorLabelsLayerRef.current = L.tileLayer(
      isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
      { opacity: 0.9, zIndex: 2 },
    ).addTo(FloodMonitormapRef.current);
  }, [isDarkMode]);

  // ── Highlight district when `district` prop changes externally ──────────────
  useEffect(() => {
    if (!FloodMonitormapRef.current || !geoData || !isValidGeoJSON(geoData))
      return;

    if (
      !district ||
      district.trim() === "" ||
      district.trim().toLowerCase() === "all"
    ) {
      clearLayer(FloodMonitormapRef.current, FloodMonitorboundaryLayerRef);
      return;
    }

    const matched = geoData.features.filter(
      (f: any) => f?.properties?.name === capitalize(district.toLowerCase()),
    );
    if (!matched.length) return;

    drawBoundary({ type: "FeatureCollection", features: matched }, FAO_BLUE);
  }, [district, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── getTheBounds: fit viewport to a named district ──────────────────────────
  useEffect(() => {
    if (!FloodMonitormapRef.current || !geoData || !isValidGeoJSON(geoData))
      return;
    if (!getTheBounds || getTheBounds.trim().length === 0) return;

    if (
      getTheBounds.trim().toLowerCase() === "all" ||
      getTheBounds.trim() === ""
    ) {
      clearLayer(FloodMonitormapRef.current, FloodMonitorboundaryLayerRef);
      FloodMonitormapRef.current.setView([1.3733, 32.2903], zoom);
      FloodMonitormapRef.current.setMinZoom(minZoom);
      return;
    }

    const matched = geoData.features.filter(
      (f: any) =>
        f?.properties?.name === capitalize(getTheBounds.toLowerCase()),
    );
    if (!matched.length) return;

    clearLayer(FloodMonitormapRef.current, FloodMonitorboundaryLayerRef);
    FloodMonitorboundaryLayerRef.current = L.geoJSON(
      { ...geoData, features: matched } as any,
      { style: { color: "blue", weight: 4, fill: false } },
    )
      .addTo(FloodMonitormapRef.current)
      .bringToBack();

    const bounds = FloodMonitorboundaryLayerRef.current.getBounds();
    if (bounds.isValid()) {
      FloodMonitormapRef.current.fitBounds(bounds);
      FloodMonitormapRef.current.setMaxBounds(bounds);
    }
  }, [getTheBounds, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Raster layer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!FloodMonitormapRef.current) return;

    clearLayer(FloodMonitormapRef.current, FloodMonitorrasterLayerRef);

    if (layerMode === "forecast") {
      // ── Forecast branch: driven by the flood layer toggle ─────────────────
      if (!selectedFloodForecastData) return;
      const formattedDate = dateRange?.replace(/-/g, "").slice(0, 8) ?? "";
      const layerName = `wfews:${selectedFloodForecastData}_${formattedDate}_${forecastStep}h`;
      FloodMonitorrasterLayerRef.current = L.tileLayer
        .wms(GEO_SERVER_URL, { ...WMS_BASE_OPTIONS, layers: layerName })
        .on("loading", () => setRasterIsLoading(true))
        .on("load", () => setRasterIsLoading(false))
        .on("tileerror", () => setRasterIsLoading(false))
        .addTo(FloodMonitormapRef.current);
      FloodMonitorrasterLayerRef.current.bringToFront();
      return;
    }

    // ── Daily / monthly branch ────────────────────────────────────────────
    const hour =
      sliderhourIndexValue === "000"
        ? "00"
        : String(sliderhourIndexValue).padStart(2, "0");

    const layerName =
      mapLayerName({
        parameter: selectedParameter,
        date: dateRange,
        mode: "daily",
        hour,
      }) ??
      mapLayerName({
        parameter: selectedParameter,
        date: dateRange,
        mode: "monthly",
      });

    if (!layerName) return;

    FloodMonitorrasterLayerRef.current = L.tileLayer
      .wms(GEO_SERVER_URL, { ...WMS_BASE_OPTIONS, layers: layerName })
      .on("loading", () => setRasterIsLoading(true))
      .on("load", () => setRasterIsLoading(false))
      .on("tileerror", () => setRasterIsLoading(false))
      .addTo(FloodMonitormapRef.current);
    FloodMonitorrasterLayerRef.current.bringToFront();
  }, [
    geoData,
    selectedParameter,
    dateRange,
    sliderhourIndexValue,
    layerMode,
    forecastStep,
    selectedFloodForecastData,
  ]);

  // In the component, below where you destructure currentPage from the store
  const isVisibleOnPage = (layer: LayerDef): boolean => {
    if (!layer.pages || layer.pages.includes("*")) return true;
    return layer.pages.some((route) => (currentPage ?? "").startsWith(route));
  };

  const visibleGroups = LAYER_GROUPS.map((group) => ({
    ...group,
    layers: group.layers.filter(isVisibleOnPage),
  })).filter((group) => group.layers.length > 0);
  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={floodRootRef} className={`relative overflow-hidden ${className}`}>
      {/* Map container */}
      <div
        ref={FloodMonitormapContainerRef}
        className="absolute inset-0 z-0"
        style={{
          background: isDarkMode ? "#0f172a" : "#f1f5f9",
        }}
      />

      {/* Loading overlay */}
      <div
        className={`
         absolute inset-0 z-[500]
         flex items-center justify-center
         transition-all duration-300
         ${
           !geoData || isRasterLoading
             ? "opacity-100 visible"
             : "opacity-0 invisible pointer-events-none"
         }
         ${isDarkMode ? "bg-slate-900/70" : "bg-white/70"}
       `}
      >
        <div className="flex flex-col items-center gap-3">
          {/* Spinner */}
          <div
            className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{
              borderColor: `${FAO_BLUE}30`,
              borderTopColor: FAO_BLUE,
            }}
          />

          {/* Loading text */}
          {/* <span
           className={`text-xs font-medium tracking-wide ${
             isDarkMode ? "text-slate-300" : "text-slate-600"
           }`}
         >
           Loading weather layers...
         </span> */}
        </div>
      </div>

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
          background: "rgba(10,15,30,0.65)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: `1px solid ${FAO_BLUE}55`,
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

      {/* Zoom controls — below MAP LAYERS button */}
      <div className="absolute top-[46px] right-2 z-[400] flex flex-col gap-1">
        {[
          {
            icon: Plus,
            title: "Zoom in",
            action: () => FloodMonitormapRef.current?.zoomIn(),
          },
          {
            icon: Minus,
            title: "Zoom out",
            action: () => FloodMonitormapRef.current?.zoomOut(),
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
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[600]"
            onClick={() => setShowLayerPanel(false)}
          />

          <div
            className={`
             absolute top-10 right-2 z-[700] w-64 overflow-y-auto rounded-xl shadow-xl
             flex flex-col
             ${
               isDarkMode
                 ? "bg-slate-800 border border-slate-700"
                 : "bg-white border border-slate-200"
             }
           `}
            style={{
              maxHeight: "90%",
            }}
          >
            {/* Panel header */}
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

            {/* Scrollable layer list */}
            <div className="overflow-y-auto flex-1 py-1 h-[calc(100%-40px)]">
              {visibleGroups?.map((group) => (
                <div key={group.title} className="mb-1">
                  {/* Group heading */}
                  <p
                    className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest"
                    style={{ color: FAO_BLUE }}
                  >
                    {group.title}
                  </p>

                  {/* Layer rows */}
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
                          {/* Checkbox */}
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
                            className={`text-xs ${
                              isDarkMode ? "text-slate-300" : "text-slate-700"
                            }`}
                          >
                            {layerDef.label}
                          </span>
                        </div>

                        {/* Date badge */}
                        {layerDef.date && (
                          <span
                            className={`text-[10px] ml-2 flex-shrink-0 ${
                              isDarkMode ? "text-slate-500" : "text-slate-400"
                            }`}
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

      {/* Legend — gradient bar with Waves icon */}
      {legendTitle &&
        legendItems.length > 0 &&
        (() => {
          const gradientStops = legendItems
            .map(
              (item, i) =>
                `${item.color} ${Math.round((i / (legendItems.length - 1)) * 100)}%`,
            )
            .join(", ");
          return (
            <div
              className="absolute bottom-4 left-2 z-[400] px-3 py-2.5 rounded-xl shadow-lg"
              style={{
                background: "rgba(8,12,24,0.68)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid rgba(255,255,255,0.1)",
                minWidth: 172,
              }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Waves
                  className="w-3.5 h-3.5"
                  style={{ color: legendItems[legendItems.length - 1].color }}
                />
                <span
                  className="text-[10px] font-bold tracking-widest uppercase"
                  style={{ color: legendItems[legendItems.length - 1].color }}
                >
                  {legendTitle}
                </span>
              </div>
              <div
                className="h-2.5 rounded-full w-full"
                style={{
                  background: `linear-gradient(to right, ${gradientStops})`,
                }}
              />
              <div className="flex justify-between mt-1">
                {legendItems.map((item) => (
                  <span
                    key={item.label}
                    className="text-[8px] font-medium"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

      {/* Hover tooltip — follows cursor, shows district value */}
      {hoveredDistrictName &&
        (() => {
          const param = selectedParameter?.toLowerCase() ?? "";
          const config = PARAM_LEGENDS[param];
          const value = config
            ? getDistrictValue(hoveredDistrictName, param)
            : null;
          const color =
            config && value !== null ? getValueColor(value, param) : FAO_BLUE;
          const tx = mousePos.x > 360 ? mousePos.x - 158 : mousePos.x + 14;
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
                minWidth: 140,
              }}
            >
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: isDarkMode
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(0,0,0,0.4)",
                  marginBottom: 4,
                }}
              >
                {hoveredDistrictName}
              </p>
              {config && value !== null && (
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 3 }}
                >
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isDarkMode
                        ? "rgba(255,255,255,0.55)"
                        : "rgba(0,0,0,0.5)",
                    }}
                  >
                    {config.unit}
                  </span>
                </div>
              )}
              <p
                style={{
                  fontSize: 9,
                  color: isDarkMode
                    ? "rgba(255,255,255,0.3)"
                    : "rgba(0,0,0,0.3)",
                  marginTop: 4,
                  textTransform: "capitalize",
                }}
              >
                {selectedParameter ?? "—"}
              </p>
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
         color: #ffffff;
         white-space: nowrap;
         pointer-events: none;
         text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8), 0 -1px 3px rgba(0,0,0,0.8);
       }

       .waterAreas-label {
         background: transparent !important;
         border: none !important;
         box-shadow: none !important;
         font-size: 10px;
         font-weight: 600;
         color: #7ec8f7;
         pointer-events: none;
         text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8);
       }
     `}</style>
    </div>
  );
}
