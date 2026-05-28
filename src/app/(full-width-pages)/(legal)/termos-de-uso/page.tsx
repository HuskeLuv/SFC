import type { Metadata } from 'next';
import LegalArticle from '@/components/legal/LegalArticle';

export const metadata: Metadata = {
  title: 'Termos de Uso — MyFinance',
  description: 'Condições para uso da plataforma MyFinance.',
};

/**
 * Termos de Uso — boilerplate inicial (LGPD #1 do checklist mai/28).
 *
 * Wellington vai substituir pelo texto definitivo revisado juridicamente.
 */
export default function TermosDeUso() {
  return (
    <LegalArticle title="Termos de Uso" updatedAt="28 de maio de 2026" version="1.0">
      <h2>1. Aceitação</h2>
      <p>
        Ao criar uma conta ou utilizar a plataforma MyFinance (&quot;Serviço&quot;), você concorda
        com estes Termos de Uso e com a nossa{' '}
        <a href="/politica-de-privacidade" className="text-brand-500 hover:underline">
          Política de Privacidade
        </a>
        . Se não concorda com algum item, não utilize o Serviço.
      </p>

      <h2>2. Descrição do Serviço</h2>
      <p>
        A MyFinance é uma plataforma de gestão financeira pessoal que permite ao usuário registrar e
        consultar informações sobre seus investimentos, fluxo de caixa, planejamento financeiro e
        métricas derivadas (rentabilidade, risco, exposição a benchmarks). O Serviço integra-se a
        provedores públicos de dados de mercado (BRAPI, BACEN, B3 COTAHIST, CVM, Tesouro Direto,
        Yahoo Finance, CoinGecko) para enriquecer cotações e indicadores.
      </p>
      <p>
        <strong>
          O Serviço não constitui consultoria de investimentos, recomendação financeira, nem
          corretagem.
        </strong>{' '}
        Todas as decisões de investimento são de exclusiva responsabilidade do usuário.
      </p>

      <h2>3. Cadastro e conta</h2>
      <ul>
        <li>Você deve fornecer informações verdadeiras e mantê-las atualizadas.</li>
        <li>Você é responsável por manter sua senha em segurança e por toda atividade na conta.</li>
        <li>
          A idade mínima para uso é 18 anos. Menores devem ter o cadastro feito por responsável
          legal.
        </li>
        <li>
          Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos ou que
          apresentem indícios de fraude.
        </li>
      </ul>

      <h2>4. Uso permitido</h2>
      <p>Você concorda em utilizar o Serviço apenas para fins lícitos e em não:</p>
      <ul>
        <li>Tentar acesso não autorizado a sistemas, contas ou dados de terceiros.</li>
        <li>Distribuir malware, scripts de scraping ou ataques de negação de serviço.</li>
        <li>Realizar engenharia reversa ou copiar partes substanciais da plataforma.</li>
        <li>Compartilhar credenciais com terceiros não autorizados.</li>
      </ul>

      <h2>5. Propriedade intelectual</h2>
      <p>
        Todo o conteúdo da plataforma (código, marcas, layout, textos, gráficos) é de propriedade da
        MyFinance ou licenciado, protegido pelas leis aplicáveis. O uso do Serviço não transfere
        qualquer direito sobre essa propriedade. Você mantém a titularidade dos dados que registra
        na plataforma (transações, objetivos, observações).
      </p>

      <h2>6. Modalidade de consultor</h2>
      <p>
        Caso você seja um consultor financeiro autorizado pela CVM/ANCORD a utilizar a plataforma
        para atender clientes, aplicam-se condições adicionais. Cada cliente deve consentir
        expressamente ao acesso pelo consultor através do fluxo de convite. Todos os acessos
        realizados em nome de cliente são auditados.
      </p>

      <h2>7. Limitação de responsabilidade</h2>
      <p>
        O Serviço é fornecido &quot;como está&quot;. Dentro dos limites permitidos por lei, a
        MyFinance não se responsabiliza por:
      </p>
      <ul>
        <li>
          Decisões de investimento tomadas com base nas informações exibidas; cotações vêm de
          terceiros e podem conter atraso ou divergências.
        </li>
        <li>Perdas decorrentes de instabilidade técnica ou indisponibilidade temporária.</li>
        <li>
          Conteúdo gerado pelo usuário (observações, descrições de ativos, etc.) e suas
          consequências.
        </li>
      </ul>

      <h2>8. Tratamento de dados pessoais</h2>
      <p>
        O tratamento dos seus dados pessoais é regido pela{' '}
        <a href="/politica-de-privacidade" className="text-brand-500 hover:underline">
          Política de Privacidade
        </a>
        , que é parte integrante destes Termos.
      </p>

      <h2>9. Encerramento da conta</h2>
      <p>
        Você pode solicitar a exclusão da sua conta a qualquer momento na área de perfil. Dados
        pessoais identificáveis serão anonimizados conforme nossa Política de Privacidade.
      </p>

      <h2>10. Alterações destes Termos</h2>
      <p>
        Podemos atualizar estes Termos para refletir melhorias do Serviço ou mudanças legais.
        Mudanças relevantes serão comunicadas por e-mail com pelo menos 15 dias de antecedência. O
        uso continuado após o prazo equivale a aceitação.
      </p>

      <h2>11. Foro e legislação aplicável</h2>
      <p>
        Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca da sede da
        MyFinance, com renúncia a qualquer outro, ainda que mais privilegiado.
      </p>

      <h2>12. Contato</h2>
      <p>
        Dúvidas sobre estes Termos podem ser enviadas a{' '}
        <a href="mailto:suporte@appmyfinance.com.br" className="text-brand-500 hover:underline">
          suporte@appmyfinance.com.br
        </a>
        .
      </p>
    </LegalArticle>
  );
}
