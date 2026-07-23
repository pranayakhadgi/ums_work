import { create } from 'zustand';

export interface Instance {
  id: string;
  name: string;
  scheme: string;
  host: string;
  port: number;
  managerUrl: string;
  managerUser: string;
  managerPass: string;
  environment: string;
  isActive: boolean;
  createdAt: string;
}

export interface AddInstancePayload {
  name: string;
  managerUrl: string;
  managerUser: string;
  managerPass: string;
}

interface InstanceStore {
  instances: Instance[];
  currentInstanceId: string | null;
  loading: boolean;
  error: string | null;
  loadInstances: () => Promise<void>;
  addInstance: (data: AddInstancePayload) => Promise<void>;
  setCurrentInstance: (id: string) => void;
}

export const useInstanceStore = create<InstanceStore>((set, get) => ({
  instances: [],
  currentInstanceId: null,
  loading: false,
  error: null,

  loadInstances: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/instances');
      if (!res.ok) throw new Error('Failed to fetch instances');
      const json = await res.json();
      const instances: Instance[] = json.data ?? [];
      set({ instances, loading: false });

      // Auto-select first instance if none is selected yet
      const { currentInstanceId } = get();
      if (!currentInstanceId && instances.length > 0) {
        set({ currentInstanceId: instances[0].id });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Unknown error', loading: false });
    }
  },

  addInstance: async (data: AddInstancePayload) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Failed to create instance');
      }
      // Reload list to get fresh data including the new instance
      await get().loadInstances();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Unknown error', loading: false });
      throw e; // re-throw so the modal can handle it
    }
  },

  setCurrentInstance: (id: string) => {
    set({ currentInstanceId: id });
  },
}));
