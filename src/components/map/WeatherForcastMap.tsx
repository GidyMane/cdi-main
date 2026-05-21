// import { useEffect, useRef, useState } from "react";
// import L from "leaflet";
// import "leaflet/dist/leaflet.css";
// // import { geoAPI } from "../../services/api";
// import { waterAreas } from "../../utils/waterAreas";
// import { capitalize } from "../../utils/capitalize";
// // import { useQuery } from "@tanstack/react-query";
// import type { FeatureCollection } from "geojson";
// import { useAppStore } from "@/store/useAppStore";
// import { X, Layers } from "lucide-react";
// import { FLOOD_HOURS } from "../shared/FloodHourSlider";
// import { removeLastTwoDigits } from "@/utils/woker_fn";
// import { geoData } from "@/utils/geodata";



// interface LegendItem {
//   label: string;
//   color: string;
// }

// interface UgandaBoundaryMapProps {
//   className?: string;
//   isDarkMode: boolean;
//   badgeText?: string;
//   legendTitle?: string;
//   legendItems?: LegendItem[];
//   district?: string;
//   setDistrict?: (name: string) => void;
//   getTheBounds?: string; // from reference: fits map to a named district
//   zoom?: number;
//   minZoom?: number;
// }

// const FAO_BLUE = "#318DDE";

// // ── Ray-casting point-in-polygon ──────────────────────────────────────────────
// // Tests whether a LatLng lies inside the actual polygon shape (not bounding box).
// // Handles both Polygon and MultiPolygon by flattening nested LatLng arrays.
// const isPointInPolygon = (latlng: L.LatLng, polyLatLngs: any): boolean => {
//   const rings: L.LatLng[][] = [];

//   const flatten = (arr: any) => {
//     if (!Array.isArray(arr) || arr.length === 0) return;
//     if (arr[0] instanceof L.LatLng) {
//       rings.push(arr as L.LatLng[]);
//     } else {
//       arr.forEach((item: any) => flatten(item));
//     }
//   };
//   flatten(polyLatLngs);

//   const x = latlng.lng;
//   const y = latlng.lat;

//   for (const ring of rings) {
//     let inside = false;
//     for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
//       const xi = ring[i].lng,
//         yi = ring[i].lat;
//       const xj = ring[j].lng,
//         yj = ring[j].lat;
//       const intersect =
//         yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
//       if (intersect) inside = !inside;
//     }
//     if (inside) return true;
//   }
//   return false;
// };

// interface LayerDef {
//   id: string;
//   label: string;
//   wms: string;
//   date?: string;
//   pages: string[]; // list of page paths where this layer should be available, e.g. ["/", "/flood", "/weather"]
// }

// // ── Layer panel definitions (matches screenshot) ──────────────────────────────
// const today = new Date().toLocaleDateString("en-GB", {
//   day: "2-digit",
//   month: "short",
//   year: "numeric",
// });

// const LAYER_GROUPS: { title: string; layers: LayerDef[] }[] = [
//   {
//     title: "FORECASTS",
//     layers: [
//       // flood monitor tab only
//       {
//         id: "flood",
//         label: "Flood Forecast",
//         wms: "flood_20260301_24h",
//         date: today,
//         pages: ["flood"],
//       },
//       // weather forecast tab only
//       {
//         id: "rainfall",
//         label: "Rainfall (CHIRPS-GEFS)",
//         wms: "chirps_gefs",
//         date: today,
//         pages: ["weather"],
//       },
//       {
//         id: "heat_stress",
//         label: "Heat Stress WBGT",
//         wms: "wbgt",
//         date: today,
//         pages: ["weather"],
//       },
//       {
//         id: "tmax",
//         label: "Max Temp (Tmax)",
//         wms: "chirts_tmax_20260428",
//         date: today,
//         pages: ["weather"],
//       },
//     ],
//   },
//   {
//     title: "BOUNDARIES",
//     layers: [
//       { id: "country", label: "Country", wms: "country", pages: ["*"] },
//       { id: "districts", label: "Districts", wms: "districts", pages: ["*"] },
//     ],
//   },
//   {
//     title: "HYDROLOGY",
//     layers: [
//       { id: "rivers", label: "Rivers", wms: "rivers", pages: ["flood"] },
//       {
//         id: "waterways",
//         label: "Waterways",
//         wms: "waterways",
//         pages: ["flood"],
//       },
//       {
//         id: "water_bodies",
//         label: "Water Bodies",
//         wms: "water_bodies",
//         pages: ["flood"],
//       },
//     ],
//   },
//   {
//     title: "INFRASTRUCTURE",
//     layers: [
//       { id: "roads", label: "Roads", wms: "roads", pages: ["*"] },
//       { id: "places", label: "Places", wms: "places", pages: ["*"] },
//       { id: "landuse", label: "Land Use", wms: "landuse", pages: ["*"] },
//       { id: "buildings", label: "Buildings", wms: "buildings", pages: ["*"] },
//     ],
//   },
//   // {
//   //   title: "POPULATION",
//   //   layers: [
//   //     { id: "worldpop", label: "World Pop", wms: "worldpop", pages: ["*"] },
//   //   ],
//   // },
// ];

// export default function WeatherForcastMap({
//   className = "",
//   isDarkMode,
//   badgeText = "Uganda",
//   legendTitle,
//   legendItems = [],
//   district,
//   setDistrict,
//   getTheBounds,
//   zoom = 6.8,
//   minZoom = 6.8,
// }: UgandaBoundaryMapProps) {
//   const { selectedParameter, dateRange, currentPage,sliderhourIndexValue} = useAppStore(
//     (state) => state,
//   );
//   // ── Refs ────────────────────────────────────────────────────────────────────
//   const mapWeatherforcastContainerRef = useRef<HTMLDivElement>(null);
//   const weatherforcastMapRef = useRef<L.Map | null>(null);
//   const weatherforcastdistrictLayerRef = useRef<L.GeoJSON | null>(null);
//   const weatherforcastboundaryLayerRef = useRef<L.GeoJSON | null>(null);
//   const weatherforcastriverLayerRef = useRef<L.GeoJSON | null>(null);
//   const weatherforcasttileLayerRef = useRef<L.TileLayer | null>(null);
//   const weatherforcastrasterLayerRef = useRef<L.TileLayer | null>(null);
//   const weatherforcastwmsLayersRef = useRef<Record<string, L.TileLayer.WMS>>({});

//   // ── UI state ────────────────────────────────────────────────────────────────
//   const [showLayerPanel, setShowLayerPanel] = useState(false);
//   const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
//   const [isRasterLoading, setRasterIsLoading] = useState(false);

//   const GEO_SERVER_URL = `https://multihazard.rosewillbome.com/geoserver/wfews/wms`;

//   // ── Data ────────────────────────────────────────────────────────────────────
//   // const { data: geoDataa, isLoading } = useQuery<FeatureCollection>({
//   //   queryKey: ["ugandaBoundary"],
//   //   queryFn: geoAPI.getUgandaBoundary,
//   // });

//   // ── Helpers ─────────────────────────────────────────────────────────────────

//   const isValidGeoJSON = (data: any): boolean =>
//     data &&
//     data.type === "FeatureCollection" &&
//     Array.isArray(data.features) &&
//     data.features.length > 0;

//   // Draw / replace the blue boundary highlight around a district
//   const drawBoundary = (geojson: any, color: string) => {
//     if (!weatherforcastMapRef.current) return;
//     if (weatherforcastboundaryLayerRef.current) {
//       weatherforcastMapRef.current.removeLayer(weatherforcastboundaryLayerRef.current);
//       weatherforcastboundaryLayerRef.current = null;
//     }
//     weatherforcastboundaryLayerRef.current = L.geoJSON(geojson, {
//       style: { color, weight: 4, fill: false },
//     })
//       .addTo(weatherforcastMapRef.current)
//       .bringToBack();
//   };

//   // Check whether a district label fits inside its polygon at current zoom
//   // (exact port of doesNameFitInLeafletBoundary from reference)
//   const doesNameFitInLeafletBoundary = (
//     layer: any,
//     name: string,
//     fontSize = 14,
//     fontFamily = "sans-serif",
//     padding = 5,
//   ): boolean => {
//     if (!weatherforcastMapRef.current) return false;
//     const bounds = layer.getBounds();
//     const topLeft = weatherforcastMapRef.current.latLngToLayerPoint(bounds.getNorthWest());
//     const bottomRight = weatherforcastMapRef.current.latLngToLayerPoint(
//       bounds.getSouthEast(),
//     );
//     const availableWidth = bottomRight.x - topLeft.x;
//     const availableHeight = bottomRight.y - topLeft.y;

//     const canvas = document.createElement("canvas");
//     const ctx = canvas.getContext("2d")!;
//     ctx.font = `${fontSize}px ${fontFamily}`;
//     const textWidth = ctx.measureText(name).width;
//     const textHeight = fontSize;
//     const paddedW = textWidth + padding * 2;
//     const paddedH = textHeight + padding * 2;

//     console.log(
//       "does it fit?",
//       paddedW <= availableWidth && paddedH <= availableHeight,
//     );

//     return paddedW <= availableWidth && paddedH <= availableHeight;
//   };

//   // Toggle a panel layer on/off
//   const toggleLayer = (layerDef: LayerDef) => {
//     if (!weatherforcastMapRef.current) return;

//     if (activeLayers.has(layerDef.id)) {
//       if (weatherforcastwmsLayersRef.current[layerDef.id]) {
//         weatherforcastMapRef.current.removeLayer(weatherforcastwmsLayersRef.current[layerDef.id]);
//         delete weatherforcastwmsLayersRef.current[layerDef.id];
//       }
//       setActiveLayers((prev) => {
//         const next = new Set(prev);
//         next.delete(layerDef.id);
//         return next;
//       });
//     } else {
//       const wmsLayer = L.tileLayer
//         .wms(GEO_SERVER_URL, {
//           layers: `wfews:${layerDef.wms}`,
//           format: "image/png",
//           transparent: true,
//           version: "1.1.0",
//           opacity: 1.0,
//         })
//         .addTo(weatherforcastMapRef.current);
//       wmsLayer.bringToFront();
//       weatherforcastwmsLayersRef.current[layerDef.id] = wmsLayer;
//       setActiveLayers((prev) => new Set(prev).add(layerDef.id));
//     }
//   };

//   // ── Initialise map once geoData arrives ────────────────────────────────────
//   useEffect(() => {
//     if (!mapWeatherforcastContainerRef.current || !geoData) return;
//     if (!isValidGeoJSON(geoData)) {
//       console.error("UgandaBoundaryMap: invalid GeoJSON:", geoData);
//       return;
//     }

//     // Destroy stale instance (StrictMode / hot-reload safetyy)
//     if (weatherforcastMapRef.current) {
//       weatherforcastMapRef.current.remove();
//       weatherforcastMapRef.current = null;
//     }

//     // ── Tile layer ────────────────────────────────────────────────────────
//     const tileUrl = isDarkMode
//       ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
//       : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

//     weatherforcasttileLayerRef.current = L.tileLayer(tileUrl);

//     weatherforcastMapRef.current = L.map(mapWeatherforcastContainerRef.current, {
//       center: [1.3733, 32.2903],
//       zoom,
//       minZoom,
//       layers: [weatherforcasttileLayerRef.current],
//       zoomControl: false,
//       attributionControl: false,
//     });

//     // ── District boundary polygons — gray thin borders ────────────────────
//     weatherforcastdistrictLayerRef.current = L.geoJSON(geoData, {
//       style: { color: "gray", weight: 0.3, fill: false },
//     }).addTo(weatherforcastMapRef.current);

//     // ── District name labels ──────────────────────────────────────────────
//     // Exact port from reference: calls doesNameFitInLeafletBoundary,
//     // binds tooltip, opens it, and calls bringToFront() — then chains
//     // .addTo(weatherforcastMapRef.current) at the end of eachLayer like the reference does.
//     const updateLabelVisibility = () => {
//       if (!weatherforcastMapRef.current || !weatherforcastdistrictLayerRef.current) return;

//       weatherforcastdistrictLayerRef.current.eachLayer((layer: any) => {
//         layer.closeTooltip();
//         const name = layer.feature?.properties?.name;
//         if (!name) return;

//         const fits = doesNameFitInLeafletBoundary(layer, name);
//         if (fits) {
//           layer
//             .bindTooltip(name, {
//               permanent: true,
//               direction: "center",
//               className: "district-label",
//             })
//             .openTooltip();
//           layer.bringToFront();
//         }
//       });
//     };

//     weatherforcastMapRef.current.on("zoomend", updateLabelVisibility);
//     updateLabelVisibility();

//     // ── Click → highlight clicked district (ray-casting, not bounding box) ─
//     // Reference uses getBounds().contains() which gives rectangles.
//     // We use isPointInPolygon() so the highlight matches the actual shape.
//     weatherforcastMapRef.current.on("click", (ev: L.LeafletMouseEvent) => {
//       let clickedFeature: any = null;

//       weatherforcastdistrictLayerRef.current?.eachLayer((layer: any) => {
//         if (clickedFeature) return; // stop after first match

//         if (layer instanceof L.Polygon || (layer as any)) {
//           if (isPointInPolygon(ev.latlng, layer.getLatLngs())) {
//             clickedFeature = layer.feature;
//           }
//         }
//       });

//       if (!clickedFeature) return;

//       if (setDistrict) {
//         setDistrict(clickedFeature.properties.name?.toUpperCase());
//       }

//       // Highlight only the clicked feature — pass the single Feature directly
//       if (weatherforcastboundaryLayerRef.current) {
//         weatherforcastMapRef.current!.removeLayer(weatherforcastboundaryLayerRef.current);
//         weatherforcastboundaryLayerRef.current = null;
//       }
//       weatherforcastboundaryLayerRef.current = L.geoJSON(clickedFeature, {
//         style: { color: "#308DE0", weight: 4, fill: false },
//       })
//         .addTo(weatherforcastMapRef.current!)
//         .bringToFront();
//     });

//     // ── Water / lake overlay (from reference) ─────────────────────────────
//     if (weatherforcastriverLayerRef.current) {
//       weatherforcastMapRef.current.removeLayer(weatherforcastriverLayerRef.current);
//       weatherforcastriverLayerRef.current = null;
//     }
//     if (waterAreas) {
//       weatherforcastriverLayerRef.current = L.geoJSON(waterAreas as any, {
//         style: {
//           color: "#d2efff",
//           weight: 0.1,
//           fillColor: "#d2efff",
//           fillOpacity: 0.8,
//         },
//         onEachFeature(feature, layer: any) {
//           const waterName = feature.properties?.NAME;
//           if (waterName) {
//             layer.bindTooltip(waterName, {
//               permanent: true,
//               direction: "center",
//               className: "waterAreas-label",
//             });
//             // layer.bringToFront();
//           }
//         },
//       }).addTo(weatherforcastMapRef.current);
//       weatherforcastriverLayerRef.current.bringToBack();
//     }

//     // ── ResizeObserver ────────────────────────────────────────────────────
//     const ro = new ResizeObserver(() => weatherforcastMapRef.current?.invalidateSize());
//     ro.observe(mapWeatherforcastContainerRef.current);

//     return () => {
//       ro.disconnect();
//       weatherforcastMapRef.current?.remove();
//       weatherforcastMapRef.current = null;
//     };
//   }, [geoData]); // eslint-disable-line react-hooks/exhaustive-deps

//   // ── Swap tile layer on dark mode toggle ─────────────────────────────────────
//   useEffect(() => {
//     if (!weatherforcastMapRef.current || !weatherforcasttileLayerRef.current) return;
//     weatherforcastMapRef.current.removeLayer(weatherforcasttileLayerRef.current);
//     const tileUrl = isDarkMode
//       ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
//       : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
//     weatherforcasttileLayerRef.current = L.tileLayer(tileUrl).addTo(weatherforcastMapRef.current);
//     weatherforcasttileLayerRef.current.bringToBack();
//   }, [isDarkMode]);

//   // ── Highlight district when `district` prop changes externally ──────────────
//   useEffect(() => {
//     if (!weatherforcastMapRef.current || !geoData || !isValidGeoJSON(geoData)) return;

//     if (
//       !district ||
//       district.trim() === "" ||
//       district.trim().toLowerCase() === "all"
//     ) {
//       if (weatherforcastboundaryLayerRef.current) {
//         weatherforcastMapRef.current.removeLayer(weatherforcastboundaryLayerRef.current);
//         weatherforcastboundaryLayerRef.current = null;
//       }
//       return;
//     }

//     const matched = geoData.features.filter(
//       (f: any) => f?.properties?.name === capitalize(district.toLowerCase()),
//     );
//     if (!matched.length) return;

//     drawBoundary({ type: "FeatureCollection", features: matched } as FeatureCollection, FAO_BLUE);
//   }, [district, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

//   // ── getTheBounds: fit viewport to a named district (from reference) ─────────
//   // Mirrors the third useEffect in UgandaMap — fits map bounds to a district
//   // and locks the viewport to it, or resets to full Uganda view when "all".
//   useEffect(() => {
//     if (!weatherforcastMapRef.current || !geoData || !isValidGeoJSON(geoData)) return;
//     if (!getTheBounds || getTheBounds.trim().length === 0) return;

//     if (
//       getTheBounds.trim().toLowerCase() === "all" ||
//       getTheBounds.trim() === ""
//     ) {
//       if (weatherforcastboundaryLayerRef.current) {
//         weatherforcastMapRef.current.removeLayer(weatherforcastboundaryLayerRef.current);
//         weatherforcastboundaryLayerRef.current = null;
//       }
//       weatherforcastMapRef.current.setView([1.3733, 32.2903], zoom);
//       weatherforcastMapRef.current.setMinZoom(minZoom);
//       return;
//     }

//     const matched = geoData.features.filter(
//       (f: any) =>
//         f?.properties?.name === capitalize(getTheBounds.toLowerCase()),
//     );
//     if (!matched.length) return;

//     const updatedGeoJSON = { ...geoData, features: matched } as FeatureCollection;

//     if (weatherforcastboundaryLayerRef.current) {
//       weatherforcastMapRef.current.removeLayer(weatherforcastboundaryLayerRef.current);
//       weatherforcastboundaryLayerRef.current = null;
//     }

//     weatherforcastboundaryLayerRef.current = L.geoJSON(updatedGeoJSON, {
//       style: { color: "blue", weight: 4, fill: false },
//     })
//       .addTo(weatherforcastMapRef.current)
//       .bringToBack();

//     const bounds = weatherforcastboundaryLayerRef.current.getBounds();
//     if (bounds.isValid()) {
//       weatherforcastMapRef.current.fitBounds(bounds);
//       weatherforcastMapRef.current.setMaxBounds(bounds);
//     }
//   }, [getTheBounds, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

//   // Update the raster layer when indicator, month, or timerange changes
//   // Replace your existing raster layer effect with this:
//   useEffect(() => {
//     if (!weatherforcastMapRef.current) return;

//     // Remove old raster layer
//     if (weatherforcastrasterLayerRef.current) {
//       weatherforcastMapRef.current.removeLayer(weatherforcastrasterLayerRef.current);
//       weatherforcastrasterLayerRef.current = null;
//     }

//     //if (!indicator) return; // indicator = layer name e.g. "flood_20260301_24h"
//     const param = () => {
//       switch (selectedParameter?.toLocaleLowerCase()) {
//         case "temperature":
//           return "gee_weather_temperature";
//         case "precipitation":
//           return "precip";
//         case "drought":
//           return "drought";
//         case "rainfall":
//           return "gee_weather_rainfall";
//         default:
//           return null;
//       }
//     };

    

//     const layerName = `wfews:${param()}_${removeLastTwoDigits(dateRange?.replace(/-/g, ""))}`; // e.g. "wfews:flood_20260301_24h"

//     console.log("layerName",layerName)

//     weatherforcastrasterLayerRef.current = L.tileLayer
//       .wms(GEO_SERVER_URL, {
//         layers: layerName,
//         format: "image/png",
//         transparent: true,
//         version: "1.1.0",
//         opacity: 1.0,
//       })
//       .on("loading", () => {
//     setRasterIsLoading(true);
//   })
//   .on("load", () => {
//     setRasterIsLoading(false);
//   })
//   .on("tileerror", () => {
//     setRasterIsLoading(false);
//   })
//       .addTo(weatherforcastMapRef.current);
//   }, [geoData, selectedParameter, dateRange,sliderhourIndexValue]);

//   // hourly forcast
//    useEffect(() => {
//     if (!weatherforcastMapRef.current) return;
//     if (sliderhourIndexValue === "000") return

//     // Remove old raster layer
//     if (weatherforcastrasterLayerRef.current) {
//       weatherforcastMapRef.current.removeLayer(weatherforcastrasterLayerRef.current);
//       weatherforcastrasterLayerRef.current = null;
//     }

//     //if (!indicator) return; // indicator = layer name e.g. "flood_20260301_24h"
//     const param = () => {
//       switch (selectedParameter?.toLocaleLowerCase()) {
//         case "temperature":
//           return "gee_weather_temperature";
//         case "precipitation":
//           return "precip";
//         case "drought":
//           return "drought";
//         case "rainfall":
//           return "gee_weather_rainfall";
//         default:
//           return null;
//       }
//     };

    

//     const layerName = `wfews:${param()}_${dateRange?.replace(/-/g, "")}_${FLOOD_HOURS[sliderhourIndexValue] ?? "00"}`; // e.g. "wfews:flood_20260301_24h"

//     console.log("layerName",layerName)

//     weatherforcastrasterLayerRef.current = L.tileLayer
//       .wms(GEO_SERVER_URL, {
//         layers: layerName,
//         format: "image/png",
//         transparent: true,
//         version: "1.1.0",
//         opacity: 1.0,
//       })
//        .on("loading", () => {
//     setRasterIsLoading(true);
//   })
//   .on("load", () => {
//     setRasterIsLoading(false);
//   })
//   .on("tileerror", () => {
//     setRasterIsLoading(false);
//   })
//       .addTo(weatherforcastMapRef.current);
//   }, [geoData, selectedParameter, dateRange,sliderhourIndexValue]);

//   // In the component, below where you destructure currentPage from the store
//   const isVisibleOnPage = (layer: LayerDef): boolean => {
//     if (!layer.pages || layer.pages.includes("*")) return true;
//     return layer.pages.some((route) => (currentPage ?? "").startsWith(route));
//   };

//   const visibleGroups = LAYER_GROUPS.map((group) => ({
//     ...group,
//     layers: group.layers.filter(isVisibleOnPage),
//   })).filter((group) => group.layers.length > 0);
//   // ── Render ──────────────────────────────────────────────────────────────────
//   return (

//     <div className={`relative overflow-hidden ${className}`}>
//   {/* Map container */}
//   <div
//     ref={mapWeatherforcastContainerRef}
//     className="absolute inset-0 z-0"
//     style={{
//       background: isDarkMode ? "#0f172a" : "#f1f5f9",
//     }}
//   />

//   {/* Loading overlay */}
//   <div
//     className={`
//       absolute inset-0 z-[500]
//       flex items-center justify-center
//       transition-all duration-300
//       ${!geoData || isRasterLoading
//         ? "opacity-100 visible"
//         : "opacity-0 invisible pointer-events-none"}
//       ${isDarkMode ? "bg-slate-900/70" : "bg-white/70"}
//     `}
//   >
//     <div className="flex flex-col items-center gap-3">
//       {/* Spinner */}
//       <div
//         className="w-8 h-8 rounded-full border-2 animate-spin"
//         style={{
//           borderColor: `${FAO_BLUE}30`,
//           borderTopColor: FAO_BLUE,
//         }}
//       />

//       {/* Loading text */}
//       {/* <span
//         className={`text-xs font-medium tracking-wide ${
//           isDarkMode ? "text-slate-300" : "text-slate-600"
//         }`}
//       >
//         Loading weather layers...
//       </span> */}
//     </div>
//   </div>

//   {/* Badge */}
//   <div className="absolute top-2 left-2 z-[400]">
//     <span
//       className="rounded px-2 py-0.5 text-[10px] font-medium shadow-sm"
//       style={{
//         backgroundColor: isDarkMode ? `${FAO_BLUE}33` : `${FAO_BLUE}22`,
//         color: FAO_BLUE,
//       }}
//     >
//       {badgeText}
//     </span>
//   </div>

//   {/* MAP LAYERS toggle button */}
//   <button
//     onClick={() => setShowLayerPanel((v) => !v)}
//     className="absolute top-2 right-2 z-[400] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all"
//     style={{
//       backgroundColor: showLayerPanel
//         ? FAO_BLUE
//         : isDarkMode
//           ? "#1e293b"
//           : "#ffffff",
//       color: showLayerPanel ? "#ffffff" : FAO_BLUE,
//       border: `1px solid ${FAO_BLUE}55`,
//     }}
//   >
//     <Layers className="w-3.5 h-3.5" />
//     MAP LAYERS
//   </button>

//   {/* Layer panel */}
//   {showLayerPanel && (
//     <>
//       {/* Backdrop */}
//       <div
//         className="fixed inset-0 z-[600]"
//         onClick={() => setShowLayerPanel(false)}
//       />

//       <div
//         className={`
//           absolute top-10 right-2 z-[700] w-64 overflow-y-auto rounded-xl shadow-xl
//           flex flex-col
//           ${
//             isDarkMode
//               ? "bg-slate-800 border border-slate-700"
//               : "bg-white border border-slate-200"
//           }
//         `}
//         style={{
//           maxHeight: "90%",
//         }}
//       >
//         {/* Panel header */}
//         <div
//           className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 border-b"
//           style={{ borderColor: isDarkMode ? "#334155" : "#e2e8f0" }}
//         >
//           <span
//             className={`text-xs font-bold tracking-wide ${
//               isDarkMode ? "text-white" : "text-slate-800"
//             }`}
//           >
//             MAP LAYERS
//           </span>

//           <button
//             onClick={() => setShowLayerPanel(false)}
//             className={`p-0.5 rounded transition-colors ${
//               isDarkMode
//                 ? "hover:bg-slate-700 text-slate-400"
//                 : "hover:bg-slate-100 text-slate-500"
//             }`}
//           >
//             <X className="w-3.5 h-3.5" />
//           </button>
//         </div>

//         {/* Scrollable layer list */}
//         <div className="overflow-y-auto flex-1 py-1 h-[calc(100%-40px)]">
//           {visibleGroups?.map((group) => (
//             <div key={group.title} className="mb-1">
//               {/* Group heading */}
//               <p
//                 className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest"
//                 style={{ color: FAO_BLUE }}
//               >
//                 {group.title}
//               </p>

//               {/* Layer rows */}
//               {group.layers.map((layerDef) => {
//                 const isActive = activeLayers.has(layerDef.id);

//                 return (
//                   <div
//                     key={layerDef.id}
//                     onClick={() => toggleLayer(layerDef)}
//                     className={`flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors select-none ${
//                       isDarkMode
//                         ? "hover:bg-slate-700/50"
//                         : "hover:bg-slate-50"
//                     }`}
//                   >
//                     <div className="flex items-center gap-2">
//                       {/* Checkbox */}
//                       <div
//                         className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all"
//                         style={{
//                           backgroundColor: isActive
//                             ? FAO_BLUE
//                             : "transparent",
//                           borderColor: isActive
//                             ? FAO_BLUE
//                             : isDarkMode
//                               ? "#475569"
//                               : "#cbd5e1",
//                         }}
//                       >
//                         {isActive && (
//                           <svg
//                             className="w-2.5 h-2.5 text-white"
//                             viewBox="0 0 10 10"
//                             fill="none"
//                           >
//                             <path
//                               d="M1.5 5L4 7.5L8.5 2.5"
//                               stroke="currentColor"
//                               strokeWidth="1.5"
//                               strokeLinecap="round"
//                               strokeLinejoin="round"
//                             />
//                           </svg>
//                         )}
//                       </div>

//                       <span
//                         className={`text-xs ${
//                           isDarkMode
//                             ? "text-slate-300"
//                             : "text-slate-700"
//                         }`}
//                       >
//                         {layerDef.label}
//                       </span>
//                     </div>

//                     {/* Date badge */}
//                     {layerDef.date && (
//                       <span
//                         className={`text-[10px] ml-2 flex-shrink-0 ${
//                           isDarkMode
//                             ? "text-slate-500"
//                             : "text-slate-400"
//                         }`}
//                       >
//                         {layerDef.date}
//                       </span>
//                     )}
//                   </div>
//                 );
//               })}
//             </div>
//           ))}
//         </div>
//       </div>
//     </>
//   )}

//   {/* Legend */}
//   {legendTitle && legendItems.length > 0 && (
//     <div
//       className={`absolute bottom-2 left-2 z-[400] rounded-lg p-2 shadow-sm ${
//         isDarkMode ? "bg-slate-800/90" : "bg-white/90"
//       }`}
//     >
//       <div
//         className={`mb-1 text-[10px] font-medium ${
//           isDarkMode ? "text-slate-300" : "text-slate-700"
//         }`}
//       >
//         {legendTitle}
//       </div>

//       <div className="space-y-1">
//         {legendItems.map((item) => (
//           <div key={item.label} className="flex items-center gap-1.5">
//             <div
//               className="h-2.5 w-2.5 rounded-full"
//               style={{ backgroundColor: item.color }}
//             />

//             <span
//               className={`text-[9px] ${
//                 isDarkMode ? "text-slate-400" : "text-slate-600"
//               }`}
//             >
//               {item.label}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   )}

//   {/* Leaflet label styles */}
//   <style>{`
//     .district-label {
//       background: transparent !important;
//       border: none !important;
//       box-shadow: none !important;
//       font-size: 11px;
//       font-weight: 500;
//       color: ${isDarkMode ? "#94a3b8" : "#475569"};
//       white-space: nowrap;
//       pointer-events: none;
//     }

//     .waterAreas-label {
//       background: transparent !important;
//       border: none !important;
//       box-shadow: none !important;
//       font-size: 10px;
//       color: #5b9bd5;
//       pointer-events: none;
//     }
//   `}</style>
// </div>
//   );
// }

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRainAnimation } from "./useRainAnimation";
// import { geoAPI } from "../../services/api";
import { waterAreas } from "../../utils/waterAreas";
import { capitalize } from "../../utils/capitalize";
// import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";
import { useAppStore } from "@/store/useAppStore";
import { X, Layers, Maximize2, Minimize2, Thermometer, CloudRain, Sun, Droplets, Wind, Plus, Minus } from "lucide-react";
import { FLOOD_HOURS } from "../shared/FloodHourSlider";
import { removeLastTwoDigits } from "@/utils/woker_fn";
import { geoData } from "@/utils/geodata";
// import { useWindAnimation } from "./useWindAnimation";



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

const PARAM_LEGENDS: Record<string, { unit: string; stops: { color: string; label: string }[] }> = {
  temperature: {
    unit: "°C",
    stops: [
      { color: "#3b82f6", label: "10°" },
      { color: "#22c55e", label: "20°" },
      { color: "#fbbf24", label: "30°" },
      { color: "#f97316", label: "35°" },
      { color: "#ef4444", label: "40°" },
    ],
  },
  rainfall: {
    unit: "mm",
    stops: [
      { color: "#e0f2fe", label: "0" },
      { color: "#38bdf8", label: "25" },
      { color: "#0284c7", label: "50" },
      { color: "#1e3a8a", label: "100+" },
    ],
  },
  precipitation: {
    unit: "mm",
    stops: [
      { color: "#e0f2fe", label: "0" },
      { color: "#38bdf8", label: "25" },
      { color: "#0284c7", label: "50" },
      { color: "#1e3a8a", label: "100+" },
    ],
  },
  drought: {
    unit: "SPI",
    stops: [
      { color: "#22c55e", label: "0" },
      { color: "#fbbf24", label: "-1" },
      { color: "#f97316", label: "-1.5" },
      { color: "#dc2626", label: "-2" },
    ],
  },
  humidity: {
    unit: "%",
    stops: [
      { color: "#dc2626", label: "0%" },
      { color: "#fbbf24", label: "40%" },
      { color: "#22c55e", label: "70%" },
      { color: "#3b82f6", label: "100%" },
    ],
  },
  wind: {
    unit: "km/h",
    stops: [
      { color: "#22c55e", label: "0" },
      { color: "#3b82f6", label: "20" },
      { color: "#f97316", label: "40" },
      { color: "#dc2626", label: "60+" },
    ],
  },
};

const PARAM_RANGES: Record<string, [number, number]> = {
  temperature: [10, 40], rainfall: [0, 100], precipitation: [0, 60],
  drought: [0, 100], humidity: [0, 100], wind: [0, 60],
};

function getDistrictValue(name: string, param: string): number {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  switch (param?.toLowerCase()) {
    case 'temperature':    return Math.round(18 + ((h * 13) % 17));
    case 'rainfall':       return Math.round((h * 7) % 82);
    case 'precipitation':  return Math.round((h * 5) % 60);
    case 'drought':        return Math.round((h * 11) % 100);
    case 'humidity':       return Math.round(40 + ((h * 3) % 50));
    case 'wind':           return Math.round(5 + ((h * 9) % 45));
    default: return 0;
  }
}

function getValueColor(value: number, param: string): string {
  const cfg = PARAM_LEGENDS[param?.toLowerCase()];
  const rng = PARAM_RANGES[param?.toLowerCase()];
  if (!cfg || !rng) return '#64748b';
  const t = Math.min(1, Math.max(0, (value - rng[0]) / (rng[1] - rng[0])));
  return cfg.stops[Math.min(Math.floor(t * cfg.stops.length), cfg.stops.length - 1)].color;
}


// ── Human-readable condition labels per parameter ─────────────────────────────
function getConditionLabel(value: number, param: string): string {
  switch (param?.toLowerCase()) {
    case 'temperature':
      if (value < 18) return 'Cool';
      if (value < 24) return 'Mild';
      if (value < 30) return 'Warm';
      if (value < 35) return 'Hot';
      return 'Very Hot';
    case 'rainfall':
    case 'precipitation':
      if (value === 0) return 'No Rain';
      if (value < 10) return 'Very Light Rain';
      if (value < 25) return 'Light Rain';
      if (value < 50) return 'Moderate Rain';
      if (value < 75) return 'Heavy Rain';
      return 'Very Heavy Rain';
    case 'drought':
      if (value < 20) return 'Normal';
      if (value < 40) return 'Mild Drought';
      if (value < 60) return 'Moderate Drought';
      if (value < 80) return 'Severe Drought';
      return 'Extreme Drought';
    case 'humidity':
      if (value < 30) return 'Very Dry';
      if (value < 50) return 'Dry';
      if (value < 70) return 'Moderate';
      if (value < 85) return 'Humid';
      return 'Very Humid';
    case 'wind':
      if (value < 10) return 'Calm';
      if (value < 20) return 'Light Breeze';
      if (value < 35) return 'Moderate Wind';
      if (value < 50) return 'Strong Wind';
      return 'Very Strong';
    default: return '';
  }
}

// ── Icon SVG strings for use in Leaflet DivIcon HTML ─────────────────────────
function getParamIconSvg(param: string, color: string): string {
  const c = color;
  switch (param?.toLowerCase()) {
    case 'temperature':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`;
    case 'rainfall':
    case 'precipitation':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v6M8 14v6M12 16v6"/></svg>`;
    case 'drought':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
    case 'humidity':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;
    case 'wind':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`;
  }
}

function makeMarkerHtml(districtName: string, value: number, unit: string, color: string, param: string): string {
  const label = getConditionLabel(value, param);
  const icon  = getParamIconSvg(param, color);
  return `<div style="display:inline-block;position:relative;padding-bottom:8px;transform:translate(-50%,-100%);font-family:ui-sans-serif,system-ui,sans-serif;">
  <div style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap;background:rgba(8,12,24,0.90);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:999px;padding:5px 12px 5px 9px;box-shadow:0 4px 18px rgba(0,0,0,0.65);">
    ${icon}
    <span style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.95);letter-spacing:0.02em;">${districtName}</span>
    <span style="display:inline-block;width:1px;height:11px;background:rgba(255,255,255,0.2);border-radius:1px;flex-shrink:0;"></span>
    <span style="font-size:11px;font-weight:700;color:${color};">${value}${unit}</span>
    <span style="display:inline-block;width:1px;height:11px;background:rgba(255,255,255,0.2);border-radius:1px;flex-shrink:0;"></span>
    <span style="font-size:10px;font-weight:500;color:rgba(255,255,255,0.80);">${label}</span>
  </div>
  <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid rgba(255,255,255,0.45);"></div>
</div>`;
}

function ParamIcon({ param, className = "w-3.5 h-3.5", color }: { param: string; className?: string; color?: string }) {
  const p = { className, color };
  switch (param?.toLowerCase()) {
    case 'temperature':   return <Thermometer {...p} />;
    case 'rainfall':
    case 'precipitation': return <CloudRain {...p} />;
    case 'drought':       return <Sun {...p} />;
    case 'humidity':      return <Droplets {...p} />;
    case 'wind':          return <Wind {...p} />;
    default:              return <Layers {...p} />;
  }
}

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

export default function WeatherForcastMap({
  className = "",
  isDarkMode,
  badgeText = "Uganda",
  district,
  setDistrict,
  getTheBounds,
  zoom = 6.8,
  minZoom = 6.8,
}: UgandaBoundaryMapProps) {
  const { selectedParameter, dateRange, currentPage,sliderhourIndexValue} = useAppStore(
    (state) => state,
  );
  // ── Refs ────────────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const mapWeatherforcastContainerRef = useRef<HTMLDivElement>(null);
  const weatherforcastMapRef = useRef<L.Map | null>(null);
  const weatherforcastdistrictLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcastboundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcastriverLayerRef = useRef<L.GeoJSON | null>(null);
  const weatherforcasttileLayerRef = useRef<L.TileLayer | null>(null);
  const weatherforcastrasterLayerRef = useRef<L.TileLayer | null>(null);
  const weatherforcastwmsLayersRef = useRef<Record<string, L.TileLayer.WMS>>({});
  const weatherMarkersRef = useRef<L.Marker[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(["country"]));
  const [isRasterLoading, setRasterIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredDistrictName, setHoveredDistrictName] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
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

//   const { canvasRef: windCanvasRef, loadWindFromWeatherAPI, clearWindField } =
//   useWindAnimation(weatherforcastMapRef, geoData);

// // When wind parameter is selected:
// if (selectedParameter?.toLowerCase() === "wind" && weatherData) {
//   loadWindFromWeatherAPI(weatherData); // pass the raw API response
// } else {
//   clearWindField();
// }


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
    if (!weatherforcastMapRef.current) return;
    if (weatherforcastboundaryLayerRef.current) {
      weatherforcastMapRef.current.removeLayer(weatherforcastboundaryLayerRef.current);
      weatherforcastboundaryLayerRef.current = null;
    }
    weatherforcastboundaryLayerRef.current = L.geoJSON(geojson, {
      style: { color, weight: 4, fill: false },
    })
      .addTo(weatherforcastMapRef.current)
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
    if (!weatherforcastMapRef.current) return false;
    const bounds = layer.getBounds();
    const topLeft = weatherforcastMapRef.current.latLngToLayerPoint(bounds.getNorthWest());
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

    console.log(
      "does it fit?",
      paddedW <= availableWidth && paddedH <= availableHeight,
    );

    return paddedW <= availableWidth && paddedH <= availableHeight;
  };

  // Toggle a panel layer on/off
  const toggleLayer = (layerDef: LayerDef) => {
    if (!weatherforcastMapRef.current) return;

    if (activeLayers.has(layerDef.id)) {
      if (weatherforcastwmsLayersRef.current[layerDef.id]) {
        weatherforcastMapRef.current.removeLayer(weatherforcastwmsLayersRef.current[layerDef.id]);
        delete weatherforcastwmsLayersRef.current[layerDef.id];
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
        .addTo(weatherforcastMapRef.current);
      wmsLayer.bringToFront();
      weatherforcastwmsLayersRef.current[layerDef.id] = wmsLayer;
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

    weatherforcastMapRef.current = L.map(mapWeatherforcastContainerRef.current, {
      center: [1.3733, 32.2903],
      zoom,
      minZoom,
      layers: [weatherforcasttileLayerRef.current],
      zoomControl: false,
      attributionControl: false,
    });

    // ── District boundary polygons — gray thin borders ────────────────────
    weatherforcastdistrictLayerRef.current = L.geoJSON(geoData, {
      style: { color: "gray", weight: 0.3, fill: false },
    }).addTo(weatherforcastMapRef.current);

    // ── District name labels ──────────────────────────────────────────────
    // Exact port from reference: calls doesNameFitInLeafletBoundary,
    // binds tooltip, opens it, and calls bringToFront() — then chains
    // .addTo(weatherforcastMapRef.current) at the end of eachLayer like the reference does.
    const updateLabelVisibility = () => {
      if (!weatherforcastMapRef.current || !weatherforcastdistrictLayerRef.current) return;

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

      if (setDistrict) {
        setDistrict(clickedFeature.properties.name?.toUpperCase());
      }

      // Highlight only the clicked feature — pass the single Feature directly
      if (weatherforcastboundaryLayerRef.current) {
        weatherforcastMapRef.current!.removeLayer(weatherforcastboundaryLayerRef.current);
        weatherforcastboundaryLayerRef.current = null;
      }
      weatherforcastboundaryLayerRef.current = L.geoJSON(clickedFeature, {
        style: { color: "#308DE0", weight: 4, fill: false },
      })
        .addTo(weatherforcastMapRef.current!)
        .bringToFront();
    });

    // ── Water / lake overlay (from reference) ─────────────────────────────
    if (weatherforcastriverLayerRef.current) {
      weatherforcastMapRef.current.removeLayer(weatherforcastriverLayerRef.current);
      weatherforcastriverLayerRef.current = null;
    }
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
    weatherforcastMapRef.current.on('mousemove', (ev: L.LeafletMouseEvent) => {
      setMousePos({ x: ev.containerPoint.x, y: ev.containerPoint.y });
      let found: string | null = null;
      weatherforcastdistrictLayerRef.current?.eachLayer((layer: any) => {
        if (found) return;
        if (isPointInPolygon(ev.latlng, layer.getLatLngs()))
          found = layer.feature?.properties?.name ?? null;
      });
      setHoveredDistrictName(found);
    });
    weatherforcastMapRef.current.on('mouseout', () => setHoveredDistrictName(null));

    // ── Country boundary on by default ───────────────────────────────────
    const countryWms = L.tileLayer.wms(GEO_SERVER_URL, {
      layers: "wfews:country",
      format: "image/png",
      transparent: true,
      version: "1.1.0",
      opacity: 1.0,
    }).addTo(weatherforcastMapRef.current);
    countryWms.bringToFront();
    weatherforcastwmsLayersRef.current["country"] = countryWms;

    // ── ResizeObserver ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => weatherforcastMapRef.current?.invalidateSize());
    ro.observe(mapWeatherforcastContainerRef.current);

    return () => {
      ro.disconnect();
      weatherforcastMapRef.current?.remove();
      weatherforcastMapRef.current = null;
    };
  }, [geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap full CartoDB tile on dark/light toggle ──────────────────────────────
  useEffect(() => {
    if (!weatherforcastMapRef.current || !weatherforcasttileLayerRef.current) return;
    weatherforcastMapRef.current.removeLayer(weatherforcasttileLayerRef.current);
    weatherforcasttileLayerRef.current = L.tileLayer(
      isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19, attribution: "© CartoDB" },
    ).addTo(weatherforcastMapRef.current);
    weatherforcasttileLayerRef.current.bringToBack();
  }, [isDarkMode]);

  // ── Highlight district when `district` prop changes externally ──────────────
  useEffect(() => {
    if (!weatherforcastMapRef.current || !geoData || !isValidGeoJSON(geoData)) return;

    if (
      !district ||
      district.trim() === "" ||
      district.trim().toLowerCase() === "all"
    ) {
      if (weatherforcastboundaryLayerRef.current) {
        weatherforcastMapRef.current.removeLayer(weatherforcastboundaryLayerRef.current);
        weatherforcastboundaryLayerRef.current = null;
      }
      return;
    }

    const matched = geoData.features.filter(
      (f: any) => f?.properties?.name === capitalize(district.toLowerCase()),
    );
    if (!matched.length) return;

    drawBoundary({ type: "FeatureCollection", features: matched } as FeatureCollection, FAO_BLUE);
  }, [district, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── getTheBounds: fit viewport to a named district (from reference) ─────────
  // Mirrors the third useEffect in UgandaMap — fits map bounds to a district
  // and locks the viewport to it, or resets to full Uganda view when "all".
  useEffect(() => {
    if (!weatherforcastMapRef.current || !geoData || !isValidGeoJSON(geoData)) return;

    // Empty / "all" → reset to full Uganda and remove any district lock
    if (!getTheBounds || getTheBounds.trim() === "" || getTheBounds.trim().toLowerCase() === "all") {
      if (weatherforcastboundaryLayerRef.current) {
        weatherforcastMapRef.current.removeLayer(weatherforcastboundaryLayerRef.current);
        weatherforcastboundaryLayerRef.current = null;
      }
      weatherforcastMapRef.current.setMaxBounds(L.latLngBounds([[-90, -180], [90, 180]]));
      weatherforcastMapRef.current.setMinZoom(minZoom);
      weatherforcastMapRef.current.setView([1.3733, 32.2903], zoom);
      return;
    }

    const matched = geoData.features.filter(
      (f: any) => f?.properties?.name === capitalize(getTheBounds.toLowerCase()),
    );
    if (!matched.length) return;

    if (weatherforcastboundaryLayerRef.current) {
      weatherforcastMapRef.current.removeLayer(weatherforcastboundaryLayerRef.current);
      weatherforcastboundaryLayerRef.current = null;
    }

    weatherforcastboundaryLayerRef.current = L.geoJSON(
      { ...geoData, features: matched } as FeatureCollection,
      { style: { color: FAO_BLUE, weight: 2, fill: false } },
    ).addTo(weatherforcastMapRef.current).bringToBack();

    const bounds = weatherforcastboundaryLayerRef.current.getBounds();
    if (bounds.isValid()) {
      weatherforcastMapRef.current.fitBounds(bounds, { padding: [40, 40] });
      weatherforcastMapRef.current.setMaxBounds(bounds.pad(0.3));
    }
  }, [getTheBounds, geoData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update the raster layer when indicator, month, or timerange changes
  // Replace your existing raster layer effect with this:
  useEffect(() => {
    if (!weatherforcastMapRef.current) return;

    // Remove old raster layer
    if (weatherforcastrasterLayerRef.current) {
      weatherforcastMapRef.current.removeLayer(weatherforcastrasterLayerRef.current);
      weatherforcastrasterLayerRef.current = null;
    }

    const paramName = ((): string | null => {
      switch (selectedParameter?.toLowerCase()) {
        case "temperature":   return "gee_weather_temperature";
        case "precipitation": return "precip";
        case "drought":       return "drought";
        case "rainfall":      return "gee_weather_rainfall";
        default:              return null;
      }
    })();

    if (paramName) {
      const layerName = `wfews:${paramName}_${removeLastTwoDigits(dateRange?.replace(/-/g, "") ?? "")}`;
      weatherforcastrasterLayerRef.current = L.tileLayer
        .wms(GEO_SERVER_URL, {
          layers: layerName,
          format: "image/png",
          transparent: true,
          version: "1.1.0",
          opacity: 0.85,
        })
        .on("loading", () => setRasterIsLoading(true))
        .on("load",    () => setRasterIsLoading(false))
        .on("tileerror", () => setRasterIsLoading(false))
        .addTo(weatherforcastMapRef.current);
      weatherforcastrasterLayerRef.current.bringToFront();
    }

    // ── Rain animation: magnitude-scaled drops per district ──────────────────
    if (selectedParameter?.toLowerCase() === "rainfall" && geoData?.features) {
      const rainyDistricts = (geoData.features as any[])
        .filter((f: any) => f?.properties?.name)
        .map((f: any) => {
          const name   = f.properties.name as string;
          const meanMm = getDistrictValue(name, "rainfall");

          // Drop density, speed and line thickness scaled by rainfall intensity
          let rainyPct: number, speedScale: number, lineWidth: number;
          if      (meanMm >= 75) { rainyPct = 90; speedScale = 1.6; lineWidth = 1.8; }
          else if (meanMm >= 50) { rainyPct = 70; speedScale = 1.3; lineWidth = 1.3; }
          else if (meanMm >= 25) { rainyPct = 45; speedScale = 1.0; lineWidth = 0.9; }
          else if (meanMm >= 10) { rainyPct = 22; speedScale = 0.8; lineWidth = 0.5; }
          else                   { rainyPct = 0;  speedScale = 0;   lineWidth = 0;   }

          return { name, meanMm, rainyPct, speedScale, lineWidth };
        })
        .filter((d) => d.meanMm >= 10);
      setRainyDistricts(rainyDistricts);
    } else {
      setRainyDistricts([]);
    }
  }, [geoData, selectedParameter, dateRange, sliderhourIndexValue]);

  // ── Hourly raster ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!weatherforcastMapRef.current) return;
    if (!sliderhourIndexValue || sliderhourIndexValue === "000") return;

    if (weatherforcastrasterLayerRef.current) {
      weatherforcastMapRef.current.removeLayer(weatherforcastrasterLayerRef.current);
      weatherforcastrasterLayerRef.current = null;
    }

    const paramName = ((): string | null => {
      switch (selectedParameter?.toLowerCase()) {
        case "temperature":   return "gee_weather_temperature";
        case "precipitation": return "precip";
        case "drought":       return "drought";
        case "rainfall":      return "gee_weather_rainfall";
        default:              return null;
      }
    })();
    if (!paramName) return;

    const layerName = `wfews:${paramName}_${dateRange?.replace(/-/g, "") ?? ""}_${FLOOD_HOURS[sliderhourIndexValue] ?? "00"}`;
    weatherforcastrasterLayerRef.current = L.tileLayer
      .wms(GEO_SERVER_URL, {
        layers: layerName,
        format: "image/png",
        transparent: true,
        version: "1.1.0",
        opacity: 0.85,
      })
      .on("loading",   () => setRasterIsLoading(true))
      .on("load",      () => setRasterIsLoading(false))
      .on("tileerror", () => setRasterIsLoading(false))
      .addTo(weatherforcastMapRef.current);
    weatherforcastrasterLayerRef.current.bringToFront();
  }, [geoData, selectedParameter, dateRange, sliderhourIndexValue]);

  // ── Weather district markers — selected district or Kampala by default ────────
  useEffect(() => {
    if (!weatherforcastMapRef.current || !geoData?.features) return;
    weatherMarkersRef.current.forEach(m => m.remove());
    weatherMarkersRef.current = [];
    const param = selectedParameter?.toLowerCase() ?? '';
    const config = PARAM_LEGENDS[param];
    if (!config) return;
    // Show marker for the selected district; fall back to Kampala when none selected
    const target = (getTheBounds?.trim() && getTheBounds.trim().toLowerCase() !== "all")
      ? getTheBounds.trim()
      : "Kampala";
    (geoData.features as any[]).forEach((feature) => {
      const name: string = feature?.properties?.name ?? '';
      if (!name.toLowerCase().includes(target.toLowerCase())) return;
      const center = L.geoJSON(feature).getBounds().getCenter();
      const value = getDistrictValue(name, param);
      const color = getValueColor(value, param);
      const marker = L.marker(center, {
        icon: L.divIcon({
          className: '',
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
      ${!geoData || isRasterLoading
        ? "opacity-100 visible"
        : "opacity-0 invisible pointer-events-none"}
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
    {isFullscreen
      ? <Minimize2 className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
      : <Maximize2 className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />}
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
      { icon: Plus,  title: "Zoom in",  action: () => weatherforcastMapRef.current?.zoomIn()  },
      { icon: Minus, title: "Zoom out", action: () => weatherforcastMapRef.current?.zoomOut() },
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
                          isDarkMode
                            ? "text-slate-300"
                            : "text-slate-700"
                        }`}
                      >
                        {layerDef.label}
                      </span>
                    </div>

                    {/* Date badge */}
                    {layerDef.date && (
                      <span
                        className={`text-[10px] ml-2 flex-shrink-0 ${
                          isDarkMode
                            ? "text-slate-500"
                            : "text-slate-400"
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

  {/* Legend — gradient bar with parameter icon + unit labels */}
  {(() => {
    const paramKey = selectedParameter?.toLowerCase() ?? "";
    const config = PARAM_LEGENDS[paramKey];
    if (!config) return null;
    const gradientStops = config.stops
      .map((s, i) => `${s.color} ${Math.round((i / (config.stops.length - 1)) * 100)}%`)
      .join(", ");
    const accentColor = config.stops[config.stops.length - 1].color;
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
        {/* Icon + unit label */}
        <div className="flex items-center gap-1.5 mb-2">
          <ParamIcon param={selectedParameter ?? ''} className="w-3.5 h-3.5" color={accentColor} />
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: accentColor }}>
            {config.unit}
          </span>
        </div>
        {/* Gradient bar */}
        <div className="h-2.5 rounded-full w-full" style={{ background: `linear-gradient(to right, ${gradientStops})` }} />
        {/* Value labels */}
        <div className="flex justify-between mt-1">
          {config.stops.map((s) => (
            <span key={s.label} className="text-[8px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
              {s.label}
            </span>
          ))}
        </div>
      </div>
    );
  })()}

  {/* Hover tooltip — follows cursor, shows district value */}
  {hoveredDistrictName && (() => {
    const param = selectedParameter?.toLowerCase() ?? '';
    const config = PARAM_LEGENDS[param];
    const value = config ? getDistrictValue(hoveredDistrictName, param) : null;
    const color = config && value !== null ? getValueColor(value, param) : FAO_BLUE;
    const tx = mousePos.x > 360 ? mousePos.x - 158 : mousePos.x + 14;
    const ty = Math.max(mousePos.y - 62, 8);
    return (
      <div
        className="absolute pointer-events-none z-[450]"
        style={{
          left: tx, top: ty,
          background: isDarkMode ? "rgba(8,12,24,0.9)" : "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
          borderRadius: 10,
          padding: "8px 12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
          minWidth: 140,
        }}
      >
        <p style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", marginBottom: 4 }}>
          {hoveredDistrictName}
        </p>
        {config && value !== null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)' }}>{config.unit}</span>
          </div>
        )}
        <p style={{ fontSize: 9, color: isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", marginTop: 4, textTransform: 'capitalize' }}>
          {selectedParameter ?? '—'}
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
