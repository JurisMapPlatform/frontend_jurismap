import { useEffect, useRef } from 'react';

// HU-05: cierra la sesión automáticamente tras N minutos sin actividad del usuario.
// Cualquier interacción (mouse, teclado, scroll, toque) reinicia el temporizador.
export default function useIdleLogout(onIdle, minutes = 30) {
  // La referencia guarda siempre la última función recibida, pero se actualiza en un efecto
  // (no al renderizar) para no leer ni escribir la referencia durante el render.
  const cb = useRef(onIdle);
  useEffect(() => {
    cb.current = onIdle;
  });

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
