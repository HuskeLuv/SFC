/**
 * Lista de imóveis do FII + resumo (A6, item 1; fatia A). Funções PURAS: a gravação
 * (gravarImoveisFii) usa inferirUf/normalizarSetor/ehSetorPlaceholder e a leitura
 * (leitura/ativo/imoveisFii) usa montarListaImoveis.
 *
 * - Dados como informados à CVM (informe trimestral): nada é normalizado. O % da receita fica
 *   como veio; soma fora de FAIXA_SOMA_RECEITA_PCT só liga o aviso da tela.
 * - UF inferida do TEXTO do endereço: sigla explícita (', SP', '- RJ', '/MG') vale primeiro; sem
 *   sigla, o nome do estado por extenso. Vale a ÚLTIMA ocorrência (o fim do endereço costuma trazer
 *   cidade/UF). Nada identificado = null ('não identificada'); nunca adivinha pela cidade.
 * - Setores dos locatários só quando reais: o genérico 'SetorN'/'Setor1'… do CSV de inquilino é
 *   placeholder e nunca vai para a tela; setor vazio é ''.
 * - Locatários por nome: a CVM não publica (a tela diz 'sem dado' com o motivo).
 */
import { ehClasseRenda } from '@/services/analiseAtivos/regras/fii/imoveis';
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import type { Estado, FiiTipoTela } from '@/types/analiseAtivosApi';
import {
  FAIXA_SOMA_RECEITA_PCT,
  RE_SETOR_PLACEHOLDER,
  type ImovelFiiApi,
  type ImovelOutroFiiApi,
  type ListaImoveisFiiApi,
  type MotivoListaImoveisFii,
  type SetorLocatarioApi,
} from '@/types/analiseAtivosComplementos';

// ---------------------------------------------------------------------------
// Texto da CVM
// ---------------------------------------------------------------------------

/** '' e '-' (o CSV usa '-' para "não informado") viram null; o resto fica como informado. */
export function textoOpcional(s: string | null | undefined): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t === '' || /^-+$/.test(t) ? null : t;
}

// ---------------------------------------------------------------------------
// UF inferida
// ---------------------------------------------------------------------------

const SIGLAS_UF = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

/** Sigla em caixa alta isolada (não faz parte de palavra). 'BR' (rodovia) não é UF. */
const RE_SIGLA = new RegExp(`(?<![\\p{L}\\p{N}])(${SIGLAS_UF.join('|')})(?![\\p{L}])`, 'gu');

/**
 * Nome por extenso (sem acento, minúsculo), do mais longo para o mais curto ('mato grosso do sul'
 * antes de 'mato grosso'). 'Pará' fica fora daqui: sem acento é a preposição 'para' — só conta
 * escrito com acento (RE_PARA).
 */
const NOMES_UF: ReadonlyArray<readonly [string, string]> = [
  ['rio grande do norte', 'RN'],
  ['rio grande do sul', 'RS'],
  ['mato grosso do sul', 'MS'],
  ['distrito federal', 'DF'],
  ['espirito santo', 'ES'],
  ['rio de janeiro', 'RJ'],
  ['santa catarina', 'SC'],
  ['minas gerais', 'MG'],
  ['mato grosso', 'MT'],
  ['pernambuco', 'PE'],
  ['tocantins', 'TO'],
  ['sao paulo', 'SP'],
  ['rondonia', 'RO'],
  ['maranhao', 'MA'],
  ['amazonas', 'AM'],
  ['alagoas', 'AL'],
  ['roraima', 'RR'],
  ['sergipe', 'SE'],
  ['paraiba', 'PB'],
  ['parana', 'PR'],
  ['amapa', 'AP'],
  ['bahia', 'BA'],
  ['ceara', 'CE'],
  ['goias', 'GO'],
  ['piaui', 'PI'],
  ['acre', 'AC'],
];
const RE_PARA = /(?<![\p{L}])Par[áÁ](?![\p{L}])/gu;

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Última sigla de UF isolada no texto (ou null). */
function ultimaSigla(endereco: string): string | null {
  let ultima: string | null = null;
  for (const m of endereco.matchAll(RE_SIGLA)) ultima = m[1];
  return ultima;
}

/**
 * Último nome de estado por extenso no texto (ou null). semAcento mantém o comprimento do texto
 * (NFC: cada letra acentuada vira uma letra), então as posições dos dois casamentos (sem acento e
 * 'Pará' com acento, no original) são comparáveis.
 */
function ultimoNome(endereco: string): string | null {
  let melhor: { pos: number; uf: string } | null = null;
  const anotar = (pos: number, uf: string) => {
    if (!melhor || pos > melhor.pos) melhor = { pos, uf };
  };
  let texto = semAcento(endereco.normalize('NFC')).toLowerCase();
  for (const [nome, uf] of NOMES_UF) {
    const re = new RegExp(`(?<![a-z0-9])${nome.replace(/ /g, '\\s+')}(?![a-z])`, 'g');
    for (const m of texto.matchAll(re)) anotar(m.index, uf);
    // apaga o casado (mesmo comprimento) para 'mato grosso' não casar dentro de '… do sul'
    texto = texto.replace(re, (x) => ' '.repeat(x.length));
  }
  for (const m of endereco.normalize('NFC').matchAll(RE_PARA)) anotar(m.index, 'PA');
  return (melhor as { pos: number; uf: string } | null)?.uf ?? null;
}

/**
 * UF inferida do endereço informado à CVM. Ex.: '…, Duque de Caxias - RJ, 25085-009' → 'RJ';
 * 'Av. Central, Rio de Janeiro' → 'RJ'; 'Rodovia BR 153, Km 5,5' → null.
 */
export function inferirUf(endereco: string | null | undefined): string | null {
  const e = textoOpcional(endereco);
  if (!e) return null;
  return ultimaSigla(e) ?? ultimoNome(e);
}

// ---------------------------------------------------------------------------
// Setor dos locatários
// ---------------------------------------------------------------------------

/** Setor como informado, com espaços normalizados; vazio e '-' viram '' (PK da tabela). */
export function normalizarSetor(s: string | null | undefined): string {
  return textoOpcional(s) ?? '';
}

/**
 * 'SetorN', 'Setor1', 'Setor 2'… = placeholder do formulário (nunca exibido). RE_SETOR_PLACEHOLDER
 * (contrato) cobre os numerados; o 'SetorN' literal também aparece no CSV.
 */
export function ehSetorPlaceholder(setor: string): boolean {
  const s = setor.trim();
  return RE_SETOR_PLACEHOLDER.test(s) || /^setor\s*n$/i.test(s);
}

// ---------------------------------------------------------------------------
// Lista + resumo
// ---------------------------------------------------------------------------

/** Imóvel como lido de fii_imovel_trimestral (Decimal já em number). */
export interface ImovelLido {
  ordem: number;
  classe: string | null;
  nome: string | null;
  endereco: string | null;
  ufInferida: string | null;
  area: number | null;
  unidades: number | null;
  vacanciaPct: number | null;
  receitaPct: number | null;
}

export interface SetorLido {
  setor: string;
  pctReceitaFii: number | null;
  placeholder: boolean;
}

export interface EntradaListaImoveis {
  /** último dia do trimestre (AAAA-MM-DD); null = sem informe trimestral recente gravado */
  refQuarter: string | null;
  imoveis: ImovelLido[];
  setores: SetorLido[];
  /** a MESMA célula do Essencial (vacância física ponderada) */
  vacancia: Estado<number>;
  fiiTipo: FiiTipoTela | null;
  cnpjEmConferencia?: boolean;
}

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const arred = (n: number | null, casas: number): number | null =>
  finito(n) ? Math.round(n * 10 ** casas) / 10 ** casas : null;

function ausenteLista(motivo: MotivoListaImoveisFii): Estado<ListaImoveisFiiApi> {
  const texto = TEXTOS_IMOVEIS_FII.motivos[motivo];
  return motivo === 'nao_se_aplica_tipo'
    ? { estado: 'nao_se_aplica', motivo, texto }
    : { estado: 'ausente', motivo, texto };
}

/** Área decrescente (sem área por último); empate pela ordem do informe. */
function porArea(a: { area: number | null; ordem: number }, b: typeof a): number {
  const aa = finito(a.area) ? a.area : -1;
  const bb = finito(b.area) ? b.area : -1;
  return bb - aa || a.ordem - b.ordem;
}

/** Setores reais (sem placeholder nem vazio), do maior % da receita para o menor. */
export function setoresReais(setores: readonly SetorLido[]): SetorLocatarioApi[] {
  return setores
    .filter((s) => !s.placeholder && s.setor !== '' && !ehSetorPlaceholder(s.setor))
    .map((s) => ({ setor: s.setor, receitaPct: arred(s.pctReceitaFii, 2) }))
    .sort((a, b) => (b.receitaPct ?? -1) - (a.receitaPct ?? -1) || a.setor.localeCompare(b.setor));
}

export function montarListaImoveis(e: EntradaListaImoveis): Estado<ListaImoveisFiiApi> {
  if (e.fiiTipo === 'papel' || e.fiiTipo === 'fof') return ausenteLista('nao_se_aplica_tipo');
  if (e.cnpjEmConferencia) return ausenteLista('cnpj_em_conferencia');
  if (!e.refQuarter || e.imoveis.length === 0) return ausenteLista('sem_informe_trimestral');

  const renda = e.imoveis.filter((i) => ehClasseRenda(i.classe)).sort(porArea);
  const outros = e.imoveis.filter((i) => !ehClasseRenda(i.classe)).sort(porArea);
  if (renda.length === 0) return ausenteLista('sem_imoveis_renda');

  const imoveis: ImovelFiiApi[] = renda.map((i) => ({
    ordem: i.ordem,
    nome: i.nome,
    endereco: i.endereco,
    uf: i.ufInferida,
    areaM2: arred(i.area, 2),
    unidades: finito(i.unidades) ? i.unidades : null,
    vacanciaPct: arred(i.vacanciaPct, 2),
    receitaPct: arred(i.receitaPct, 2),
  }));
  const listaOutros: ImovelOutroFiiApi[] = outros.map((i) => ({
    ordem: i.ordem,
    nome: i.nome,
    classe: i.classe,
    areaM2: arred(i.area, 2),
  }));

  const areas = renda.map((i) => i.area).filter(finito);
  const areaTotal = areas.length ? areas.reduce((a, b) => a + b, 0) : null;
  const receitas = renda.map((i) => i.receitaPct).filter(finito);
  const somaReceita = receitas.length ? receitas.reduce((a, b) => a + b, 0) : null;
  const comUf = renda.filter((i) => i.ufInferida !== null);

  return {
    estado: 'ok',
    valor: {
      refQuarter: e.refQuarter,
      resumo: {
        nImoveisRenda: renda.length,
        nOutros: outros.length,
        areaTotalM2: arred(areaTotal, 2),
        vacanciaFisicaPct: e.vacancia,
        nEstados: new Set(comUf.map((i) => i.ufInferida)).size,
        nComUf: comUf.length,
        setores: setoresReais(e.setores),
      },
      imoveis,
      outros: listaOutros,
      somaReceitaPct: arred(somaReceita, 2),
      somaReceitaForaDaFaixa:
        somaReceita !== null &&
        (somaReceita < FAIXA_SOMA_RECEITA_PCT.min || somaReceita > FAIXA_SOMA_RECEITA_PCT.max),
    },
  };
}
