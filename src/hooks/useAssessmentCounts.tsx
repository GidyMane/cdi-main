import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAppStore } from "@/store/useAppStore";
import { getMonthAndYear } from "@/utils/woker_fn";

export const useAssessmentCounts = () => {
  const [assessment, setAssessment] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);

  const { dateRange } = useAppStore((state:any) => state);

  const{ month, year:timerange } = getMonthAndYear(dateRange)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(
          `https://droughtbackend.rosewillbome.co.ke/data/district/assessment/count`
        );

        setAssessment(response?.data?.data || []);

      } catch (error) {
        console.error("Assessment fetch error:", error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!assessment?.length) return;

    let filters: any[] = [];

    if (timerange?.toString()?.trim() && month?.trim()) {
      const result = assessment.filter(
        (item) =>
          item[0]?.trim()?.toLowerCase() ===
            month.trim().toLowerCase() &&
          item[1]?.trim() === timerange?.toString()?.trim()
      );

      filters = result[0] || [];
    }

    setFiltered(filters);
  }, [assessment, timerange, month]);

  const counts = useMemo(
    () => ({
      extremeCount: filtered?.length ? filtered[3] : 0,
      trendingCount: filtered?.length ? filtered[6] : 0,
      improvingCount: filtered?.length ? filtered[12] : 0,
    }),
    [filtered]
  );

  
  return {
    assessment,
    filtered,
    ...counts,
  };
};