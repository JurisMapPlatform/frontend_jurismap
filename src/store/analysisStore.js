import { create } from 'zustand';
import { analysisApi, getErrorMessage } from '../services/api';

const useAnalysisStore = create((set, get) => ({
  analyses: [],
  current: null,
  stats: null,
  loading: false,
  error: null,

  fetchAnalyses: async (params) => {
    set({ loading: true });
    try {
      const { data } = await analysisApi.list(params);
      set({ analyses: data.items || data, loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err, 'No se pudo cargar la información.'), loading: false });
    }
  },

  fetchDetail: async (id) => {
    set({ loading: true });
    try {
      const { data } = await analysisApi.detail(id);
      set({ current: data, loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err, 'No se pudo cargar la información.'), loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const { data } = await analysisApi.stats();
      set({ stats: data });
    } catch { /* ignore */ }
  },

  deleteAnalysis: async (id) => {
    await analysisApi.delete(id);
    set({ analyses: get().analyses.filter((a) => a.id !== id) });
  },

  renameAnalysis: async (id, title) => {
    await analysisApi.rename(id, title);
    set({ analyses: get().analyses.map((a) => (a.id === id ? { ...a, title } : a)) });
  },

  cancelAnalysis: async (id) => {
    await analysisApi.cancel(id);
    await get().fetchAnalyses();
  },

  updateProcessing: (data) => {
    set((state) => ({
      analyses: state.analyses.map((a) =>
        a.id === data.analysis_id ? { ...a, status: data.status, processing_step: data.step } : a
      ),
    }));
  },

  clearCurrent: () => set({ current: null }),
}));

export default useAnalysisStore;
