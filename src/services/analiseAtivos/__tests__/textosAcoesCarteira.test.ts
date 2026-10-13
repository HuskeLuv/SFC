import { describe, expect, it } from 'vitest';
import {
  encontrarProibidasOperacao,
  encontrarProibidasV2,
} from '@/services/analiseAtivos/regras/comum/linguagemV2';
import {
  CLASSE_CARTEIRA,
  ROTULOS_SECAO,
  TEXTOS_ACOES_CARTEIRA,
  TEXTOS_OPERACAO,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';

/** Todas as strings de um objeto de textos, com o caminho (para a mensagem do teste). */
function folhas(obj: unknown, caminho = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[caminho, obj]];
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).flatMap(([k, v]) => folhas(v, caminho ? `${caminho}.${k}` : k));
}

describe('textosAcoesCarteira — linguagem (caso 32, fatia C1)', () => {
  it('nenhuma palavra proibida da v2.4 (lista padrão) fora de TEXTOS_OPERACAO', () => {
    const achados = [
      ...folhas(TEXTOS_ACOES_CARTEIRA, 'TEXTOS_ACOES_CARTEIRA'),
      ...folhas(CLASSE_CARTEIRA, 'CLASSE_CARTEIRA'),
      ...folhas(ROTULOS_SECAO, 'ROTULOS_SECAO'),
    ]
      .map(([c, t]) => [c, encontrarProibidasV2(t)] as const)
      .filter(([, p]) => p.length > 0);
    expect(achados).toEqual([]);
  });

  it('TEXTOS_OPERACAO passa pela lista própria (sem compra/venda) e é só Compra/Venda', () => {
    expect(TEXTOS_OPERACAO).toEqual({ compra: 'Compra', venda: 'Venda' });
    for (const t of Object.values(TEXTOS_OPERACAO)) {
      expect(encontrarProibidasOperacao(t)).toEqual([]);
      // na lista padrão eles casariam — por isso a lista própria
      expect(encontrarProibidasV2(t).length).toBeGreaterThan(0);
    }
  });

  it('vocabulário de desvio: nunca "faltam", "quanto falta", "compre" nem "oportunidade"', () => {
    const tudo = folhas(TEXTOS_ACOES_CARTEIRA)
      .map(([, t]) => t)
      .join('\n')
      .toLowerCase();
    for (const proibida of ['faltam', 'quanto falta', 'compre', 'oportunidade', 'aporte necess']) {
      expect(tudo).not.toContain(proibida);
    }
    expect(TEXTOS_ACOES_CARTEIRA.naCarteira.alvoPlanejado).toContain('alvo planejado por você');
    expect(TEXTOS_ACOES_CARTEIRA.naCarteira.semAlvo).toBe(TEXTOS_CRITERIOS.desvio.semAlvo);
  });

  it('nenhum texto de nota, semáforo, destaque ou Índice', () => {
    const tudo = folhas(TEXTOS_ACOES_CARTEIRA)
      .map(([, t]) => t)
      .join('\n');
    expect(tudo).not.toMatch(/\bnotas?\b|sem[aá]foro|destaque|Índice|★/i);
  });
});
