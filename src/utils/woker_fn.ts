import type { DailyEntry, HourlyForecast } from "@/types/data_types";
import L from "leaflet";

// Map weather_code → icon type
const getIconFromCode = (code: number): string => {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "cloud";
  if (code === 3) return "cloud";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "cloud";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 95 && code <= 99) return "storm";
  return "cloud";
};

// Normalise API data → component shape
export const normaliseHourly = (raw: HourlyForecast[]) => {
  if (!raw || raw?.length === 0) return [];
  return raw.map((h: HourlyForecast) => {
    const date = new Date(h.time);
    return {
      time: date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      rawTime: h.time,
      rawDate: date,
      temp: Math.round(h.temp),
      humidity: 0,
      rain: h.precip,
      windSpeed: 0,
      icon: getIconFromCode(h.weather_code),
    };
  });
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// export const normaliseDaily = (raw: DailyEntry[]) =>
//   raw?.map((d) => {
//     const date = new Date(d.date);
//     return {
//       day: DAYS[date.getUTCDay()],
//       date: `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`,
//       high: Math.round(d.temp_max),
//       low: Math.round(d.temp_min),
//       rain: d.precip_sum,
//       icon: getIconFromCode(d.weather_code), // reuse the same fn from hourly
//       confidence: 90, // not in API, use a static value or omit
//     };
//   });

export const normaliseDaily = (raw: DailyEntry[]) => {
  if (!raw || raw?.length === 0) return [];
  return raw?.map((d) => {
    const date = new Date(d.date);
    return {
      day: DAYS[date.getUTCDay()],
      date: `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`,
      rawDate: date,
      high: Math.round(d.temp_max),
      low: Math.round(d.temp_min),
      rain: d.precip_sum,
      windSpeed: d.wind_speed_max,
      icon: getIconFromCode(d.weather_code),
      confidence: 90,
    };
  });
};

export function removeLastTwoDigits(value: string) {
  let data = value.toString().slice(0, -2);
  console.log("removeLastTwoDigits", data);
  return data;
}

// ── Layer name builder ────────────────────────────────────────────────────────
//
// Naming conventions observed from GeoServer:
//
//  Monthly    wfews:chirps_rainfall_YYYYMM
//             wfews:era5_temperature_YYYYMM
//             wfews:era5_wind_YYYYMM
//
//  Daily      wfews:gsmap_rainfall_YYYYMMDD_HH
//             wfews:era5_wind_YYYYMMDD_HH
//
//  Forecast   wfews:gfs_precip_<step>h_YYYYMMDD
//             wfews:gfs_tmax_<step>h_YYYYMMDD
//             wfews:gfs_tmin_<step>h_YYYYMMDD
//             wfews:gfs_tmp_<step>h_YYYYMMDD
//             wfews:gfs_10m_windspd_<step>h_YYYYMMDD
//             wfews:gfs_10m_winddir_<step>h_YYYYMMDD
//
//  humidity   → MISSING on all resolutions

export type LayerMode = "nowcast" | "forecast";

export interface LayerNameOptions {
  /** e.g. "temperature" | "rainfall" | "wind" | "humidity" | "precipitation" */
  parameter: string;
  /** ISO date string or YYYY-MM-DD */
  date: string;
  /** "monthly" | "daily" | "forecast" — defaults to "daily" */
  mode?: LayerMode;
  /** Hour string "00"–"23" — required for daily mode */
  hour?: string;
  /** Forecast step in hours e.g. 24 | 48 | 72 — required for forecast mode */
  forecastStep?: number;
}

/**
 * Returns the full WMS layer name (including workspace prefix) for a given
 * parameter + date combination, or null if the combination is not available.
 */
export function mapLayerName(opts: LayerNameOptions): string | null {
  const {
    parameter,
    date,
    mode = "nowcast",
    hour = "00",
    forecastStep = 24,
  } = opts;

  const param = parameter?.toLowerCase().trim();

  // ── Derive date parts ──────────────────────────────────────────────────────
  // Accept "2026-05-13", "20260513", or a Date-parseable string
  const clean = date?.replace(/-/g, "") ?? ""; // "20260513"
  const yyyymm = clean.slice(0, 6); // "202605"
  const yyyymmdd = clean.slice(0, 8); // "20260513"
  const hh = String(hour ?? "00").padStart(2, "0"); // "00"
  const step = forecastStep ?? 24;

  if (!yyyymm) return null;
  console.log("yyyymmdd ", yyyymmdd, "hh ", hh);

  // ── Monthly ────────────────────────────────────────────────────────────────
  // if (mode === "monthly") {
  //   switch (param) {
  //     case "rainfall":
  //       return `wfews:chirps_rainfall_${yyyymm}`;
  //     case "temperature":
  //       return `wfews:era5_temperature_${yyyymm}`;
  //     case "wind":
  //       return `wfews:era5_wind_${yyyymm}`;
  //     case "humidity":
  //       return `wfews:era5_humidity_${yyyymm}`; // MISSING
  //     default:
  //       return null;
  //   }
  // }

  // ── Daily ──────────────────────────────────────────────────────────────────

  if (mode === "nowcast") {
    if (!yyyymmdd) return null;
    switch (param) {
      case "rainfall":
        return `wfews:gsmap_rainfall_${yyyymmdd}_${hh}`;
      case "wind":
        return `wfews:era5_wind_${yyyymmdd}_${hh}`;
      case "temperature":
        return `wfews:era5_temperature_${yyyymmdd}_${hh}`;
      case "humidity":
        return `wfews:era5_humidity_${yyyymmdd}_${hh}`; // MISSING
      default:
        return null;
    }
  }

  // ── Forecast ───────────────────────────────────────────────────────────────
  if (mode === "forecast") {
    if (!yyyymmdd) return null;
    switch (param) {
      case "rainfall":
      case "precipitation":
        return `wfews:gfs_precip_${step}h_${yyyymmdd}`;
      case "temperature":
        // gfs_tmp = instantaneous temp; gfs_tmax / gfs_tmin for extremes
        return `wfews:gfs_tmp_${step}h_${yyyymmdd}`;
      case "temperature_max":
        return `wfews:gfs_tmax_${step}h_${yyyymmdd}`;
      case "temperature_min":
        return `wfews:gfs_tmin_${step}h_${yyyymmdd}`;
      case "wind":
        return `wfews:gfs_10m_windspd_${step}h_${yyyymmdd}`;
      case "wind_direction":
        return `wfews:gfs_10m_winddir_${step}h_${yyyymmdd}`;
      case "humidity":
        return null; // MISSING
      default:
        return null;
    }
  }

  return null;
}

export interface LayerConfigParams {
  today: any;
  forecastStep: string | number;
  dateRange?: string;
}
export interface LayerDef {
  id: string;
  label: string;
  wms: string;
  date?: string;
  pages: string[]; // list of page paths where this layer should be available, e.g. ["/", "/flood", "/weather"]
}

export const getLayerGroups = ({
  today,
  forecastStep,
  dateRange,
}: LayerConfigParams): { title: string; layers: LayerDef[] }[] => {
  // Clean the date format for the WMS string
  const formattedDate = dateRange?.replace(/-/g, "").slice(0, 8) || "";

  return [
    {
      title: "FORECASTS",
      layers: [
        {
          id: "flood",
          label: "Flood Forecast",
          wms: `flood_forecast_${formattedDate}_${forecastStep}`,
          date: today,
          pages: ["flood"],
        },
        {
          id: "rainfall",
          label: "Rainfall (CHIRPS-GEFS)",
          wms: "chirps_gefs",
          date: today,
          pages: ["weather"],
        },
        {
          id: "icon_temperature",
          label: "Temperature (ICON 13km)",
          wms: "local:temperature_2m",
          date: today,
          pages: ["weather"],
        },
        {
          id: "icon_precipitation",
          label: "Precipitation (ICON)",
          wms: "local:precipitation",
          date: today,
          pages: ["weather"],
        },
        {
          id: "icon_cloud_cover",
          label: "Cloud Cover (ICON)",
          wms: "local:cloud_cover",
          date: today,
          pages: ["weather"],
        },
        {
          id: "icon_wind",
          label: "Wind (ICON)",
          wms: "local:wind_u_10m",
          date: today,
          pages: ["weather"],
        },
        {
          id: "gfs_temperature",
          label: "Temperature (GFS 25km)",
          wms: "local:gfs_temperature_2m",
          date: today,
          pages: ["weather"],
        },
        {
          id: "gfs_precipitation",
          label: "Precipitation (GFS)",
          wms: "local:gfs_precipitation",
          date: today,
          pages: ["weather"],
        },
        {
          id: "imerg_precip",
          label: "Rain Satellite (IMERG)",
          wms: "local:imerg_precip",
          date: today,
          pages: ["weather", "flood"],
        },
        {
          id: "tmax",
          label: "Max Temp (Tmax)",
          // wms: `gfs_tmax_${forecastStep}h_${formattedDate}`,
          wms: "",
          date: today,
          pages: ["weather"],
        },
        {
          id: "tmin",
          label: "Min Temp (Tmin)",
          // wms: `gfs_tmin_${forecastStep}h_${formattedDate}`,
          wms: "",
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
  ];
};

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  // Create date using (year, monthIndex, day) - month is 0-indexed
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const PARAM_LEGENDS: Record<
  string,
  { unit: string; stops: { color: string; label: string }[] }
> = {
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

export const PARAM_RANGES: Record<string, [number, number]> = {
  temperature: [10, 40],
  rainfall: [0, 100],
  precipitation: [0, 60],
  drought: [0, 100],
  humidity: [0, 100],
  wind: [0, 60],
};

export function getDistrictValue(name: string, param: string): number {
  const h = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  switch (param?.toLowerCase()) {
    case "temperature":
      return Math.round(18 + ((h * 13) % 17));
    case "rainfall":
      return Math.round((h * 7) % 82);
    case "precipitation":
      return Math.round((h * 5) % 60);
    case "drought":
      return Math.round((h * 11) % 100);
    case "humidity":
      return Math.round(40 + ((h * 3) % 50));
    case "wind":
      return Math.round(5 + ((h * 9) % 45));
    default:
      return 0;
  }
}

export function getValueColor(value: number, param: string): string {
  const cfg = PARAM_LEGENDS[param?.toLowerCase()];
  const rng = PARAM_RANGES[param?.toLowerCase()];
  if (!cfg || !rng) return "#64748b";
  const t = Math.min(1, Math.max(0, (value - rng[0]) / (rng[1] - rng[0])));
  return cfg.stops[
    Math.min(Math.floor(t * cfg.stops.length), cfg.stops.length - 1)
  ].color;
}

// ── Human-readable condition labels per parameter ─────────────────────────────
export function getConditionLabel(value: number, param: string): string {
  switch (param?.toLowerCase()) {
    case "temperature":
      if (value < 18) return "Cool";
      if (value < 24) return "Mild";
      if (value < 30) return "Warm";
      if (value < 35) return "Hot";
      return "Very Hot";
    case "rainfall":
    case "precipitation":
      if (value === 0) return "No Rain";
      if (value < 10) return "Very Light Rain";
      if (value < 25) return "Light Rain";
      if (value < 50) return "Moderate Rain";
      if (value < 75) return "Heavy Rain";
      return "Very Heavy Rain";
    case "drought":
      if (value < 20) return "Normal";
      if (value < 40) return "Mild Drought";
      if (value < 60) return "Moderate Drought";
      if (value < 80) return "Severe Drought";
      return "Extreme Drought";
    case "humidity":
      if (value < 30) return "Very Dry";
      if (value < 50) return "Dry";
      if (value < 70) return "Moderate";
      if (value < 85) return "Humid";
      return "Very Humid";
    case "wind":
      if (value < 10) return "Calm";
      if (value < 20) return "Light Breeze";
      if (value < 35) return "Moderate Wind";
      if (value < 50) return "Strong Wind";
      return "Very Strong";
    default:
      return "";
  }
}

// ── Icon SVG strings for use in Leaflet DivIcon HTML ─────────────────────────
export function getParamIconSvg(param: string, color: string): string {
  const c = color;
  switch (param?.toLowerCase()) {
    case "temperature":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`;
    case "rainfall":
    case "precipitation":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v6M8 14v6M12 16v6"/></svg>`;
    case "drought":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
    case "humidity":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;
    case "wind":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`;
  }
}

export function makeMarkerHtml(
  districtName: string,
  value: number,
  unit: string,
  color: string,
  param: string,
): string {
  const label = getConditionLabel(value, param);
  const icon = getParamIconSvg(param, color);
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

// ── Ray-casting point-in-polygon ──────────────────────────────────────────────
// Tests whether a LatLng lies inside the actual polygon shape (not bounding box).
// Handles both Polygon and MultiPolygon by flattening nested LatLng arrays.
export const isPointInPolygon = (
  latlng: L.LatLng,
  polyLatLngs: any,
): boolean => {
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

export const isValidGeoJSON = (data: any): boolean =>
  data &&
  data.type === "FeatureCollection" &&
  Array.isArray(data.features) &&
  data.features.length > 0;
