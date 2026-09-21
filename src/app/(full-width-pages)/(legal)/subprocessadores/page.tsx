import type { Metadata } from 'next';
import LegalArticle from '@/components/legal/LegalArticle';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';

export const metadata: Metadata = {
  title: 'Subprocessadores — MyFinance',
  description: 'Lista de prestadores de serviço que tratam dados pessoais em nosso nome.',
};

interface Subprocessador {
  nome: string;
  finalidade: string;
  dados: string;
  regiao: string;
  internacional: boolean;
}

/**
 * Subprocessadores (LGPD #8, Art. 18, VII do checklist mai/28).
 *
 * Infraestrutura atual (desde 10/09/2026): um servidor AWS Lightsail em
 * sa-east-1 com a aplicação e o PostgreSQL, e cópias de segurança no S3 da
 * mesma região (ver infra/README.md). Antes: Vercel/Amplify + RDS.
 */
const SUBPROCESSADORES: Subprocessador[] = [
  {
    nome: 'Amazon Web Services (Lightsail)',
    finalidade: 'Servidor que hospeda a aplicação web, a API e o banco de dados.',
    dados:
      'Todo o tráfego HTTP do serviço (incluindo cookies de autenticação) e o banco de dados: cadastro (nome, e-mail, hash de senha), portfólio, transações, fluxo de caixa e logs de auditoria.',
    regiao: 'São Paulo, Brasil (sa-east-1)',
    internacional: false,
  },
  {
    nome: 'Amazon Web Services (S3)',
    finalidade: 'Cópias de segurança diárias do banco de dados, criptografadas em repouso.',
    dados: 'Cópia integral do banco de dados, retida por até 30 dias.',
    regiao: 'São Paulo, Brasil (sa-east-1)',
    internacional: false,
  },
  {
    nome: 'BRAPI',
    finalidade: 'Cotações em tempo real, dividendos e fundamentos de ativos brasileiros.',
    dados: 'Apenas símbolos de ativos consultados (PETR4, ITUB4, etc.). Sem dados pessoais.',
    regiao: 'Brasil',
    internacional: false,
  },
  {
    nome: 'Banco Central do Brasil (BACEN SGS)',
    finalidade: 'Séries históricas de indicadores econômicos (CDI, IPCA, SELIC).',
    dados: 'Apenas IDs de séries consultadas. Sem dados pessoais.',
    regiao: 'Brasil',
    internacional: false,
  },
  {
    nome: 'B3 (COTAHIST)',
    finalidade: 'Histórico de preços de ativos negociados na B3.',
    dados: 'Apenas tickers e datas consultadas. Sem dados pessoais.',
    regiao: 'Brasil',
    internacional: false,
  },
  {
    nome: 'CVM (Dados Abertos)',
    finalidade: 'Catálogo de fundos de investimento.',
    dados: 'Apenas CNPJs e dados públicos de fundos. Sem dados pessoais.',
    regiao: 'Brasil',
    internacional: false,
  },
  {
    nome: 'Tesouro Transparente',
    finalidade: 'Preços históricos dos títulos do Tesouro Direto.',
    dados: 'Sem dados pessoais.',
    regiao: 'Brasil',
    internacional: false,
  },
  {
    nome: 'Yahoo Finance',
    finalidade: 'Cotações históricas do IBOV e câmbio USD-BRL.',
    dados: 'Apenas tickers e ranges de datas consultados. Sem dados pessoais.',
    regiao: 'EUA',
    internacional: false,
  },
  {
    nome: 'CoinGecko',
    finalidade: 'Cotações históricas de criptomoedas.',
    dados: 'Apenas IDs de criptomoedas (bitcoin, ethereum, etc.). Sem dados pessoais.',
    regiao: 'Global',
    internacional: false,
  },
  {
    nome: 'Anthropic PBC (API Claude)',
    finalidade:
      'Assistente de IA dentro do app (responder perguntas sobre as suas finanças e propor lançamentos, sempre com a sua confirmação).',
    dados:
      'Somente quando você usa o assistente: a sua pergunta e um resumo dos seus dados financeiros (saldos, posições, totais mensais do fluxo de caixa, orçamento, dívidas e indicadores), sem nome, e-mail ou senha. A Anthropic retém o conteúdo por até 30 dias para fins de segurança e não o usa para treinar modelos.',
    regiao: 'EUA',
    internacional: true,
  },
];

export default function Subprocessadores() {
  return (
    <LegalArticle title="Subprocessadores" updatedAt="21 de setembro de 2026">
      <p>
        Em conformidade com o Art. 18, VII da LGPD, listamos abaixo todos os prestadores de serviço
        (subprocessadores) que tratam dados pessoais em nosso nome para a operação do serviço.
        Nenhum desses subprocessadores utiliza seus dados para finalidades próprias.
      </p>

      <h2>Lista atual</h2>
      <div className={`not-prose ${TABLE_STYLES.wrapper}`}>
        <table className={TABLE_STYLES.table}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <th className={`${TABLE_STYLES.th} text-left`}>Subprocessador</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Finalidade</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Dados envolvidos</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Região</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSADORES.map((sp) => (
              <tr key={sp.nome} className={`${TABLE_STYLES.row} align-top`}>
                <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                  {sp.nome}
                </td>
                <td className={TABLE_STYLES.td}>{sp.finalidade}</td>
                <td className={TABLE_STYLES.td}>{sp.dados}</td>
                <td className={TABLE_STYLES.td}>{sp.regiao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Transferência internacional</h2>
      <p>
        Toda a infraestrutura de armazenamento de dados pessoais opera em território brasileiro (AWS
        sa-east-1, São Paulo).{' '}
        <strong>
          A única transferência internacional ocorre quando você usa o assistente de IA
        </strong>
        : a sua pergunta e um resumo dos seus dados financeiros são enviados à Anthropic (EUA) para
        gerar a resposta, com base no art. 33, IX, da LGPD (necessidade para a execução do serviço
        que você solicitou). O assistente é opcional; se você não o usar, nenhum dado seu sai do
        Brasil.
      </p>
      <p>
        Os provedores Yahoo Finance e CoinGecko, embora operem fora do Brasil, recebem apenas
        consultas anônimas (tickers e datas) sem nenhum dado pessoal do usuário.
      </p>

      <h2>Atualizações</h2>
      <p>
        Esta lista é mantida atualizada. Caso adicionemos novo subprocessador que trate dados
        pessoais, notificaremos os usuários por e-mail e atualizaremos esta página com pelo menos 15
        dias de antecedência.
      </p>

      <h2>Contato</h2>
      <p>
        Para esclarecimentos sobre os subprocessadores, escreva ao Encarregado em{' '}
        <a href="mailto:dpo@appmyfinance.com.br" className="text-brand-500 hover:underline">
          dpo@appmyfinance.com.br
        </a>
        .
      </p>
    </LegalArticle>
  );
}
