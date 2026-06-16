import { create } from 'zustand';
import { type Monitor, fetchMonitors, addMonitorsBulk } from '../api/monitors';

interface MonitorStore {
  monitors: Monitor[];
  loading: boolean;
  error: string | null;
  loadMonitors: () => Promise<void>;
  bulkAdd: (items: { name: string; url: string }[]) => Promise<void>;
}

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  monitors: [],
  loading: false,
  error: null,

  loadMonitors: async () => {
    set({ loading: true, error: null });
    try {
      const monitors = await fetchMonitors();
      set({ monitors, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'An unknown error occurred', loading: false });
    }
  },

  bulkAdd: async (items) => {
    set({ loading: true, error: null });
    try {
      const newMonitors = await addMonitorsBulk(items);
      // merge with existing, avoiding duplicates
      const existing = get().monitors;
      const mergedMap = new Map<string, Monitor>();
      existing.forEach((m) => mergedMap.set(m.id, m));
      newMonitors.forEach((m) => mergedMap.set(m.id, m));
      set({ monitors: Array.from(mergedMap.values()), loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'An unknown error occurred', loading: false });
    }
  },
}));
