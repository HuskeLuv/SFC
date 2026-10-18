/**
 * Textos da linha de ações do cabeçalho do ativo, dos 4 modais da Carteira (Comparar, Planejar na
 * carteira, Ver na Carteira, Registrar operação) e do card "Na sua carteira" (fatia C1, v2.4).
 * BlocoNaCarteira e BarraPesoAlvo importam daqui (o quantoFalta/faltam do textosTela sai; a F
 * apaga de lá).
 *
 * Linguagem (spec §9, parecer de compliance de 10/10): posição × alvo sempre em vocabulário de
 * DESVIO, na base da aba (rec. 1) — nunca "faltam", "quanto falta", "compre", "oportunidade" nem
 * chamada à ação. O vocabulário compartilhado de desvio está em TEXTOS_CRITERIOS.desvio.
 *
 * TEXTOS_OPERACAO fica SEPARADO: os rótulos de tipo de operação ('Compra'/'Venda') são varridos pela
 * lista própria de linguagemV2 (encontrarProibidasOperacao); TODO o resto passa pela lista padrão —
 * por isso nenhum outro texto daqui usa "compra"/"venda" (ex.: "da última aquisição").
 * Placeholders {nome} preenchidos com formatarTexto.
 *
 * v2.5: o Registrar operação escolhe a seção sozinho e mostra 'Na Carteira: Ações · Value (dá para
 * mover depois)' (decisão 2). Chaves da v2.4 que a C deixa de usar ficam marcadas 'v2.4'.
 * 17/10/2026 (ticket do Pedro): o alvo do "Planejar na carteira" deixou de ser % da carteira TOTAL
 * em planning_asset_targets (que nada fora da Análise lia) e passou a ser o OBJETIVO DA CARTEIRA,
 * % dentro da aba — os textos de alvo/desvio falam "da aba" e o "≈ X% da carteira total" é só
 * informativo.
 */
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

export const TEXTOS_OPERACAO = {
  compra: 'Compra',
  venda: 'Venda',
} as const;

/** Unidades e nomes por classe (Ações/FII's = nome da aba na Carteira). */
export const CLASSE_CARTEIRA: Record<
  ClasseQuadro,
  { aba: string; plural: string; un: string; unSingular: string }
> = {
  acao: { aba: 'Ações', plural: 'ações', un: 'ações', unSingular: 'ação' },
  fii: { aba: "FII's", plural: 'FIIs', un: 'cotas', unSingular: 'cota' },
  // EUA (fatia 0): nomes das abas da Carteira (carteiraTabsConfig: 'Stocks' e "REIT's")
  stock: { aba: 'Stocks', plural: 'stocks', un: 'ações', unSingular: 'ação' },
  reit: { aba: "REIT's", plural: 'REITs', un: 'ações', unSingular: 'ação' },
};

/** Rótulos das seções da Carteira (estratégia de ação; tipo de FII). */
export const ROTULOS_SECAO: Record<string, string> = {
  value: 'Value',
  growth: 'Growth',
  risk: 'Risk',
  tijolo: 'Tijolo',
  tvm: 'Papel (TVM)',
  fofi: 'Fundo de fundos',
  infra: 'Infraestrutura',
};

export const TEXTOS_ACOES_CARTEIRA = {
  barra: {
    rotulo: 'Ações da sua carteira para {ticker}',
    comparar: 'Comparar',
    compararAria: 'Comparar {ticker} com outros ativos',
    planejar: 'Planejar na carteira',
    ajustarPlano: 'Ajustar plano',
    verNaCarteira: 'Ver na Carteira',
    registrar: 'Registrar operação',
    chipNaCarteira: 'Na carteira',
    chipPlanejado: 'Planejado',
    chipNaCarteiraTitulo: 'Você tem {qtd} {un} na carteira',
    chipPlanejadoTitulo: 'Objetivo na Carteira: {pct} em {aba}',
    chipPlanejadoSemObjetivoTitulo: 'Planejado na aba {aba} da Carteira',
  },
  consultor: {
    aviso: 'Você está alterando a carteira de {cliente}.',
    clientePadrao: 'seu cliente',
  },
  modal: {
    fechar: 'Fechar',
    cancelar: 'Cancelar',
    tentarDeNovo: 'Tentar de novo',
    carregando: 'Carregando…',
    salvando: 'Salvando…',
  },
  comparar: {
    titulo: 'Comparar {ticker} com até 3 {plural}',
    subtituloAcao: 'Pares do mesmo setor aparecem primeiro; depois, os demais em ordem alfabética.',
    subtituloFii:
      'Mostrando só FIIs de {tipo} — comparar tijolo com papel usa critérios diferentes.',
    tipoTijolo: 'tijolo',
    tipoPapel: 'papel',
    selecionados: 'Selecionados',
    maisAtivo: '+ ativo',
    tirar: 'Tirar {ticker}',
    busca: 'Buscar por ticker ou nome',
    sugestoes: 'Sugestões',
    mesmoSetor: 'mesmo setor',
    criterios: '{n} de {de} crit.',
    criteriosAria: '{n} de {de} critérios em {janela} anos',
    semCriterios: 'sem avaliação',
    vazio: 'Nenhum ativo encontrado.',
    erro: 'Não foi possível carregar as sugestões.',
    escolhaUm: 'Escolha pelo menos 1 ativo',
    nDe4: '{n} de 4 selecionados',
    abrir: 'Abrir comparador',
    rotuloMetricaAcao: 'P/L',
    rotuloMetricaFii: 'P/VP',
  },
  /**
   * 17/10/2026 (ticket do Pedro): o Planejar grava o OBJETIVO DA CARTEIRA (% dentro da aba), o mesmo
   * da coluna Objetivo — com posição, Portfolio.objetivo; sem posição, a linha planejada da aba.
   */
  planejar: {
    tituloNovo: 'Planejar na carteira · {ticker}',
    tituloAjustar: 'Ajustar plano · {ticker}',
    subtitulo:
      'Defina o peso que {ticker} deve ter dentro da aba {aba}: é o mesmo Objetivo da sua Carteira. O alvo é seu: o My Finance só mostra a diferença entre a posição atual e ele.',
    campo: 'Peso-alvo dentro de {aba} (%)',
    placeholder: 'ex.: 10',
    secao: 'Seção na Carteira',
    /** sem posição e sem plano, quando a Análise não sabe a seção: o usuário escolhe */
    secaoEscolha: 'Seção na Carteira (escolha)',
    classe: 'Classe no Planejamento',
    classeValor: '{aba} · {pct} da carteira (alvo da classe: {alvo})',
    classeSemAlvo: '{aba} · {pct} da carteira (sem alvo da classe)',
    posicao: 'Posição atual',
    posicaoValor: '{qtd} {un} · {pct} da aba · {valor}',
    semPosicao: 'não está na carteira',
    /** linha informativa: objetivo × peso atual da aba na carteira */
    equivalenteTotal: '≈ {pct} da carteira total (a aba {aba} é {peso} da carteira hoje)',
    equivalenteAbaVazia:
      'A aba {aba} ainda não tem posições: o peso na carteira total aparece quando houver.',
    equivalenteCarteiraVazia:
      'Sua carteira ainda não tem posições: o peso na carteira total aparece quando houver.',
    resumoVazio: 'Informe o peso-alvo para ver a diferença em relação à sua posição atual.',
    /** peso digitado, mas a carteira está vazia (sem total, não há valor equivalente) */
    resumoCarteiraVazia:
      'Sua carteira ainda não tem posições: o valor equivalente ao alvo aparece quando houver.',
    /** peso digitado, carteira com posições, mas a aba vazia (sem base para o valor equivalente) */
    resumoAbaVazia:
      'A aba {aba} ainda não tem posições: o valor equivalente ao alvo aparece quando houver.',
    valorAlvo: 'Valor equivalente ao alvo',
    qtdAlvo: '≈ {un} no alvo',
    desvio: 'Posição atual vs. alvo',
    desvioValor: '{pp} ({valor} · {qtd} {un})',
    desvioSemQtd: '{pp} ({valor})',
    nota: 'Fica salvo como o Objetivo de {ticker} na aba {aba} da sua Carteira, o mesmo que você edita lá.',
    notaPlanejado:
      'Sem posição, {ticker} aparece na aba {aba} da Carteira como ativo planejado, na seção {secao}.',
    remover: 'Remover do plano',
    salvar: 'Salvar na Carteira',
    erroFaixa: 'Informe um peso-alvo entre 0 e 100%.',
    erroBase: 'Não foi possível carregar a aba {aba} da sua Carteira agora.',
    salvo: '{ticker} planejado: objetivo de {pct} em {aba} na sua Carteira.',
    removidoPosicao: '{ticker} saiu do plano: o objetivo em {aba} na Carteira voltou a 0%.',
    removidoPlanejado: '{ticker} saiu do plano e da aba {aba} da Carteira.',
  },
  ver: {
    titulo: '{ticker} na sua Carteira',
    subtitulo:
      'Resumo da posição registrada no My Finance (operações registradas e conexões Open Finance). A tela completa tem histórico, proventos e custódia.',
    posicao: 'Posição',
    pctCarteira: '{pct} da carteira',
    valorAtual: 'Valor atual',
    aCotacao: 'a {preco}',
    precoMedio: 'Preço médio',
    custo: 'custo {valor}',
    resultado: 'Resultado',
    resultadoNota: 'com proventos, igual à Carteira',
    proventos: 'Proventos recebidos',
    proventosNota: 'desde a 1ª operação',
    alvo: 'Alvo planejado',
    alvoValor: '{pct} em {aba}',
    alvoDesvio: 'posição {pos} da aba · desvio {pp}',
    semAlvo: 'sem alvo definido',
    ultimas: 'Últimas operações',
    colData: 'Data',
    colOperacao: 'Operação',
    colQtd: 'Qtd.',
    colPreco: 'Preço',
    colTotal: 'Total',
    semOperacoes: 'Nenhuma operação registrada.',
    vazio: 'Você ainda não tem {ticker} na carteira.',
    vazioAlvo: 'Está planejado na aba {aba} da sua Carteira, com objetivo de {pct}.',
    rodape: 'Dados da sua carteira',
    abrirCompleta: 'Abrir Carteira completa',
    erro: 'Não foi possível carregar sua posição agora.',
  },
  registrar: {
    titulo: 'Registrar operação · {ticker}',
    subtitulo:
      'Lança a operação na sua Carteira e atualiza a posição e o peso no Planejamento. Proventos e custódia continuam na Carteira.',
    operacao: 'Operação',
    semPosicaoParaSaida: 'Disponível quando houver posição.',
    quantidade: 'Quantidade ({un})',
    preco: 'Preço por {unSingular}',
    data: 'Data',
    /** v2.4: campo Seção (a C tira o campo; a seção é automática) */
    secao: 'Seção na Carteira',
    secaoDoPlano: 'Seção na Carteira (do seu plano)',
    secaoCvm: 'Seção na Carteira (tipo na CVM)',
    secaoPosicao: '{rotulo}: {valor} (da sua posição)',
    rotuloEstrategia: 'Estratégia',
    rotuloTipoFii: 'Tipo de FII',
    escolha: 'Escolha…',
    instituicao: 'Instituição',
    instituicaoPlaceholder: 'Digite o nome da instituição',
    instituicaoUltima: '{nome} (da última aquisição)',
    instituicaoUltimaSemNome: 'a mesma da última aquisição',
    total: 'Total',
    novaPosicao: 'Nova posição',
    novoPm: 'Novo preço médio',
    pmMantido: 'Preço médio',
    pmMantidoNota: 'não muda nesta operação',
    /** v2.5: linha discreta do resumo com a seção automática (decisão 2) */
    secaoAutomatica: 'Na Carteira: {aba} · {secao} (dá para mover depois)',
    formCompletoAntes: 'Taxas, observações e instituições ainda não cadastradas:',
    formCompleto: 'abrir o formulário completo',
    hintPosicao: 'Posição atual: {qtd} {un} · PM {pm}',
    hintSemPosicao: 'Sem posição atual',
    registrar: 'Registrar',
    registrando: 'Registrando…',
    semAtivoCatalogo:
      'Este ativo ainda não está no catálogo da Carteira; use o formulário completo.',
    erros: {
      quantidade_invalida: 'Informe uma quantidade inteira maior que zero.',
      acima_da_posicao: 'Você tem {qtd} {un}; a operação não pode passar disso.',
      data_futura: 'Informe uma data que não seja futura.',
      /** v2.4: a seção automática da v2.5 nunca fica vazia */
      sem_secao: 'Escolha a seção da Carteira em que o ativo vai entrar.',
      preco_invalido: 'Informe um preço maior que zero.',
      sem_instituicao: 'Escolha a instituição.',
    },
    erroServidor: 'Não foi possível registrar: {erro}',
    registrada:
      'Operação registrada: {qtd} {un} de {ticker} a {preco} · posição {pos}. A Carteira e o Planejamento foram atualizados.',
    verNaCarteira: 'Ver na Carteira',
  },
  naCarteira: {
    titulo: 'Na sua carteira',
    voceNaoTem: 'Você não tem {ticker}',
    semAlvo: 'sem alvo planejado',
    planejar: 'planejar na carteira',
    ajustarPlano: 'ajustar plano',
    alvoPlanejado: 'alvo planejado por você: {pct} em {aba}',
    posicaoAtual: 'posição atual {pct} da aba',
    desvio: 'desvio {pp} ({valor})',
    equivalente: '≈ {pct} da carteira total (informativo; muda com o mercado)',
    classe: 'Classe {aba} no Planejamento: {pct} da carteira',
    classeAlvo: '(alvo {alvo})',
    classeSemAlvo: '(sem alvo da classe)',
    barraAria: 'Posição atual {pos} da aba, {alvo}',
    barraAlvoAria: 'alvo planejado {pct} da aba',
    barraSemAlvoAria: 'sem alvo planejado',
    quantidade: 'Quantidade',
    valor: 'Valor',
    pctCarteira: '% da carteira',
    precoMedio: 'Preço médio',
    rentabilidade: 'Rentabilidade',
    rentabilidadeNota: 'com os proventos recebidos, igual à Carteira',
    naAba: 'Na aba {aba}',
    notaAba:
      'Está na aba {aba} da sua Carteira. O alvo planejado é o Objetivo dessa aba (% dentro dela), o mesmo da coluna Objetivo da Carteira.',
    cotacaoDiferente:
      'Valor e % calculados pela Carteira com a cotação de {valor}; o cabeçalho mostra o fechamento de {data}.',
    abaSemDetalhe: 'O ativo está na aba {aba} da sua Carteira. Os números ficam lá.',
    abrirNaCarteira: 'Abrir na Carteira',
    verNaCarteira: 'Ver na Carteira',
    erro: 'Não foi possível carregar sua posição agora.',
    tentarNovamente: 'Tentar de novo',
  },
  /** Barra posição × alvo (BarraPesoAlvo). */
  barraPeso: {
    aria: '{rotulo}: {valor}, {referencia}',
  },
} as const;
