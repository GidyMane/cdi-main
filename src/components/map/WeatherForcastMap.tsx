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
  formatDate,
  getLayerGroups,
  getValueColor,
  isPointInPolygon,
  isValidGeoJSON,
  makeMarkerHtml,
  mapLayerName,
  PARAM_LEGENDS,
} from "@/utils/woker_fn";
import { geoData } from "@/utils/geodata";
import { clippedWms } from "./clippedWmsLayer";
import { weatherAPI } from "@/services/api";
import { API_BASE, GEOSERVER_WFEWS_WMS, GEOSERVER_WEATHER_WMS } from "@/config";
import type {
  district,
  LayerDef,
  UgandaBoundaryMapProps,
} from "@/types/data_types";

const FAO_BLUE = "#318DDE";
const GEO_SERVER_URL = GEOSERVER_WFEWS_WMS;

// Local Uganda Weather GeoServer (ICON, GFS, IMERG satellite precipitation)
const LOCAL_GEO_SERVER_URL = GEOSERVER_WEATHER_WMS;

/** Shared WMS options used for every raster layer */
const WMS_BASE_OPTIONS = {
  format: "image/png" as const,
  transparent: true,
  version: "1.1.0",
  opacity: 0.85,
};

/** Map layer names to their GeoServer SLD style names */
const LAYER_STYLE_MAP: Record<string, string> = {
  precipitation: "precipitation_style",
  temperature_2m: "temperature_2m_style",
  humidity: "humidity_style",
  wind_u_10m: "wind_u_10m_style",
  wind_v_10m: "wind_v_10m_style",
  cloud_cover: "cloud_cover_style",
  pressure_msl: "pressure_msl_style",
  gfs_precipitation: "precipitation_style",
  gfs_temperature_2m: "temperature_2m_style",
  gfs_humidity: "humidity_style",
  gfs_wind_u_10m: "wind_u_10m_style",
  gfs_wind_v_10m: "wind_v_10m_style",
  gfs_cloud_cover: "cloud_cover_style",
  gfs_pressure_msl: "pressure_msl_style",
  imerg_precip: "precipitation_style",
};

/** Get WMS options with the correct style for a layer */
function getWmsOptions(layerName: string, opacity = 0.85) {
  return {
    ...WMS_BASE_OPTIONS,
    layers: layerName,
    styles: LAYER_STYLE_MAP[layerName] || "",
    opacity,
  };
}

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

  const [_selectedForcastData, setSelectedForcastData] = useState<
    string | null
  >(null);
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
      // Toggle off — remove the layer
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
      // Remove any existing weather raster layer first (one at a time)
      // Keep boundary/infrastructure layers (country, districts, rivers, etc.)
      const keepLayers = new Set([
        "country",
        "districts",
        "rivers",
        "waterways",
        "water_bodies",
        "roads",
        "places",
        "landuse",
        "buildings",
      ]);
      for (const [id, layer] of Object.entries(
        weatherforcastwmsLayersRef.current,
      )) {
        if (!keepLayers.has(id)) {
          weatherforcastMapRef.current.removeLayer(layer);
          delete weatherforcastwmsLayersRef.current[id];
        }
      }
      // Also clear the raster layer ref if active
      clearLayer(weatherforcastMapRef.current, weatherforcastrasterLayerRef);

      // tmax / tmin are handled via the raster useEffect; skip adding a WMS layer here
      if (layerDef.id !== "tmax" && layerDef.id !== "tmin") {
        // Route to local GeoServer for ICON/GFS/IMERG layers
        const isLocal = layerDef.wms.startsWith("local:");
        const serverUrl = isLocal ? LOCAL_GEO_SERVER_URL : GEO_SERVER_URL;
        const layerName = isLocal
          ? layerDef.wms.replace("local:", "")
          : `wfews:${layerDef.wms}`;

        const wmsLayer = clippedWms(serverUrl, {
          layers: layerName,
          format: "image/png",
          transparent: true,
          version: "1.1.0",
          opacity: isLocal ? 0.75 : 1.0,
        }).addTo(weatherforcastMapRef.current);
        wmsLayer.bringToFront();
        weatherforcastwmsLayersRef.current[layerDef.id] = wmsLayer as any;
      }
      // Replace active set with only keep layers + the new one
      setActiveLayers((prev) => {
        const next = new Set([...prev].filter((id) => keepLayers.has(id)));
        next.add(layerDef.id);
        return next;
      });
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
    // clearLayer(weatherforcastMapRef.current, weatherforcastriverLayerRef);
    // if (waterAreas) {
    //   weatherforcastriverLayerRef.current = L.geoJSON(waterAreas as any, {
    //     style: {
    //       color: "#d2efff",
    //       weight: 0.1,
    //       fillColor: "#d2efff",
    //       fillOpacity: 0.3,
    //     },
    //     onEachFeature(feature, layer: any) {
    //       const waterName = feature.properties?.NAME;
    //       if (waterName) {
    //         layer.bindTooltip(waterName, {
    //           permanent: true,
    //           direction: "center",
    //           className: "waterAreas-label",
    //         });
    //         // layer.bringToFront();
    //       }
    //     },
    //   }).addTo(weatherforcastMapRef.current);
    //   weatherforcastriverLayerRef.current.bringToBack();
    // }

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
        opacity: 0.92,
      })
      .addTo(weatherforcastMapRef.current);
    countryWms.bringToFront();
    weatherforcastwmsLayersRef.current["country"] = countryWms;

    // The raster layer useEffect will load the initial weather layer
    // based on the current selectedParameter — no need to add one here.

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

  // ── Zoom.earth-style raster animation system ────────────────────────────────
  // Pre-loads all frames as WMS layers, then rapidly toggles visibility for
  // smooth rainfall/wind animation without per-frame network requests.

  const framesRef = useRef<{
    model: string;
    param: string;
    frames: any[];
    wmsUrl: string;
  } | null>(null);

  // Only ONE active raster layer at a time
  const activeFrameHourRef = useRef<number>(-1);
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch frame metadata when model or parameter changes
  useEffect(() => {
    const paramMap: Record<string, string> = {
      rainfall: "precipitation",
      precipitation: "precipitation",
      temperature: "temperature",
      wind: "wind-u",
      humidity: "humidity",
      cloud_cover: "cloud-cover",
      clouds: "cloud-cover",
      pressure: "pressure",
    };
    const apiParam =
      paramMap[selectedParameter?.toLowerCase()] ||
      selectedParameter?.toLowerCase();
    const model = layerMode === "forecast" ? "gfs" : "icon";

    // Remove current raster layer
    if (weatherforcastMapRef.current) {
      clearLayer(weatherforcastMapRef.current, weatherforcastrasterLayerRef);
    }
    activeFrameHourRef.current = -1;

    setRasterIsLoading(true);

    weatherAPI
      .getRasterFrames(model, apiParam)
      .then((data) => {
        framesRef.current = {
          model,
          param: apiParam,
          frames: data.frames,
          wmsUrl: LOCAL_GEO_SERVER_URL,
        };

        if (!weatherforcastMapRef.current || !data.frames.length) {
          setRasterIsLoading(false);
          return;
        }

        // Show the first frame only — use base layer name for reliability
        const firstFrame = data.frames[0];
        const layerName = firstFrame.wms_layer;

        clearLayer(weatherforcastMapRef.current!, weatherforcastrasterLayerRef);
        weatherforcastrasterLayerRef.current = clippedWms(
          LOCAL_GEO_SERVER_URL,
          getWmsOptions(layerName, 0.85),
        )
          .on("load", () => setRasterIsLoading(false))
          .on("tileerror", () => setRasterIsLoading(false))
          .addTo(weatherforcastMapRef.current!) as any;
        weatherforcastrasterLayerRef.current!.bringToFront();
        activeFrameHourRef.current = firstFrame.forecast_hour;
      })
      .catch((err) => {
        console.warn("Failed to fetch raster frames:", err);
        framesRef.current = null;
        setRasterIsLoading(false);
        // Fallback
        const layerName = mapLayerName({
          parameter: selectedParameter,
          date: dateRange,
          mode: layerMode === "forecast" ? "forecast" : "daily",
        });
        if (layerName && weatherforcastMapRef.current) {
          clearLayer(
            weatherforcastMapRef.current,
            weatherforcastrasterLayerRef,
          );
          const isLocal = layerName.startsWith("local:");
          const serverUrl = isLocal ? LOCAL_GEO_SERVER_URL : GEO_SERVER_URL;
          const wmsLayerName = isLocal
            ? layerName.replace("local:", "")
            : layerName;
          weatherforcastrasterLayerRef.current = clippedWms(
            serverUrl,
            getWmsOptions(wmsLayerName),
          )
            .on("loading", () => setRasterIsLoading(true))
            .on("load", () => setRasterIsLoading(false))
            .addTo(weatherforcastMapRef.current) as any;
          weatherforcastrasterLayerRef.current!.bringToFront();
        }
      });

    return () => {
      // Cleanup animation on parameter/model change
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [selectedParameter, layerMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Show frame matching current hour (single layer swap) ─────────────────────
  useEffect(() => {
    if (!weatherforcastMapRef.current || !framesRef.current) return;

    const cached = framesRef.current;
    if (!cached.frames.length) return;

    const hour =
      sliderhourIndexValue === "000"
        ? 0
        : parseInt(String(sliderhourIndexValue), 10) || 0;
    const targetDate = dateRange || new Date().toISOString().split("T")[0];

    // Find best matching frame
    let bestFrame = cached.frames[0];
    let bestDiff = Infinity;
    for (const frame of cached.frames) {
      const runDate = new Date(frame.run);
      const effectiveTime = new Date(
        runDate.getTime() + frame.forecast_hour * 3600000,
      );
      const targetTime = new Date(
        `${targetDate}T${String(hour).padStart(2, "0")}:00:00Z`,
      );
      const diff = Math.abs(effectiveTime.getTime() - targetTime.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestFrame = frame;
      }
    }

    const targetHour = bestFrame.forecast_hour;
    if (targetHour === activeFrameHourRef.current) return;

    // Remove old layer, add new one with slide-in animation
    const map = weatherforcastMapRef.current!;
    const prevLayer = weatherforcastrasterLayerRef.current;

    // Always use the base layer name — per-frame layers may not be published
    const layerName = bestFrame.wms_layer;

    const newLayer = clippedWms(cached.wmsUrl, {
      ...getWmsOptions(layerName, 0),
    })
      .on("load", () => {
        setRasterIsLoading(false);
        // Slide-in: fade from 0 to 0.85 over 400ms
        let opacity = 0;
        const step = 0.85 / 8; // 8 steps × 50ms = 400ms
        const fadeIn = setInterval(() => {
          opacity += step;
          if (opacity >= 0.85) {
            opacity = 0.85;
            clearInterval(fadeIn);
            // Remove old layer after transition
            if (prevLayer && map.hasLayer(prevLayer)) {
              map.removeLayer(prevLayer);
            }
          }
          try {
            (newLayer as any).setOpacity(opacity);
          } catch {}
        }, 50);
      })
      .on("tileerror", () => setRasterIsLoading(false))
      .addTo(map) as any;
    newLayer.bringToFront();

    weatherforcastrasterLayerRef.current = newLayer;
    activeFrameHourRef.current = targetHour;
  }, [sliderhourIndexValue, dateRange, forecastStep]);

  // ── Zoom.earth-style rapid animation (triggered by play button) ─────────────
  // The FloodHourSlider advances the hour — the effect above swaps the layer.

  // ── Weather district markers — real data from weather/map API ──────────────
  const districtWeatherRef = useRef<Record<string, any>>({});

  useEffect(() => {
    if (!weatherforcastMapRef.current || !geoData?.features) return;

    const param = selectedParameter?.toLowerCase() ?? "";
    const config = PARAM_LEGENDS[param];
    if (!config) return;

    // Fetch real weather data for all districts
    const paramApiMap: Record<string, string> = {
      temperature: "temperature",
      rainfall: "rainfall",
      precipitation: "rainfall",
      humidity: "humidity",
      wind: "wind_speed",
    };
    const apiParam = paramApiMap[param] || "temperature";

    fetch(`${API_BASE}weather/map/?parameter=${apiParam}`)
      .catch(() => null)
      .then((res) => res?.json?.())
      .then((data) => {
        if (!data?.features || !weatherforcastMapRef.current) return;

        // Build lookup: district_name → value
        const lookup: Record<string, number | null> = {};
        for (const feature of data.features) {
          const props = feature.properties;
          lookup[props.district_name?.toLowerCase()] = props.value;
        }
        districtWeatherRef.current = lookup;

        // Clear old markers
        weatherMarkersRef.current.forEach((m) => m.remove());
        weatherMarkersRef.current = [];

        // Show marker for the selected district; fall back to Kampala
        const target =
          getTheBounds?.trim() && getTheBounds.trim().toLowerCase() !== "all"
            ? getTheBounds.trim()
            : "Kampala";

        (geoData.features as any[]).forEach((feature) => {
          const name: string = feature?.properties?.name ?? "";
          if (!name.toLowerCase().includes(target.toLowerCase())) return;

          const center = L.geoJSON(feature).getBounds().getCenter();
          const realValue = lookup[name.toLowerCase()];
          const value =
            realValue != null ? Math.round(realValue * 10) / 10 : null;

          if (value == null) return; // Skip districts with no data

          const color = getValueColor(value, param);
          const marker = L.marker(center, {
            icon: L.divIcon({
              className: "",
              html: makeMarkerHtml(
                name,
                Math.round(value),
                config.unit,
                color,
                param,
              ),
              iconSize: [1, 1],
              iconAnchor: [0, 0],
            }),
            interactive: false,
            zIndexOffset: 200,
          }).addTo(weatherforcastMapRef.current!);
          weatherMarkersRef.current.push(marker);
        });
      })
      .catch(() => {
        // Fallback: clear markers if API fails
        weatherMarkersRef.current.forEach((m) => m.remove());
        weatherMarkersRef.current = [];
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
          background: isDarkMode ? "#07111f" : "#dceaf4",
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

      {/* Forecast status */}
      <div className="absolute top-2 left-2 z-[500] flex items-center gap-2">
        <span className="rounded bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur-md">
          {badgeText}
        </span>
        <span className="rounded bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-100 shadow-lg backdrop-blur-md">
          {layerMode === "forecast" ? "GFS" : "ICON"}{" "}
          {selectedParameter ?? "Temperature"} · UTC
        </span>
      </div>

      {/* ── Model Switcher (zoom.earth style) ─────────────────────────────── */}
      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] flex items-center rounded-full overflow-hidden shadow-lg"
        style={{
          background: "rgba(10,15,30,0.45)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {(
          [
            { id: "icon", label: "ICON" },
            { id: "gfs", label: "GFS" },
            { id: "imerg", label: "Satellite" },
          ] as const
        ).map((model) => {
          const isSelected = (() => {
            if (model.id === "imerg") return activeLayers.has("imerg_precip");
            if (model.id === "gfs") return layerMode === "forecast";
            return layerMode === "nowcast" && !activeLayers.has("imerg_precip");
          })();
          return (
            <button
              key={model.id}
              onClick={() => {
                if (model.id === "imerg") {
                  // Toggle IMERG satellite layer
                  const imergLayer = LAYER_GROUPS.flatMap((g) => g.layers).find(
                    (l) => l.id === "imerg_precip",
                  );
                  if (imergLayer) toggleLayer(imergLayer);
                } else if (model.id === "gfs") {
                  useAppStore.getState().setLayerMode("forecast");
                } else {
                  useAppStore.getState().setLayerMode("nowcast");
                }
              }}
              className="px-4 py-1.5 text-[11px] font-bold tracking-wide transition-all whitespace-nowrap"
              style={{
                backgroundColor: isSelected ? FAO_BLUE : "transparent",
                color: isSelected ? "#fff" : "rgba(255,255,255,0.6)",
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
          background: "rgba(10,15,30,0.45)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.1)",
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
                backgroundColor: isActive ? `${FAO_BLUE}` : "transparent",
              }}
            >
              <Icon
                className="w-4 h-4"
                style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.55)" }}
              />
            </button>
          );
        })}
        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="flex items-center justify-center w-[34px] h-[34px] transition-all border-t border-white/10"
        >
          {isFullscreen ? (
            <Minimize2
              className="w-4 h-4"
              style={{ color: "rgba(255,255,255,0.55)" }}
            />
          ) : (
            <Maximize2
              className="w-4 h-4"
              style={{ color: "rgba(255,255,255,0.55)" }}
            />
          )}
        </button>
      </div>

      {/* ── MAP LAYERS toggle + Zoom (top-right) ──────────────────────────── */}
      <button
        onClick={() => setShowLayerPanel((v) => !v)}
        className="absolute top-2 right-2 z-[500] flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold shadow-md transition-all"
        style={{
          backgroundColor: showLayerPanel ? FAO_BLUE : "rgba(10,15,30,0.45)",
          color: showLayerPanel ? "#ffffff" : "rgba(255,255,255,0.8)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <Layers className="w-3.5 h-3.5" />
        Layers
      </button>

      {/* Zoom controls */}
      <div
        className="absolute top-[46px] right-2 z-[500] flex flex-col rounded-lg overflow-hidden shadow-lg"
        style={{
          background: "rgba(10,15,30,0.45)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.1)",
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
            className="flex items-center justify-center w-[30px] h-[30px] transition-all hover:bg-white/10"
            style={{
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.1)" : undefined,
            }}
          >
            <Icon
              className="w-3.5 h-3.5"
              style={{ color: "rgba(255,255,255,0.7)" }}
            />
          </button>
        ))}
      </div>

      {/* Layer panel */}
      <AnimatePresence>
        {showLayerPanel && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[600]"
              onClick={() => setShowLayerPanel(false)}
            />

            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
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
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
            className="absolute bottom-4 left-2 z-[400] px-3 py-2.5 rounded-xl shadow-lg"
            style={{
              background: "rgba(8,12,24,0.45)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.1)",
              minWidth: 172,
            }}
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
                style={{ color: accentColor }}
              >
                {config.unit}
              </span>
            </div>
            {/* Gradient bar */}
            <div
              className="h-2.5 rounded-full w-full"
              style={{
                background: `linear-gradient(to right, ${gradientStops})`,
              }}
            />
            {/* Value labels */}
            <div className="flex justify-between mt-1">
              {config.stops.map((s) => (
                <span
                  key={s.label}
                  className="text-[8px] font-medium"
                  style={{ color: "rgba(255,255,255,0.55)" }}
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
          const realValue =
            districtWeatherRef.current[hoveredDistrictName.toLowerCase()];
          const value =
            config && realValue != null
              ? Math.round(realValue * 10) / 10
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
