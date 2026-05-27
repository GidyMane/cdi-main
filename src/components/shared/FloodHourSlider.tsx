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
  disabledUp = false,
  disabledDown = false,
  disabled = false,
  isDarkMode = true,
}: {
  display: string;
  onUp: () => void;
  onDown: () => void;
  disabledUp?: boolean;
  disabledDown?: boolean;
  disabled?: boolean;
  isDarkMode?: boolean;
}) {
  const textColor = isDarkMode ? "text-white" : "text-slate-900";
  const dimColor = isDarkMode ? "text-white/40" : "text-slate-900/40";
  const chevronColor = isDarkMode ? "#ffffff" : "#0f172a";
  return (
    <div className="flex flex-col items-center select-none">
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!disabledUp && !disabled) onUp();
        }}
        className={`p-0.5 transition-opacity ${disabledUp || disabled ? "opacity-20 cursor-not-allowed" : "opacity-70 hover:opacity-100"}`}
      >
        <ChevronUp className="w-3.5 h-3.5" style={{ color: chevronColor }} />
      </button>
      <span
        className={`font-bold text-sm w-10 text-center leading-5 ${disabled ? dimColor : textColor}`}
      >
        {display}
      </span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!disabledDown && !disabled) onDown();
        }}
        className={`p-0.5 transition-opacity ${disabledDown || disabled ? "opacity-20 cursor-not-allowed" : "opacity-70 hover:opacity-100"}`}
      >
        <ChevronDown className="w-3.5 h-3.5" style={{ color: chevronColor }} />
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

  // ── Today's date — captured once, never changes ───────────────────────────
  const todayRef = useRef(new Date());
  const todayDay = todayRef.current.getDate();
  const todayMonth = todayRef.current.getMonth();
  const todayYear = todayRef.current.getFullYear();

  // ── 10-day lookback lower bound ───────────────────────────────────────────
  const minDate = new Date(todayRef.current);
  minDate.setDate(minDate.getDate() - 10);
  const minDay = minDate.getDate();
  const minMonth = minDate.getMonth();
  const minYear = minDate.getFullYear();

  // ── Date state — seed from store if valid, otherwise today ──────────────
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
  // Always start at the real current hour, not midnight
  const [hour, setHour] = useState(new Date().getHours());
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const internalWrite = useRef(false);

  // ── On mount: get authoritative server time, fall back to local clock ─────
  // Fetches Africa/Kampala time from worldtimeapi.org so a misconfigured
  // local clock doesn't load the wrong WMS layer. Falls back to new Date()
  // after 3 s if the request is slow or fails.
  useEffect(() => {
    let cancelled = false;

    const apply = (now: Date) => {
      if (cancelled) return;
      const mon = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      setDay(now.getDate());
      setMonth(now.getMonth());
      setYear(now.getFullYear());
      setHour(now.getHours());
      internalWrite.current = true;
      setDateRange(`${now.getFullYear()}-${mon}-${d}`);
      setSliderhourIndexValue(now.getHours());
    };

    // Fallback fires after 3 s if the API is slow
    const fallbackTimer = setTimeout(() => apply(new Date()), 3000);

    fetch("https://worldtimeapi.org/api/timezone/Africa/Kampala")
      .then((r) => r.json())
      .then((data) => {
        clearTimeout(fallbackTimer);
        const serverNow = new Date(data.datetime);
        apply(isNaN(serverNow.getTime()) ? new Date() : serverNow);
      })
      .catch(() => {
        clearTimeout(fallbackTimer);
        apply(new Date());
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync FROM store dateRange → local state ───────────────────────────────
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
          setForecastStep((prev) => {
            const idx = FORECAST_STEPS.indexOf(prev);
            const next = FORECAST_STEPS[(idx + 1) % FORECAST_STEPS.length];
            return next;
          });
        } else {
          setHour((h) => {
            const next = (h + 1) % 24;
            if (next === 0) {
              // Advance day — stop at today
              setDay((d) => {
                const daysThisMonth = new Date(year, month + 1, 0).getDate();
                if (d < daysThisMonth) return d + 1;
                // Roll into next month, but not past today
                const newMonth = (month + 1) % 12;
                const newYear = month === 11 ? year + 1 : year;
                if (
                  newYear > todayYear ||
                  (newYear === todayYear && newMonth > todayMonth)
                ) {
                  setPlaying(false);
                  return d; // already at today's month boundary
                }
                setMonth(newMonth);
                setYear(newYear);
                return 1;
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
  }, [
    playing,
    isForecast,
    month,
    year,
    setForecastStep,
    todayYear,
    todayMonth,
  ]);

  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

  // ── Day navigation with automatic month/year rollover ────────────────────
  const isAtMax = year === todayYear && month === todayMonth && day >= todayDay;
  const isAtMin = year === minYear && month === minMonth && day <= minDay;

  const dayUp = () => {
    if (isAtMax) return;
    const daysThisMonth = new Date(year, month + 1, 0).getDate();
    if (day < daysThisMonth) {
      setDay(day + 1);
    } else {
      // Roll forward into next month
      const newMonth = (month + 1) % 12;
      const newYear = month === 11 ? year + 1 : year;
      setMonth(newMonth);
      setYear(newYear);
      setDay(1);
    }
  };

  const dayDown = () => {
    if (isAtMin) return;
    if (day > 1) {
      setDay(day - 1);
    } else {
      // Roll back into previous month
      const newMonth = (month + 11) % 12;
      const newYear = month === 0 ? year - 1 : year;
      const daysInPrevMonth = new Date(newYear, newMonth + 1, 0).getDate();
      setMonth(newMonth);
      setYear(newYear);
      setDay(daysInPrevMonth);
    }
  };

  const skipToEnd = () => {
    if (isForecast) {
      setForecastStep(FORECAST_STEPS[FORECAST_STEPS.length - 1]);
    } else {
      // Skip to today at current hour
      setDay(todayDay);
      setMonth(todayMonth);
      setYear(todayYear);
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

  // ── Floating spinner pill ────────────────────────────────────────────────────
  if (floating) {
    return (
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1"
        style={{
          background: "rgba(15,23,42,0.72)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
        }}
      >
        {/* Play / Pause */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.stopPropagation();
            setPlaying((p) => !p);
          }}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex-shrink-0"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="w-3 h-3 text-white" />
          ) : (
            <Play className="w-3 h-3 text-white fill-white" />
          )}
        </button>

        {/* Day */}
        <Spinner
          display={String(day).padStart(2, "0")}
          onUp={dayUp}
          onDown={dayDown}
          disabledUp={isAtMax}
          disabledDown={isAtMin}
        />

        {/* Month — read-only */}
        <Spinner
          display={MONTHS[month]}
          onUp={() => {}}
          onDown={() => {}}
          disabled
        />

        {/* Year */}
        <span className="text-white/50 font-bold text-xs tabular-nums">
          {year}
        </span>

        <span className="text-white/30 font-bold text-sm">·</span>

        {/* Hour or forecast step */}
        {!isForecast ? (
          <>
            <Spinner
              display={String(hour).padStart(2, "0")}
              onUp={() => setHour((v) => clamp(v + 1, 0, 23))}
              onDown={() => setHour((v) => clamp(v - 1, 0, 23))}
            />
            <span className="text-white/50 text-xs font-medium">h</span>
          </>
        ) : (
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
        )}

        {/* Skip to end */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.stopPropagation();
            skipToEnd();
          }}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex-shrink-0"
          title={
            isForecast
              ? `Skip to +${FORECAST_STEPS[FORECAST_STEPS.length - 1]}h`
              : "Skip to 23:00"
          }
        >
          <SkipForward className="w-3 h-3 text-white" />
        </button>
      </div>
    );
  }

  // ── Non-floating pill (flood monitor page) ───────────────────────────────────
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

      <Spinner
        display={String(day).padStart(2, "0")}
        onUp={dayUp}
        onDown={dayDown}
        disabledUp={isAtMax}
        disabledDown={isAtMin}
      />
      <Spinner
        display={MONTHS[month]}
        onUp={() => {}}
        onDown={() => {}}
        disabled
      />
      <span className="text-white/50 font-bold text-xs leading-5 tabular-nums">
        {year}
      </span>
      <span className="text-white/30 font-bold text-sm">·</span>

      {!isForecast && (
        <>
          <Spinner
            display={String(hour).padStart(2, "0")}
            onUp={() => setHour((v) => clamp(v + 1, 0, 23))}
            onDown={() => setHour((v) => clamp(v - 1, 0, 23))}
          />
          <span className="text-white/50 text-xs font-medium">h</span>
        </>
      )}
      {isForecast && (
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
      )}

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

  return (
    <div
      className={`border-t ${borderColor} flex items-center justify-center py-2 px-3`}
    >
      {pill}
    </div>
  );
}

export default FloodHourSlider;
