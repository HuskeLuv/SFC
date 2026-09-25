/**
 * Textos da jornada Open Finance (aviso, consentimento, redirecionamento) e os
 * produtos pedidos ao Pluggy — compartilhado entre a tela e o servidor.
 *
 * Adequação pedida pelos advogados em 21/09/2026: cada etapa com o seu texto
 * (aviso inicial, opt-in com base legal/finalidade/dados/terceiros/revogação,
 * disclaimer de redirecionamento). O aceite grava a VERSÃO e o hash do texto
 * (services/pluggy/consentimento.ts) — mudar qualquer texto aqui exige NOVA
 * versão em VERSOES, para o registro antigo continuar mostrando o que a pessoa
 * aceitou.
 *
 * v1 e v2 foram publicadas como PROVISÓRIAS (selo na tela); a v3 é o mesmo
 * texto da v2, aprovado pelos advogados em 25/09/2026, sem o selo.
 */

/** Produtos pedidos ao Pluggy no connect token (= escopo do consentimento). */
export const PRODUTOS_OPEN_FINANCE = [
  'ACCOUNTS',
  'CREDIT_CARDS',
  'TRANSACTIONS',
  'PAYMENT_DATA',
  // Fase 3: investimentos e empréstimos entram sozinhos na Carteira e em Dívidas
  'INVESTMENTS',
  'INVESTMENTS_TRANSACTIONS',
  'LOANS',
] as const;

export type ProdutoOpenFinance = (typeof PRODUTOS_OPEN_FINANCE)[number];

/** Como cada produto aparece para o cliente ("quais dados serão acessados"). */
export const ROTULO_PRODUTO: Record<ProdutoOpenFinance, string> = {
  ACCOUNTS: 'Contas corrente e poupança: nome, número mascarado e saldo',
  CREDIT_CARDS: 'Cartões de crédito: limite, fatura, fechamento e vencimento',
  TRANSACTIONS: 'Transações das contas e dos cartões: dos últimos 12 meses e as novas',
  PAYMENT_DATA: 'Detalhes de pagamento das transações: forma de pagamento e nome de quem recebeu',
  INVESTMENTS: 'Investimentos: posições, saldos, taxas e vencimentos',
  INVESTMENTS_TRANSACTIONS: 'Movimentações dos investimentos: aplicações e resgates',
  LOANS: 'Empréstimos e financiamentos: saldo devedor, parcelas e taxa',
};

export interface SecaoConsentimento {
  titulo: string;
  texto?: string;
  itens?: string[];
}

export interface TextoConsentimento {
  versao: string;
  /** true = redação provisória, ainda sem revisão jurídica. */
  provisorio: boolean;
  aviso: { titulo: string; texto: string };
  consentimento: { titulo: string; secoes: SecaoConsentimento[]; aceite: string };
  redirecionamento: { titulo: string; texto: string };
}

const V1: TextoConsentimento = {
  versao: 'v1-2026-09-21',
  provisorio: true,
  aviso: {
    titulo: 'Conectar pelo Open Finance',
    texto:
      'Você será redirecionado para o ambiente Open Finance. Seus dados serão acessados em modo ' +
      'leitura: o My Finance não faz pagamentos nem movimenta seu dinheiro.',
  },
  consentimento: {
    titulo: 'Autorização de compartilhamento de dados',
    secoes: [
      {
        titulo: 'Quais dados serão acessados',
        itens: PRODUTOS_OPEN_FINANCE.map((p) => ROTULO_PRODUTO[p]),
      },
      {
        titulo: 'Quem participa',
        itens: [
          'My Finance: recebe e trata os dados para as finalidades abaixo.',
          'Pluggy Tecnologia Ltda.: conecta o My Finance ao Open Finance e repassa os dados que você autorizar.',
          'Sua instituição financeira: é onde você autoriza e de onde os dados são enviados.',
        ],
      },
      {
        titulo: 'Para que usamos',
        texto:
          'Consolidar suas contas, cartões, investimentos e dívidas no My Finance: sugerir ' +
          'lançamentos no Fluxo de Caixa, atualizar a Carteira e as Dívidas e montar seus ' +
          'relatórios. Não usamos os dados para publicidade e não os vendemos nem repassamos a ' +
          'outras empresas.',
      },
      {
        titulo: 'Base legal',
        texto:
          'Execução do contrato de uso do My Finance (LGPD, art. 7º, V), somada ao consentimento ' +
          'que você dá na sua instituição para o compartilhamento no Open Finance.',
      },
      {
        titulo: 'Por quanto tempo',
        texto:
          'A autorização vale pelo prazo que você escolher na sua instituição. Enquanto ela ' +
          'valer, o My Finance atualiza os dados automaticamente.',
      },
      {
        titulo: 'Você pode revogar quando quiser',
        texto:
          'Desconecte a qualquer momento em Conexões bancárias (ou no app da sua instituição). ' +
          'Ao desconectar, paramos de receber dados e apagamos o extrato importado; o que você ' +
          'já aplicou no Fluxo de Caixa, na Carteira ou em Dívidas continua, porque passa a ser ' +
          'um registro seu.',
      },
      {
        titulo: 'Seus direitos',
        texto:
          'Para acessar, corrigir ou apagar seus dados, escreva ao nosso Encarregado (DPO) em ' +
          'dpo@appmyfinance.com.br. Detalhes na Política de Privacidade.',
      },
    ],
    aceite:
      'Li e autorizo o My Finance a acessar, em modo leitura, os dados listados acima para as ' +
      'finalidades descritas.',
  },
  redirecionamento: {
    titulo: 'Você vai sair do My Finance',
    texto:
      'A partir deste ponto, você está no ambiente da Pluggy e da sua instituição financeira. ' +
      'O My Finance não controla esta etapa: a escolha do banco, o login e a autorização ' +
      'acontecem lá, e nós não vemos a sua senha. Ao terminar, você volta para cá.',
  },
};

/**
 * v2 (25/09/2026): alinha o termo aos Termos de Uso e ao Aviso de Privacidade
 * dos advogados — razão social da Pluggy e canal do Encarregado. O resto é o v1.
 */
const V2: TextoConsentimento = {
  ...V1,
  versao: 'v2-2026-09-25',
  consentimento: {
    ...V1.consentimento,
    secoes: V1.consentimento.secoes.map((s) => {
      if (s.titulo === 'Quem participa') {
        return {
          ...s,
          itens: [
            'My Finance: recebe e trata os dados para as finalidades abaixo.',
            'Pluggy Brasil Instituição de Pagamento Ltda.: conecta o My Finance ao Open Finance e repassa os dados que você autorizar.',
            'Sua instituição financeira: é onde você autoriza e de onde os dados são enviados.',
          ],
        };
      }
      if (s.titulo === 'Seus direitos') {
        return {
          ...s,
          texto:
            'Para acessar, corrigir ou apagar seus dados, escreva ao nosso Encarregado (DPO) em ' +
            'privacidade@appmyfinance.com.br. Detalhes no Aviso de Privacidade.',
        };
      }
      return s;
    }),
  },
};

/**
 * v3 (25/09/2026): textos das telas aprovados pelos advogados. Mesmo conteúdo da
 * v2 sem o selo "provisório" (que faz parte do texto aceito e do hash; por isso
 * versão nova, e não edição da v2).
 */
const V3: TextoConsentimento = { ...V2, versao: 'v3-2026-09-25', provisorio: false };

/** Todas as versões já publicadas (o registro de consentimento aponta para uma delas). */
export const VERSOES_CONSENTIMENTO: Record<string, TextoConsentimento> = {
  [V1.versao]: V1,
  [V2.versao]: V2,
  [V3.versao]: V3,
};

export const TEXTO_CONSENTIMENTO_ATUAL: TextoConsentimento = V3;
