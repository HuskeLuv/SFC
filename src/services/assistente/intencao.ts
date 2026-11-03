/**
 * Classificação de intenção por palavras-chave — SÓ para métricas (spec v1.1 §7:
 * volume por intenção, intenções não reconhecidas, demanda reprimida CVM).
 * Não roteia nada: toda mensagem vai para o modelo. Quando houver uso real
 * medido, a Camada 1 (regras) nasce desta lista.
 */

export type Intencao =
  | 'gasto_categoria'
  | 'receitas'
  | 'sobra_mes'
  | 'maior_despesa'
  | 'orcamento'
  | 'carteira'
  | 'rentabilidade'
  | 'proventos'
  | 'vencimentos'
  | 'dividas'
  | 'saude_financeira'
  | 'objetivos'
  | 'lancamento'
  | 'ajuste_fluxo'
  | 'conceito'
  | 'navegacao'
  | 'recomendacao_investimento'
  | 'nao_suportado'
  | 'outro';

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const REGRAS: Array<{ intencao: Intencao; re: RegExp }> = [
  // Demanda reprimida (CVM) e não suportado vêm primeiro: são as métricas mais importantes.
  {
    intencao: 'recomendacao_investimento',
    re: /(onde|em que|qual|quais).{0,30}(investir|comprar|aplicar)|(vai|vao) subir|melhor (acao|fundo|ativo|investimento)|devo (comprar|vender)|recomenda/,
  },
  {
    intencao: 'nao_suportado',
    re: /\bsaldo\b.{0,20}(conta|banco|nubank|inter|caixa|itau|bradesco|santander)|\bfatura\b|transfer(i|encia)|efetiv|extrato|cartao de credito/,
  },
  {
    // Agenda (16/09/2026): parcelas, vencimentos de RF, proventos e IR têm data no app.
    intencao: 'vencimentos',
    re: /\bvence(m|r|ndo)?\b|vencimento|agenda|proxim(a|o)s? (parcela|pagamento|vencimento)/,
  },
  {
    // Comentário, cor ou orçado no fluxo (ticket 86e2wwqxm): "comenta que foi DET", "pinta de
    // vermelho", "marca como pago", "lança um orçamento de 200 em cinema".
    intencao: 'ajuste_fluxo',
    re: /comenta|\bcor\b|pint(a|e|ar|ou)\b|colori|marc\w* como (pago|recebido)|(defin|coloc|lanc|poe|bota|muda|ajust)\w*.{0,30}\borcamento|\borcamento de .{0,30}\d/,
  },
  {
    // Verbo de registro + um número: "gastei 45,90", "registra 1.000 em ITSA4".
    // "Quanto gastei este mês?" (sem número) é consulta, não lançamento.
    // Recorrente: número + "todo mês"/"por mês"/"mensal" ("meu aluguel é 2.500 por mês").
    intencao: 'lancamento',
    re: /\b(registr|lanc|anot|adicion|coloc|inclu|gastei|paguei|recebi|comprei|ganhei)\w*\b.{0,40}(\d|r\$)|(\d|r\$).{0,30}\b(todo mes|todos os meses|por mes|ao mes|mensal(mente|idade)?|fixo)\b/,
  },
  { intencao: 'conceito', re: /o que (e|sao|significa)|como funciona|diferenca entre|explica/ },
  { intencao: 'proventos', re: /provento|dividendo|jcp|juros sobre capital|data.?com/ },
  { intencao: 'rentabilidade', re: /rentab|rendeu|render|retorno|twr|mwr|\bcdi\b/ },
  {
    intencao: 'carteira',
    re: /carteira|investid|posic|ativo|acao|acoes|\bfii|renda fixa|tesouro|cripto|patrimonio/,
  },
  { intencao: 'dividas', re: /divida|financiamento|emprestimo|parcela|consignado|quitar/ },
  {
    intencao: 'saude_financeira',
    re: /saude financeira|reserva de emergencia|taxa de poupanca|independencia|score/,
  },
  { intencao: 'objetivos', re: /objetivo|sonho|meta\b|aposentadoria/ },
  { intencao: 'orcamento', re: /orcamento|estour|limite|posso gastar|ainda posso/ },
  { intencao: 'maior_despesa', re: /maior (gasto|despesa)|mais gast|onde (eu )?gasto/ },
  { intencao: 'sobra_mes', re: /sobr(ou|a)|resultado do mes|saldo do mes|fech(ei|ar) o mes/ },
  { intencao: 'receitas', re: /receit|entrada|ganh(ei|o)|salario|quanto recebi/ },
  { intencao: 'gasto_categoria', re: /gast|despes|paguei|custo/ },
  {
    intencao: 'navegacao',
    re: /onde (vejo|encontro|fica|esta)|como (faco|importo|cadastro|registro|vejo)|me leva|abrir/,
  },
];

export function classificarIntencao(texto: string): Intencao {
  const t = normalizar(texto);
  for (const { intencao, re } of REGRAS) {
    if (re.test(t)) return intencao;
  }
  return 'outro';
}

/** Intenções cujo texto (truncado) vale guardar para a fila de revisão. */
export function guardarTextoDaIntencao(intencao: Intencao): boolean {
  return (
    intencao === 'outro' || intencao === 'nao_suportado' || intencao === 'recomendacao_investimento'
  );
}
