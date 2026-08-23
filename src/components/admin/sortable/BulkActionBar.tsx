import { Loader2 } from 'lucide-react';

interface BulkActionBarProps {
  count: number;
  busy?: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onDelete?: () => void;
  onClear: () => void;
  labels: {
    selected: string;
    activate: string;
    deactivate: string;
    pin: string;
    unpin: string;
    delete?: string;
    clear: string;
  };
}

export default function BulkActionBar({
  count,
  busy,
  onActivate,
  onDeactivate,
  onPin,
  onUnpin,
  onDelete,
  onClear,
  labels,
}: BulkActionBarProps) {
  if (count === 0) return null;
  const btn =
    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-forest-900 text-white rounded-2xl shadow-lg mb-4">
      <span className="text-sm font-semibold mr-1">
        {labels.selected.replace('{{count}}', String(count))}
      </span>
      <button onClick={onActivate} disabled={busy} className={`${btn} bg-jade-500 hover:bg-jade-600`}>
        {labels.activate}
      </button>
      <button onClick={onDeactivate} disabled={busy} className={`${btn} bg-gray-600 hover:bg-gray-700`}>
        {labels.deactivate}
      </button>
      <button onClick={onPin} disabled={busy} className={`${btn} bg-forest-500 hover:bg-forest-600`}>
        {labels.pin}
      </button>
      <button onClick={onUnpin} disabled={busy} className={`${btn} bg-gray-600 hover:bg-gray-700`}>
        {labels.unpin}
      </button>
      {onDelete && labels.delete && <button onClick={onDelete} disabled={busy} className={`${btn} bg-red-600 hover:bg-red-700`}>
        {labels.delete}
      </button>}
      <button onClick={onClear} disabled={busy} className={`${btn} bg-white/10 hover:bg-white/20`}>
        {labels.clear}
      </button>
      {busy && <Loader2 size={14} className="animate-spin" />}
    </div>
  );
}
