import { EmptyState, getWeatherIcon } from "@/pages/WeatherForecastPage";
import { Cloud } from "lucide-react";

function HourlyCards({
  hourlyForecast,
  isDarkMode,
  textMuted,
  headerText,
  FAO_BLUE,
  selectedIndex,
  onSelectCard,
}: {
  hourlyForecast: any[];
  isDarkMode: boolean;
  textMuted: string;
  headerText: string;
  FAO_BLUE: string;
  selectedIndex?: number | null;
  onSelectCard?: (index: number) => void;
}) {
  return hourlyForecast?.length === 0 ? (
    <EmptyState
      icon={Cloud}
      message="No forecast data available"
      isDarkMode={isDarkMode}
    />
  ) : (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {hourlyForecast.slice(0, 8).map((hour, idx) => (
        <div
          key={idx}
          onClick={() => onSelectCard?.(idx)}
          className={`flex-shrink-0 w-14 p-2 rounded-lg text-center transition-all hover:scale-105 cursor-pointer ${
            selectedIndex === idx || idx === 0
              ? "border"
              : isDarkMode
                ? "bg-slate-700/30"
                : "bg-slate-100"
          }`}
          style={{
            borderColor: selectedIndex === idx || idx === 0 ? FAO_BLUE : undefined,
            backgroundColor: selectedIndex === idx || idx === 0 ? `${FAO_BLUE}20` : undefined,
          }}
        >
          <p className={`text-[10px] ${textMuted} mb-1`}>{hour.time ?? "—"}</p>
          {getWeatherIcon(hour.icon, "w-5 h-5 mx-auto")}
          <p className={`text-sm font-bold mt-1 ${headerText}`}>
            {hour.temp ?? 0}°
          </p>
          <p className="text-[10px]" style={{ color: FAO_BLUE }}>
            {hour.rain ?? 0}mm
          </p>
        </div>
      ))}
    </div>
  );
}

export default HourlyCards;
