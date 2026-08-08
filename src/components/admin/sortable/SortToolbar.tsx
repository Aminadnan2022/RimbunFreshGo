import { Search, Loader2 } from 'lucide-react';
import type { SortMode, SortModeOption } from './useSortableManager';

interface SortToolbarProps<T> {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  sortMode: SortMode;
  onSortModeChange: (m: SortMode) => void;
  sortModes: SortModeOption<T>[];
  label: (key: string) => string;
  manualHint?: string;
  showManualHint?: boolean;
  savingOrder?: boolean;
  busy?: boolean;
}

export default function SortToolbar<T>({
  search,
  onSearchChange,
  searchPlaceholder,
  sortMode,
  onSortModeChange,
  sortModes,
  label,
  manualHint,
  showManualHint,
  savingOrder,
  busy,
}: SortToolbarProps<T>) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="input-field pl-11"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sortModes.map((m) => (
          <button
            key={m.value}
            onClick={() => onSortModeChange(m.value)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              sortMode === m.value
                ? 'bg-forest-700 text-white shadow-green'
                : 'bg-white text-gray-600 border border-cream-300 hover:border-forest-400 hover:text-forest-700'
            }`}
          >
            {label(m.labelKey)}
          </button>
        ))}
        {showManualHint && (
          <span className="text-xs text-gray-400 ml-1">{manualHint}</span>
        )}
        {(savingOrder || busy) && (
          <span className="flex items-center gap-1.5 text-forest-600 font-medium text-xs">
            <Loader2 size={14} className="animate-spin" />
          </span>
        )}
      </div>
    </div>
  );
}
