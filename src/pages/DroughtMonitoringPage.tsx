import { useState, useEffect } from "react";
import { Sun,  AlertTriangle } from "lucide-react";

interface DroughtMonitoringPageProps {
  isDarkMode?: boolean;
}

const FAO_BLUE = "#318DDE";

export default function DroughtMonitoringPage({
  isDarkMode = true,
}: DroughtMonitoringPageProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const textMuted = isDarkMode ? "text-slate-400" : "text-slate-500";

  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-slate-900" : "bg-slate-50"}`}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }}
          ></div>
          <p className={textMuted}>Loading Drought Monitor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Compact Header Banner - Ribbon only */}
      <div className="px-4 md:px-6 py-3">
        <div
          className="relative overflow-hidden rounded-lg md:rounded-xl p-3 md:p-4 animate-fade-in-up"
          style={{
            background: `linear-gradient(135deg, ${FAO_BLUE}e6 0%, ${FAO_BLUE}99 100%)`,
          }}
        >
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="text-lg md:text-xl font-bold text-white">
                  Drought Monitoring
                </h1>
                <p className="text-slate-200 text-xs md:text-sm">
                  CDI (Combined Drought Index) and vegetation health analysis
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(249, 115, 22, 0.4)" }}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Severe Drought Warning
                  </span>
                  <span
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                  >
                    <Sun className="w-3 h-3" />
                    Low Vegetation Health
                  </span>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>

      {/* Embedded CDI iframe - takes remaining spacee */}
      <div className="flex-1 relative bg-slate-900 overflow-hidden">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-900/50 backdrop-blur-sm">
            <div className="w-10 h-10 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin"></div>
          </div>
        )}
        <iframe
          src="https://droughtfrontend.rosewillbome.co.ke"
          className="w-full h-full border-0"
          title="CDI Drought Monitoring System"
          onLoad={() => setIframeLoaded(true)}
          sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
        />
      </div>
    </div>
  );
}
