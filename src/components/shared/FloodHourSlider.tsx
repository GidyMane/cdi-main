import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ChevronUp, ChevronDown, Play, Pause, SkipForward } from "lucide-react";

// ── FLOOD_HOURS: index → zero-padded hour string ──────────────────────────────
export const FLOOD_HOURS: Record<number | string, string> = {
  "000": "-", // sentinel — no hour selected
  ...Object.fromEntries(
    Array.from({ length: 24 }, (_, i) => [i, String(i).padStart(2, "0")]),
  ),
};

// ── Available forecast steps (hours ahead) ────────────────────────────────────
export const FORECAST_STEPS = [24, 48, 72, 96, 120, 144, 168];

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

interface FloodHourSliderProps {
  isDarkMode: boolean;
  borderColor: string;
  textMuted: string;
  FAO_BLUE?: string;
  floating?: boolean;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({
  display,
  onUp,
  onDown,
}: {
  display: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex flex-col items-center select-none">
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          onUp();
        }}
        className="p-0.5 opacity-70 hover:opacity-100 transition-opacity"
      >
        <ChevronUp className="w-3.5 h-3.5 text-white" />
      </button>
      <span className="text-white font-bold text-sm w-10 text-center leading-5">
        {display}
      </span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          onDown();
        }}
        className="p-0.5 opacity-70 hover:opacity-100 transition-opacity"
      >
        <ChevronDown className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  );
}

export function FloodHourSlider({
  isDarkMode,
  borderColor,
  floating = false,
}: FloodHourSliderProps) {
  const {
    setSliderhourIndexValue,
    setDateRange,
    dateRange,
    layerMode,
    forecastStep,
    setForecastStep,
  } = useAppStore((s) => s);

  const isForecast = layerMode === "forecast";

  // ── Date state ────────────────────────────────────────────────────────────
  const initDate = (() => {
    if (dateRange) {
      const p = new Date(dateRange + "T00:00:00");
      if (!isNaN(p.getTime())) return p;
    }
    return new Date();
  })();

  const [day, setDay] = useState(initDate.getDate());
  const [month, setMonth] = useState(initDate.getMonth());
  const [year, setYear] = useState(initDate.getFullYear());
  const [hour, setHour] = useState(new Date().getHours());
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sync FROM store dateRange → local state ───────────────────────────────
  const internalWrite = useRef(false);
  useEffect(() => {
    if (internalWrite.current) {
      internalWrite.current = false;
      return;
    }
    if (!dateRange) return;
    const parsed = new Date(dateRange + "T00:00:00");
    if (isNaN(parsed.getTime())) return;
    setDay(parsed.getDate());
    setMonth(parsed.getMonth());
    setYear(parsed.getFullYear());
  }, [dateRange]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // ── Sync day / month / year → store ──────────────────────────────────────
  useEffect(() => {
    const mon = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    internalWrite.current = true;
    setDateRange(`${year}-${mon}-${d}`);
  }, [day, month, year, setDateRange]);

  // ── Sync hour → store ─────────────────────────────────────────────────────
  useEffect(() => {
    setSliderhourIndexValue(hour);
  }, [hour, setSliderhourIndexValue]);

  // ── Auto-play ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        if (isForecast) {
          // Cycle through forecast steps
          setForecastStep((prev) => {
            const idx = FORECAST_STEPS.indexOf(prev);
            const next = FORECAST_STEPS[(idx + 1) % FORECAST_STEPS.length];
            return next;
          });
        } else {
          // Advance hour, wrap day at midnight
          setHour((h) => {
            const next = (h + 1) % 24;
            if (next === 0) {
              setDay((d) => {
                const maxDay = new Date(year, month + 1, 0).getDate();
                return d < maxDay ? d + 1 : 1;
              });
            }
            return next;
          });
        }
      }, 1500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, isForecast, month, year, setForecastStep]);

  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

  const skipToEnd = () => {
    if (isForecast) {
      setForecastStep(FORECAST_STEPS[FORECAST_STEPS.length - 1]);
    } else {
      setHour(23);
    }
    setPlaying(false);
  };

  // ── Forecast step navigation ──────────────────────────────────────────────
  const stepUp = () => {
    const idx = FORECAST_STEPS.indexOf(forecastStep);
    if (idx < FORECAST_STEPS.length - 1)
      setForecastStep(FORECAST_STEPS[idx + 1]);
  };
  const stepDown = () => {
    const idx = FORECAST_STEPS.indexOf(forecastStep);
    if (idx > 0) setForecastStep(FORECAST_STEPS[idx - 1]);
  };

  const bg = isDarkMode ? "bg-slate-700/90" : "bg-slate-600/90";

  const pill = (
    <div
      className={`${bg} backdrop-blur-sm rounded-2xl px-4 py-2 flex items-center gap-3 shadow-lg`}
    >
      {/* Play / Pause */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          setPlaying((p) => !p);
        }}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex-shrink-0"
        title={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="w-3.5 h-3.5 text-white" />
        ) : (
          <Play className="w-3.5 h-3.5 text-white fill-white" />
        )}
      </button>

      {isForecast ? (
        /* ── Forecast mode: show step spinner ── */
        <>
          <Spinner
            display={`+${forecastStep}h`}
            onUp={stepUp}
            onDown={stepDown}
          />
          <span className="text-white/50 text-xs font-medium whitespace-nowrap">
            ahead
          </span>
        </>
      ) : (
        /* ── Daily mode: show date + hour ── */
        <>
          <Spinner
            display={String(day).padStart(2, "0")}
            onUp={() => setDay((v) => clamp(v + 1, 1, daysInMonth))}
            onDown={() => setDay((v) => clamp(v - 1, 1, daysInMonth))}
          />
          <Spinner
            display={MONTHS[month]}
            onUp={() => setMonth((m) => (m + 1) % 12)}
            onDown={() => setMonth((m) => (m + 11) % 12)}
          />
          <span className="text-white/50 font-bold text-xs leading-5 tabular-nums">
            {year}
          </span>
          <span className="text-white/60 font-bold text-sm">·</span>
          <Spinner
            display={String(hour).padStart(2, "0")}
            onUp={() => setHour((v) => clamp(v + 1, 0, 23))}
            onDown={() => setHour((v) => clamp(v - 1, 0, 23))}
          />
          <span className="text-white font-bold text-sm -mx-1">:00</span>
        </>
      )}

      {/* Skip to end */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          skipToEnd();
        }}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex-shrink-0"
        title={
          isForecast
            ? `Skip to +${FORECAST_STEPS[FORECAST_STEPS.length - 1]}h`
            : "Skip to 23:00"
        }
      >
        <SkipForward className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  );

  if (floating) return pill;

  return (
    <div
      className={`border-t ${borderColor} flex items-center justify-center py-2 px-3`}
    >
      {pill}
    </div>
  );
}

export default FloodHourSlider;
