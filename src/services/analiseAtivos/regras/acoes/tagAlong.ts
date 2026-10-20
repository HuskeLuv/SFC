/**
 * Tag along por espécie (A6, item 6; fatia D). Regra PURA, com duas bases de texto:
 *
 *  - 'segmento_b3' (regra do segmento de listagem da B3): 100% da ON no Novo Mercado (e no Bovespa
 *    Mais) e 100% da ON e da PN no Nível 2 (e no Bovespa Mais Nível 2);
 *  - 'lei_254a' (mínimo legal, Lei 6.404 art. 254-A): 80% da ON no Nível 1 e no Tradicional;
 *  - PN fora do Nível 2: 'conforme_estatuto' (sem número);
 *  - quando o FRE 2022 (ANO_FRE_DIREITOS) informa valor ACIMA do da base (ou qualquer valor válido
 *    onde a base não tem número), mostra esse valor com a base 'fre_2022';
 *  - valor espúrio do FRE (fora de FAIXA_TAG_ALONG_PCT: 0, 7500, 125…) é descartado;
 *  - Unit = tag along das ações que a compõem (o menor entre elas; 'conforme_estatuto' se alguma
 *    componente não tem número).
 *
 * Segmento desconhecido (null) = regras do Tradicional (o art. 254-A vale para toda companhia
 * aberta). Espécie não emitida ⇒ 'nao_emite'.
 */
import {
  FAIXA_TAG_ALONG_PCT,
  type BaseTagAlong,
  type EspecieAcao,
  type TagAlongEspecieApi,
} from '@/types/analiseAtivosComplementos';

export type SegmentoListagemNorm = 'NM' | 'N2' | 'N1' | 'MA' | 'M2' | 'TRADICIONAL';

/** 'NM' | 'Novo Mercado' | 'Nível 2' | 'N1' | 'MA' (Bovespa Mais)… ⇒ código; vazio ⇒ Tradicional. */
export function normalizarSegmentoListagem(s: string | null | undefined): SegmentoListagemNorm {
  const t = (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  if (!t) return 'TRADICIONAL';
  if (t === 'NM' || t.includes('NOVO MERCADO')) return 'NM';
  if (t === 'M2' || (t.includes('MAIS') && t.includes('2'))) return 'M2';
  if (t === 'MA' || t.includes('MAIS')) return 'MA';
  if (t === 'N2' || /NIVEL\s*2/.test(t)) return 'N2';
  if (t === 'N1' || /NIVEL\s*1/.test(t)) return 'N1';
  return 'TRADICIONAL';
}

/** Tag along declarado no FRE 2022 (linha de cia_fre_direito_acao). */
export interface TagAlongDeclarado {
  especie: string;
  classePn: string;
  pctTagAlong: number | null;
}

export interface EntradaTagAlong {
  segmentoListagem: string | null;
  /** espécies que a companhia emite (ON sempre; PN e Unit pelos tickers/FRE) */
  emitePn: boolean;
  emiteUnit: boolean;
  /** linhas do FRE 2022 (vazio = sem FRE 2022) */
  declarados: TagAlongDeclarado[];
}

/** Valor do FRE dentro da faixa plausível; senão null (descartado). */
export function tagAlongValido(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < FAIXA_TAG_ALONG_PCT.min || v > FAIXA_TAG_ALONG_PCT.max) return null;
  return v;
}

interface Piso {
  pct: number | null;
  base: BaseTagAlong;
}

function pisoDe(especie: 'ON' | 'PN', seg: SegmentoListagemNorm): Piso {
  const nivel2 = seg === 'N2' || seg === 'M2';
  if (especie === 'ON') {
    return seg === 'NM' || seg === 'MA' || nivel2
      ? { pct: 100, base: 'segmento_b3' }
      : { pct: 80, base: 'lei_254a' };
  }
  return nivel2 ? { pct: 100, base: 'segmento_b3' } : { pct: null, base: 'conforme_estatuto' };
}

function aplicarDeclarado(piso: Piso, declarado: number | null): Piso {
  if (declarado === null) return piso;
  if (piso.pct === null || declarado > piso.pct) return { pct: declarado, base: 'fre_2022' };
  return piso;
}

function linha(especie: EspecieAcao, classePn: string, p: Piso): TagAlongEspecieApi {
  return { especie, classePn, pct: p.pct, base: p.base };
}

/**
 * Linhas por espécie, na ordem ON, PN (uma por classe declarada no FRE 2022; sem classe = ''),
 * Unit. Sempre devolve ON, ao menos uma PN e a Unit (as não emitidas com 'nao_emite').
 */
export function tagAlongPorEspecie(e: EntradaTagAlong): TagAlongEspecieApi[] {
  const seg = normalizarSegmentoListagem(e.segmentoListagem);
  const declON = e.declarados.filter((d) => d.especie === 'ON');
  const declPN = e.declarados.filter((d) => d.especie === 'PN');
  const maiorValido = (ds: TagAlongDeclarado[]) =>
    ds.reduce<number | null>((m, d) => {
      const v = tagAlongValido(d.pctTagAlong);
      return v === null ? m : m === null ? v : Math.max(m, v);
    }, null);

  const on = linha('ON', '', aplicarDeclarado(pisoDe('ON', seg), maiorValido(declON)));

  let pns: TagAlongEspecieApi[];
  if (!e.emitePn) {
    pns = [linha('PN', '', { pct: null, base: 'nao_emite' })];
  } else {
    const classes = [...new Set(declPN.map((d) => d.classePn))].sort();
    const lista = classes.length > 0 ? classes : [''];
    pns = lista.map((c) =>
      linha(
        'PN',
        c,
        aplicarDeclarado(pisoDe('PN', seg), maiorValido(declPN.filter((d) => d.classePn === c))),
      ),
    );
  }

  let unit: TagAlongEspecieApi;
  if (!e.emiteUnit) {
    unit = linha('UNIT', '', { pct: null, base: 'nao_emite' });
  } else {
    const componentes = [on, ...pns.filter((p) => p.base !== 'nao_emite')];
    const semNumero = componentes.find((c) => c.pct === null);
    if (semNumero) {
      unit = linha('UNIT', '', { pct: null, base: semNumero.base });
    } else {
      const menor = componentes.reduce((m, c) => ((c.pct ?? 0) < (m.pct ?? 0) ? c : m));
      unit = linha('UNIT', '', { pct: menor.pct, base: menor.base });
    }
  }
  return [on, ...pns, unit];
}
