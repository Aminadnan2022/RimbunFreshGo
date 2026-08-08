import type { CSSProperties, ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableRowProps {
  id: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export default function SortableRow({ id, disabled = false, className = '', children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, over } = useSortable({ id, disabled });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOver = over?.id === id && !isDragging && !disabled;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-stretch transition-colors ${isDragging ? 'z-10 opacity-90 shadow-card-hover ring-2 ring-forest-400 rounded-2xl' : ''} ${isOver ? 'ring-2 ring-forest-300 rounded-2xl' : ''} ${className}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        className={`flex items-center justify-center px-1.5 text-gray-400 hover:text-forest-700 transition-colors cursor-grab active:cursor-grabbing touch-none ${
          isDragging ? 'cursor-grabbing text-forest-700' : ''
        } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical size={18} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
