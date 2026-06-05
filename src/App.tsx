import { useState, useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Cloud,
  Sun,
  Waves,
  Radio,
  Bell,
  Menu,
  X,
  Moon,
  BookOpen,
  HelpCircle,
  Sun as SunIcon,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import OverviewPage from "./pages/OverviewPage";
import WeatherForecastPage from "./pages/WeatherForecastPage";

import DroughtMonitoringPage from "./pages/DroughtMonitoringPage";
import FloodMonitoringPage from "./pages/FloodMonitoringPage";
import WeatherStationsPage from "./pages/WeatherStationsPage";
import ResourcesPage from "./pages/ResourcesPage";
import HelpPage from "./pages/HelpPage";
import type { AppStoreState } from "./store/useAppStore";
import { useAppStore } from "./store/useAppStore";
import { useTheme } from "./hooks/useTheme";
import { ThemeProvider } from "./components/providers/ThemeProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { alertsAPI } from "./services/api";

// PageType derived from store for consistency
export type PageType = AppStoreState["currentPage"];

const navItems: { id: PageType; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "weather", label: "Weather Forecast", icon: Cloud },
  { id: "drought", label: "Drought Monitor", icon: Sun },
  { id: "flood", label: "Flood Monitor", icon: Waves },
  { id: "stations", label: "Weather Stations", icon: Radio },
  { id: "resources", label: "Resources", icon: BookOpen },
  { id: "help", label: "Help", icon: HelpCircle },
];

// Helper function to format time ago
const formatTimeAgo = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "recently";
  }
};

// FAO Blue Theme Color
const FAO_BLUE = "#318DDE";

function AppContent() {
  const {
    currentPage,
    setCurrentPage,
    sidebarOpen,
    setSidebarOpen,
    pageLoading,
    setPageLoading,
    showNotifications,
    setShowNotifications,
    floodAlerts,
  } = useAppStore();

  const { isDarkMode, toggleTheme } = useTheme();

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [particles, setParticles] = useState<
    { id: number; left: string; top: string; delay: string; duration: string }[]
  >([]);
  const [alertsData, setAlertsData] = useState<any[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Generate particles once to avoid impure function calls during render
  useEffect(() => {
    setParticles(
      [...Array(20)].map((_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${Math.random() * 5}s`,
        duration: `${3 + Math.random() * 4}s`,
      })),
    );
  }, []);

  // Fetch alerts from API
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response: any = await alertsAPI.getRecent(5);
        if (response && Array.isArray(response.results)) {
          const formatted = response.results.map((alert: any) => ({
            id: alert.id || Math.random(),
            title: alert.title || alert.message || "Alert",
            location: alert.location || "Uganda",
            time: alert.created_at
              ? formatTimeAgo(alert.created_at)
              : "Recently",
            type: alert.alert_type || "alert",
            severity: alert.severity === "high" ? "high" : "medium",
          }));
          setAlertsData(formatted);
        }
      } catch (error) {
        console.error("Failed to fetch alerts:", error);
        // Keep empty array on error
      }
    };

    fetchAlerts();
    // Refresh alerts every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePageChange = (page: PageType) => {
    if (page === currentPage) return;
    setPageLoading(true);
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentPage(page);
      setTimeout(() => {
        setIsTransitioning(false);
        setPageLoading(false);
      }, 50);
    }, 300);
  };

  const renderPage = () => {
    switch (currentPage) {
      case "overview":
        return (
          <OverviewPage onNavigate={handlePageChange} isDarkMode={isDarkMode} />
        );
      case "weather":
        return <WeatherForecastPage isDarkMode={isDarkMode} />;
     
      case "drought":
        return <DroughtMonitoringPage isDarkMode={isDarkMode} />;
      case "flood":
        return <FloodMonitoringPage isDarkMode={isDarkMode} />;
      case "stations":
        return <WeatherStationsPage isDarkMode={isDarkMode} />;
      case "resources":
        return <ResourcesPage isDarkMode={isDarkMode} />;
      case "help":
        return <HelpPage isDarkMode={isDarkMode} />;
      default:
        return (
          <OverviewPage onNavigate={handlePageChange} isDarkMode={isDarkMode} />
        );
    }
  };

  // Theme classes
  const themeClasses = isDarkMode
    ? "bg-slate-900 text-white"
    : "bg-slate-50 text-slate-900";

  const headerClasses = isDarkMode
    ? "bg-slate-800/50 border-slate-700/50"
    : "bg-white/80 border-slate-200";

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-500 ${themeClasses}`}
    >
      {/* Page Loading Overlay */}
      {pageLoading && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center ${isDarkMode ? "bg-slate-900/90" : "bg-white/90"} backdrop-blur-sm`}
        >
          <div className="text-center">
            <div
              className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }}
            ></div>
            <p className={isDarkMode ? "text-slate-400" : "text-slate-600"}>
              Loading...
            </p>
          </div>
        </div>
      )}

      {/* Background Animation - Only in Dark Mode */}
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {/* Animated gradient orbs - FAO Blue Theme */}
          <div
            className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20 animate-pulse"
            style={{ backgroundColor: FAO_BLUE, animationDuration: "4s" }}
          />
          <div
            className="absolute top-1/2 -left-40 w-80 h-80 rounded-full blur-3xl opacity-10 animate-pulse bg-blue-400"
            style={{ animationDuration: "6s", animationDelay: "1s" }}
          />
          <div
            className="absolute -bottom-40 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-15 animate-pulse bg-cyan-400"
            style={{ animationDuration: "5s", animationDelay: "2s" }}
          />

          {/* Floating particles */}
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute w-1 h-1 rounded-full opacity-30 animate-float bg-blue-400"
              style={{
                left: p.left,
                top: p.top,
                animationDelay: p.delay,
                animationDuration: p.duration,
              }}
            />
          ))}
        </div>
      )}

      {/* Top Navigation Bar */}
      <header
        className={`h-14 backdrop-blur-sm border-b flex items-center justify-between px-4 md:px-6 fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${headerClasses}`}
      >
        <div className="flex items-center gap-3">
          {/* Mobile Menu Button - Only shows sidebar on desktop */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1.5 rounded-lg transition-colors hidden lg:flex ${isDarkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-200"}`}
          >
            {sidebarOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>

          {/* FAO and Uganda Logo */}
          <div className="flex items-center gap-2">
            <img
              src={isDarkMode ? "/fao-white.png" : "/fao_logo_3lines_en1.png"}
              alt="FAO Logo"
              className="h-6 md:h-8 w-auto object-contain"
            />
            <div
              className={`h-6 w-px ${isDarkMode ? "bg-slate-700" : "bg-slate-300"}`}
            />
            <div className="flex items-center gap-1.5">
              <img
                src="/uganda-coat-of-arms.svg"
                alt="Uganda Coat of Arms"
                className="h-7 md:h-9 w-auto object-contain"
              />
              <div className="hidden sm:block">
                <p
                  className={`text-[9px] md:text-[10px] font-bold leading-tight ${isDarkMode ? "text-white" : "text-slate-900"}`}
                >
                  Republic of Uganda
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Center Navigation Tabs - Desktop only */}
        <nav
          className={`hidden lg:flex items-center gap-0.5 rounded-xl p-1 ${isDarkMode ? "bg-slate-800/80" : "bg-slate-200/80"}`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handlePageChange(item.id)}
                title={item.label}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs xl:text-sm font-medium transition-all ${
                  isActive
                    ? "text-white"
                    : isDarkMode
                      ? "text-slate-400 hover:text-white hover:bg-slate-700/50"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-300/50"
                }`}
                style={{ backgroundColor: isActive ? FAO_BLUE : "transparent" }}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden xl:inline">{item.label}</span>
                <span className="xl:hidden">{item.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Side - System Name, Theme Toggle, Notifications */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* System Name */}
          <div className="hidden md:block text-right">
            <h1 className="font-bold text-xs xl:text-sm leading-tight">
              Uganda Multi Hazard
            </h1>
            <p
              className={`text-[9px] xl:text-[10px] ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
            >
              Observatory System
            </p>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl transition-colors ${isDarkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-200"}`}
          >
            {isDarkMode ? (
              <SunIcon className="w-5 h-5 text-yellow-400" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </button>

          {/* Notification Button with Dropdown */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative p-2 rounded-xl transition-colors ${isDarkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-200"}`}
            >
              <Bell
                className={`w-5 h-5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
              />
              {(alertsData.length + floodAlerts.length) > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div
                className={`absolute right-0 top-full mt-2 w-80 rounded-xl shadow-lg border z-50 animate-fade-in-up ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700"
                    : "bg-white border-slate-200"
                }`}
              >
                <div
                  className={`p-3 border-b flex items-center justify-between ${isDarkMode ? "border-slate-700" : "border-slate-200"}`}
                >
                  <span className="font-semibold text-sm">Notifications</span>
                  <span className="text-xs px-2 py-1 bg-red-500/20 text-red-500 rounded-full">
                    {alertsData.length + floodAlerts.length} New
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {/* Flood critical basin alerts from live API */}
                  {floodAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 border-b last:border-b-0 transition-colors ${
                        isDarkMode
                          ? "border-slate-700/30 hover:bg-slate-700/50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {alert.basinName} — {alert.status} flood alert
                          </p>
                          <div className={`flex items-center gap-2 text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                            <MapPin className="w-3 h-3" />
                            <span>{alert.discharge.toLocaleString()} m³/s</span>
                            {alert.population > 0 && (
                              <>
                                <span>•</span>
                                <span>{alert.population >= 1000 ? `${Math.round(alert.population / 1000)}K` : alert.population} at risk</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* General system alerts */}
                  {alertsData.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 border-b last:border-b-0 transition-colors ${
                        isDarkMode
                          ? "border-slate-700/30 hover:bg-slate-700/50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            alert.severity === "high" ? "text-red-500" : "text-yellow-500"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{alert.title}</p>
                          <div className={`flex items-center gap-2 text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                            <MapPin className="w-3 h-3" />
                            <span>{alert.location}</span>
                            <span>•</span>
                            <span>{alert.time}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {alertsData.length === 0 && floodAlerts.length === 0 && (
                    <div className={`p-4 text-center text-xs ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                      No active alerts
                    </div>
                  )}
                </div>
                <div className={`p-2 border-t text-center ${isDarkMode ? "border-slate-700/30" : "border-slate-200"}`}>
                  <button
                    className="text-xs hover:underline"
                    style={{ color: FAO_BLUE }}
                    onClick={() => { setShowNotifications(false); setCurrentPage("flood"); }}
                  >
                    View Flood Monitor
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation - Bottom bar */}
      <nav
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t px-2 py-2 ${
          isDarkMode
            ? "bg-slate-800/95 border-slate-700/50"
            : "bg-white/95 border-slate-200"
        }`}
      >
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handlePageChange(item.id)}
                className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-all ${
                  isActive
                    ? "text-white"
                    : isDarkMode
                      ? "text-slate-400"
                      : "text-slate-500"
                }`}
                style={{ color: isActive ? FAO_BLUE : undefined }}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px]">{item.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex pt-14 min-h-screen relative z-10 pb-16 lg:pb-0">
        {/* Main Content with transition */}
        <main
          className={`flex-1 overflow-auto transition-all duration-300 ${isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
        >
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

// Create once outside the component so the cache persists across re-renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes default
      gcTime: 30 * 60 * 1000,   // 30 minutes in memory
    },
  },
});

/**
 * Main App component with ThemeProvider wrapper
 * This ensures theme is available throughout the entire app
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;