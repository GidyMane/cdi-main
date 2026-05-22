import type { DailyEntry, HourlyForecast } from "@/types/data_types";

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

export type LayerMode = "monthly" | "daily" | "forecast";

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
    mode = "daily",
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
  if (mode === "monthly") {
    switch (param) {
      case "rainfall":
        return `wfews:chirps_rainfall_${yyyymm}`;

      case "temperature":
        return `wfews:era5_temperature_${yyyymm}`;
      case "wind":
        return `wfews:era5_wind_${yyyymm}`;
      case "humidity":
        return null; // MISSING
      default:
        return null;
    }
  }

  // ── Daily ──────────────────────────────────────────────────────────────────

  if (mode === "daily") {
    if (!yyyymmdd) return null;
    switch (param) {
      case "rainfall":
        return `wfews:gsmap_rainfall_${yyyymmdd}_${hh}`;
      case "wind":
        return `wfews:era5_wind_${yyyymmdd}_${hh}`;
      case "temperature":
        return `wfews:era5_temperature_${yyyymmdd}_${hh}`;
      case "humidity":
        return null; // MISSING
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
