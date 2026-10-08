/**
 * Textos do Valuation · Meus cenários (Bloco D, fatia B). Esqueleto da fatia 0 com TODOS os textos
 * da spec e do protótipo final; a fatia B pode ACRESCENTAR chaves (sem renomear as existentes).
 * Passa pela varredura do Bloco D (textosBlocoD.test.ts). Vai ao jurídico antes de ligar
 * ANALISE_ATIVOS_CENARIOS_HABILITADO (decisão 15).
 *
 * O RODAPÉ dos cenários é o texto LITERAL TEXTOS_ANALISE.rodapeValuation (decisão 14): exportado
 * como RODAPE_CENARIOS, FORA do objeto varrido (cita "preço justo" para negá-lo; é exceção do
 * linter e fixado por textos.test.ts/casos46.test.ts). Não reescrever.
 *
 * Decisões refletidas: D6 (dado em conferência = selo: "usa {campo} em conferência"), D7
 * (consultor: calculadora sem salvar), D8 (Meta de renda → objetivo no Planejamento, aviso do
 * Fluxo de Caixa, botão some quando a posição cobre), D13 ("Restaurar valores do ativo" SEM
 * confirmação + "Desfazer" por 5 s; métodos em cartões no celular).
 */
import { TEXTOS_ANALISE } from '@/services/analiseAtivos/textos';

/** Rodapé fixo e literal dos cenários (decisão 14). */
export const RODAPE_CENARIOS: string = TEXTOS_ANALISE.rodapeValuation;

export const TEXTOS_CENARIOS = {
  seletor: {
    rotuloGrupo: 'Tipo de valuation',
    multiplos: 'Múltiplos',
    cenarios: 'Meus cenários',
  },
  titulo: 'Valuation',
  sub: {
    multiplos: 'onde cada múltiplo está em relação ao próprio histórico',
    cenarios: 'contas com as suas premissas',
  },
  secoes: {
    dadosAtivo: 'Dados do ativo',
    premissas: 'Suas premissas',
    resultados: 'Resultados',
  },
  campos: {
    cotacao: { rotulo: 'Cotação', origem: 'último pregão: {data} · fonte B3' },
    lpa: { rotulo: 'LPA 12m', origem: 'do ativo: lucro por ação em 12 meses' },
    vpa: { rotulo: 'VPA', origem: 'do ativo: patrimônio por ação ({data})' },
    dpa: { rotulo: 'DPA 12m', origem: 'do ativo: proventos por ação em 12 meses' },
    yieldAcao: { rotulo: 'Yield desejado (Bazin)', origem: 'padrão: {valor}%' },
    plAlvo: {
      rotulo: 'P/L alvo',
      origem: 'padrão: média de 10 anos ({valor})',
      historicoCurto: 'histórico com menos de 5 anos: informe o P/L alvo',
    },
    gPct: { rotulo: 'Crescimento g (Gordon)', origem: 'padrão: {valor}% ao ano' },
    kPct: { rotulo: 'Retorno exigido k (Gordon)', origem: 'padrão: {valor}% ao ano' },
    rend12m: {
      rotulo: 'Rendimento 12m por cota',
      origem: 'do fundo: data-com nos últimos 12 meses',
    },
    vpCota: { rotulo: 'VP por cota', origem: 'do fundo: informe de {data}' },
    yieldFii: { rotulo: 'Yield desejado', origem: 'padrão: {valor}% para FIIs' },
    pvpAlvo: { rotulo: 'P/VP alvo', origem: 'padrão: {valor}' },
    rendaMensal: { rotulo: 'Renda mensal desejada', origem: 'padrão: R$ {valor} por mês' },
    somenteLeitura: 'só leitura',
    editado: 'editado',
    doAtivo: 'do ativo: {valor}',
    voltarAoAtivo: 'voltar ao valor do ativo',
    valorMudou: 'O valor do ativo mudou desde que você salvou: agora é {valor}.',
    usarValorAtual: 'Usar o valor atual',
    emConferencia: 'em conferência',
  },
  validacao: {
    numero: 'Digite um número (vírgula ou ponto).',
    faixa: 'Use um valor entre {valor} e {max}.',
    margemPasso: 'Use a margem em passos de 5%.',
    camposMarcados: 'Confira os campos marcados.',
  },
  margem: {
    rotulo: 'Margem que você exige',
    valor: '{valor}%',
    ajuda: 'O resultado com margem é o resultado menos esse percentual.',
    marcas: { min: '0%', meio: '25%', max: '50%' },
  },
  metodos: {
    bazin: 'Preço pelo dividendo (Bazin)',
    graham: 'Fórmula de Graham',
    multiplo: 'Múltiplo alvo',
    gordon: 'Dividendos crescentes (Gordon)',
    rendaDesejada: 'Preço pela renda desejada',
    pvpAlvo: 'P/VP alvo × VP/cota',
  },
  premissasTexto: {
    bazin: 'DPA {valor} ÷ yield {premissa}%',
    graham: '√(22,5 × LPA {valor} × VPA {premissa})',
    multiplo: 'P/L {premissa} × LPA {valor}',
    gordon: 'DPA {valor} · g {premissa}% · k {n}%',
    rendaDesejada: 'rendimento {valor} ÷ yield {premissa}%',
    pvpAlvo: 'P/VP {premissa} × VP/cota {valor}',
  },
  colunas: {
    metodo: 'Método',
    premissas: 'Suas premissas',
    resultado: 'Resultado',
    vsCotacao: 'vs. cotação',
    comMargem: 'Com sua margem',
  },
  motivos: {
    dpaZero: 'DPA zero: sem proventos nos últimos 12 meses',
    lpaNaoPositivo: 'LPA ≤ 0: a fórmula não se aplica',
    vpaNaoPositivo: 'VPA ≤ 0',
    plVazio: 'informe o P/L alvo',
    kMenorOuIgualG: 'k ≤ g: o modelo não tem resultado',
    premissaForaDoLimite: '{campo} fora do limite',
    rendimentoNaoPositivo: 'rendimento 12m ≤ 0',
    vpConferencia: 'VP/cota em conferência',
    faltaDado: 'falta {campo}',
    usaConferencia: 'usa {campo} em conferência',
    semCotacao: 'sem cotação',
  },
  resultados: {
    rotuloRegiao: 'Resultados dos métodos',
    caption: 'Resultados dos métodos com as suas premissas; cotação {valor}; margem {n}%',
    rotuloListaCelular: 'Métodos: resultado, cotação e margem',
    cotacaoHoje: 'Cotação de hoje',
    anuncio: '{metodo} com sua margem: {valor}',
  },
  barras: {
    titulo: 'Resultados lado a lado',
    legendaResultado: 'Resultado',
    legendaMargem: 'Com sua margem',
    legendaCotacao: 'Cotação',
    semResultado: 'sem resultado',
    nenhumResultado: 'Nenhum método tem resultado com estes valores. Confira os campos marcados.',
    nenhumResultadoAcaoLpaNegativo:
      'Graham e Múltiplo alvo pedem LPA maior que zero; Bazin e Gordon pedem DPA maior que zero.',
    alternativaTexto: 'A tabela de resultados traz os mesmos números.',
  },
  suaPosicao: {
    titulo: 'Sua posição',
    tituloCliente: 'Posição do cliente',
    acao: '{n} ações · preço médio {valor}',
    fii: '{n} cotas · preço médio {valor}',
    plSobreCusto: 'P/L sobre custo',
    yieldSobreCusto: 'Yield sobre custo',
    pvpSobreCusto: 'P/VP sobre custo',
    rendimentoSobreCusto: 'Rendimento sobre custo',
    semPosicao: 'Este ativo não está na sua carteira.',
    semPosicaoCliente: 'Este ativo não está na carteira do cliente.',
  },
  metaRenda: {
    titulo: 'Meta de renda',
    explicacao: 'Quantas cotas, ao rendimento dos últimos 12 meses, pagam a renda mensal desejada.',
    cotasNecessarias: 'Cotas necessárias',
    custoHoje: 'Custo à cotação de hoje',
    faltam: 'Faltam',
    cotas: '{cotas} cotas',
    voceTem: 'você tem {n}',
    clienteTem: 'o cliente tem {n}',
    semFundo: 'você não tem este fundo na carteira',
    semFundoCliente: 'o cliente não tem este fundo na carteira',
    coberta: 'A sua posição já cobre a meta: não há objetivo a criar.',
    cobertaCliente: 'A posição do cliente já cobre a meta: não há objetivo a criar.',
    semRendimento: 'Sem rendimento nos últimos 12 meses: a meta não tem resultado.',
    botao: 'Criar objetivo no Planejamento',
    botaoCliente: 'Criar objetivo no Planejamento do cliente',
  },
  objetivo: {
    titulo: 'Criar objetivo no Planejamento',
    tituloCliente: 'Criar objetivo no Planejamento do cliente',
    nomePadrao: 'Renda de R$ {renda}/mês com {ticker}',
    campos: {
      nome: 'Nome',
      valor: 'Valor do objetivo',
      valorAjuda: '{cotas} cotas × cotação de hoje',
      disponivel: 'Já disponível',
      disponivelAjuda: 'sua posição × cotação de hoje',
      prazo: 'Prazo (meses)',
      prioridade: 'Prioridade',
      status: 'Situação',
    },
    avisoFluxo: 'O objetivo também aparece no seu Fluxo de Caixa.',
    avisoFluxoCliente: 'O objetivo será criado no Planejamento e no Fluxo de Caixa do cliente.',
    avisoCotacao:
      'Ele usa a cotação de hoje e não se atualiza sozinho; dá para editar no Planejamento.',
    cancelar: 'Cancelar',
    confirmar: 'Criar objetivo',
    criando: 'Criando…',
    toast: 'Objetivo criado no Planejamento.',
    toastCliente: 'Objetivo criado no Planejamento do cliente.',
    abrirPlanejamento: 'Abrir o Planejamento',
    erro: 'Não foi possível criar o objetivo. Tente de novo.',
  },
  salvamento: {
    valoresDoAtivo: 'Valores do ativo e premissas padrão',
    naoSalvo: 'Alterações não salvas',
    salvando: 'Salvando…',
    salvoEm: 'Salvo em {data} às {hora}',
    erro: 'Não foi possível salvar. O que você digitou continua aqui.',
    tentarNovamente: 'Tentar de novo',
    salvar: 'Salvar cenário',
    restaurar: 'Restaurar valores do ativo',
    restaurado: 'Valores do ativo restaurados. O cenário salvo foi apagado.',
    desfazer: 'Desfazer',
    fechar: 'Fechar',
    limiteCenarios:
      'Você chegou ao limite de {max} cenários salvos. Apague o de outro ativo para salvar este.',
  },
  consultor:
    'Os cenários salvos são pessoais de cada usuário. Você pode fazer as contas, mas não salvar.',
  comoCalculado: {
    titulo: 'Como é calculado',
    bazin:
      'Preço pelo dividendo (Bazin): DPA ÷ yield desejado. Os 6% eram a referência de juros da época.',
    graham:
      'Fórmula de Graham: √(22,5 × LPA × VPA). O 22,5 vem de P/L 15 × P/VP 1,5, os limites que Benjamin Graham usava.',
    multiplo: 'Múltiplo alvo: P/L alvo × LPA. O padrão é a média do P/L nos últimos 10 anos.',
    gordon: 'Dividendos crescentes (Gordon, 1959): DPA × (1 + g) ÷ (k − g). Só existe com k > g.',
    rendaDesejada: 'Preço pela renda desejada: rendimento 12m por cota ÷ yield desejado.',
    pvpAlvo: 'P/VP alvo × VP/cota: o valor patrimonial da cota multiplicado pelo P/VP escolhido.',
    margem: 'Com sua margem: resultado × (1 − margem).',
    vsCotacao: 'vs. cotação: diferença entre o resultado e a cotação de hoje, em %.',
    aviso: 'Nenhum método é previsão de preço.',
  },
  estados: {
    carregando: 'Carregando: Meus cenários',
    erro: 'Não foi possível carregar este bloco.',
    tentarNovamente: 'Tentar de novo',
  },
} as const;
