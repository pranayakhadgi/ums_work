import { create } from 'zustand'; // FIX: zustand v4+ exports `create` as a named export, not default

interface AppState {
    count: number; increment: () => void; decrement: () => void;
}

export const useAppStore = create<AppState>((set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
    decrement: () => set((state) => ({ count: state.count - 1 })),
}));