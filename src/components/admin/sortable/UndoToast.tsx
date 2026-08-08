import { CheckCircle2, Undo2 } from 'lucide-react';

interface UndoToastProps {
  message: string;
  undoLabel: string;
  onUndo: () => void;
  onDismiss: () => void;
}

export default function UndoToast({ message, undoLabel, onUndo, onDismiss }: UndoToastProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-[fadeSlideUp_0.2s_ease-out]">
      <div className="flex items-center gap-3 bg-forest-900 text-white rounded-2xl pl-4 pr-2 py-2.5 shadow-2xl">
        <CheckCircle2 size={18} className="text-jade-400 flex-shrink-0" />
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={onUndo}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 transition-all"
        >
          <Undo2 size={14} />
          {undoLabel}
        </button>
        <button
          onClick={onDismiss}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Dismiss"
        >
          <span className="text-lg leading-none">&times;</span>
        </button>
      </div>
    </div>
  );
}
