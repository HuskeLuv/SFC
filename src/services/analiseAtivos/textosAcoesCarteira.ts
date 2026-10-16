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
 * v2.5 (fatia 0, CONGELADOS para a C): o alvo do "Planejar na carteira" passa a ser % da carteira
 * TOTAL, gravado em planning_asset_targets (spec §3.2/§5, caso 33) — sem mexer no Objetivo da
 * Carteira, que aparece só como linha informativa ('Objetivo na aba ‹Aba› da Carteira: X%', decisão
 * 1). O Registrar operação escolhe a seção sozinho e mostra 'Na Carteira: Ações · Value (dá para
 * mover depois)' (decisão 2). Chaves da v2.4 que a C deixa de usar ficam marcadas 'v2.4'.
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
    chipPlanejadoTitulo: 'Alvo planejado por você: {pct} da carteira',
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
  planejar: {
    tituloNovo: 'Planejar na carteira · {ticker}',
    tituloAjustar: 'Ajustar plano · {ticker}',
    subtitulo:
      'Defina o peso que {ticker} deve ter na sua carteira. O alvo é seu: o My Finance só mostra a diferença entre a posição atual e ele.',
    campo: 'Peso-alvo na carteira (%)',
    placeholder: 'ex.: 5',
    classe: 'Classe no Planejamento',
    classeValor: '{aba} · {pct} da carteira (alvo da classe: {alvo})',
    classeSemAlvo: '{aba} · {pct} da carteira (sem alvo da classe)',
    posicao: 'Posição atual',
    posicaoValor: '{qtd} {un} · {pct} da carteira · {valor}',
    semPosicao: 'não está na carteira',
    resumoVazio: 'Informe o peso-alvo para ver a diferença em relação à sua posição atual.',
    valorAlvo: 'Valor equivalente ao alvo',
    qtdAlvo: '≈ {un} no alvo',
    desvio: 'Posição atual vs. alvo',
    desvioValor: '{pp} ({valor} · {qtd} {un})',
    desvioSemQtd: '{pp} ({valor})',
    /** v2.4 (alvo em % da aba); sem uso com a base total */
    equivalente: '≈ {pct} da carteira hoje (informativo, não é gravado)',
    nota: 'Fica salvo no seu Planejamento como o alvo de {ticker} em % da carteira total. O Objetivo da aba {aba} na Carteira não muda.',
    /** linha informativa quando a posição tem Objetivo > 0 na aba (decisão 1) */
    objetivoAba: 'Objetivo na aba {aba} da Carteira: {pct}',
    remover: 'Remover do plano',
    salvar: 'Salvar no Planejamento',
    erroFaixa: 'Informe um peso-alvo entre 0 e 100%.',
    erroBase: 'Não foi possível carregar a aba {aba} da sua Carteira agora.',
    salvo: '{ticker} planejado: alvo de {pct} da carteira no seu Planejamento.',
    removido: '{ticker} saiu dos alvos do Planejamento.',
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
    alvoValor: '{pct} da carteira',
    alvoDesvio: 'posição {pos} · desvio {pp}',
    semAlvo: 'sem alvo definido',
    ultimas: 'Últimas operações',
    colData: 'Data',
    colOperacao: 'Operação',
    colQtd: 'Qtd.',
    colPreco: 'Preço',
    colTotal: 'Total',
    semOperacoes: 'Nenhuma operação registrada.',
    vazio: 'Você ainda não tem {ticker} na carteira.',
    vazioAlvo: 'Há um alvo planejado de {pct} da carteira no seu Planejamento.',
    objetivoAba: 'Objetivo na aba {aba} da Carteira: {pct}',
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
    alvoPlanejado: 'alvo planejado por você: {pct}',
    posicaoAtual: 'posição atual {pct}',
    /** linha informativa quando a posição tem Objetivo > 0 na aba (decisão 1) */
    objetivoAba: 'Objetivo na aba {aba} da Carteira: {pct}',
    desvio: 'desvio {pp} ({valor})',
    equivalente: 'equivale hoje a ≈ {pct} da carteira (informativo; muda com o mercado)',
    classe: 'Classe {aba} no Planejamento: {pct} da carteira',
    classeAlvo: '(alvo {alvo})',
    classeSemAlvo: '(sem alvo da classe)',
    barraAria: 'Posição atual {pos} da carteira, {alvo}',
    barraAlvoAria: 'alvo planejado {pct} da carteira',
    barraSemAlvoAria: 'sem alvo planejado',
    quantidade: 'Quantidade',
    valor: 'Valor',
    pctCarteira: '% da carteira',
    precoMedio: 'Preço médio',
    rentabilidade: 'Rentabilidade',
    rentabilidadeNota: 'com os proventos recebidos, igual à Carteira',
    naAba: 'Na aba {aba}',
    notaAba:
      'Está na aba {aba} da sua Carteira. O alvo planejado é em % da carteira total e não muda se você mover o ativo de aba.',
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
