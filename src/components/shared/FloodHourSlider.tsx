// import { useAppStore } from "@/store/useAppStore";

// // ── Available flood hour steps from GeoServer ─────────────────────────────────
// // export const FLOOD_HOURS = [24, 48, 72, 96, 120, 144, 168, 192];
// export const FLOOD_HOURS = [
//   "00",
//   "01",
//   "02",
//   "03",
//   "04",
//   "05",
//   "06",
//   "07",
//   "08",
//   "09",
//   "10",
//   "11",
//   "12",
//   "13",
//   "14",
//   "15",
//   "16",
//   "17",
//   "18",
//   "19",
//   "20",
//   "21",
//   "22",
//   "23",
//   "24",
// ];

// interface FloodHourSliderProps {
//   isDarkMode: boolean;
//   borderColor: string;
//   textMuted: string;
//   FAO_BLUE?: string;
// }

// const DEFAULT_FAO_BLUE = "#318DDE";

// export function FloodHourSlider({
//   isDarkMode,
//   borderColor,
//   textMuted,
//   FAO_BLUE = DEFAULT_FAO_BLUE,
// }: FloodHourSliderProps) {
//   const { sliderhourIndexValue, setSliderhourIndexValue } = useAppStore(
//     (state) => state,
//   );
//   //   const [hourIndex, setHourIndex] = useState(0);
//   const selectedHours = FLOOD_HOURS[sliderhourIndexValue];

//   return (
//     <div
//       className={`px-4 py-3 border-t ${borderColor} flex items-center gap-4 ${
//         isDarkMode ? "bg-slate-800/80" : "bg-slate-50"
//       }`}
//     >
//       {/* Start label */}
//       <span className={`text-xs font-medium ${textMuted}`}>
//         {FLOOD_HOURS[0]}h
//       </span>

//       {/* Slider */}
//       <input
//         type="range"
//         min={0}
//         max={FLOOD_HOURS.length - 1}
//         step={1}
//         value={sliderhourIndexValue}
//         // onChange={(e) => setSliderhourIndexValue(Number(e.target.value))}
//         onChange={(e) => setSliderhourIndexValue(e.target.value)}
//         className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
//         style={{
//           backgroundColor: isDarkMode ? "#334155" : "#cbd5e1",
//           accentColor: FAO_BLUE,
//         }}
//       />

//       {/* Current value badgee */}
//       <span
//         className="text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap"
//         style={{
//           backgroundColor: `${FAO_BLUE}20`,
//           color: FAO_BLUE,
//         }}
//       >
//         +{selectedHours}h
//       </span>
//     </div>
//   );
// }

// export default FloodHourSlider;

// import { useAppStore } from "@/store/useAppStore";

// // ── Hour steps (00 → 11) ────────────────────────────────────────────────
// export const FLOOD_HOURS = Array.from({ length: 192 }, (_, i) =>
//   String(i).padStart(2, "0"),
// );

// interface FloodHourSliderProps {
//   isDarkMode: boolean;
//   borderColor: string;
//   textMuted: string;
//   FAO_BLUE?: string;
// }

// const DEFAULT_FAO_BLUE = "#318DDE";

// export function FloodHourSlider({
//   isDarkMode,
//   borderColor,
//   textMuted,
//   FAO_BLUE = DEFAULT_FAO_BLUE,
// }: FloodHourSliderProps) {
//   const { sliderhourIndexValue, setSliderhourIndexValue } = useAppStore(
//     (state) => state,
//   );

//   const selectedHour = FLOOD_HOURS[sliderhourIndexValue] ?? "00";

//   console.log("sliderhourIndexValue",sliderhourIndexValue)

//   return (
//     <div
//       className={`px-4 py-3 border-t ${borderColor} flex items-center gap-4 ${
//         isDarkMode ? "bg-slate-800/80" : "bg-slate-50"
//       }`}
//     >
//       {/* Start label */}
//       <span className={`text-xs font-medium ${textMuted}`}>
//         {FLOOD_HOURS[0]}
//       </span>

//       {/* Slider */}
//       <input
//         type="range"
//         min={0}
//         max={FLOOD_HOURS.length - 1}
//         step={1}
//         value={sliderhourIndexValue}
//         onChange={(e) => setSliderhourIndexValue(Number(e.target.value))}
//         className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
//         style={{
//           backgroundColor: isDarkMode ? "#334155" : "#cbd5e1",
//           accentColor: FAO_BLUE,
//         }}
//       />

//       {/* Current value badge */}
//       <span
//         className="text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap"
//         style={{
//           backgroundColor: `${FAO_BLUE}20`,
//           color: FAO_BLUE,
//         }}
//       >
//         {selectedHour}
//       </span>
//     </div>
//   );
// }

// export default FloodHourSlider;


import { useAppStore } from "@/store/useAppStore";

// ── Available flood hour steps from GeoServer ───────────────────────────────
export const FLOOD_HOURS:any = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
];

interface FloodHourSliderProps {
  isDarkMode: boolean;
  borderColor: string;
  textMuted: string;
  FAO_BLUE?: string;
}

const DEFAULT_FAO_BLUE = "#318DDE";

export function FloodHourSlider({
  isDarkMode,
  borderColor,
  textMuted,
  FAO_BLUE = DEFAULT_FAO_BLUE,
}: FloodHourSliderProps) {
  const { sliderhourIndexValue, setSliderhourIndexValue } = useAppStore(
    (state) => state,
  );

  // Ensure safe fallback
  const selectedHours = FLOOD_HOURS[sliderhourIndexValue] ?? "00";
  console.log("sliderhourIndexValue",sliderhourIndexValue)

  return (
    <div
      className={`px-4 py-3 border-t ${borderColor} flex items-center gap-4 ${
        isDarkMode ? "bg-slate-800/80" : "bg-slate-50"
      }`}
    >
      {/* Start label */}
      <span className={`text-xs font-medium ${textMuted}`}>
        {FLOOD_HOURS[0]}h
      </span>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={FLOOD_HOURS.length - 1}
        step={1}
        value={sliderhourIndexValue}
        onChange={(e) =>
          setSliderhourIndexValue(Number(e.target.value))
        }
        className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
        style={{
          backgroundColor: isDarkMode ? "#334155" : "#cbd5e1",
          accentColor: FAO_BLUE,
        }}
      />

      {/* Current value badge */}
      <span
        className="text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap"
        style={{
          backgroundColor: `${FAO_BLUE}20`,
          color: FAO_BLUE,
        }}
      >
        +{selectedHours}h
      </span>
    </div>
  );
}

export default FloodHourSlider;