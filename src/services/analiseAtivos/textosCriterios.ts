/**
 * Textos COMPARTILHADOS dos Filtros de Fundamentos (v2.4). Dono: fatia 0.
 *
 * Aqui ficam os fatos (frases factuais do motor, fatia A), estados, marcas, contador, frase do
 * card, fonte, perfil, janela, mini-barras e o vocabulário de DESVIO (base da aba, rec. 1) — usados
 * por A, B, C1, C2 e D sem arquivo em comum. Rótulos e definições de cada critério NÃO ficam aqui:
 * vêm de criteria_params (params versionados). Textos jurídicos literais: textosLiterais.ts.
 *
 * Linguagem: todos os valores passam por linguagemV2 (teste textosCriterios.test.ts): sem nota,
 * Índice, semáforo, destaque, vencedor, melhor/pior, falta(m), compre/venda, recomend*. A marca é
 * ✓ / — / n/a em tinta neutra, nunca cor semântica. Placeholders {chave} via formatarTexto.
 */
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type {
  EstadoCriterio,
  FormatoCriterio,
  IdCriterio,
  Janela,
  PerfilCriterio,
} from '@/types/analiseAtivosCriterios';

export { formatarTexto };

export const TEXTOS_CRITERIOS = {
  titulo: 'Critérios de fundamentos',
  /** frase sob o número do card */
  subtitulo: 'verificados ano a ano nas demonstrações financeiras',
  /** cabeçalho da coluna do Quadro */
  coluna: 'Critérios',
  colunaAria: 'Critérios de fundamentos atendidos',

  estados: {
    atende: 'atende',
    nao_atende: 'não atende',
    sem_dado: 'não atende · sem dado nas demonstrações',
    nao_se_aplica: 'não se aplica',
  } satisfies Record<EstadoCriterio, string>,

  /** marca visual (aria-hidden) */
  marcas: {
    atende: '✓',
    nao_atende: '—',
    sem_dado: '—',
    nao_se_aplica: 'n/a',
  } satisfies Record<EstadoCriterio, string>,

  /** texto para leitor de tela junto da marca */
  marcasSr: {
    atende: 'atende:',
    nao_atende: 'não atende:',
    sem_dado: 'não atende, sem dado:',
    nao_se_aplica: 'não se aplica:',
  } satisfies Record<EstadoCriterio, string>,

  contador: {
    /** 'n de k' na célula e no card */
    curto: '{n} de {total}',
    /** 'n de k crit.' nas sugestões do Comparar */
    abreviado: '{n} de {total} crit.',
    /** card e comparador ('Critérios atendidos: 5 de 6') */
    atendidos: 'Critérios atendidos: {n} de {total}',
    /** leitura dos dados do comparador ('WEGE3: 5 de 6 critérios em 5 anos') */
    porAtivo: '{ticker}: {n} de {total} critérios em {anos} anos',
    semAvaliacao: 'sem avaliação',
  },

  celula: {
    /** aria-label do botão da célula */
    aria: 'Critérios em {anos} anos: {n} de {total} atendidos. Ver detalhes.',
    ariaSemAvaliacao: 'Critérios: sem avaliação para {ticker}.',
    /** linha do tooltip: 'Receita crescente: atende · cresceu em 5 de 5 anos …' */
    linhaTooltip: '{rotulo}: {estado} · {fato}',
    tituloTooltip: 'Critérios em {anos} anos',
    fecharTooltip: 'Fechar',
  },

  janela: {
    rotuloGrupo: 'Janela de anos dos critérios',
    opcao: '{anos} anos',
    opcaoCompacta: '{anos}a',
    /** título de bloco ('Critérios de fundamentos · 5 anos') */
    tituloComJanela: 'Critérios de fundamentos · {anos} anos',
    periodo: '{anoInicio}–{anoFim}',
  },

  /** Frases factuais do motor (fatia A; port do fmtC/evalCriteria do screen.js). */
  fatos: {
    up: 'cresceu em {n} de {total} anos · {inicio} → {fim}',
    upComUnidade: 'cresceu em {n} de {total} anos · {inicio} → {fim} ({unidade})',
    pos: 'positiva em {n} de {total} anos · mín. {min}',
    max: 'dentro do limite em {n} de {total} anos · máx. {max} (limite {limite})',
    maxCaixaLiquido:
      'dentro do limite em {n} de {total} anos · máx. {max} (limite {limite}) · caixa líquido em todos os anos',
    min: 'dentro do limite em {n} de {total} anos · mín. {min} (limite {limite})',
    meses: '{n} de {total} meses com rendimento pago',
    mesesPeriodo: '{n} de {total} meses com rendimento pago (jan/{anoInicio}–dez/{anoFim})',
    semDado: 'sem dado nas demonstrações',
    semDadoFii10: 'sem dado nas demonstrações · os informes de FII na CVM começam em 2016',
    /** rec. 4: base de proventos começa depois do início da janela */
    baseProventosCurta: 'sem dado nas demonstrações (proventos registrados desde {mesAno})',
    ebitdaNaoPositivo: 'EBITDA ≤ 0 em {ano}',
  },

  /** Textos dos critérios inativos (D3) e não aplicáveis (D4), por motivo. */
  motivos: {
    sem_fonte_confiavel: {
      vac: 'sem dado nas demonstrações · a vacância informada à CVM pode diferir do relatório do gestor e fica fora do critério até a conferência dos fundos',
      inad: 'sem dado nas demonstrações · existe só nos relatórios gerenciais em PDF; entra quando a planilha curada estiver no ar',
      ltv: 'sem dado nas demonstrações · existe só nos relatórios gerenciais em PDF; entra quando a planilha curada estiver no ar',
    } satisfies Partial<Record<IdCriterio, string>>,
    instituicao_financeira:
      'não se aplica a instituições financeiras (bancos, seguradoras e holdings financeiras): o balanço não tem EBITDA nem dívida líquida',
    instituicao_financeira_mg:
      'não se aplica a esta instituição financeira: a receita nas demonstrações não é comparável ao lucro (holding de participações ou banco no balanço individual)',
    instituicao_financeira_fcl:
      'não se aplica a instituições financeiras: o caixa operacional de banco e seguradora inclui depósitos, captações e reservas técnicas',
  },

  /** Selo do chip desabilitado (vac/inad) e tooltips dos pares de FII. */
  chips: {
    seloSemDado: 'sem dado',
    tooltipDesabilitado:
      'Sem fonte confiável nas demonstrações: a vacância informada à CVM pode diferir do relatório do gestor, e a inadimplência existe só nos relatórios em PDF. O filtro fica desligado até a conferência.',
    tooltipParAlavancagem:
      'Em FII de tijolo: Obrigações/PL ≤ 20%. Fundo de papel não tem LTV nas demonstrações e fica de fora deste filtro.',
    parSeparador: ' / ',
  },

  /** Perfil (FoF/indefinido/financeira) — nota curta junto da contagem. */
  perfil: {
    fof: 'FoF: avaliado com os critérios de papel (regra de composição)',
    indefinido: 'tipo indefinido: avaliado com os critérios de {perfil} (regra de composição)',
    hibrido: 'híbrido: avaliado com os critérios de {perfil} (regra de composição)',
    financeira: 'instituição financeira: {n} critérios não se aplicam',
    naoSeAplicamUm: '1 critério não se aplica a este ativo',
    naoSeAplicamVarios: '{n} critérios não se aplicam a este ativo',
    nomes: {
      acao: 'ações',
      acao_financeira: 'instituições financeiras',
      fii_tijolo: 'tijolo',
      fii_papel: 'papel',
    } satisfies Record<PerfilCriterio, string>,
  },

  /** Fonte e aviso do card de critérios (§3.2). */
  fonte: {
    acao: 'Fonte: DFP/ITR (CVM).',
    fii: 'Fonte: informes mensais e trimestrais dos FIIs (CVM).',
    aviso:
      'Dado contábil histórico, não avaliação do My Finance; rentabilidade passada não é garantia de resultados futuros. Para os demonstrativos completos, use o Raio-X.',
    janela10Fii:
      'Os informes de FII na CVM começam em 2016. Na janela de 10 anos, os critérios saem "sem dado nas demonstrações" para quase todos os fundos.',
  },

  /** Tooltips D2 do Essencial e dos critérios de lucro. */
  tooltips: {
    lucroLiquido:
      'A CVM não publica o lucro sem itens não recorrentes. A coluna usa o lucro líquido dos controladores.',
    margemLiquida:
      'Lucro líquido ÷ receita líquida. A margem sem itens não recorrentes depende de um lucro que a CVM não publica.',
  },

  /** Mini-barras anuais. */
  barras: {
    aria: '{rotulo}, {anoInicio} a {anoFim}: {valores}',
    anoValor: '{ano}: {valor}',
    anoSemDado: '{ano}: sem dado',
    separador: '; ',
    limite: 'limite {limite}',
  },

  /**
   * Vocabulário de DESVIO (rec. 1): posição, alvo e desvio na MESMA base (% da aba). Nunca
   * "faltam", "quanto falta", "aporte necessário" nem chamada à ação.
   */
  desvio: {
    posicao: 'posição atual {pct} de {aba}',
    alvo: 'alvo planejado por você: {pct}',
    desvio: 'desvio {pp}',
    desvioComValor: 'desvio {pp} ({valor} · {qtd})',
    semAlvo: 'sem alvo planejado',
    planejar: 'planejar na carteira',
    equivalenteTotal: '≈ {pct} da carteira hoje',
    resumo: 'posição atual vs. alvo {pp} ({valor} · {qtd})',
  },
} as const;

// ===========================================================================
// Formatação dos números do fato (fmtC do screen.js)
// ===========================================================================

const MENOS = '−';

function numeroPtBr(v: number, casas: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/**
 * Formata um valor de critério como no fato: n = inteiro com milhar ('17.500'), n1/n2 = 1/2 casas,
 * % = 1 casa + '%', x = 1 casa + '×'. |v| < 0,05 vira 0 (exceto n2). Negativo com '−' tipográfico.
 * null/NaN = '—'.
 */
export function formatarValorCriterio(v: number | null, formato: FormatoCriterio): string {
  if (v === null || !Number.isFinite(v)) return '—';
  let x = v;
  if (formato !== 'n2' && Math.abs(x) < 0.05) x = 0;
  const casas = formato === 'n' ? 0 : formato === 'n2' ? 2 : 1;
  const abs = numeroPtBr(Math.abs(x), casas);
  const sinal = x < 0 && abs !== numeroPtBr(0, casas) ? MENOS : '';
  const sufixo = formato === '%' ? '%' : formato === 'x' ? '×' : '';
  return `${sinal}${abs}${sufixo}`;
}

/** 'n de k' (k = aplicáveis). */
export function textoContador(n: number, total: number): string {
  return formatarTexto(TEXTOS_CRITERIOS.contador.curto, { n, total });
}

/** Rótulo da pílula de janela ('5 anos' | '5a'). */
export function textoJanela(janela: Janela, compacta = false): string {
  return formatarTexto(
    compacta ? TEXTOS_CRITERIOS.janela.opcaoCompacta : TEXTOS_CRITERIOS.janela.opcao,
    { anos: janela },
  );
}

/** Placeholders aceitos nos textos deste módulo (o teste confere). */
export const PLACEHOLDERS_CRITERIOS = [
  'n',
  'total',
  'ticker',
  'anos',
  'rotulo',
  'estado',
  'fato',
  'anoInicio',
  'anoFim',
  'inicio',
  'fim',
  'unidade',
  'min',
  'max',
  'limite',
  'mesAno',
  'ano',
  'perfil',
  'valores',
  'valor',
  'pct',
  'aba',
  'pp',
  'qtd',
] as const;
