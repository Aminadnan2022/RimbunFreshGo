import type { CSSProperties, ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pin, ChevronUp, ChevronDown, PinOff } from 'lucide-react';

interface SortableCardProps {
  id: string;
  disabled?: boolean;
  canReorder?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  showCheckbox?: boolean;
  className?: string;
  children: ReactNode;
}

export default function SortableCard({
  id,
  disabled = false,
  canReorder = true,
  pinned = false,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  selected,
  onToggleSelect,
  showCheckbox = false,
  className = '',
  children,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, over } = useSortable({ id, disabled: disabled || !canReorder });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOver = over?.id === id && !isDragging && !disabled;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-stretch rounded-2xl transition-colors ${
        isDragging ? 'z-20 opacity-90 shadow-card-hover ring-2 ring-forest-400' : ''
      } ${isOver ? 'ring-2 ring-forest-300' : ''} ${className}`}
    >
      {canReorder && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          className="flex items-center justify-center px-1.5 text-gray-400 hover:text-forest-700 transition-colors cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical size={18} />
        </button>
      )}

      {showCheckbox && (
        <label className="flex items-center pl-3 pr-1 cursor-pointer">
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="w-4 h-4 rounded border-cream-300 text-forest-700 focus:ring-forest-500"
          />
        </label>
      )}

      <div className="flex-1 min-w-0">{children}</div>

      <div className="flex items-center gap-0.5 pr-2 pl-1 shrink-0">
        {canReorder && onMoveUp && (
          <button onClick={onMoveUp} className="p-1.5 rounded-lg text-gray-400 hover:text-forest-700 hover:bg-forest-50 transition-all" title="Move up">
            <ChevronUp size={15} />
          </button>
        )}
        {canReorder && onMoveDown && (
          <button onClick={onMoveDown} className="p-1.5 rounded-lg text-gray-400 hover:text-forest-700 hover:bg-forest-50 transition-all" title="Move down">
            <ChevronDown size={15} />
          </button>
        )}
        {onTogglePin && (
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-all ${
              pinned
                ? 'text-forest-700 bg-forest-50'
                : 'text-gray-400 hover:text-forest-700 hover:bg-forest-50'
            }`}
            title={pinned ? 'Unpin' : 'Pin to top'}
          >
            {pinned ? <Pin size={15} className="fill-forest-700 text-forest-700" /> : <PinOff size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}
