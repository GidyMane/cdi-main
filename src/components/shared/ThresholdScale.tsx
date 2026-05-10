import { getPercentagePosition } from '../../utils/chartHelpers';

interface ThresholdScaleProps {
  value: number;
  min: number;
  max: number;
  thresholds: Array<{ value: number; color: string; label: string }>;
  isDarkMode: boolean;
}

/**
 * Reusable threshold scale component
 * Shows a colored progress bar with labeled threshold zones
 */
export function ThresholdScale({
  value,
  min,
  max,
  thresholds,
  isDarkMode,
}: ThresholdScaleProps) {
  const percentage = getPercentagePosition(value, min, max);

  return (
    <div className="mt-2">
      <div
        className={`relative h-1.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}
      >
        <div className="absolute inset-0 flex">
          {thresholds.map((t, i) => {
            const prevValue = i === 0 ? min : thresholds[i - 1].value;
            const width = ((Math.min(t.value, max) - prevValue) / (max - min)) * 100;
            return (
              <div
                key={i}
                className="h-full"
                style={{
                  width: `${width}%`,
                  backgroundColor: t.color,
                  opacity: 0.7,
                }}
              />
            );
          })}
        </div>
        <div
          className={`absolute top-1/2 w-0.5 h-4 rounded-sm shadow-sm transition-all duration-500 ${isDarkMode ? 'bg-white' : 'bg-slate-800'}`}
          style={{
            left: `${percentage}%`,
            transform: `translate(-50%, -50%)`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        {thresholds.map((t, i) => (
          <span
            key={i}
            className={`text-[9px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
