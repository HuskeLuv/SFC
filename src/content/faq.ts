/**
 * Perguntas Frequentes da página Ajuda (/ajuda). Conteúdo estático: para incluir uma pergunta,
 * acrescente um item em `FAQ` (o `id` vira a âncora `/ajuda#<id>` e precisa ser único).
 *
 * Cada resposta é uma lista de blocos: parágrafo, passos numerados ou aviso em destaque.
 * Confira o texto no comportamento real do app antes de publicar — nada de prometer o que a
 * tela não faz.
 */

export type BlocoResposta =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'passos'; itens: string[] }
  | { tipo: 'aviso'; texto: string };

export interface PerguntaFaq {
  id: string;
  categoria: CategoriaFaq;
  pergunta: string;
  resposta: BlocoResposta[];
}

export type CategoriaFaq = 'Fluxo de Caixa e Open Finance' | 'Carteira' | 'Uso geral';

/** Ordem em que as categorias aparecem na página. */
export const CATEGORIAS_FAQ: CategoriaFaq[] = [
  'Fluxo de Caixa e Open Finance',
  'Carteira',
  'Uso geral',
];

export const EMAIL_SUPORTE = 'suporte@appmyfinance.com.br';

export const FAQ: PerguntaFaq[] = [
  {
    id: 'corrigir-lancamento-open-finance',
    categoria: 'Fluxo de Caixa e Open Finance',
    pergunta:
      'Se eu lançar no fluxo de caixa errado, consigo editar o lançamento feito do Open Finance?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'Sim. O lançamento que veio do banco não é corrigido digitando na célula — ele é retirado e lançado de novo na linha certa.',
      },
      {
        tipo: 'passos',
        itens: [
          'Vá em Conexões bancárias e abra o extrato da conta de onde veio a transação.',
          'Na transação lançada aparece “no fluxo · tirar”. Clique nele: o valor sai da linha onde estava e a transação volta para a Caixa de entrada.',
          'Na Caixa de entrada, lance a transação na linha correta.',
        ],
      },
      {
        tipo: 'paragrafo',
        texto:
          'Se o lançamento errado foi a última coisa que você fez, também dá para usar o botão Desfazer no Histórico de alterações.',
      },
      {
        tipo: 'aviso',
        texto:
          'Importante: não corrija apagando ou alterando o número direto na célula. A transação continua ligada àquela linha e o valor pode ficar errado depois. O valor da transação em si não é editável, porque vem direto do banco.',
      },
    ],
  },
  {
    id: 'conectar-banco',
    categoria: 'Fluxo de Caixa e Open Finance',
    pergunta: 'Como conecto meu banco pelo Open Finance?',
    resposta: [
      {
        tipo: 'passos',
        itens: [
          'No menu, abra Conexões bancárias e clique em Conectar banco.',
          'Leia o consentimento, marque que autoriza e siga para a Pluggy, a parceira que faz a conexão com o banco.',
          'Escolha o banco e confirme a autorização no ambiente dele.',
        ],
      },
      {
        tipo: 'paragrafo',
        texto:
          'Contas e cartões aparecem na própria tela de Conexões bancárias. As transações dos últimos 12 meses vão para a Caixa de entrada, e os investimentos entram sozinhos na Carteira — alguns bancos levam até 48 horas para enviá-los.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'O acesso é só de leitura: o My Finance não faz pagamentos nem movimenta seu dinheiro. Para revogar, use Desconectar na conexão; o extrato importado é apagado, mas o que você já levou ao Fluxo de Caixa, à Carteira ou a Dívidas continua.',
      },
    ],
  },
  {
    id: 'caixa-de-entrada',
    categoria: 'Fluxo de Caixa e Open Finance',
    pergunta: 'O que é a Caixa de entrada?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'Fica em Conexões bancárias e reúne as transações importadas do banco que ainda não foram lançadas no Fluxo de Caixa. Cada uma já vem com uma linha do fluxo sugerida pela categoria do banco: você confirma, troca a linha ou ignora.',
      },
      {
        tipo: 'paragrafo',
        texto:
          '“Lançar sugeridas” lança de uma vez todas as que têm linha sugerida, e “Ignorar transferências” tira da lista as transferências e aplicações. O valor lançado soma ao que já está na célula do mês — o que você digitou é mantido.',
      },
    ],
  },
  {
    id: 'orcamento',
    categoria: 'Fluxo de Caixa e Open Finance',
    pergunta: 'Como funciona o Orçamento?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'No Fluxo de Caixa, a aba Orçamento mostra, mês a mês, quanto você planejou gastar (o orçado) em cada categoria e subcategoria e quanto já foi gasto.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'Você escolhe a base da comparação: “Lançado” considera tudo o que está no Fluxo do mês; “Consolidado” considera só os valores marcados como Pago/Recebido.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'Cada categoria tem uma subcategoria Geral. Quem já usava o orçamento antigo encontra lá o valor que cada categoria tinha; dá para distribuí-lo entre as subcategorias quando quiser, sem mudar o total da categoria.',
      },
    ],
  },
  {
    id: 'excluir-linha-geral',
    categoria: 'Fluxo de Caixa e Open Finance',
    pergunta: 'O que acontece com os valores quando excluo uma linha do Fluxo de Caixa?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'Se a linha tem valores e a categoria tem a linha Geral, o app pergunta o que fazer:',
      },
      {
        tipo: 'passos',
        itens: [
          'Mover para Geral: os valores são somados na linha Geral da categoria.',
          'Apagar os valores: os valores saem do Fluxo e do Orçamento. Use quando você já lançou esses valores em outra linha.',
        ],
      },
      {
        tipo: 'paragrafo',
        texto:
          'O que veio do banco (Open Finance) vai para a Geral nos dois casos, junto com as transações. A escolha vale também para os outros anos, e dá para voltar atrás em Desfazer, no Histórico de alterações.',
      },
    ],
  },
  {
    id: 'caixa-para-investir',
    categoria: 'Carteira',
    pergunta: 'O que é o Caixa para Investir?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'É o dinheiro que você guardou para investir e ainda não aplicou. O card da Carteira Consolidada mostra o total; cada aba (Ações, FIIs, Renda Fixa…) pode ter a sua reserva dentro desse total, e o que sobra aparece como livre.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'Ao registrar um investimento, marque “Descontar do Caixa para Investir”: sai primeiro da reserva da aba e depois do caixa livre. Num resgate, dá para devolver o valor ao Caixa para Investir. No card do total também há a opção de somar ali os proventos pagos a partir de hoje.',
      },
    ],
  },
  {
    id: 'imposto-de-renda',
    categoria: 'Carteira',
    pergunta: 'Onde vejo o Imposto de Renda dos meus investimentos?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'Na Carteira, abra a aba Análise e depois Imposto de Renda. Lá estão o Resumo Anual e o detalhe mês a mês de renda variável no Brasil, Stocks US, Cripto e Come-cotas.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'O cálculo é feito a partir das operações registradas na sua carteira. Confira com seu contador antes de declarar ou pagar o imposto.',
      },
    ],
  },
  {
    id: 'esconder-valores',
    categoria: 'Uso geral',
    pergunta: 'Como escondo os valores da tela?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'Clique no ícone de olho: no computador ele fica no rodapé do menu lateral, ao lado do botão de tema; no celular, no topo da tela, antes do sino. Com o olho fechado, os valores ficam cobertos; clique de novo para mostrá-los.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'A escolha fica guardada no aparelho, então vale também quando você volta ao app. As respostas do Assistente de IA não são escondidas.',
      },
    ],
  },
  {
    id: 'desfazer-alteracao',
    categoria: 'Uso geral',
    pergunta: 'Como desfaço uma alteração?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'No menu, abra Histórico. Ali estão as alterações feitas na sua conta; nas que podem ser revertidas aparece o botão Desfazer.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'Desfazer segue a ordem: só a alteração mais recente de cada item pode ser desfeita. Se você mexeu no mesmo item depois, desfaça primeiro a alteração mais nova.',
      },
    ],
  },
  {
    id: 'assistente-ia',
    categoria: 'Uso geral',
    pergunta: 'Como uso o Assistente de IA? Existe limite?',
    resposta: [
      {
        tipo: 'paragrafo',
        texto:
          'Clique no botão redondo azul no canto inferior direito da tela. Pergunte sobre a sua carteira, o fluxo de caixa, o orçamento ou as dívidas, ou peça para registrar um gasto (por exemplo, “gastei 45,90 no mercado”). Nada é lançado sem você confirmar, e o assistente não recomenda investimentos.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'Sim: até 300 mensagens por mês. O topo do assistente mostra quantas ainda restam, um aviso aparece quando você está perto do limite, e a contagem recomeça no mês seguinte.',
      },
    ],
  },
];
