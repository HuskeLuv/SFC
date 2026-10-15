/**
 * FonteExemplo — conector FAKE e DETERMINÍSTICO de fundamentos (v2.5, desenho final.camada_fontes
 * §5). Serve de molde para o conector pago (fonteProvedorX.ts) e de dublê nos testes da ingestão
 * (point-in-time, sanidade, curadoria) e no DEV (`rodar-job fontes-fundamentos --fonte=exemplo`).
 *
 * NUNCA roda em produção: o registro (obterFonte) recusa 'exemplo' com NODE_ENV=production e o job
 * repete a checagem. Não faz rede: os valores saem de uma conta sobre o ticker e o ano.
 *
 * Itens que entrega (para exercitar a ingestão):
 *  - ação: revenue, net_income e net_income_adjusted (FY) — valores em REAIS (unidade do catálogo);
 *  - FII: vacancy_physical trimestral (Q) e uma linha de qualidade (default_pct / ltv_avg);
 *  - um campo fora do catálogo ('rating', nota proprietária) que a ingestão DESCARTA e só conta.
 * criarFonteExemplo({ itens }) troca o gerador por uma lista fixa (testes).
 */
import type {
  AtivoFonte,
  ContextoBuscaFonte,
  FonteFundamentos,
  PontoSerie,
  QualidadeFii,
} from '@/types/analiseAtivosFontes';

export const ID_FONTE_EXEMPLO = 'exemplo';
export const ROTULO_FONTE_EXEMPLO = 'Fonte de exemplo (teste)';
const URL_EXEMPLO = 'https://exemplo.invalid/fundamentos';

/** Item como um conector real poderia mandar (inclui lixo fora do catálogo). */
export type ItemFonteExemplo = PontoSerie | QualidadeFii | Record<string, unknown>;

/** Semente estável por ticker (soma dos códigos dos caracteres). */
function semente(symbol: string): number {
  let s = 0;
  for (const c of symbol) s += c.charCodeAt(0);
  return s;
}

/** Itens gerados para um ativo entre `desdeAno` e `ateAno` (inclusive). Pura. */
export function itensExemplo(
  ativo: AtivoFonte,
  desdeAno: number,
  ateAno: number,
): ItemFonteExemplo[] {
  const s = semente(ativo.symbol);
  const out: ItemFonteExemplo[] = [];
  for (let ano = desdeAno; ano <= ateAno; ano++) {
    const i = ano - desdeAno;
    const base = { symbol: ativo.symbol, emissorId: ativo.emissorId, classe: ativo.classe };
    const meta = {
      sourceUrl: `${URL_EXEMPLO}/${ativo.symbol}/${ano}`,
      extractedBy: 'api' as const,
    };
    if (ativo.classe === 'acao') {
      const receita = (1_000 + (s % 97) * 10) * 1e6 * (1 + 0.08 * i);
      const lucro = receita * 0.12;
      for (const [serie, valor] of [
        ['revenue', receita],
        ['net_income', lucro],
        ['net_income_adjusted', lucro * 0.95],
      ] as const) {
        out.push({
          ...base,
          ...meta,
          serie,
          tipoPeriodo: 'FY',
          anoFiscal: ano,
          dtFim: `${ano}-12-31`,
          valor: Math.round(valor),
        });
      }
      // nota proprietária do provedor: fora do catálogo, descartada pela ingestão
      out.push({ ...base, serie: 'rating', anoFiscal: ano, dtFim: `${ano}-12-31`, valor: 7 });
    } else {
      for (const [q, mes] of [
        [1, '03-31'],
        [2, '06-30'],
        [3, '09-30'],
        [4, '12-31'],
      ] as const) {
        out.push({
          ...base,
          ...meta,
          serie: 'vacancy_physical',
          tipoPeriodo: 'Q',
          anoFiscal: ano,
          dtFim: `${ano}-${mes}`,
          valor: Math.round(((s % 7) + q * 0.5) * 100) / 100,
        });
      }
      out.push({
        tipo: 'qualidade_fii',
        symbol: ativo.symbol,
        cnpj: ativo.emissorId ?? `sem-cnpj-${ativo.symbol}`,
        periodo: `${ano}-12-31`,
        defaultPct: Math.round((s % 3) * 50) / 100,
        ltvAvg: 50 + (s % 10),
        sourceUrl: meta.sourceUrl,
        extractedBy: 'api',
      });
    }
  }
  return out;
}

export interface OpcoesFonteExemplo {
  /** lista fixa de itens (testes); ausente = gerador determinístico */
  itens?: readonly ItemFonteExemplo[];
}

export function criarFonteExemplo(opcoes: OpcoesFonteExemplo = {}): FonteFundamentos {
  return {
    id: ID_FONTE_EXEMPLO,
    rotulo: ROTULO_FONTE_EXEMPLO,
    mercados: ['br_acoes', 'br_fii'],
    seriesOferecidas: [
      'revenue',
      'net_income',
      'net_income_adjusted',
      'vacancy_physical',
      'default_pct',
      'ltv_avg',
    ],
    modo: 'ingestao',
    async *buscar(ctx: ContextoBuscaFonte, ativos: readonly AtivoFonte[], desde: Date) {
      const symbols = new Set(ativos.map((a) => a.symbol));
      if (opcoes.itens) {
        for (const item of opcoes.itens) {
          if (symbols.has(String((item as { symbol?: unknown }).symbol))) {
            yield item as PontoSerie | QualidadeFii;
          }
        }
        return;
      }
      const ateAno = ctx.agora.getUTCFullYear() - 1;
      for (const ativo of ativos) {
        if (ctx.signal?.aborted) return;
        for (const item of itensExemplo(ativo, desde.getUTCFullYear(), ateAno)) {
          yield item as PontoSerie | QualidadeFii;
        }
      }
    },
  };
}

export const FONTE_EXEMPLO: FonteFundamentos = criarFonteExemplo();
