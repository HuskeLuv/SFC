/**
 * Catálogo de critérios do Comparador (Bloco D, fatia C) — PURO e isomórfico.
 *
 * Fonte: spec-desenho.json `regras_comparador` + decisões (decisoes.md, PREVALECEM):
 *  - D10: Nº de imóveis, Área informada e Vacância física (CVM) aparecem com "fonte CVM" e SEM ★
 *    (semValidacaoCvm) até validar com os relatórios dos gestores;
 *  - D11: payout NEUTRO (sem ★);
 *  - CRIs (papel): Nº de CRIs (maior) e Maior CRI (menor) com o selo "critério provisório";
 *  - Dív. líq./PL e P/Receita vêm do AssetMultiplesCurrent (LinhaQuadroApi não os tem);
 *  - P/VP do FII: tijolo/híbrido = menor; papel = perto de 1; tijolo + papel = sem ★.
 *
 * Linhas fora da tabela (montadas na tela): Índice MF (anel, sem ★), Cotação (nos slots) e "Na
 * minha carteira" (overlay do cliente; a API não tem dado do usuário).
 *
 * Cada extrator devolve o Estado ANTES da política de conferência; montarComparador aplica a
 * conferência pelo `campoTela` (chip + fora do ★).
 */
import type { CampoTela } from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { DirecaoDestaque } from '@/types/analiseAtivosBlocoD';
import type {
  ClasseQuadro,
  Estado,
  FiiTipoTela,
  FormatoAnalise,
  LinhaQuadroApi,
} from '@/types/analiseAtivosApi';

/** Tipo do ativo para a aplicabilidade de grupo/linha ('acao' ou o tipo do FII). */
export type TipoAtivoComparador = 'acao' | FiiTipoTela;

/** Dados de um ativo que os extratores leem (montados por montarComparador). */
export interface DadosAtivoComparador {
  linha: LinhaQuadroApi;
  /** régua do Índice ('acao_financeira' ⇒ dívida/margem/P/Receita n/a) */
  regua: string | null;
  /** AssetMultiplesCurrent (só os campos usados); null = sem linha */
  atual: {
    divLiqPl: number | null;
    pReceita: number | null;
    rend12m: number | null;
    vpCota: number | null;
    naoSeAplica: string[];
  } | null;
  /** último informe trimestral do FII (refQuarter ≥ hoje − 9 meses); null = sem informe */
  trimestre: {
    nImoveis: number | null;
    areaM2: number | null;
    nCri: number | null;
    maiorCriPct: number | null;
  } | null;
  /** FII com ticker↔CNPJ não conferido: dados do informe ficam '—' */
  cnpjEmConferencia: boolean;
}

export interface DefIndicador {
  codigo: keyof typeof TEXTOS_COMPARADOR.linhas;
  rotulo: string;
  sub: string | null;
  formato: FormatoAnalise;
  /** direção do ★; o P/VP do FII é decidido por tipo (direcaoPvpFii) */
  direcao: DirecaoDestaque;
  /** tipos a que a linha se aplica; os demais ficam 'n/a' */
  aplicavel: (tipo: TipoAtivoComparador) => boolean;
  fonteCvmAviso: boolean;
  criterioProvisorio: boolean;
  /** decisão 10: sem ★ até a validação */
  semValidacaoCvm: boolean;
  /** campo de tela da conferência (regras/comum/conferencia.ts); null = sem conferência */
  campoTela: CampoTela | null;
  extrator: (d: DadosAtivoComparador) => Estado<number>;
}

export interface DefGrupoComparador {
  codigo: keyof typeof TEXTOS_COMPARADOR.grupos;
  rotulo: string;
  aplicavelA: TipoAtivoComparador[];
  linhas: DefIndicador[];
}

const TL = TEXTOS_COMPARADOR.linhas;
const TG = TEXTOS_COMPARADOR.grupos;

const TIPOS_FII: FiiTipoTela[] = ['tijolo', 'papel', 'hibrido', 'fof', 'indefinido'];
const TIPOS_IMOVEIS: FiiTipoTela[] = ['tijolo', 'hibrido'];
const TIPOS_CRI: FiiTipoTela[] = ['papel'];

export function tipoDoAtivo(
  linha: Pick<LinhaQuadroApi, 'classe' | 'fiiTipo'>,
): TipoAtivoComparador {
  if (linha.classe === 'acao') return 'acao';
  return linha.fiiTipo ?? 'indefinido';
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export function okOuSemDado(n: number | null | undefined): Estado<number> {
  return typeof n === 'number' && Number.isFinite(n)
    ? { estado: 'ok', valor: n }
    : { estado: 'ausente', motivo: 'sem_dado_fonte', texto: TEXTOS_TELA.ausentesPorCampo.semDado };
}

export function naoSeAplicaComparador(motivo = 'fora_do_escopo'): Estado<number> {
  return { estado: 'nao_se_aplica', motivo, texto: TEXTOS_COMPARADOR.celula.naoSeAplica };
}

function cnpjEmConferencia(): Estado<number> {
  return {
    estado: 'ausente',
    motivo: 'cnpj_em_conferencia',
    texto: TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia,
  };
}

const ehFinanceira = (d: DadosAtivoComparador) => d.regua === 'acao_financeira';

/** Campo do AssetMultiplesCurrent de ação (financeira ou naoSeAplica ⇒ n/a). */
function doAtualAcao(campo: 'divLiqPl' | 'pReceita') {
  return (d: DadosAtivoComparador): Estado<number> => {
    if (ehFinanceira(d)) return naoSeAplicaComparador('financeira');
    if (d.atual?.naoSeAplica.includes(campo)) return naoSeAplicaComparador();
    return okOuSemDado(d.atual?.[campo]);
  };
}

function doTrimestre(fn: (t: NonNullable<DadosAtivoComparador['trimestre']>) => number | null) {
  return (d: DadosAtivoComparador): Estado<number> => {
    if (d.cnpjEmConferencia) return cnpjEmConferencia();
    return okOuSemDado(d.trimestre ? fn(d.trimestre) : null);
  };
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

type Base = Omit<DefIndicador, 'rotulo' | 'sub' | 'aplicavel'> & {
  aplicavel?: DefIndicador['aplicavel'];
};

function linha(b: Base): DefIndicador {
  const t = TL[b.codigo] as { rotulo: string; sub: string };
  return {
    ...b,
    rotulo: t.rotulo,
    sub: t.sub ? t.sub : null,
    aplicavel: b.aplicavel ?? (() => true),
  };
}

const NEUTRO = {
  fonteCvmAviso: false,
  criterioProvisorio: false,
  semValidacaoCvm: false,
} as const;

export const GRUPOS_ACAO: DefGrupoComparador[] = [
  {
    codigo: 'qualidade',
    rotulo: TG.qualidade,
    aplicavelA: ['acao'],
    linhas: [
      linha({
        ...NEUTRO,
        codigo: 'lucrosSeguidos',
        formato: 'inteiro',
        direcao: 'maior',
        campoTela: 'anosLucroConsecutivos',
        extrator: (d) => okOuSemDado(d.linha.anosLucroConsecutivos),
      }),
      linha({
        ...NEUTRO,
        codigo: 'roe',
        formato: 'pct',
        direcao: 'maior',
        campoTela: 'roe',
        extrator: (d) => d.linha.roe,
      }),
      linha({
        ...NEUTRO,
        codigo: 'margemLiquida',
        formato: 'pct',
        direcao: 'maior',
        campoTela: 'margemLiquida',
        extrator: (d) =>
          ehFinanceira(d) ? naoSeAplicaComparador('financeira') : d.linha.margemLiquida,
      }),
    ],
  },
  {
    codigo: 'endividamento',
    rotulo: TG.endividamento,
    aplicavelA: ['acao'],
    linhas: [
      linha({
        ...NEUTRO,
        codigo: 'divLiqEbitda',
        formato: 'numero2',
        direcao: 'menor',
        campoTela: 'divLiqEbitda',
        extrator: (d) =>
          ehFinanceira(d) ? naoSeAplicaComparador('financeira') : d.linha.divLiqEbitda,
      }),
      linha({
        ...NEUTRO,
        codigo: 'divLiqPl',
        formato: 'numero2',
        direcao: 'menor',
        campoTela: 'divLiqPl',
        extrator: doAtualAcao('divLiqPl'),
      }),
    ],
  },
  {
    codigo: 'preco',
    rotulo: TG.preco,
    aplicavelA: ['acao'],
    linhas: [
      linha({
        ...NEUTRO,
        codigo: 'pl',
        formato: 'numero',
        direcao: 'menor_positivo',
        campoTela: 'pl',
        extrator: (d) => d.linha.pl,
      }),
      linha({
        ...NEUTRO,
        codigo: 'pvp',
        formato: 'numero2',
        direcao: 'menor',
        campoTela: 'pvp',
        extrator: (d) => d.linha.pvp,
      }),
      linha({
        ...NEUTRO,
        codigo: 'pReceita',
        formato: 'numero2',
        direcao: 'menor',
        campoTela: 'pReceita',
        extrator: doAtualAcao('pReceita'),
      }),
    ],
  },
  {
    codigo: 'dividendos',
    rotulo: TG.dividendos,
    aplicavelA: ['acao'],
    linhas: [
      linha({
        ...NEUTRO,
        codigo: 'dy12m',
        formato: 'pct',
        direcao: 'maior',
        campoTela: 'dy12m',
        extrator: (d) => d.linha.dy12m,
      }),
      // decisão 11: payout neutro (alto não é mais nem menos favorável)
      linha({
        ...NEUTRO,
        codigo: 'payout',
        formato: 'pct',
        direcao: 'neutro',
        campoTela: 'payout',
        extrator: (d) => d.linha.payout,
      }),
    ],
  },
  {
    codigo: 'tamanhoLiquidez',
    rotulo: TG.tamanhoLiquidez,
    aplicavelA: ['acao'],
    linhas: [
      linha({
        ...NEUTRO,
        codigo: 'valorMercado',
        formato: 'moedaCompacta',
        direcao: 'neutro',
        campoTela: 'valorMercado',
        extrator: (d) => okOuSemDado(d.linha.valorMercado),
      }),
      linha({
        ...NEUTRO,
        codigo: 'liquidez21',
        formato: 'moedaCompacta',
        direcao: 'neutro',
        campoTela: 'liquidez21',
        extrator: (d) => okOuSemDado(d.linha.liquidezMedia21),
      }),
    ],
  },
];

const soImoveis = (t: TipoAtivoComparador) => (TIPOS_IMOVEIS as string[]).includes(t);
const soCri = (t: TipoAtivoComparador) => (TIPOS_CRI as string[]).includes(t);

export const GRUPOS_FII: DefGrupoComparador[] = [
  {
    codigo: 'renda',
    rotulo: TG.renda,
    aplicavelA: TIPOS_FII,
    linhas: [
      linha({
        ...NEUTRO,
        codigo: 'dy12m',
        formato: 'pct',
        direcao: 'maior',
        campoTela: 'dy12m',
        extrator: (d) => d.linha.dy12m,
      }),
      linha({
        ...NEUTRO,
        codigo: 'rendimentoCota',
        formato: 'numero2',
        direcao: 'neutro',
        campoTela: 'rendCota12m',
        extrator: (d) => okOuSemDado(d.atual?.rend12m),
      }),
      linha({
        ...NEUTRO,
        codigo: 'mesesComRendimento',
        formato: 'inteiro',
        direcao: 'maior',
        campoTela: 'mesesComRendimento',
        extrator: (d) => okOuSemDado(d.linha.mesesComRendimento),
      }),
    ],
  },
  {
    codigo: 'preco',
    rotulo: TG.preco,
    aplicavelA: TIPOS_FII,
    linhas: [
      // direção por tipo: tijolo/híbrido = menor; papel = perto de 1 (direcaoPvpFii)
      linha({
        ...NEUTRO,
        codigo: 'pvpFii',
        formato: 'numero2',
        direcao: 'menor',
        campoTela: 'pvp',
        extrator: (d) => d.linha.pvp,
      }),
      linha({
        ...NEUTRO,
        codigo: 'vpCota',
        formato: 'numero2',
        direcao: 'neutro',
        campoTela: 'vpCota',
        extrator: (d) => (d.cnpjEmConferencia ? cnpjEmConferencia() : okOuSemDado(d.atual?.vpCota)),
      }),
    ],
  },
  {
    codigo: 'imoveis',
    rotulo: TG.imoveis,
    aplicavelA: TIPOS_IMOVEIS,
    linhas: [
      linha({
        codigo: 'nImoveis',
        formato: 'inteiro',
        direcao: 'neutro',
        aplicavel: soImoveis,
        fonteCvmAviso: true,
        criterioProvisorio: false,
        semValidacaoCvm: true,
        campoTela: 'nImoveisCvm',
        extrator: (d) =>
          d.cnpjEmConferencia
            ? cnpjEmConferencia()
            : okOuSemDado(d.trimestre?.nImoveis ?? d.linha.nImoveisCvm),
      }),
      linha({
        codigo: 'areaInformada',
        formato: 'inteiro',
        direcao: 'neutro',
        aplicavel: soImoveis,
        fonteCvmAviso: true,
        criterioProvisorio: false,
        semValidacaoCvm: true,
        campoTela: null,
        extrator: doTrimestre((t) => (t.areaM2 === null ? null : t.areaM2 / 1000)),
      }),
      linha({
        codigo: 'vacanciaFisica',
        formato: 'pct',
        direcao: 'neutro',
        aplicavel: soImoveis,
        fonteCvmAviso: true,
        criterioProvisorio: false,
        semValidacaoCvm: true,
        campoTela: 'vacanciaCvm',
        extrator: (d) => d.linha.vacanciaCvm,
      }),
    ],
  },
  {
    codigo: 'cris',
    rotulo: TG.cris,
    aplicavelA: TIPOS_CRI,
    linhas: [
      linha({
        codigo: 'nCri',
        formato: 'inteiro',
        direcao: 'maior',
        aplicavel: soCri,
        fonteCvmAviso: true,
        criterioProvisorio: true,
        semValidacaoCvm: false,
        campoTela: 'nCri',
        extrator: doTrimestre((t) => t.nCri),
      }),
      linha({
        codigo: 'maiorCri',
        formato: 'pct',
        direcao: 'menor',
        aplicavel: soCri,
        fonteCvmAviso: true,
        criterioProvisorio: true,
        semValidacaoCvm: false,
        campoTela: null,
        extrator: doTrimestre((t) => t.maiorCriPct),
      }),
    ],
  },
  {
    codigo: 'alavancagem',
    rotulo: TG.alavancagem,
    aplicavelA: TIPOS_FII,
    linhas: [
      linha({
        ...NEUTRO,
        codigo: 'obrigacoesPl',
        formato: 'pct',
        direcao: 'menor',
        campoTela: 'obrigacoesPl',
        extrator: (d) => d.linha.obrigacoesPl,
      }),
    ],
  },
  {
    codigo: 'tamanhoLiquidez',
    rotulo: TG.tamanhoLiquidez,
    aplicavelA: TIPOS_FII,
    linhas: [
      linha({
        ...NEUTRO,
        codigo: 'patrimonio',
        formato: 'moedaCompacta',
        direcao: 'neutro',
        campoTela: 'patrimonio',
        extrator: (d) => okOuSemDado(d.linha.patrimonio),
      }),
      linha({
        ...NEUTRO,
        codigo: 'cotistas',
        formato: 'inteiro',
        direcao: 'neutro',
        campoTela: 'cotistas',
        extrator: (d) => okOuSemDado(d.linha.cotistas),
      }),
      linha({
        ...NEUTRO,
        codigo: 'liquidez21',
        formato: 'moedaCompacta',
        direcao: 'neutro',
        campoTela: 'liquidez21',
        extrator: (d) => okOuSemDado(d.linha.liquidezMedia21),
      }),
    ],
  },
];

export function catalogoComparador(classe: ClasseQuadro): DefGrupoComparador[] {
  return classe === 'acao' ? GRUPOS_ACAO : GRUPOS_FII;
}

/** P/VP do FII: todos papel ⇒ perto de 1; nenhum papel ⇒ menor; tijolo + papel ⇒ sem ★. */
export function direcaoPvpFii(tipos: readonly TipoAtivoComparador[]): {
  direcao: DirecaoDestaque;
  tiposDiferentes: boolean;
} {
  const papel = tipos.filter((t) => t === 'papel').length;
  if (papel > 0 && papel === tipos.length) return { direcao: 'perto_de_1', tiposDiferentes: false };
  return { direcao: 'menor', tiposDiferentes: papel > 0 };
}

/** tijolo (ou híbrido) e papel no mesmo conjunto. */
export function ehMisto(tipos: readonly TipoAtivoComparador[]): boolean {
  return tipos.some((t) => t === 'papel') && tipos.some((t) => soImoveis(t));
}
