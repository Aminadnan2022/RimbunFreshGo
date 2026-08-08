import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface RowMenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface RowMenuProps {
  actions: RowMenuAction[];
  title?: string;
}

const MENU_WIDTH = 192; // w-48
const ITEM_HEIGHT = 40; // px-4 py-2.5 text-sm item height estimate
const MENU_PADDING = 12; // py-1.5 wrapper padding

/**
 * Shared admin dropdown action menu.
 *
 * Rendered through a React Portal into <body> so it can never be clipped by an
 * ancestor's `overflow: hidden` (table wrappers, sortable rows, rounded cards).
 * Positioned with `position: fixed` relative to the trigger button and
 * automatically flips upward when there is not enough space below it.
 *
 * Used by all admin tables that expose an action menu (Products, Combos,
 * Delivery Points, ...). Named export `DropdownMenu` is provided as the
 * reusable alias for any future admin dropdown.
 */
export function DropdownMenu({ actions, title }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Measure the trigger and place the menu before paint so it never flickers.
  useLayoutEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const menuH = actions.length * ITEM_HEIGHT + MENU_PADDING;
    const openUp = r.bottom + menuH > viewportH && r.top - menuH >= 0;
    const left = Math.min(Math.max(r.right - MENU_WIDTH, 8), Math.max(8, viewportW - MENU_WIDTH - 8));
    const top = openUp ? r.top - menuH : r.bottom;
    setPos({ top: Math.max(8, top), left });
  }, [open, actions.length]);

  // Close on outside click, scroll, resize, or Escape.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    function onDocClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      close();
    }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', (e) => e.key === 'Escape' && close());
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="p-2 rounded-lg text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 50 }}
            className="bg-white rounded-2xl shadow-2xl border border-cream-200 py-1.5 overflow-hidden animate-[fadeSlideUp_0.15s_ease-out]"
          >
            {actions.map((a) => (
              <button
                key={a.key}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  a.onClick();
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors ${
                  a.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-cream-50'
                }`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export default function RowMenu(props: RowMenuProps) {
  return <DropdownMenu {...props} />;
}
