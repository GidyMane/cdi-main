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

export function removeLastTwoDigits(value:string) {
  let data = value.toString().slice(0, -2);
  console.log("removeLastTwoDigits",data)
  return data
}
