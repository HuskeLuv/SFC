'use client';

/**
 * Card "Fundamentos" da página do ativo — STUB da fatia 0 do Bloco D (dono: fatia A).
 *
 * Hoje: renderiza exatamente o BlocoFundamentosEssencial (tela idêntica à da Fase 1).
 * A fatia A implementa, SEM mexer na PaginaAtivo:
 *  - com config.recursos.raioX: SeletorNivel 'Essencial | Raio-X' (TEXTOS_RAIO_X.seletor) no slot
 *    `cabecalhoExtra` do Essencial e da TabelaRaioX;
 *  - nível NA URL (decisão 13): lido com nivelFundamentosDaUrl(searchParams.get('fund'), raioX) e
 *    trocado com queryComNivelFundamentos + router.replace(…, { scroll: false }) — nada em
 *    localStorage; ?fund=raiox abre direto no Raio-X; sem o recurso, o parâmetro é ignorado;
 *  - Raio-X com useRaioX (só quando o nível é 'raioX') e Exportar CSV com baixarCsvRaioX.
 * Sem o recurso, continua renderizando só o Essencial.
 */
import BlocoFundamentosEssencial from '@/components/analiseAtivos/ativo/analise/BlocoFundamentosEssencial';
import type { BlocoFundamentosProps } from '@/types/analiseAtivosBlocoD';

export default function BlocoFundamentos({ ticker, classe }: BlocoFundamentosProps) {
  return <BlocoFundamentosEssencial ticker={ticker} classe={classe} />;
}
