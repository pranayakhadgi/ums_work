import { create } from 'zustand';
import { fetchDiscoveryCandidates, promoteToMonitor } from '../api/health';

export interface DiscoveredApp {
  id: string;
  instanceId: string;
  name: string;
  contextPath: string;
  tomcatState: string;
  discoveredAt: string;
  lastSeenAt: string;
  isPromoted: boolean;
  sessions: number;
}

interface DiscoveryStore {
  candidates: DiscoveredApp[];
  loading: boolean;
  error: string | null;
  loadCandidates: (instanceId?: string) => Promise<void>;
  promote: (app: DiscoveredApp) => Promise<void>;
  promoteAll: (apps: DiscoveredApp[]) => Promise<void>;
}

export const useDiscoveryStore = create<DiscoveryStore>((set, get) => ({
  candidates: [],
  loading: false,
  error: null,

  loadCandidates: async (instanceId?: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetchDiscoveryCandidates(instanceId);
      set({ candidates: res.data ?? [], loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'an unknown error occurred', loading: false });
    }
  },

  promote: async (app: DiscoveredApp) => {
    set({ loading: true, error: null });
    try {
      await promoteToMonitor(app);
      await get().loadCandidates();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'an unknown error occurred', loading: false });
    }
  },

  promoteAll: async (apps) => {
    set({ loading: true, error: null });
    try {
      await Promise.all(apps.map(app => promoteToMonitor(app)));
      await get().loadCandidates();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Bulk promote failed', loading: false });
    }
  }
}));

