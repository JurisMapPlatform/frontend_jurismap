import { useEffect, useRef } from 'react';

// HU-05: cierra la sesión automáticamente tras N minutos sin actividad del usuario.
// Cualquier interacción (mouse, teclado, scroll, toque) reinicia el temporizador.
export default function useIdleLogout(onIdle, minutes = 30) {
  const cb = useRef(onIdle);
  cb.current = onIdle;

  useEffect(() => {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current(), minutes * 60 * 1000);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
}
