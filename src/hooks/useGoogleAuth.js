import { useEffect, useRef } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function useGoogleAuth(onCredential, containerId = 'google-signin-btn') {
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID || !window.google?.accounts) return;

    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => cbRef.current(response.credential),
      auto_select: false,
    });

    const el = document.getElementById(containerId);
    if (!el) return;

    window.google.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 360,
      locale: 'es',
    });
  }, [containerId]);
}
