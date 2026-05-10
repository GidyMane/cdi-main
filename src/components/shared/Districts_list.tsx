import { useAppStore } from "@/store/useAppStore";
import type { district } from "@/types/data_types";

function Districts_list({ district_list, isDarkMode, textMuted }: any) {
  const { selectedDistrictId, setSelectedDistrictId } = useAppStore(
    (state) => state,
  );

  return (
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Districts</label>
      <select
        // ── Use the id as the select value, not the whole object ──────────
        value={selectedDistrictId?.id}
        onChange={(e) => {
          // Find the full district object by id and pass it to the store
          const found = district_list?.find(
            (r: district) => r.id === Number(e.target.value),
          );
          if (found) setSelectedDistrictId(found);
        }}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${
          isDarkMode
            ? "bg-slate-700 border-slate-600 text-white"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <option value="">All Districts</option>
        {district_list?.map((r: district) => (
          // ── Use r.id as the option value, not the object ─────────────────
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default Districts_list;
