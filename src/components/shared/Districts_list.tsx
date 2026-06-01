import { useAppStore } from "@/store/useAppStore";
import type { district } from "@/types/data_types";

function Districts_list({ district_list, isDarkMode, textMuted }: any) {
  console.log("district_list ",district_list)
  const { selectedDistrictId, setSelectedDistrictId } = useAppStore(
    (state) => state,
  );

  // Deduplicate by id to prevent duplicate entries from the API response
  const unique: district[] = district_list
    ? Array.from(
        new Map((district_list as district[]).map((d) => [d.id, d])).values(),
      ).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Districts</label>
      <select
        value={selectedDistrictId?.id ?? ""}
        onChange={(e) => {
          if (!e.target.value) {
            // "All Districts" selected — clear district and reset map
            setSelectedDistrictId(undefined);
            return;
          }
          const found = unique.find((r) => r.id === Number(e.target.value));
          if (found) setSelectedDistrictId(found);
        }}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${
          isDarkMode
            ? "bg-slate-700 border-slate-600 text-white"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <option value="">All Districts</option>
        {unique.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default Districts_list;
