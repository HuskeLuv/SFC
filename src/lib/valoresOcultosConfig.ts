/**
 * Flag do "esconder valores" (31/10/2026, pedido do Pedro): botão de olho que troca valores em
 * dinheiro, quantidades e preço médio por uma pílula cinza. Fica DESLIGADA até o PR que fecha a
 * Fase 1 (merge = deploy: sem a flag o olho iria para produção prometendo esconder telas ainda
 * não cobertas). Desligada, nada muda: sem olho, sem atributo no <html>, e a rota
 * /api/preferencias/valores-ocultos responde 404. Edge-safe (lida também no middleware).
 *
 *  - VALORES_OCULTOS_HABILITADO="true"   liga o olho
 */
export function valoresOcultosHabilitado(): boolean {
  return process.env.VALORES_OCULTOS_HABILITADO === 'true';
}
