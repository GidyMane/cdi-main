import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRainAnimation } from "./useRainAnimation";
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
  formatDate,
  getDistrictValue,
  getLayerGroups,
  getValueColor,
  isPointInPolygon,
  isValidGeoJSON,
  makeMarkerHtml,
  mapLayerName,
  PARAM_LEGENDS,
} from "@/utils/woker_fn";
import { geoData } from "@/utils/geodata";
import type {
  district,
  LayerDef,
  UgandaBoundaryMapProps,
} from "@/types/data_types";

const FAO_BLUE = "#318DDE";
const GEO_SERVER_URL =
  "https://multihazard.rosewillbome.com/geoserver/wfews/wms";

/** Shared WMS options used for every raster layer */
const WMS_BASE_OPTIONS = {
  format: "image/png" as const,
  transparent: true,
  version: "1.1.0",
  opacity: 0.85,
};

/** Remove a layer from the map and null the ref */
function clearLayer<T extends L.Layer>(
  map: L.Map,
  ref: React.MutableRefObject<T | null>,
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

// ── Layer panel definitions (matches screenshot) ──────────────────────────────

export default function WeatherForcastMap({
  className = "",
  isDarkMode,
  badgeText = "Uganda",
  // district,
  // setDistrict,
  getTheBounds,
  zoom = 6.8,
  minZoom = 6.8,
  district_list,
}: UgandaBoundaryMapProps) {
  const {
    selectedParameter,
    dateRange,
    currentPage,
    sliderhourIndexValue,
    // selectedDistrictId,
    setSelectedDistrictId,
    layerMode,
    forecastStep,
  } = useAppStore((state) => state);

  const LAYER_GROUPS = getLayerGroups({
    today: formatDate(dateRange),
    forecastStep,
    dateRange,
  });

  //clean districts
  const unique: district[] = district_list
    ? Array.from(
        new Map((district_list as district[]).map((d) => [d.id, d])).values(),
      ).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // ── Refs ────────────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const mapWeatherforcastContainerRef = useRef<HTMLDivElement>(null);
  const weatherforcastMapRef = useRef<L.Map | null>(null);
  const weatherforcastdistrictLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcastboundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcastriverLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcasttileLayerRef = useRef<L.TileLayer | null>(null);
  const weatherforcastrasterLayerRef = useRef<L.TileLayer | null>(null);
  const weatherforcastwmsLayersRef = useRef<Record<string, L.TileLayer.WMS>>(
    {},
  );
  const weatherMarkersRef = useRef<L.Marker[]>([]);

  const [selectedForcastData, setSelectedForcastData] = useState<string | null>(
    null,
  );
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    new Set(["country"]),
  );
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
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // ── Rain animation ──────────────────────────────────────────────────────────
  const { canvasRef: rainCanvasRef, setRainyDistricts } = useRainAnimation(
    weatherforcastMapRef,
    geoData as any,
  );

  // Check whether a district label fits inside its polygon at current zoom
  // (exact port of doesNameFitInLeafletBoundary from reference)
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

  // Toggle a panel layer on/off
  const toggleLayer = (layerDef: LayerDef) => {
    const forecastParam =
      layerDef?.id === "tmax"
        ? "gfs_tmax"
        : layerDef?.id === "tmin"
          ? "gfs_tmin"
          : null;
    setSelectedForcastData(forecastParam);

    if (!weatherforcastMapRef.current) return;

    if (activeLayers.has(layerDef.id)) {
      if (weatherforcastwmsLayersRef.current[layerDef.id]) {
        weatherforcastMapRef.current.removeLayer(
          weatherforcastwmsLayersRef.current[layerDef.id],
        );
        delete weatherforcastwmsLayersRef.current[layerDef.id];
      }
      setActiveLayers((prev) => {
        const next = new Set(prev);
        next.delete(layerDef.id);
        return next;
      });
    } else {
      // tmax / tmin are handled via the raster useEffect; skip adding a WMS layer here
      if (layerDef.id !== "tmax" && layerDef.id !== "tmin") {
        const wmsLayer = L.tileLayer
          .wms(GEO_SERVER_URL, {
            layers: `wfews:${layerDef.wms}`,
            format: "image/png",
            transparent: true,
            version: "1.1.0",
            opacity: 1.0,
          })
          .addTo(weatherforcastMapRef.current);
        wmsLayer.bringToFront();
        weatherforcastwmsLayersRef.current[layerDef.id] = wmsLayer;
      }
      setActiveLayers((prev) => new Set(prev).add(layerDef.id));
    }
  };

  // ── Initialise map once geoData arrives ────────────────────────────────────
  useEffect(() => {
    if (!mapWeatherforcastContainerRef.current || !geoData) return;
    if (!isValidGeoJSON(geoData)) {
      console.error("UgandaBoundaryMap: invalid GeoJSON:", geoData);
      return;
    }

    // Destroy stale instance (StrictMode / hot-reload safetyy)
    if (weatherforcastMapRef.current) {
      weatherforcastMapRef.current.remove();
      weatherforcastMapRef.current = null;
    }

    // ── CartoDB base tile (same style as Overview map) ────────────────────
    weatherforcasttileLayerRef.current = L.tileLayer(
      isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19, attribution: "© CartoDB" },
    );

    weatherforcastMapRef.current = L.map(
      mapWeatherforcastContainerRef.current,
      {
        center: [1.3733, 32.2903],
        zoom,
        minZoom,
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
    // Exact port from reference: calls doesNameFitInLeafletBoundary,
    // binds tooltip, opens it, and calls bringToFront() — then chains
    // .addTo(weatherforcastMapRef.current) at the end of eachLayer like the reference does.
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

    weatherforcastMapRef.current.on("zoomend", updateLabelVisibility);
    updateLabelVisibility();

    // ── Click → highlight clicked district (ray-casting, not bounding box) ─
    // Reference uses getBounds().contains() which gives rectangles.
    // We use isPointInPolygon() so the highlight matches the actual shape.
    weatherforcastMapRef.current.on("click", (ev: L.LeafletMouseEvent) => {
      let clickedFeature: any = null;

      weatherforcastdistrictLayerRef.current?.eachLayer((layer: any) => {
        if (clickedFeature) return; // stop after first match

        if (layer instanceof L.Polygon || (layer as any)) {
          if (isPointInPolygon(ev.latlng, layer.getLatLngs())) {
            clickedFeature = layer.feature;
          }
        }
      });

      if (!clickedFeature) return;

      if (setSelectedDistrictId) {
        const filtered = unique.find(
          (item) =>
            item?.name?.toLowerCase() ===
            clickedFeature.properties.name?.toLowerCase(),
        );

        console.log("filtered", filtered);
        setSelectedDistrictId(filtered);
      }

      // Highlight only the clicked feature
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
          fillOpacity: 0.8,
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
      }).addTo(weatherforcastMapRef.current);
      weatherforcastriverLayerRef.current.bringToBack();
    }

    // ── Hover: district detection on mouse move ───────────────────────────
    weatherforcastMapRef.current.on("mousemove", (ev: L.LeafletMouseEvent) => {
      setMousePos({ x: ev.containerPoint.x, y: ev.containerPoint.y });
      let found: string | null = null;
      weatherforcastdistrictLayerRef.current?.eachLayer((layer: any) => {
        if (found) return;
        if (isPointInPolygon(ev.latlng, layer.getLatLngs()))
          found = layer.feature?.properties?.name ?? null;
      });
      setHoveredDistrictName(found);
    });
    weatherforcastMapRef.current.on("mouseout", () =>
      setHoveredDistrictName(null),
    );

    // ── Country boundary on by default ───────────────────────────────────
    const countryWms = L.tileLayer
      .wms(GEO_SERVER_URL, {
        layers: "wfews:country",
        format: "image/png",
        transparent: true,
        version: "1.1.0",
        opacity: 1.0,
      })
      .addTo(weatherforcastMapRef.current);
    countryWms.bringToFront();
    weatherforcastwmsLayersRef.current["country"] = countryWms;

    // ── ResizeObserver ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() =>
      weatherforcastMapRef.current?.invalidateSize(),
    );
    ro.observe(mapWeatherforcastContainerRef.current);

    return () => {
      ro.disconnect();
      weatherforcastMapRef.current?.remove();
      weatherforcastMapRef.current = null;
    };
  }, [geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap full CartoDB tile on dark/light toggle ──────────────────────────────
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
      { maxZoom: 19, attribution: "© CartoDB" },
    ).addTo(weatherforcastMapRef.current);
    weatherforcasttileLayerRef.current.bringToBack();
  }, [isDarkMode]);

  useEffect(() => {
    if (!weatherforcastMapRef.current || !geoData || !isValidGeoJSON(geoData))
      return;

    // Empty / "all" → reset to full Uganda and remove any district lock
    if (
      !getTheBounds ||
      getTheBounds.trim() === "" ||
      getTheBounds.trim().toLowerCase() === "all"
    ) {
      clearLayer(weatherforcastMapRef.current, weatherforcastboundaryLayerRef);
      weatherforcastMapRef.current.setMaxBounds(
        L.latLngBounds([
          [-90, -180],
          [90, 180],
        ]),
      );
      weatherforcastMapRef.current.setMinZoom(minZoom);
      weatherforcastMapRef.current.setView([1.3733, 32.2903], zoom);
      return;
    }

    const matched = geoData.features.filter(
      (f: any) =>
        f?.properties?.name === capitalize(getTheBounds.toLowerCase()),
    );
    if (!matched.length) return;

    clearLayer(weatherforcastMapRef.current, weatherforcastboundaryLayerRef);

    weatherforcastboundaryLayerRef.current = L.geoJSON(
      { ...geoData, features: matched } as FeatureCollection,
      { style: { color: FAO_BLUE, weight: 2, fill: false } },
    )
      .addTo(weatherforcastMapRef.current)
      .bringToBack();

    const bounds = weatherforcastboundaryLayerRef.current.getBounds();
    if (bounds.isValid()) {
      weatherforcastMapRef.current.fitBounds(bounds, { padding: [40, 40] });
      weatherforcastMapRef.current.setMaxBounds(bounds.pad(0.3));
    }
  }, [getTheBounds, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Raster layer — handles daily / monthly and forecast modes ───────────────
  useEffect(() => {
    if (!weatherforcastMapRef.current) return;

    clearLayer(weatherforcastMapRef.current, weatherforcastrasterLayerRef);

    if (layerMode === "forecast") {
      if (!selectedForcastData) return;
      const formattedDate = dateRange?.replace(/-/g, "").slice(0, 8) ?? "";
      const layerName = `wfews:${selectedForcastData}_${forecastStep}h_${formattedDate}`;
      weatherforcastrasterLayerRef.current = L.tileLayer
        .wms(GEO_SERVER_URL, { ...WMS_BASE_OPTIONS, layers: layerName })
        .on("loading", () => setRasterIsLoading(true))
        .on("load", () => setRasterIsLoading(false))
        .on("tileerror", () => setRasterIsLoading(false))
        .addTo(weatherforcastMapRef.current);
      weatherforcastrasterLayerRef.current.bringToFront();
      return;
    }

    // ── Daily / monthly branch ────────────────────────────────────────────
    const hour =
      sliderhourIndexValue === "000"
        ? "00"
        : String(sliderhourIndexValue).padStart(2, "0");

    const layerName = mapLayerName({
      parameter: selectedParameter,
      date: dateRange,
      mode: "nowcast",
      hour,
    });

    if (layerName) {
      weatherforcastrasterLayerRef.current = L.tileLayer
        .wms(GEO_SERVER_URL, { ...WMS_BASE_OPTIONS, layers: layerName })
        .on("loading", () => setRasterIsLoading(true))
        .on("load", () => setRasterIsLoading(false))
        .on("tileerror", () => setRasterIsLoading(false))
        .addTo(weatherforcastMapRef.current);
      weatherforcastrasterLayerRef.current.bringToFront();
    }

    // ── Rain animation: magnitude-scaled drops per district ───────────────
    if (selectedParameter?.toLowerCase() === "rainfall" && geoData?.features) {
      const rainyDistricts = (geoData.features as any[])
        .filter((f: any) => f?.properties?.name)
        .map((f: any) => {
          const name = f.properties.name as string;
          const meanMm = getDistrictValue(name, "rainfall");
          let rainyPct: number, speedScale: number, lineWidth: number;
          if (meanMm >= 75) {
            rainyPct = 90;
            speedScale = 1.6;
            lineWidth = 1.8;
          } else if (meanMm >= 50) {
            rainyPct = 70;
            speedScale = 1.3;
            lineWidth = 1.3;
          } else if (meanMm >= 25) {
            rainyPct = 45;
            speedScale = 1.0;
            lineWidth = 0.9;
          } else if (meanMm >= 10) {
            rainyPct = 22;
            speedScale = 0.8;
            lineWidth = 0.5;
          } else {
            rainyPct = 0;
            speedScale = 0;
            lineWidth = 0;
          }
          return { name, meanMm, rainyPct, speedScale, lineWidth };
        })
        .filter((d) => d.meanMm >= 10);
      setRainyDistricts(rainyDistricts);
    } else {
      setRainyDistricts([]);
    }
  }, [
    geoData,
    selectedParameter,
    dateRange,
    sliderhourIndexValue,
    layerMode,
    forecastStep,
    selectedForcastData,
  ]);

  // ── Weather district markers — selected district or Kampala by default ────────
  useEffect(() => {
    if (!weatherforcastMapRef.current || !geoData?.features) return;
    weatherMarkersRef.current.forEach((m) => m.remove());
    weatherMarkersRef.current = [];
    const param = selectedParameter?.toLowerCase() ?? "";
    const config = PARAM_LEGENDS[param];
    if (!config) return;
    // Show marker for the selected district; fall back to Kampala when none selected
    const target =
      getTheBounds?.trim() && getTheBounds.trim().toLowerCase() !== "all"
        ? getTheBounds.trim()
        : "Kampala";
    (geoData.features as any[]).forEach((feature) => {
      const name: string = feature?.properties?.name ?? "";
      if (!name.toLowerCase().includes(target.toLowerCase())) return;
      const center = L.geoJSON(feature).getBounds().getCenter();
      const value = getDistrictValue(name, param);
      const color = getValueColor(value, param);
      const marker = L.marker(center, {
        icon: L.divIcon({
          className: "",
          html: makeMarkerHtml(name, value, config.unit, color, param),
          // [1,1] size with [0,0] anchor places the div's top-left at the lat/lng;
          // the CSS transform inside makeMarkerHtml shifts the bubble up + centers it.
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        }),
        interactive: false,
        zIndexOffset: 200,
      }).addTo(weatherforcastMapRef.current!);
      weatherMarkersRef.current.push(marker);
    });
  }, [selectedParameter, geoData, getTheBounds]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div ref={rootRef} className={`relative overflow-hidden ${className}`}>
      {/* Map container */}
      <div
        ref={mapWeatherforcastContainerRef}
        className="absolute inset-0 z-0"
        style={{
          background: isDarkMode ? "#0f172a" : "#f1f5f9",
        }}
      />

      {/* Rain animation canvas — sits above the map, below UI controls */}
      <canvas
        ref={rainCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 450 }}
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
            action: () => weatherforcastMapRef.current?.zoomIn(),
          },
          {
            icon: Minus,
            title: "Zoom out",
            action: () => weatherforcastMapRef.current?.zoomOut(),
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
              {visibleGroups?.map((group) => {
                const displayLayers = group.layers.filter(
                  (l) => l.id !== "country" && l.id !== "districts",
                );
                if (!displayLayers.length) return null;
                return (
                <div key={group.title} className="mb-1">
                  {/* Group heading */}
                  <p
                    className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest"
                    style={{ color: FAO_BLUE }}
                  >
                    {group.title}
                  </p>

                  {/* Layer rows */}
                  {displayLayers.map((layerDef) => {
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
              );
              })}
            </div>
          </div>
        </>
      )}

      {/* Legend — gradient bar with parameter icon + unit labels */}
      {(() => {
        const paramKey = selectedParameter?.toLowerCase() ?? "";
        const config = PARAM_LEGENDS[paramKey];
        if (!config) return null;
        const gradientStops = config.stops
          .map(
            (s, i) =>
              `${s.color} ${Math.round((i / (config.stops.length - 1)) * 100)}%`,
          )
          .join(", ");
        const accentColor = config.stops[config.stops.length - 1].color;
        return (
          <div
            className="absolute bottom-4 left-2 z-[400] px-3 py-2.5 rounded-xl"
            style={{ minWidth: 172 }}
          >
            {/* Icon + unit label */}
            <div className="flex items-center gap-1.5 mb-2">
              <ParamIcon
                param={selectedParameter ?? ""}
                className="w-3.5 h-3.5"
                color={accentColor}
              />
              <span
                className="text-[10px] font-bold tracking-widest uppercase"
                style={{
                  color: accentColor,
                  textShadow: isDarkMode
                    ? "0 1px 3px rgba(0,0,0,0.9)"
                    : "0 1px 4px rgba(255,255,255,0.9)",
                }}
              >
                {config.unit}
              </span>
            </div>
            {/* Gradient bar */}
            <div
              className="h-2.5 rounded-full w-full"
              style={{
                background: `linear-gradient(to right, ${gradientStops})`,
                boxShadow: "0 1px 6px rgba(0,0,0,0.4)",
              }}
            />
            {/* Value labels */}
            <div className="flex justify-between mt-1">
              {config.stops.map((s) => (
                <span
                  key={s.label}
                  className="text-[8px] font-semibold"
                  style={{
                    color: isDarkMode
                      ? "rgba(255,255,255,0.85)"
                      : "rgba(0,0,0,0.8)",
                    textShadow: isDarkMode
                      ? "0 1px 3px rgba(0,0,0,0.9)"
                      : "0 1px 4px rgba(255,255,255,0.9)",
                  }}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Hover tooltip — text only, no background or border */}
      {hoveredDistrictName &&
        (() => {
          const param = selectedParameter?.toLowerCase() ?? "";
          const config = PARAM_LEGENDS[param];
          const value = config
            ? getDistrictValue(hoveredDistrictName, param)
            : null;
          const color =
            config && value !== null ? getValueColor(value, param) : FAO_BLUE;
          const tx = mousePos.x > 360 ? mousePos.x - 120 : mousePos.x + 12;
          const ty = Math.max(mousePos.y - 48, 8);
          return (
            <div
              className="absolute pointer-events-none z-[450]"
              style={{ left: tx, top: ty }}
            >
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: isDarkMode
                    ? "rgba(255,255,255,0.55)"
                    : "rgba(0,0,0,0.55)",
                  textShadow: isDarkMode
                    ? "0 1px 3px rgba(0,0,0,0.8)"
                    : "0 1px 3px rgba(255,255,255,0.9)",
                  marginBottom: 2,
                }}
              >
                {hoveredDistrictName}
              </p>
              {config && value !== null && (
                <p
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    lineHeight: 1,
                    color,
                    textShadow: isDarkMode
                      ? "0 1px 4px rgba(0,0,0,0.9)"
                      : "0 1px 4px rgba(255,255,255,0.9)",
                  }}
                >
                  {value}
                  <span
                    style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}
                  >
                    {config.unit}
                  </span>
                </p>
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
