import { useEffect, useRef } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const RETRY_MS = 100;
const MAX_WAIT_MS = 15000;

// Dibuja el botón «Continuar con Google» en el contenedor indicado.
// El script de Google se carga en segundo plano (index.html, async): si la pantalla se monta antes
// de que termine de descargarse, se reintenta hasta que esté disponible, en lugar de rendirse en el
// primer intento y dejar la pantalla sin el botón.
export default function useGoogleAuth(onCredential, containerId = 'google-signin-btn') {
  const cbRef = useRef(onCredential);
  useEffect(() => {
    cbRef.current = onCredential;
  });

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let timer;
    const inicio = Date.now();

    const intentar = () => {
      const el = document.getElementById(containerId);
      if (!window.google?.accounts?.id || !el) {
        if (Date.now() - inicio < MAX_WAIT_MS) timer = setTimeout(intentar, RETRY_MS);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => cbRef.current(response.credential),
        auto_select: false,
      });
      window.google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 360,
        locale: 'es',
      });
    };

    intentar();
    return () => clearTimeout(timer);
  }, [containerId]);
}
