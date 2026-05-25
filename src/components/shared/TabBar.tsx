import { useAppStore } from "@/store/useAppStore";
import { Calendar, Clock } from "lucide-react";
import { useEffect } from "react";

function TabBar({
  mobile = false,
  activeTab,
  setActiveTab,
  borderColor,
  isDarkMode,
  FAO_BLUE,
}: {
  mobile?: boolean;
  activeTab: "nowcast" | "forecast";
  setActiveTab: (tab: "nowcast" | "forecast") => void;
  borderColor: string;
  isDarkMode: boolean;
  FAO_BLUE: string;
}) {
  const { setLayerMode } = useAppStore((state) => state);
  useEffect(() => {
    setLayerMode(activeTab);
  }, [activeTab]);
  return (
    <div className={`flex border-b ${borderColor}`}>
      {(["nowcast", "forecast"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all ${
            activeTab === tab
              ? "text-white"
              : isDarkMode
                ? "bg-slate-800/50 text-slate-400 hover:text-white"
                : "bg-slate-100 text-slate-600"
          }`}
          style={{ backgroundColor: activeTab === tab ? FAO_BLUE : undefined }}
        >
          <span
            className={`w-2 h-2 rounded-full ${activeTab === tab ? "bg-white" : "bg-slate-400"}`}
          />
          {tab === "nowcast" ? (
            <>
              <Clock className="w-3.5 h-3.5" />
              {mobile ? "Nowcast" : "24-Hour Nowcast"}
            </>
          ) : (
            <>
              <Calendar className="w-3.5 h-3.5" />
              {mobile ? "Forecast" : "7-Day Forecast"}
            </>
          )}
        </button>
      ))}
    </div>
  );
}

export default TabBar;
