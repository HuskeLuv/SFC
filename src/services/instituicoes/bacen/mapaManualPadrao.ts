import type { MapaManual } from './planejarImportacao';

/**
 * Mapa manual que o import do Bacen usa por padrão (ClickUp 86e2xqh69): linhas antigas do
 * catálogo SEM cnpj que nenhuma regra automática casa e que, sem isto, continuariam aparecendo
 * como emissor sem cnpj. Um título num emissor sem cnpj vira um grupo próprio na Cobertura FGC
 * (chave = id), com limite separado do mesmo banco importado do Bacen: o excesso some.
 *
 * O --mapa do script soma a este e vence em caso de código repetido. Raízes conferidas na lista
 * do STR (30/10/2026); revisar no dry-run com o Wellington antes do --apply.
 */
export const MAPA_MANUAL_PADRAO: Readonly<MapaManual> = {
  /** 'Bradesco BBI' = BANCO BRADESCO BBI S.A. (B1, COMPE 036). */
  '237-BBI': '06271464',
  /** 'Banco Master' = BANCO MASTER S/A (COMPE 243, em liquidação: fora do IF.data ativo). */
  '243': '33923798',
  /** 'Will Bank' = WILL FINANCEIRA S.A. CFI (COMPE 280, em liquidação: fora do IF.data ativo). */
  'FIN-WILL': '23862762',
  /** 'Neon Pagamentos' = NEON PAGAMENTOS S.A. IP (N4: não emite). */
  'FIN-NEON': '20855875',
  /** N26 Brasil: sem registro ativo no Bacen e nunca emitiu renda fixa. */
  'FIN-N26': 'NAO_EMISSOR',
};
