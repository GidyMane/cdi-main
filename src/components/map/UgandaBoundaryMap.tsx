import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// import { geoAPI } from "../../services/api";
import { waterAreas } from "../../utils/waterAreas";
import { capitalize } from "../../utils/capitalize";
// import { useQuery } from "@tanstack/react-query";
// import type { FeatureCollection } from "geojson";
import { useAppStore } from "@/store/useAppStore";
import { X, Layers } from "lucide-react";
import { mapLayerName } from "@/utils/woker_fn";
import { geoData } from "@/utils/geodata";

interface LegendItem {
  label: string;
  color: string;
}

interface UgandaBoundaryMapProps {
  className?: string;
  isDarkMode: boolean;
  badgeText?: string;
  legendTitle?: string;
  legendItems?: LegendItem[];
  district?: string;
  setDistrict?: (name: string) => void;
  getTheBounds?: string; // from reference: fits map to a named district
  zoom?: number;
  minZoom?: number;
}

const FAO_BLUE = "#318DDE";

// ── Ray-casting point-in-polygon ──────────────────────────────────────────────
// Tests whether a LatLng lies inside the actual polygon shape (not bounding box).
// Handles both Polygon and MultiPolygon by flattening nested LatLng arrays.
const isPointInPolygon = (latlng: L.LatLng, polyLatLngs: any): boolean => {
  const rings: L.LatLng[][] = [];

  const flatten = (arr: any) => {
    if (!Array.isArray(arr) || arr.length === 0) return;
    if (arr[0] instanceof L.LatLng) {
      rings.push(arr as L.LatLng[]);
    } else {
      arr.forEach((item: any) => flatten(item));
    }
  };
  flatten(polyLatLngs);

  const x = latlng.lng;
  const y = latlng.lat;

  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lng,
        yi = ring[i].lat;
      const xj = ring[j].lng,
        yj = ring[j].lat;
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
};

interface LayerDef {
  id: string;
  label: string;
  wms: string;
  date?: string;
  pages: string[]; // list of page paths where this layer should be available, e.g. ["/", "/flood", "/weather"]
}

// ── Layer panel definitions (matches screenshot) ──────────────────────────────
const today = new Date().toLocaleDateString("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const LAYER_GROUPS: { title: string; layers: LayerDef[] }[] = [
  {
    title: "FORECASTS",
    layers: [
      // flood monitor tab only
      {
        id: "flood",
        label: "Flood Forecast",
        wms: "flood_20260301_24h",
        date: today,
        pages: ["flood"],
      },
      // weather forecast tab only
      {
        id: "rainfall",
        label: "Rainfall (CHIRPS-GEFS)",
        wms: "chirps_gefs",
        date: today,
        pages: ["weather"],
      },
      {
        id: "heat_stress",
        label: "Heat Stress WBGT",
        wms: "wbgt",
        date: today,
        pages: ["weather"],
      },
      {
        id: "tmax",
        label: "Max Temp (Tmax)",
        wms: "chirts_tmax_20260428",
        date: today,
        pages: ["weather"],
      },
    ],
  },
  {
    title: "BOUNDARIES",
    layers: [
      { id: "country", label: "Country", wms: "country", pages: ["*"] },
      { id: "districts", label: "Districts", wms: "districts", pages: ["*"] },
    ],
  },
  {
    title: "HYDROLOGY",
    layers: [
      { id: "rivers", label: "Rivers", wms: "rivers", pages: ["flood"] },
      {
        id: "waterways",
        label: "Waterways",
        wms: "waterways",
        pages: ["flood"],
      },
      {
        id: "water_bodies",
        label: "Water Bodies",
        wms: "water_bodies",
        pages: ["flood"],
      },
    ],
  },
  {
    title: "INFRASTRUCTURE",
    layers: [
      { id: "roads", label: "Roads", wms: "roads", pages: ["*"] },
      { id: "places", label: "Places", wms: "places", pages: ["*"] },
      { id: "landuse", label: "Land Use", wms: "landuse", pages: ["*"] },
      { id: "buildings", label: "Buildings", wms: "buildings", pages: ["*"] },
    ],
  },
  // {
  //   title: "POPULATION",
  //   layers: [
  //     { id: "worldpop", label: "World Pop", wms: "worldpop", pages: ["*"] },
  //   ],
  // },
];

export default function UgandaBoundaryMap({
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
  const { selectedParameter, dateRange, currentPage, sliderhourIndexValue } =
    useAppStore((state) => state);
  // ── Refs ────────────────────────────────────────────────────────────────────
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const districtLayerRef = useRef<L.GeoJSON | null>(null);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const riverLayerRef = useRef<L.GeoJSON | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const rasterLayerRef = useRef<L.TileLayer | null>(null);
  const wmsLayersRef = useRef<Record<string, L.TileLayer.WMS>>({});

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());

  const GEO_SERVER_URL = `https://multihazard.rosewillbome.com/geoserver/wfews/wms`;

  // ── Data ────────────────────────────────────────────────────────────────────
  // const { data: geoDataa, isLoading } = useQuery<FeatureCollection>({
  //   queryKey: ["ugandaBoundary"],
  //   queryFn: geoAPI.getUgandaBoundary,
  // });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const isValidGeoJSON = (data: any): boolean =>
    data &&
    data.type === "FeatureCollection" &&
    Array.isArray(data.features) &&
    data.features.length > 0;

  // Draw / replace the blue boundary highlight around a district
  const drawBoundary = (geojson: any, color: string) => {
    if (!mapRef.current) return;
    if (boundaryLayerRef.current) {
      mapRef.current.removeLayer(boundaryLayerRef.current);
      boundaryLayerRef.current = null;
    }
    boundaryLayerRef.current = L.geoJSON(geojson, {
      style: { color, weight: 4, fill: false },
    })
      .addTo(mapRef.current)
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
    const textHeight = fontSize;
    const paddedW = textWidth + padding * 2;
    const paddedH = textHeight + padding * 2;

    return paddedW <= availableWidth && paddedH <= availableHeight;
  };

  // Toggle a panel layer on/off
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
          layers: `wfews:${layerDef.wms}`,
          format: "image/png",
          transparent: true,
          version: "1.1.0",
          opacity: 1.0,
        })
        .addTo(mapRef.current);
      wmsLayer.bringToFront();
      wmsLayersRef.current[layerDef.id] = wmsLayer;
      setActiveLayers((prev) => new Set(prev).add(layerDef.id));
    }
  };

  // ── Initialise map once geoData arrives ────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || !geoData) return;
    if (!isValidGeoJSON(geoData)) {
      console.error("UgandaBoundaryMap: invalid GeoJSON:", geoData);
      return;
    }

    // Destroy stale instance (StrictMode / hot-reload safetyy)
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // ── Tile layer ────────────────────────────────────────────────────────
    const tileUrl = isDarkMode
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    tileLayerRef.current = L.tileLayer(tileUrl);

    mapRef.current = L.map(mapContainerRef.current, {
      center: [1.3733, 32.2903],
      zoom,
      minZoom,
      layers: [tileLayerRef.current],
      zoomControl: false,
      attributionControl: false,
    });

    // ── District boundary polygons — gray thin borders ────────────────────
    districtLayerRef.current = L.geoJSON(geoData, {
      style: { color: "gray", weight: 0.3, fill: false },
    }).addTo(mapRef.current);

    // ── District name labels ──────────────────────────────────────────────
    // Exact port from reference: calls doesNameFitInLeafletBoundary,
    // binds tooltip, opens it, and calls bringToFront() — then chains
    // .addTo(mapRef.current) at the end of eachLayer like the reference does.
    const updateLabelVisibility = () => {
      if (!mapRef.current || !districtLayerRef.current) return;

      districtLayerRef.current.eachLayer((layer: any) => {
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

    mapRef.current.on("zoomend", updateLabelVisibility);
    updateLabelVisibility();

    // ── Click → highlight clicked district (ray-casting, not bounding box) ─
    // Reference uses getBounds().contains() which gives rectangles.
    // We use isPointInPolygon() so the highlight matches the actual shape.
    mapRef.current.on("click", (ev: L.LeafletMouseEvent) => {
      let clickedFeature: any = null;

      districtLayerRef.current?.eachLayer((layer: any) => {
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

      // Highlight only the clicked feature — pass the single Feature directly
      if (boundaryLayerRef.current) {
        mapRef.current!.removeLayer(boundaryLayerRef.current);
        boundaryLayerRef.current = null;
      }
      boundaryLayerRef.current = L.geoJSON(clickedFeature, {
        style: { color: "#308DE0", weight: 4, fill: false },
      })
        .addTo(mapRef.current!)
        .bringToFront();
    });

    // ── Water / lake overlay (from reference) ─────────────────────────────
    if (riverLayerRef.current) {
      mapRef.current.removeLayer(riverLayerRef.current);
      riverLayerRef.current = null;
    }
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
          if (waterName) {
            layer.bindTooltip(waterName, {
              permanent: true,
              direction: "center",
              className: "waterAreas-label",
            });
            // layer.bringToFront();
          }
        },
      }).addTo(mapRef.current);
      riverLayerRef.current.bringToBack();
    }

    // ── ResizeObserver ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap tile layer on dark mode toggle ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    mapRef.current.removeLayer(tileLayerRef.current);
    const tileUrl = isDarkMode
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    tileLayerRef.current = L.tileLayer(tileUrl).addTo(mapRef.current);
    tileLayerRef.current.bringToBack();
  }, [isDarkMode]);

  // ── Highlight district when `district` prop changes externally ──────────────
  useEffect(() => {
    if (!mapRef.current || !geoData || !isValidGeoJSON(geoData)) return;

    if (
      !district ||
      district.trim() === "" ||
      district.trim().toLowerCase() === "all"
    ) {
      if (boundaryLayerRef.current) {
        mapRef.current.removeLayer(boundaryLayerRef.current);
        boundaryLayerRef.current = null;
      }
      return;
    }

    const matched = geoData.features.filter(
      (f: any) => f?.properties?.name === capitalize(district.toLowerCase()),
    );
    if (!matched.length) return;

    drawBoundary({ type: "FeatureCollection", features: matched }, FAO_BLUE);
  }, [district, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── getTheBounds: fit viewport to a named district (from reference) ─────────
  // Mirrors the third useEffect in UgandaMap — fits map bounds to a district
  // and locks the viewport to it, or resets to full Uganda view when "all".
  useEffect(() => {
    if (!mapRef.current || !geoData || !isValidGeoJSON(geoData)) return;
    if (!getTheBounds || getTheBounds.trim().length === 0) return;

    if (
      getTheBounds.trim().toLowerCase() === "all" ||
      getTheBounds.trim() === ""
    ) {
      if (boundaryLayerRef.current) {
        mapRef.current.removeLayer(boundaryLayerRef.current);
        boundaryLayerRef.current = null;
      }
      mapRef.current.setView([1.3733, 32.2903], zoom);
      mapRef.current.setMinZoom(minZoom);
      return;
    }

    const matched = geoData.features.filter(
      (f: any) =>
        f?.properties?.name === capitalize(getTheBounds.toLowerCase()),
    );
    if (!matched.length) return;

    const updatedGeoJSON = { ...geoData, features: matched };

    if (boundaryLayerRef.current) {
      mapRef.current.removeLayer(boundaryLayerRef.current);
      boundaryLayerRef.current = null;
    }

    boundaryLayerRef.current = L.geoJSON(updatedGeoJSON, {
      style: { color: "blue", weight: 4, fill: false },
    })
      .addTo(mapRef.current)
      .bringToBack();

    const bounds = boundaryLayerRef.current.getBounds();
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds);
      mapRef.current.setMaxBounds(bounds);
    }
  }, [getTheBounds, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update the raster layer when indicator, month, or timerange changes
  // ── Raster layer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    if (rasterLayerRef.current) {
      mapRef.current.removeLayer(rasterLayerRef.current);
      rasterLayerRef.current = null;
    }

    const hour =
      sliderhourIndexValue === "000"
        ? "00"
        : String(sliderhourIndexValue).padStart(2, "0");

    const layerName =
      mapLayerName({
        parameter: selectedParameter,
        date: dateRange,
        mode: "nowcast",
        hour,
      }) ??
      mapLayerName({
        parameter: selectedParameter,
        date: dateRange,
        mode: "nowcast",
      });

    if (!layerName) return;

    console.log("layerName", layerName);

    rasterLayerRef.current = L.tileLayer
      .wms(GEO_SERVER_URL, {
        layers: layerName,
        format: "image/png",
        transparent: true,
        version: "1.1.0",
        opacity: 1.0,
      })
      .addTo(mapRef.current);
  }, [geoData, selectedParameter, dateRange, sliderhourIndexValue]);

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
    <div className={`relative overflow-hidden ${className}`}>
      {/* Map container — always in DOM, never conditionally rendered */}
      <div
        ref={mapContainerRef}
        style={{
          position: "absolute",
          inset: 0,
          background: isDarkMode ? "#0f172a" : "#f1f5f9",
        }}
      />

      {/* Loading overlay — sits on top until geoData arrivess */}
      {!geoData && (
        <div
          className={`absolute inset-0 z-[500] flex items-center justify-center ${
            isDarkMode ? "bg-slate-900/80" : "bg-white/80"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{
                borderColor: `${FAO_BLUE}30`,
                borderTopColor: FAO_BLUE,
              }}
            />
            <span
              className={`text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
            >
              Loading map…
            </span>
          </div>
        </div>
      )}

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

      {/* Layer panel */}
      {showLayerPanel && (
        <>
          {/* Backdrop — closes panel on outside click */}
          <div
            className="fixed inset-0 z-1"
            onClick={() => setShowLayerPanel(false)}
          />

          <div
            className={`
              absolute top-10 right-2 z-[700] w-64 overflow-y-auto  rounded-xl shadow-xl
              flex flex-col
              ${isDarkMode ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"}
            `}
            style={{
              // Panel grows with content but never exceeds 70% of viewport height
              maxHeight: "90%",
            }}
          >
            {/* Panel header — always visible */}
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
                className={`p-0.5 rounded transition-colors ${isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
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
                        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors select-none ${isDarkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-50"}`}
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
                            className={`text-xs ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}
                          >
                            {layerDef.label}
                          </span>
                        </div>

                        {/* Date badge */}
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

      {/* Legend */}
      {legendTitle && legendItems.length > 0 && (
        <div
          className={`absolute bottom-2 left-2 z-[400] rounded-lg p-2 shadow-sm ${
            isDarkMode ? "bg-slate-800/90" : "bg-white/90"
          }`}
        >
          <div
            className={`mb-1 text-[10px] font-medium ${
              isDarkMode ? "text-slate-300" : "text-slate-700"
            }`}
          >
            {legendTitle}
          </div>
          <div className="space-y-1">
            {legendItems.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span
                  className={`text-[9px] ${
                    isDarkMode ? "text-slate-400" : "text-slate-600"
                  }`}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leaflet label styles */}
      <style>{`
        .district-label {
          background:     transparent !important;
          border:         none !important;
          box-shadow:     none !important;
          font-size:      11px;
          font-weight:    500;
          color:          ${isDarkMode ? "#94a3b8" : "#475569"};
          white-space:    nowrap;
          pointer-events: none;
        }
        .waterAreas-label {
          background:     transparent !important;
          border:         none !important;
          box-shadow:     none !important;
          font-size:      10px;
          color:          #5b9bd5;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
