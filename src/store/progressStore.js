import { create } from 'zustand';

// Estado compartido de progreso de análisis, alimentado por una única conexión WebSocket
// global (ProgressListener). Permite notificar la finalización en cualquier página (HU-29)
// y que la pantalla de Procesamiento lea el avance sin abrir su propia conexión.
const useProgressStore = create((set) => ({
  byId: {},     // analysis_id -> { step, status, error }
  toast: null,  // { analysis_id, status } cuando un análisis termina o falla

  push: (msg) => set((s) => {
    if (!msg || !msg.analysis_id) return s;
    const done = msg.status === 'completed' || msg.status === 'failed';
    // El mensaje final no trae paso: se conserva el último conocido para que el avance no retroceda.
    const previo = s.byId[msg.analysis_id];
    const step = msg.step ?? previo?.step;
    return {
      byId: { ...s.byId, [msg.analysis_id]: { step, status: msg.status, error: msg.error } },
      toast: done ? { analysis_id: msg.analysis_id, status: msg.status } : s.toast,
    };
  }),

  clearToast: () => set({ toast: null }),
}));

export default useProgressStore;
