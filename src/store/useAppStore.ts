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
    | "drought"
    | "flood"
    | "stations"
    | "resources"
    | "help";
  setCurrentPage: (page: AppStoreState["currentPage"]) => void;

  // Filters & Selection
  selectedDistrictId: number;
  setSelectedDistrictId: (id: number) => void;
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
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      // Theme
      isDarkMode: false,
      setIsDarkMode: (mode) => set({ isDarkMode: mode }),

      // Navigation
      currentPage: "overview",
      setCurrentPage: (page) => set({ currentPage: page }),

      // Filters
      selectedDistrictId: 1,
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
      sliderhourIndexValue: "00",
      setSliderhourIndexValue: (value: string) =>
        set({ sliderhourIndexValue: value }),
    }),
    {
      name: "app-store", // Name of the persisted store
      partialize: (state) => ({
        selectedDistrictId: state.selectedDistrictId,
      }), // Only persist theme and selected distric
    },
  ),
);
