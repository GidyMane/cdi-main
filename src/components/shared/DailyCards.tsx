import { Cloud, CloudRain } from "lucide-react";
import { EmptyState, getWeatherIcon } from "@/pages/WeatherForecastPage";
interface DailyEntry {
  day?: string;
  date?: string;
  high?: number;
  low?: number;
  rain?: number;
  icon?: string;
  confidence?: number;
}

interface DailyCardsProps {
  dailyForecast: DailyEntry[];
  isDarkMode: boolean;
  textMuted: string;
  headerText: string;
  FAO_BLUE: string;
  mobile?: boolean;
  selectedIndex?: number | null;
  onSelectCard?: (index: number) => void;
}

export const DailyCards = ({
  dailyForecast,
  isDarkMode,
  textMuted,
  headerText,
  FAO_BLUE,
  mobile = false,
  selectedIndex,
  onSelectCard,
}: DailyCardsProps) => {
  if (dailyForecast.length === 0) {
    return (
      <EmptyState
        icon={Cloud}
        message="No forecast data available"
        isDarkMode={isDarkMode}
      />
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {dailyForecast.map((day, idx) =>
        mobile ? (
          // ── Mobile card ───────────────────────────────────────────────────
          <div
            key={idx}
            onClick={() => onSelectCard?.(idx)}
            className={`flex-shrink-0 w-24 rounded-lg p-2 text-center transition-all hover:scale-105 cursor-pointer ${
              selectedIndex === idx ? "border" : isDarkMode ? "bg-slate-700/30" : "bg-slate-100"
            }`}
            style={{
              borderColor: selectedIndex === idx ? FAO_BLUE : undefined,
              backgroundColor: selectedIndex === idx ? `${FAO_BLUE}20` : undefined,
            }}
          >
            <p className={`text-xs ${textMuted}`}>{day.day ?? "—"}</p>
            <p className="text-[10px] text-slate-500 mb-1">{day.date ?? "—"}</p>
            {getWeatherIcon(day.icon, "w-5 h-5 mx-auto")}
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className={`text-sm font-bold ${headerText}`}>
                {day.high ?? 0}°
              </span>
              <span className={`text-xs ${textMuted}`}>{day.low ?? 0}°</span>
            </div>
            <div
              className="flex items-center justify-center gap-1 mt-0.5 text-[10px]"
              style={{ color: FAO_BLUE }}
            >
              <CloudRain className="w-2.5 h-2.5" />
              {day.rain ?? 0}mm
            </div>
          </div>
        ) : (
          // ── Desktop card ──────────────────────────────────────────────────
          <div
            key={idx}
            onClick={() => onSelectCard?.(idx)}
            className={`flex-shrink-0 w-20 p-2 rounded-lg text-center transition-all hover:scale-105 cursor-pointer ${
              selectedIndex === idx ? "border" : isDarkMode ? "bg-slate-700/30" : "bg-slate-100"
            }`}
            style={{
              borderColor: selectedIndex === idx ? FAO_BLUE : undefined,
              backgroundColor: selectedIndex === idx ? `${FAO_BLUE}20` : undefined,
            }}
          >
            <p className={`text-[10px] ${textMuted}`}>{day.day ?? "—"}</p>
            {getWeatherIcon(day.icon, "w-5 h-5 mx-auto my-1")}
            <p className={`text-xs font-bold ${headerText}`}>
              {day.high ?? 0}°
            </p>
            <p className={`text-[9px] ${textMuted}`}>{day.low ?? 0}°</p>
          </div>
        ),
      )}
    </div>
  );
};

export default DailyCards;
