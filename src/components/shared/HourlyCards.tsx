import { EmptyState, getWeatherIcon } from "@/pages/WeatherForecastPage";
import { Cloud, Wind, Droplets } from "lucide-react";

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
          {selectedIndex === idx && (
            <div className={`mt-1 pt-1 border-t ${isDarkMode ? "border-slate-600" : "border-slate-200"} space-y-0.5`}>
              <div className="flex items-center justify-center gap-0.5 text-[9px]">
                <Wind className="w-2.5 h-2.5" style={{ color: "#f97316" }} />
                <span style={{ color: "#f97316" }}>{hour.windSpeed ?? 0}</span>
              </div>
              <div className="flex items-center justify-center gap-0.5 text-[9px]">
                <Droplets className="w-2.5 h-2.5" style={{ color: "#06b6d4" }} />
                <span style={{ color: "#06b6d4" }}>{hour.humidity ?? 0}%</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default HourlyCards;
