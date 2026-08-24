import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';

export type SortMode = 'manual' | 'name' | 'price_low' | 'price_high' | 'newest';

export interface SortModeOption<T> {
  value: SortMode;
  labelKey: string;
  compare?: (a: T, b: T) => number;
}

export interface BulkMutationResult {
  successfulIds: string[];
  failedIds: string[];
  failedMessages?: string[];
}

export interface SortableManagerOptions<T extends { id: string }> {
  items: T[];
  sortModes: SortModeOption<T>[];
  getPinned: (item: T) => boolean;
  /** Returns a copy of the item with its pin flag updated (for optimistic UI). */
  applyPinned: (item: T, pinned: boolean) => T;
  /** Returns a copy of the item with its active state updated after a bulk mutation. */
  applyActive: (item: T, active: boolean) => T;
  onMove: (id: string, toIndex: number) => Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => Promise<void>;
  onBulkActive: (ids: string[], active: boolean) => Promise<BulkMutationResult | void>;
  onBulkPinned: (ids: string[], pinned: boolean) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onRefetch: () => Promise<void>;
  defaultSortMode?: SortMode;
  reorderMessage: string;
  pinMessage: (pinned: boolean) => string;
  bulkMessage: (label: string, count: number) => string;
  bulkPartialFailureMessage?: (failedCount: number, successfulCount: number) => string;
  undoFailedMessage: string;
}

interface Toast {
  message: string;
  undo: () => void;
  actionKey: string;
}

export function useSortableManager<T extends { id: string }>(opts: SortableManagerOptions<T>) {
  const {
    items,
    sortModes,
    getPinned,
    applyPinned,
    applyActive,
    onMove,
    onTogglePin,
    onBulkActive,
    onBulkPinned,
    onBulkDelete,
    onRefetch,
    defaultSortMode = 'manual',
    reorderMessage,
    pinMessage,
    bulkMessage,
    bulkPartialFailureMessage,
    undoFailedMessage,
  } = opts;

  const [working, setWorking] = useState<T[]>(items);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(defaultSortMode);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingOrder, setSavingOrder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);
  const prevWorkingRef = useRef<T[]>(items);

  useEffect(() => {
    setWorking(items);
    prevWorkingRef.current = items;
  }, [items]);

  useEffect(() => {
    setSelected(new Set());
  }, [search]);

  const showToast = useCallback((t: Toast) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), 10000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Display order: pinned first when in manual mode, else comparator sort.
  const ordered = useMemo(() => {
    const arr = [...working];
    if (sortMode === 'manual') {
      arr.sort((a, b) => Number(getPinned(b)) - Number(getPinned(a)));
    } else {
      const def = sortModes.find((m) => m.value === sortMode);
      if (def?.compare) arr.sort(def.compare);
    }
    return arr;
  }, [working, sortMode, sortModes, getPinned]);

  const visible = useMemo(() => {
    if (!search.trim()) return ordered;
    const q = search.toLowerCase();
    return ordered.filter((item) =>
      String((item as unknown as Record<string, unknown>).name).toLowerCase().includes(q)
    );
  }, [ordered, search]);

  const canReorder = sortMode === 'manual' && !search.trim();

  const runMutation = useCallback(
    (applyLocal: () => void, mutate: () => Promise<void>, undo: () => Promise<void>, message: string) => {
      const prev = [...working];
      prevWorkingRef.current = prev;
      applyLocal();
      setBusy(true);
      showToast({
        message,
        actionKey: Math.random().toString(36).slice(2),
        undo: () => {
          setWorking(prev);
          setBusy(true);
          undo()
            .catch(() => alert(undoFailedMessage))
            .finally(() => {
              setBusy(false);
              setToast(null);
            });
        },
      });
      mutate()
        .catch(() => {
          setWorking(prev);
          alert(undoFailedMessage);
        })
        .finally(() => {
          setBusy(false);
          setSavingOrder(false);
        });
    },
    [working, showToast, undoFailedMessage]
  );

  const handleDragEnd = useCallback(
    (oldIndex: number, newIndex: number) => {
      if (oldIndex === newIndex || !canReorder) return;
      const moved = ordered[oldIndex];
      if (!moved) return;
      const next = arrayMove(ordered, oldIndex, newIndex);
      setSavingOrder(true);
      runMutation(
        () => setWorking(next),
        () => onMove(moved.id, newIndex),
        () => onMove(moved.id, oldIndex),
        reorderMessage
      );
    },
    [canReorder, ordered, runMutation, onMove, reorderMessage]
  );

  const moveItem = useCallback(
    (id: string, direction: 1 | -1) => {
      if (!canReorder) return;
      const idx = ordered.findIndex((i) => i.id === id);
      const target = idx + direction;
      if (idx === -1 || target < 0 || target >= ordered.length) return;
      const moved = ordered[idx];
      const next = arrayMove(ordered, idx, target);
      setSavingOrder(true);
      runMutation(
        () => setWorking(next),
        () => onMove(moved.id, target),
        () => onMove(moved.id, idx),
        reorderMessage
      );
    },
    [canReorder, ordered, runMutation, onMove, reorderMessage]
  );

  const moveUp = useCallback((id: string) => moveItem(id, -1), [moveItem]);
  const moveDown = useCallback((id: string) => moveItem(id, 1), [moveItem]);

  const togglePin = useCallback(
    (id: string) => {
      const item = working.find((i) => i.id === id);
      if (!item) return;
      const pinned = !getPinned(item);
      const prev = [...working];
      setBusy(true);
      setSavingOrder(true);
      showToast({
        message: pinMessage(pinned),
        actionKey: Math.random().toString(36).slice(2),
        undo: () => {
          setWorking(prev);
          setBusy(true);
          onTogglePin(id, !pinned)
            .catch(() => alert(undoFailedMessage))
            .finally(() => {
              setBusy(false);
              setToast(null);
            });
        },
      });
      const without = working.filter((i) => i.id !== id);
      const updated = applyPinned(item, pinned);
      const next = pinned ? [updated, ...without] : [...without, updated];
      setWorking(next);
      onTogglePin(id, pinned)
        .then(() => onMove(id, pinned ? 0 : working.length - 1))
        .catch(() => {
          setWorking(prev);
          alert(undoFailedMessage);
        })
        .finally(() => {
          setBusy(false);
          setSavingOrder(false);
        });
    },
    [working, getPinned, applyPinned, pinMessage, onTogglePin, onMove, undoFailedMessage, showToast]
  );

  const bulkSetActive = useCallback(
    async (active: boolean) => {
      const ids = Array.from(selected);
      if (ids.length === 0 || busy) return;
      setBusy(true);
      try {
        const result = await onBulkActive(ids, active);
        const successfulIds = result?.successfulIds ?? ids;
        const failedIds = result?.failedIds ?? [];
        const successful = new Set(successfulIds);

        setWorking((current) => current.map((item) => (
          successful.has(item.id) ? applyActive(item, active) : item
        )));
        setSelected(new Set(failedIds));

        if (failedIds.length > 0) {
          const summary = bulkPartialFailureMessage?.(failedIds.length, successfulIds.length) ?? undoFailedMessage;
          const reasons = result?.failedMessages?.filter(Boolean) ?? [];
          alert(reasons.length > 0 ? `${summary}\n\n${reasons.join('\n')}` : summary);
        } else {
          showToast({
            message: bulkMessage(active ? 'activated' : 'deactivated', successfulIds.length),
            actionKey: Math.random().toString(36).slice(2),
            undo: () => {
              setBusy(true);
              onBulkActive(successfulIds, !active)
                .then(() => setWorking((current) => current.map((item) => (
                  successful.has(item.id) ? applyActive(item, !active) : item
                ))))
                .catch(() => alert(undoFailedMessage))
                .finally(() => {
                  setBusy(false);
                  setToast(null);
                });
            },
          });
        }
      } catch {
        alert(undoFailedMessage);
      } finally {
        setBusy(false);
      }
    },
    [selected, busy, onBulkActive, applyActive, bulkMessage, bulkPartialFailureMessage, undoFailedMessage, showToast]
  );

  const bulkSetPinned = useCallback(
    (pinned: boolean) => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      runMutation(
        () => setWorking(working.map((i) => (ids.includes(i.id) ? applyPinned(i, pinned) : i))),
        () => onBulkPinned(ids, pinned),
        () => onBulkPinned(ids, !pinned),
        bulkMessage(pinned ? 'pinned' : 'unpinned', ids.length)
      );
    },
    [selected, working, runMutation, onBulkPinned, bulkMessage, applyPinned]
  );

  const removeLocally = useCallback((ids: string[]) => {
    setWorking((w) => w.filter((i) => !ids.includes(i.id)));
    setSelected((s) => {
      const next = new Set(s);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const bulkDelete = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    onBulkDelete(ids)
      .then(() => {
        removeLocally(ids);
        setSelected(new Set());
      })
      .catch(() => alert(undoFailedMessage))
      .finally(() => setBusy(false));
  }, [selected, onBulkDelete, removeLocally, undoFailedMessage]);

  const resetOrder = useCallback(() => {
    const initial = prevWorkingRef.current;
    setWorking(initial);
    setBusy(true);
    onRefetch()
      .catch(() => alert(undoFailedMessage))
      .finally(() => setBusy(false));
  }, [onRefetch, undoFailedMessage]);

  const toggleSelected = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((s) => {
      const ids = visible.map((i) => i.id);
      const allSelected = ids.length > 0 && ids.every((id) => s.has(id));
      const next = new Set(s);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }, [visible]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const allSelected = useMemo(
    () => visible.length > 0 && visible.every((i) => selected.has(i.id)),
    [visible, selected]
  );
  const someSelected = useMemo(() => selected.size > 0 && !allSelected, [selected, allSelected]);

  return {
    working,
    ordered,
    visible,
    totalCount: working.length,
    search,
    setSearch,
    sortMode,
    setSortMode,
    sortModes,
    canReorder,
    savingOrder,
    busy,
    selected,
    allSelected,
    someSelected,
    toggleSelected,
    toggleSelectAll,
    clearSelection,
    handleDragEnd,
    moveUp,
    moveDown,
    togglePin,
    bulkSetActive,
    bulkSetPinned,
    bulkDelete,
    removeLocally,
    resetOrder,
    toast,
    dismissToast,
  };
}

export type SortableManager<T extends { id: string }> = ReturnType<typeof useSortableManager<T>>;
