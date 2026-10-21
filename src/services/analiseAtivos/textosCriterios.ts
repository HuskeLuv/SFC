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
 *
 * v2.5 (fatia 0, CONGELADOS para as fatias A/B/C): sai o texto dos informes de FII "desde 2016"
 * (janela 10 = só "sem dado nas demonstrações"); desvio na base da carteira TOTAL ('da carteira');
 * tooltips de lucro/margem descontados e do fallback; pares de chips de FII ativos; selo 'dados
 * incompletos' (§6) e a nota de fonte montada pelas origens (textoNotaFonte).
 *
 * Stocks e REITs (fatia 0 da feature EUA): nomes dos perfis stock/stock_financeira/reit, fato do
 * pagamento sobre caixa operacional ≤ 0, motivo da ocupação sem fonte, fonte '10-K (SEC)' na nota
 * de fonte das classes EUA. O resto dos textos EUA (universo, cotação, EBITDA calculado, tooltips
 * dos critérios substitutos) fica em textosEua.ts.
 *
 * fundamentei-regras (fatia F1; docs/analise-ativos/fundamentei-regras/desenho.json): fatos do tipo
 * 'cagr' (crescimento anual composto; base ≤ 0; último ano ≤ 0), do 'mes' pelo mês da data-com,
 * do payout sobre o caixa operacional ajustado ≤ 0, o motivo n/a do lucro operacional (EBIT) da
 * financeira e os rótulos/definições em PORTUGUÊS dos critérios que mudam na criteria_params v5
 * (criteriosV5; os rótulos em inglês dos critérios EUA ficam em textosEuaEn.ts, escolhidos na
 * leitura). Os textos de antes continuam para ler as avaliações v1–v4.
 */
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type {
  EstadoCriterio,
  FormatoCriterio,
  IdCriterio,
  Janela,
  ObsCriterio,
  PerfilCriterio,
} from '@/types/analiseAtivosCriterios';
import { ehClasseEua, type ClasseQuadro } from '@/types/analiseAtivosApi';
import type { IdFonte } from '@/types/analiseAtivosFontes';

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
    /** fundamentei-regras (v5, meses.mesReferencia 'data_com'): o mês que conta é o da data-com */
    mesesPeriodoDataCom:
      '{n} de {total} meses com rendimento (mês da data-com, jan/{anoInicio}–dez/{anoFim})',
    /** fundamentei-regras (tipo 'cagr'): taxa = (fim ÷ início)^(1/anos) − 1 */
    cagr: 'crescimento anual de {taxa} em {total} anos · {inicio} → {fim}',
    cagrComUnidade: 'crescimento anual de {taxa} em {total} anos · {inicio} → {fim} ({unidade})',
    /** 'cagr' com o primeiro ano ≤ 0 (cagr.baseNaoPositiva: atende pelo último ano ou sem dado) */
    cagrBaseNaoPositiva:
      'saiu de {inicio} para {fim}; taxa anual não se calcula com base negativa ou zero',
    cagrBaseNaoPositivaComUnidade:
      'saiu de {inicio} para {fim} ({unidade}); taxa anual não se calcula com base negativa ou zero',
    /** 'cagr' com o último ano ≤ 0: não atende em qualquer modo */
    cagrFimNaoPositivo: 'saiu de {inicio} para {fim}; último ano negativo ou zero',
    cagrFimNaoPositivoComUnidade:
      'saiu de {inicio} para {fim} ({unidade}); último ano negativo ou zero',
    semDado: 'sem dado nas demonstrações',
    /** QA Pedro 16/10: a série só começa depois do início da janela (empresa/fundo mais novo) */
    semDadoDesde:
      'sem dado nas demonstrações (dados desde {ano}, menos que a janela de {anos} anos)',
    /** QA Pedro 16/10: inadimplência e LTV não estão nos informes da CVM */
    semDadoRelatorioGestor:
      'sem dado nas demonstrações (publicado só nos relatórios gerenciais do fundo)',
    /** rec. 4: base de proventos começa depois do início da janela */
    baseProventosCurta: 'sem dado nas demonstrações (proventos registrados desde {mesAno})',
    /** backtest 18/10/2026 (A5/M7): mês sem provento na base em que a CVM registra distribuição */
    baseProventosIncompleta:
      'sem dado nas demonstrações (a base de proventos não tem {mesAno}, com rendimento no informe da CVM)',
    ebitdaNaoPositivo: 'EBITDA ≤ 0 em {ano}',
    /** EUA (REIT, 'pay'): dividendos ÷ caixa operacional com FCO ≤ 0 = não atende */
    caixaOperacionalNaoPositivo: 'caixa operacional ≤ 0 em {ano}',
    /** EUA (REIT, 'pay' da v5): dividendos ÷ caixa operacional ajustado com o ajustado ≤ 0 */
    caixaOperacionalAjustadoNaoPositivo: 'caixa operacional ajustado ≤ 0 em {ano}',
    /** EUA (stock_financeira, 'dl' e 'fcl'): sem dado para todas as financeiras, com o motivo */
    financeiraSemDividaLiquida:
      'sem dado nas demonstrações · o balanço de bancos e seguradoras não separa a dívida de financiamento dos depósitos e captações',
    financeiraSemFcl:
      'sem dado nas demonstrações · o fluxo de caixa de bancos e seguradoras não separa o CAPEX, e o caixa operacional inclui depósitos e captações',
  },

  /**
   * Textos dos critérios inativos (D3, só v1) e não aplicáveis (D4; na v2 só quando religados por
   * params — naoSeAplica / margemSemReceitaComparavel), por motivo.
   */
  motivos: {
    sem_fonte_confiavel: {
      vac: 'sem dado nas demonstrações · a vacância informada à CVM pode diferir do relatório do gestor e fica fora do critério até a conferência dos fundos',
      inad: 'sem dado nas demonstrações · existe só nos relatórios gerenciais em PDF; entra quando a planilha curada estiver no ar',
      ltv: 'sem dado nas demonstrações · existe só nos relatórios gerenciais em PDF; entra quando a planilha curada estiver no ar',
      /** EUA (REIT): ocupação não existe nos dados estruturados (XBRL) da SEC */
      ocup: 'sem dado nas demonstrações · a ocupação não existe nos dados estruturados da SEC (está só no texto do 10-K); entra com a leitura do relatório',
    } satisfies Partial<Record<IdCriterio, string>>,
    instituicao_financeira:
      'não se aplica a instituições financeiras (bancos, seguradoras e holdings financeiras): o balanço não tem EBITDA nem dívida líquida',
    /** fundamentei-regras (v5): o 'ebitda' passa a ser o lucro operacional (série 'ebit') */
    instituicao_financeira_ebit:
      'não se aplica a instituições financeiras (bancos, seguradoras e holdings financeiras): o resultado não separa o lucro operacional (EBIT) do resultado financeiro',
    instituicao_financeira_mg:
      'não se aplica a esta instituição financeira: a receita nas demonstrações não é comparável ao lucro (holding de participações ou banco no balanço individual)',
    instituicao_financeira_fcl:
      'não se aplica a instituições financeiras: o caixa operacional de banco e seguradora inclui depósitos, captações e reservas técnicas',
  },

  /**
   * Chips da barra de filtros. v2.5: os pares de FII ficam ATIVOS (tijolo / papel, o rótulo de papel
   * em cinza); FII sem o dado da série fica "não atende · sem dado nas demonstrações" (§4.1).
   * seloSemDado/tooltipDesabilitado só valem para um critério desligado por params (v1).
   */
  chips: {
    seloSemDado: 'sem dado',
    tooltipDesabilitado:
      'Sem fonte confiável nas demonstrações: a vacância informada à CVM pode diferir do relatório do gestor, e a inadimplência existe só nos relatórios em PDF. O filtro fica desligado até a conferência.',
    tooltipParAlavancagem:
      'Em FII de tijolo: alavancagem do fundo (obrigações ÷ PL) até 20% do patrimônio. Em FII de papel: LTV médio dos CRIs até 60%.',
    /** A6 (fatia E): o mesmo par com a v4 vigente (alavancagem do tijolo sobre o ativo total) */
    tooltipParAlavancagemAtivo:
      'Em FII de tijolo: obrigações do fundo até 15% do ativo total. Em FII de papel: LTV médio dos CRIs até 60%.',
    tooltipParVacancia:
      'Em FII de tijolo: vacância física até 10%. Em FII de papel: inadimplência da carteira de crédito até 3%.',
    /** nome acessível do chip de par ('Vacância ≤ 10% (tijolo) ou Inadimplência ≤ 3% (papel)') */
    parAria: '{tijolo} (tijolo) ou {papel} (papel)',
    /** rótulo de papel do par, exibido em cinza depois do separador */
    parPapel: '{rotulo}',
    parSeparador: ' / ',
    /** FII sem a série no chip ligado: o fundo conta como não atende (tooltip da linha) */
    semDadoFii: 'sem dado nas demonstrações: o fundo conta como não atende neste filtro',
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
      stock: 'stocks',
      stock_financeira: 'instituições financeiras',
      reit: 'REITs',
    } satisfies Record<PerfilCriterio, string>,
  },

  /**
   * Fonte e aviso do card de critérios (§3.2). v2.5: a frase de fonte é montada pelas origens
   * (textoNotaFonte): 'Fonte: DFP/ITR (CVM).' ou 'Fonte: ‹provedor› · DFP/ITR (CVM).'
   */
  fonte: {
    acao: 'Fonte: DFP/ITR (CVM).',
    fii: 'Fonte: informes mensais e trimestrais dos FIIs (CVM).',
    aviso:
      'Dado contábil histórico, não avaliação do My Finance; rentabilidade passada não é garantia de resultados futuros. Para os demonstrativos completos, use o Raio-X.',
    /** rótulo da CVM por classe, dentro de textoNotaFonte */
    cvmAcao: 'DFP/ITR (CVM)',
    cvmFii: 'informes mensais e trimestrais dos FIIs (CVM)',
    /** EUA (stock/reit): rótulo da SEC dentro de textoNotaFonte */
    sec: 'relatório anual 10-K (SEC)',
    /** 'Fonte: {fontes}.' — {fontes} = rótulos unidos por separador, provedores antes da CVM */
    frase: 'Fonte: {fontes}.',
    separador: ' · ',
  },

  /**
   * Tooltips do Essencial e dos critérios de lucro. v2.5: 'Lucro descontado' / 'Margem descontada'
   * (§3.2, net_income_adjusted); sem o descontado na fonte, usa o lucro líquido e sinaliza.
   * lucroLiquido/margemLiquida = textos da v2.4 (D2), guardados para avaliações v1.
   */
  tooltips: {
    lucroLiquido:
      'A CVM não publica o lucro sem itens não recorrentes. A coluna usa o lucro líquido dos controladores.',
    margemLiquida:
      'Lucro líquido ÷ receita líquida. A margem sem itens não recorrentes depende de um lucro que a CVM não publica.',
    lucroDescontado: 'Lucro líquido descontado: o lucro sem itens não recorrentes.',
    margemDescontada: 'Lucro descontado ÷ receita líquida.',
    /** célula/critério que usou o lucro líquido no lugar do descontado (ⓘ) */
    fallbackLucro:
      'A fonte atual não entrega o lucro sem itens não recorrentes; o valor usa o lucro líquido dos controladores.',
    fallbackMargem:
      'A fonte atual não entrega o lucro sem itens não recorrentes; a margem usa o lucro líquido dos controladores ÷ receita líquida.',
  },

  /**
   * Observações de um resultado (ResultadoCriterio.obs): complemento do tooltip/definição do
   * critério (CelulaCriterios, ItemCriterio).
   */
  obs: {
    lucro_sem_descontado:
      'A fonte atual não entrega o lucro sem itens não recorrentes; o critério usa o lucro líquido dos controladores.',
    dados_incompletos:
      'A fonte não entregou um campo obrigatório de algum ano da janela; o critério fica "não atende · sem dado nas demonstrações".',
    // A6 (fatia 0; a fatia E grava a obs no 'alav' do fii_tijolo na v4)
    obrigacoes_ativo_revisao:
      'Obrigações acima de 50% do ativo total em algum ano da janela: valor em revisão, porque outros valores a pagar podem incluir itens que não são dívida.',
    // fundamentei-regras (F0; a F1 grava a obs no fco_acao/pay do REIT na v5)
    sbc_indisponivel:
      'Sem remuneração em ações informada no 10-K em algum ano da janela; o critério usa o caixa operacional sem ajuste.',
  } satisfies Record<ObsCriterio, string>,

  /**
   * A6 (fatia 0; a fatia E copia rótulo e definição para o 'alav' do fii_tijolo em criteriaParamsV4,
   * mesmo id): decisão 1 do Wellington, obrigações ÷ ativo ≤ 15%. O rótulo de hoje ('Alavancagem
   * ≤ 20% do PL', obrigações ÷ PL) continua nas versões v2/v3.
   */
  alavancagemAtivoV4: {
    rotulo: 'Alavancagem ≤ 15% do ativo',
    definicao:
      'Obrigações do fundo (aquisição de imóveis, securitização e outros valores a pagar) até 15% do ativo total em todos os anos da janela',
    observacao:
      'Fonte CVM informe mensal · outros valores a pagar podem incluir itens que não são dívida.',
  },

  /**
   * fundamentei-regras (F1): rótulos e definições em PORTUGUÊS dos critérios que mudam na
   * criteria_params v5 (copiados para o JSON da versão em criteriaParamsV5.ts; o id não muda).
   * 'ebitda' = nome interno do critério do lucro operacional (EBIT), mantido pelo ?c= e filtros.
   */
  criteriosV5: {
    regraCagr:
      'crescimento anual composto = (valor do último ano ÷ valor do ano anterior à janela) elevado a 1 ÷ anos, menos 1; com o ponto de partida negativo ou zero, atende se o último ano for positivo',
    rec: {
      rotulo: 'Receita com crescimento anual > 0',
      definicao: 'Receita líquida com crescimento anual composto maior que zero na janela',
    },
    luc: {
      rotulo: 'Lucro líquido com crescimento anual > 0',
      definicao:
        'Lucro líquido atribuído aos controladores com crescimento anual composto maior que zero na janela',
    },
    ebitda: {
      rotulo: 'Lucro operacional (EBIT) com crescimento anual > 0',
      definicao:
        'Lucro operacional (EBIT, antes do resultado financeiro e dos impostos) com crescimento anual composto maior que zero na janela',
    },
    fcl: {
      rotulo: 'FCL com crescimento anual > 0',
      definicao:
        'Fluxo de caixa livre (FCO − CAPEX) com crescimento anual composto maior que zero na janela',
    },
    recEua: {
      rotulo: 'Receita com crescimento anual > 0',
      definicao:
        'Receita (revenues do relatório anual 10-K) com crescimento anual composto maior que zero na janela',
    },
    recReit: {
      rotulo: 'Receita com crescimento anual > 0',
      definicao:
        'Receita (revenues ou receita de aluguéis do relatório anual 10-K) com crescimento anual composto maior que zero na janela',
    },
    lucEua: {
      rotulo: 'Lucro líquido com crescimento anual > 0',
      definicao:
        'Lucro líquido atribuído aos controladores (net income, 10-K) com crescimento anual composto maior que zero na janela',
    },
    ebitdaEua: {
      rotulo: 'Lucro operacional (EBIT) com crescimento anual > 0',
      definicao:
        'Lucro operacional do 10-K (sem ele, lucro antes do IR + juros; sem os dois, lucro líquido + IR + juros) com crescimento anual composto maior que zero na janela',
    },
    fclEua: {
      rotulo: 'FCL com crescimento anual > 0',
      definicao:
        'Fluxo de caixa livre (caixa operacional − CAPEX, 10-K) com crescimento anual composto maior que zero na janela',
    },
    fcoAcaoReit: {
      rotulo: 'Caixa operacional ajustado por ação crescente',
      definicao:
        '(Caixa operacional − remuneração em ações) ÷ média de ações diluídas (10-K) maior que o do ano anterior em todos os anos da janela; se algum ano da janela não informa a remuneração em ações, usa o caixa operacional sem ajuste',
    },
    payReit: {
      rotulo: 'Payout ≤ 90% do caixa operacional ajustado',
      definicao:
        'Dividendos pagos ÷ (caixa operacional − remuneração em ações) (10-K) até 90% em todos os anos da janela; caixa operacional ajustado ≤ 0 conta como fora do limite; se algum ano da janela não informa a remuneração em ações, usa o caixa operacional sem ajuste',
    },
  },

  /** Selo 'dados incompletos' (§6) no card de critérios e no Essencial. */
  incompleto: {
    selo: 'dados incompletos',
    tooltip:
      'A fonte não entregou um campo obrigatório de algum período. Os critérios que dependem dele ficam "não atende · sem dado nas demonstrações".',
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
   * Vocabulário de DESVIO: posição, alvo e desvio na MESMA base — v2.5: % da carteira TOTAL (spec
   * §3.2, caso 33). Nunca "faltam", "quanto falta", "aporte necessário" nem chamada à ação.
   */
  desvio: {
    posicao: 'posição atual {pct} da carteira',
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

/** Rótulo de uma fonte de provedor na frase de fonte (o registro da fatia A informa o nome). */
export type RotulosFonte = Readonly<Record<string, string>>;

/**
 * Frase de fonte montada pelas origens (card de critérios e Essencial, v2.5): provedores primeiro
 * (rótulo do registro; sem rótulo, o próprio id), a fonte REGULATÓRIA da classe por último (CVM no
 * Brasil; SEC nas classes EUA, 'Fonte: relatório anual 10-K (SEC).'). Sem nenhuma origem (v2.4/v1),
 * só a regulatória: 'Fonte: DFP/ITR (CVM).'
 */
export function textoNotaFonte(
  classe: ClasseQuadro,
  fontes: readonly IdFonte[] = [],
  rotulos: RotulosFonte = {},
): string {
  const F = TEXTOS_CRITERIOS.fonte;
  const base = ehClasseEua(classe)
    ? { id: 'sec', rotulo: F.sec }
    : { id: 'cvm', rotulo: classe === 'fii' ? F.cvmFii : F.cvmAcao };
  const provedores = [...new Set(fontes.filter((f) => f !== base.id))].map((f) => rotulos[f] ?? f);
  const temBase = fontes.length === 0 || fontes.includes(base.id);
  const partes = [...provedores, ...(temBase ? [base.rotulo] : [])];
  return formatarTexto(F.frase, { fontes: partes.join(F.separador) });
}

/** Frase de fonte FIXA do card por classe (sem origens): CVM no Brasil, SEC nas classes EUA. */
export function textoFonteClasse(classe: ClasseQuadro): string {
  return textoNotaFonte(classe);
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
  'fontes',
  'tijolo',
  'papel',
  'taxa',
] as const;
