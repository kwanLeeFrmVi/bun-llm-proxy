import { create } from "zustand";
import { api } from "./api";

export interface ComboModel {
  model: string;
  weight: number;
}

export interface Combo {
  id: string;
  name: string;
  models: ComboModel[];
  createdAt?: string;
  updatedAt?: string;
}

interface ComboStore {
  // State
  combos: Combo[];
  isLoading: boolean;
  error: string | null;

  // Computed
  getComboNames: () => string[];
  isCombo: (name: string) => boolean;
  getCombo: (name: string) => Combo | undefined;
  getComboById: (id: string) => Combo | undefined;

  // Actions
  loadCombos: () => Promise<void>;
  createCombo: (name: string, models: ComboModel[]) => Promise<void>;
  updateCombo: (id: string, name: string, models: ComboModel[]) => Promise<void>;
  deleteCombo: (id: string) => Promise<void>;
  reset: () => void;
}

export const useComboStore = create<ComboStore>((set, get) => ({
  // Initial state
  combos: [],
  isLoading: false,
  error: null,

  // Computed getters
  getComboNames: () => get().combos.map((c) => c.name),

  isCombo: (name: string) => get().combos.some((c) => c.name === name),

  getCombo: (name: string) => get().combos.find((c) => c.name === name),

  getComboById: (id: string) => get().combos.find((c) => c.id === id),

  // Actions
  loadCombos: async () => {
    set({ isLoading: true, error: null });
    try {
      const { combos } = await api.combos.list();
      set({ combos, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load combos",
        isLoading: false,
      });
    }
  },

  createCombo: async (name: string, models: ComboModel[]) => {
    set({ error: null });
    try {
      const newCombo = await api.combos.create({ name, models });
      set((state) => ({ combos: [...state.combos, newCombo] }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to create combo" });
      throw e;
    }
  },

  updateCombo: async (id: string, name: string, models: ComboModel[]) => {
    set({ error: null });
    try {
      await api.combos.update(id, { name, models });
      set((state) => ({
        combos: state.combos.map((c) => (c.id === id ? { ...c, name, models } : c)),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to update combo" });
      throw e;
    }
  },

  deleteCombo: async (id: string) => {
    set({ error: null });
    try {
      await api.combos.remove(id);
      set((state) => ({
        combos: state.combos.filter((c) => c.id !== id),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Failed to delete combo" });
      throw e;
    }
  },

  reset: () => {
    set({ combos: [], isLoading: false, error: null });
  },
}));
