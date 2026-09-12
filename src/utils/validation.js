// Formato de correo alineado con el backend (pydantic EmailStr): exige texto antes y después de la
// arroba y un punto en el dominio. El navegador acepta "juan@gmail" como válido, el backend no.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}
