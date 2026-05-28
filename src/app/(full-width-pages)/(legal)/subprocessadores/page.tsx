import type { Metadata } from 'next';
import LegalArticle from '@/components/legal/LegalArticle';

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
 * Lista mantida em conformidade com a infraestrutura atual após migração
 * planejada pra AWS sa-east-1 ([[project_aws_deploy_plan]] Fase 1). Quando
 * migrar de fato, marcar Vercel como histórico e atualizar a tabela.
 */
const SUBPROCESSADORES: Subprocessador[] = [
  {
    nome: 'Amazon Web Services (AWS Amplify)',
    finalidade: 'Hospedagem da aplicação web e API.',
    dados:
      'Todo o tráfego HTTP do serviço, incluindo cookies de autenticação e payloads de requisição.',
    regiao: 'São Paulo, Brasil (sa-east-1)',
    internacional: false,
  },
  {
    nome: 'Amazon Web Services (RDS PostgreSQL)',
    finalidade: 'Armazenamento persistente do banco de dados.',
    dados:
      'Cadastro de usuários (nome, e-mail, hash de senha), portfólio, transações, fluxo de caixa, logs de auditoria.',
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
];

export default function Subprocessadores() {
  return (
    <LegalArticle title="Subprocessadores" updatedAt="28 de maio de 2026">
      <p>
        Em conformidade com o Art. 18, VII da LGPD, listamos abaixo todos os prestadores de serviço
        (subprocessadores) que tratam dados pessoais em nosso nome para a operação do serviço.
        Nenhum desses subprocessadores utiliza seus dados para finalidades próprias.
      </p>

      <h2>Lista atual</h2>
      <div className="not-prose overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
                Subprocessador
              </th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
                Finalidade
              </th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
                Dados envolvidos
              </th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
                Região
              </th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSADORES.map((sp) => (
              <tr key={sp.nome} className="border-b border-gray-100 align-top dark:border-gray-800">
                <td className="px-3 py-3 font-medium text-gray-900 dark:text-white/90">
                  {sp.nome}
                </td>
                <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{sp.finalidade}</td>
                <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{sp.dados}</td>
                <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{sp.regiao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Transferência internacional</h2>
      <p>
        Toda a infraestrutura de armazenamento de dados pessoais opera em território brasileiro (AWS
        sa-east-1, São Paulo).{' '}
        <strong>Não há transferência internacional de dados pessoais.</strong>
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
