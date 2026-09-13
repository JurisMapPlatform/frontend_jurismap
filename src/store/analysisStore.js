import { create } from 'zustand';
import { analysisApi, getErrorMessage } from '../services/api';

const PAGE_SIZE = 20;

const useAnalysisStore = create((set, get) => ({
  analyses: [],
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  current: null,
  stats: null,
  loading: false,
  loadingMore: false,
  error: null,

  // HU-23: primera página del historial; `total` permite saber si quedan más análisis por cargar.
  fetchAnalyses: async (params = {}) => {
    const pageSize = params.page_size || PAGE_SIZE;
    set({ loading: true, error: null });
    try {
      const { data } = await analysisApi.list({ page: 1, page_size: pageSize });
      const items = data.items || [];
      set({ analyses: items, total: data.total ?? items.length, page: 1, pageSize, loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err, 'No se pudieron cargar tus análisis. Revisa tu conexión e inténtalo de nuevo.'), loading: false });
    }
  },

  fetchMoreAnalyses: async () => {
    const { page, pageSize, analyses } = get();
    set({ loadingMore: true, error: null });
    try {
      const { data } = await analysisApi.list({ page: page + 1, page_size: pageSize });
      const seen = new Set(analyses.map((a) => a.id));
      const nuevos = (data.items || []).filter((a) => !seen.has(a.id));
      set({ analyses: [...analyses, ...nuevos], total: data.total ?? get().total, page: page + 1, loadingMore: false });
    } catch (err) {
      set({ error: getErrorMessage(err, 'No se pudieron cargar más análisis. Inténtalo de nuevo.'), loadingMore: false });
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
    const { analyses, total } = get();
    set({ analyses: analyses.filter((a) => a.id !== id), total: Math.max(0, total - 1) });
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
