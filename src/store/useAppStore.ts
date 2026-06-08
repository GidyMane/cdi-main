import type { district } from "@/types/data_types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Comprehensive Zustand store for global app state
 * Includes: theme, filters, loading states, and API data caching
 */

export interface AppStoreState {
  // Theme Management
  isDarkMode: boolean;
  setIsDarkMode: (mode: boolean) => void;

  // Navigation
  currentPage:
    | "overview"
    | "weather"
    | "weathermap"
    | "drought"
    | "flood"
    | "stations"
    | "resources"
    | "help";
  setCurrentPage: (page: AppStoreState["currentPage"]) => void;

  // Filters & Selection
  selectedDistrictId: district | undefined;
  setSelectedDistrictId: (id: district | undefined) => void;
  selectedRegionId?: string;
  setSelectedRegionId: (id: string) => void;

  // Constants
  FAO_BLUE: string;

  // Weather Data
  weatherData: any;
  weatherLoading: boolean;
  weatherError: string | null;
  setWeatherData: (data: any) => void;
  setWeatherLoading: (loading: boolean) => void;
  setWeatherError: (error: string | null) => void;

  // Drought Data
  droughtData: any;
  droughtLoading: boolean;
  droughtError: string | null;
  setDroughtData: (data: any) => void;
  setDroughtLoading: (loading: boolean) => void;
  setDroughtError: (error: string | null) => void;

  // Flood Data
  floodData: any;
  floodLoading: boolean;
  floodError: string | null;
  setFloodData: (data: any) => void;
  setFloodLoading: (loading: boolean) => void;
  setFloodError: (error: string | null) => void;

  // Stations Data
  stationsData: any;
  stationsLoading: boolean;
  stationsError: string | null;
  setStationsData: (data: any) => void;
  setStationsLoading: (loading: boolean) => void;
  setStationsError: (error: string | null) => void;

  // UI State
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  pageLoading: boolean;
  setPageLoading: (loading: boolean) => void;

  // Map Filters
  selectedParameter: string;
  setSelectedParameter: (parameter: string) => void;
  dateRange: string;
  setDateRange: (dateRange: string) => void;

  //slider
  sliderhourIndexValue: string;
  setSliderhourIndexValue: (value: any) => void;

  // Map layer mode
  layerMode: "nowcast" | "forecast";
  setLayerMode: (mode: "nowcast" | "forecast") => void;

  // Forecast step in hours (24, 48, 72, 96, 120, 144, 168)
  forecastStep: number;
  // setForecastStep: (step: number) => void;
  setForecastStep: (value: number | ((prev: number) => number)) => void;

  // Flood critical alerts — populated by FloodMonitoringPage, consumed by the bell
  floodAlerts: Array<{ id: string; basinName: string; status: string; discharge: number; population: number }>;
  setFloodAlerts: (alerts: Array<{ id: string; basinName: string; status: string; discharge: number; population: number }>) => void;

  // Chart metric from map interaction
  mapInteractionMetric: "temp" | "rain" | "wind" | null;
  setMapInteractionMetric: (metric: "temp" | "rain" | "wind" | null) => void;
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      // Theme — initialise from system preference so there's no flash on first load
      isDarkMode:
        typeof window !== "undefined"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : false,
      setIsDarkMode: (mode) => set({ isDarkMode: mode }),

      // Navigation
      currentPage: "overview",
      setCurrentPage: (page) => set({ currentPage: page }),

      // Filters
      selectedDistrictId: {
    "id": 5,
    "name": "Abim",
    "region": "Northern"
},
      setSelectedDistrictId: (id) => set({ selectedDistrictId: id }),
      selectedRegionId: undefined,
      setSelectedRegionId: (id) => set({ selectedRegionId: id }),

      // Constants
      FAO_BLUE: "#318DDE",

      // Weather State
      weatherData: null,
      weatherLoading: false,
      weatherError: null,
      setWeatherData: (data) => set({ weatherData: data }),
      setWeatherLoading: (loading) => set({ weatherLoading: loading }),
      setWeatherError: (error) => set({ weatherError: error }),

      // Drought State
      droughtData: null,
      droughtLoading: false,
      droughtError: null,
      setDroughtData: (data) => set({ droughtData: data }),
      setDroughtLoading: (loading) => set({ droughtLoading: loading }),
      setDroughtError: (error) => set({ droughtError: error }),

      // Flood State
      floodData: null,
      floodLoading: false,
      floodError: null,
      setFloodData: (data) => set({ floodData: data }),
      setFloodLoading: (loading) => set({ floodLoading: loading }),
      setFloodError: (error) => set({ floodError: error }),

      // Stations State
      stationsData: null,
      stationsLoading: false,
      stationsError: null,
      setStationsData: (data) => set({ stationsData: data }),
      setStationsLoading: (loading) => set({ stationsLoading: loading }),
      setStationsError: (error) => set({ stationsError: error }),

      // UI State
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      showNotifications: false,
      setShowNotifications: (show) => set({ showNotifications: show }),
      pageLoading: false,
      setPageLoading: (loading) => set({ pageLoading: loading }),

      //filter map
      selectedParameter: "temperature",
      setSelectedParameter: (parameter: any) =>
        set({ selectedParameter: parameter }),
      dateRange: "",
      setDateRange: (dateRange: any) => set({ dateRange: dateRange }),

      //slider
      sliderhourIndexValue: "000",
      setSliderhourIndexValue: (value: string) =>
        set({ sliderhourIndexValue: value }),

      // Map layer mode
      layerMode: "nowcast",
      setLayerMode: (mode) => set({ layerMode: mode }),

      // Forecast step
      forecastStep: 24,
      // setForecastStep: (step) => set({ forecastStep: step }),
      setForecastStep: (value) =>
        set((state) => ({
          forecastStep:
            typeof value === "function" ? value(state.forecastStep) : value,
        })),

      // Flood critical alerts
      floodAlerts: [],
      setFloodAlerts: (alerts) => set({ floodAlerts: alerts }),

      // Chart metric from map interaction
      mapInteractionMetric: null,
      setMapInteractionMetric: (metric) =>
        set({ mapInteractionMetric: metric }),
    }),
    {
      name: "app-store",
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        // selectedDistrictId intentionally NOT persisted — always starts fresh
      }),
    },
  ),
);