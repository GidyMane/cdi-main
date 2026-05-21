import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ChevronUp, ChevronDown, Play, Pause, SkipForward } from "lucide-react";

// ── Hour steps exported for map layer name construction ──────────────────────
export const FLOOD_HOURS: any = [
  "00","01","02","03","04","05","06","07","08","09","10","11",
  "12","13","14","15","16","17","18","19","20","21","22","23","24",
];

// ── Month names ───────────────────────────────────────────────────────────────
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

export function FloodHourSlider({
  isDarkMode,
  borderColor,
  floating = false,
}: FloodHourSliderProps) {
  const { setSliderhourIndexValue } = useAppStore(
    (state) => state,
  );

  // Initialise from today
  const today = new Date();
  const [day,    setDay]    = useState(today.getDate());
  const [month,  setMonth]  = useState(today.getMonth()); // 0-based
  const [hour,   setHour]   = useState(today.getHours());
  const [minute, setMinute] = useState(Math.floor(today.getMinutes() / 10) * 10);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep store in sync with hour
  useEffect(() => {
    setSliderhourIndexValue(hour);
  }, [hour, setSliderhourIndexValue]);

  // Auto-play: advance hour every 1.5 s
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setHour((h) => {
          const next = (h + 1) % 24;
          return next;
        });
      }, 1500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const daysInMonth = new Date(today.getFullYear(), month + 1, 0).getDate();

  const spin = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    delta: number,
    min: number,
    max: number,
  ) => setter((v) => Math.min(max, Math.max(min, v + delta)));

  const skipToEnd = () => {
    setHour(23);
    setMinute(50);
    setPlaying(false);
  };

  // ── Spinner column ───────────────────────────────────────────────────────────
  const Spinner = ({
    
    display,
    onUp,
    onDown,
  }: {
    value: number;
    display: string;
    onUp: () => void;
    onDown: () => void;
  }) => (
    <div className="flex flex-col items-center select-none">
      <button
        onClick={onUp}
        className="p-0.5 opacity-70 hover:opacity-100 transition-opacity"
      >
        <ChevronUp className="w-3.5 h-3.5 text-white" />
      </button>
      <span className="text-white font-bold text-sm w-8 text-center leading-5">
        {display}
      </span>
      <button
        onClick={onDown}
        className="p-0.5 opacity-70 hover:opacity-100 transition-opacity"
      >
        <ChevronDown className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  );

  const bg = isDarkMode ? "bg-slate-700/90" : "bg-slate-600/90";

  const pill = (
    <div
      className={`${bg} backdrop-blur-sm rounded-2xl px-4 py-2 flex items-center gap-3 shadow-lg`}
    >
        {/* Play / Pause */}
        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex-shrink-0"
        >
          {playing
            ? <Pause  className="w-3.5 h-3.5 text-white" />
            : <Play   className="w-3.5 h-3.5 text-white fill-white" />
          }
        </button>

        {/* Day */}
        <Spinner
          value={day}
          display={String(day).padStart(2, "0")}
          onUp={()   => spin(setDay, +1, 1, daysInMonth)}
          onDown={()  => spin(setDay, -1, 1, daysInMonth)}
        />

        {/* Month */}
        <Spinner
          value={month}
          display={MONTHS[month]}
          onUp={()   => setMonth((m) => (m + 1) % 12)}
          onDown={()  => setMonth((m) => (m + 11) % 12)}
        />

        {/* Separator */}
        <span className="text-white/60 font-bold text-sm">·</span>

        {/* Hour */}
        <Spinner
          value={hour}
          display={String(hour).padStart(2, "0")}
          onUp={()   => spin(setHour,   +1, 0, 23)}
          onDown={()  => spin(setHour,   -1, 0, 23)}
        />

        {/* Colon */}
        <span className="text-white font-bold text-sm -mx-1">:</span>

        {/* Minute */}
        <Spinner
          value={minute}
          display={String(minute).padStart(2, "0")}
          onUp={()   => setMinute((m) => (m + 10) % 60)}
          onDown={()  => setMinute((m) => (m - 10 + 60) % 60)}
        />

        {/* Skip to end */}
        <button
          onClick={skipToEnd}
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
