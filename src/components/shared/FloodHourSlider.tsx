import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ChevronUp, ChevronDown, Play, Pause, SkipForward } from "lucide-react";

export const FLOOD_HOURS: any = [
  "00","01","02","03","04","05","06","07","08","09","10","11",
  "12","13","14","15","16","17","18","19","20","21","22","23","24",
];

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

interface FloodHourSliderProps {
  isDarkMode: boolean;
  borderColor: string;
  textMuted: string;
  FAO_BLUE?: string;
  floating?: boolean;
}

// ── Spinner defined at module level so React never treats it as a new type ──────
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
        onMouseDown={(e) => { e.stopPropagation(); onUp(); }}
        className="p-0.5 opacity-70 hover:opacity-100 transition-opacity"
      >
        <ChevronUp className="w-3.5 h-3.5 text-white" />
      </button>
      <span className="text-white font-bold text-sm w-8 text-center leading-5">
        {display}
      </span>
      <button
        type="button"
        onMouseDown={(e) => { e.stopPropagation(); onDown(); }}
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
  const { setSliderhourIndexValue, setDateRange } = useAppStore((state) => state);

  const todayRef = useRef(new Date());
  const today = todayRef.current;

  const [day,    setDay]    = useState(today.getDate());
  const [month,  setMonth]  = useState(today.getMonth());
  const [hour,   setHour]   = useState(today.getHours());
  const [minute, setMinute] = useState(Math.floor(today.getMinutes() / 10) * 10);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const daysInMonth = new Date(today.getFullYear(), month + 1, 0).getDate();

  // Sync day/month → dateRange store
  useEffect(() => {
    const yr  = today.getFullYear();
    const mon = String(month + 1).padStart(2, "0");
    const d   = String(day).padStart(2, "0");
    setDateRange(`${yr}-${mon}-${d}`);
  }, [day, month, setDateRange, today]);

  // Sync hour → sliderhourIndexValue store
  useEffect(() => {
    setSliderhourIndexValue(hour);
  }, [hour, setSliderhourIndexValue]);

  // Auto-play: advance hour every 1.5 s
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setHour((h) => (h + 1) % 24);
      }, 1500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing]);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const skipToEnd = () => { setHour(23); setMinute(50); setPlaying(false); };

  const bg = isDarkMode ? "bg-slate-700/90" : "bg-slate-600/90";

  const pill = (
    <div className={`${bg} backdrop-blur-sm rounded-2xl px-4 py-2 flex items-center gap-3 shadow-lg`}>
      {/* Play / Pause */}
      <button
        type="button"
        onMouseDown={(e) => { e.stopPropagation(); setPlaying((p) => !p); }}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex-shrink-0"
      >
        {playing
          ? <Pause  className="w-3.5 h-3.5 text-white" />
          : <Play   className="w-3.5 h-3.5 text-white fill-white" />}
      </button>

      <Spinner
        display={String(day).padStart(2, "0")}
        onUp={()   => setDay((v) => clamp(v + 1, 1, daysInMonth))}
        onDown={()  => setDay((v) => clamp(v - 1, 1, daysInMonth))}
      />

      <Spinner
        display={MONTHS[month]}
        onUp={()   => setMonth((m) => (m + 1) % 12)}
        onDown={()  => setMonth((m) => (m + 11) % 12)}
      />

      <span className="text-white/60 font-bold text-sm">·</span>

      <Spinner
        display={String(hour).padStart(2, "0")}
        onUp={()   => setHour((v) => clamp(v + 1, 0, 23))}
        onDown={()  => setHour((v) => clamp(v - 1, 0, 23))}
      />

      <span className="text-white font-bold text-sm -mx-1">:</span>

      <Spinner
        display={String(minute).padStart(2, "0")}
        onUp={()   => setMinute((m) => (m + 10) % 60)}
        onDown={()  => setMinute((m) => (m - 10 + 60) % 60)}
      />

      <button
        type="button"
        onMouseDown={(e) => { e.stopPropagation(); skipToEnd(); }}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex-shrink-0"
      >
        <SkipForward className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  );

  if (floating) return pill;

  return (
    <div className={`border-t ${borderColor} flex items-center justify-center py-2 px-3`}>
      {pill}
    </div>
  );
}

export default FloodHourSlider;
