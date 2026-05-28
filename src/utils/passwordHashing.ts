/**
 * Custo bcrypt para o hash de senhas. OWASP (2024+) recomenda ≥12; menos
 * que isso é considerado "legacy"/transição. Aumentar mais não é gratuito
 * — 12 já leva ~250ms num servidor moderno; 14 fica em ~1s.
 *
 * Centralizado em uma constante pra permitir:
 *  - Aumento futuro sem revisitar cada call site.
 *  - Recálculo via `re-hash on next login` (quando user faz login com
 *    senha correta, se o hash atual estiver com custo < BCRYPT_ROUNDS,
 *    re-hashear silenciosamente).
 */
export const BCRYPT_ROUNDS = 12;
