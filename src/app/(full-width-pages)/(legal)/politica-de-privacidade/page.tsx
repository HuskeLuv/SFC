import type { Metadata } from 'next';
import LegalArticle from '@/components/legal/LegalArticle';

export const metadata: Metadata = {
  title: 'Política de Privacidade — MyFinance',
  description: 'Como tratamos seus dados pessoais conforme a Lei nº 13.709/2018 (LGPD).',
};

/**
 * Política de Privacidade — boilerplate inicial (LGPD #1 do checklist mai/28).
 *
 * IMPORTANTE: este conteúdo é placeholder. Wellington vai substituir pelo
 * texto definitivo revisado juridicamente. As seções cobrem o que a ANPD
 * espera ver numa política mínima (Art. 9º + Resolução CD/ANPD 2/2022):
 * dados coletados, finalidades, base legal, retenção, direitos do titular,
 * subprocessadores, contato do DPO.
 *
 * Quando atualizar versão: incrementar o `data-policy-version` no
 * `LGPDConsentBanner` e no signup pra invalidar consentimentos antigos.
 */
export default function PoliticaDePrivacidade() {
  return (
    <LegalArticle title="Política de Privacidade" updatedAt="28 de maio de 2026" version="1.0">
      <h2>1. Quem somos</h2>
      <p>
        A <strong>MyFinance</strong> é uma plataforma de gestão financeira pessoal que ajuda
        usuários a organizar investimentos, fluxo de caixa e planejamento financeiro. Esta política
        descreve como tratamos seus dados pessoais em conformidade com a Lei nº 13.709/2018 (LGPD).
      </p>

      <h2>2. Dados que coletamos</h2>
      <p>Coletamos exclusivamente os dados necessários ao funcionamento do serviço:</p>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail, senha (armazenada como hash bcrypt) e avatar
          (opcional).
        </li>
        <li>
          <strong>Dados financeiros:</strong> ativos, transações de compra/venda, aportes, resgates,
          objetivos de planejamento e fluxo de caixa que você registra na plataforma.
        </li>
        <li>
          <strong>Dados técnicos:</strong> endereço IP e User-Agent são registrados apenas em
          eventos sensíveis (login, operações de consultor) para fins de auditoria de segurança.
        </li>
        <li>
          <strong>Consentimento:</strong> data, IP e versão da política aceita durante o cadastro.
        </li>
      </ul>
      <p>
        <strong>Não coletamos</strong> CPF, RG, telefone, endereço, data de nascimento ou outros
        dados pessoais sensíveis (Art. 5º, II da LGPD).
      </p>

      <h2>3. Finalidades do tratamento</h2>
      <ul>
        <li>Autenticação e acesso seguro à sua conta.</li>
        <li>Exibição e cálculo do seu portfólio e métricas financeiras.</li>
        <li>Atendimento ao suporte e correção de problemas técnicos.</li>
        <li>Cumprimento de obrigações legais e regulatórias.</li>
        <li>Defesa em processos administrativos ou judiciais.</li>
      </ul>
      <p>
        <strong>Não usamos seus dados</strong> para publicidade, perfilamento comportamental, venda
        a terceiros ou compartilhamento com parceiros comerciais.
      </p>

      <h2>4. Base legal</h2>
      <p>Tratamos seus dados com base em:</p>
      <ul>
        <li>
          <strong>Execução de contrato</strong> (Art. 7º, V): operação do serviço solicitado por
          você.
        </li>
        <li>
          <strong>Consentimento</strong> (Art. 7º, I): coletado no momento do cadastro para
          finalidades acessórias.
        </li>
        <li>
          <strong>Cumprimento de obrigação legal</strong> (Art. 7º, II): retenção de registros
          fiscais e contábeis.
        </li>
        <li>
          <strong>Exercício regular de direitos</strong> (Art. 7º, VI): em caso de disputa.
        </li>
      </ul>

      <h2>5. Compartilhamento e subprocessadores</h2>
      <p>
        Utilizamos prestadores de serviço (subprocessadores) estritamente necessários ao
        funcionamento da plataforma. A lista completa, com região de processamento e finalidade,
        está disponível em{' '}
        <a href="/subprocessadores" className="text-brand-500 hover:underline">
          /subprocessadores
        </a>
        .
      </p>
      <p>
        Toda a infraestrutura de armazenamento de dados pessoais opera em território brasileiro (AWS
        sa-east-1, São Paulo). Não há transferência internacional de dados pessoais.
      </p>

      <h2>6. Retenção</h2>
      <ul>
        <li>
          <strong>Conta ativa:</strong> mantemos seus dados enquanto a conta estiver ativa.
        </li>
        <li>
          <strong>Após exclusão:</strong> dados pessoais identificáveis são anonimizados em até 30
          dias; registros transacionais agregados podem ser mantidos para fins fiscais (5 anos).
        </li>
        <li>
          <strong>Logs de auditoria:</strong> mantidos por até 12 meses para fins de segurança.
        </li>
      </ul>

      <h2>7. Seus direitos (Art. 18 LGPD)</h2>
      <p>Você pode, a qualquer momento, exercer os seguintes direitos:</p>
      <ul>
        <li>
          <strong>Confirmar e acessar</strong> os dados que temos sobre você.
        </li>
        <li>
          <strong>Corrigir</strong> dados incompletos, inexatos ou desatualizados.
        </li>
        <li>
          <strong>Anonimizar, bloquear ou eliminar</strong> dados desnecessários ou tratados em
          desconformidade.
        </li>
        <li>
          <strong>Portar</strong> seus dados para outro fornecedor de serviço (formato JSON
          estruturado disponível em sua área de perfil).
        </li>
        <li>
          <strong>Revogar o consentimento</strong> a qualquer momento.
        </li>
        <li>
          <strong>Solicitar informação</strong> sobre o uso compartilhado de seus dados.
        </li>
      </ul>
      <p>
        Para exercer qualquer direito, acesse a área de perfil ou escreva ao Encarregado em{' '}
        <a href="mailto:dpo@appmyfinance.com.br" className="text-brand-500 hover:underline">
          dpo@appmyfinance.com.br
        </a>
        . Respondemos em até 15 dias.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Aplicamos medidas técnicas e administrativas para proteger seus dados, incluindo:
        criptografia em trânsito (TLS), hash bcrypt para senhas, autenticação por token, controle de
        acesso baseado em papel e auditoria de operações sensíveis. Trabalhamos continuamente para
        aprimorar essas medidas (Art. 46 LGPD).
      </p>

      <h2>9. Incidentes de segurança</h2>
      <p>
        Em caso de incidente que possa acarretar risco aos titulares, comunicaremos a Autoridade
        Nacional de Proteção de Dados (ANPD) e os titulares afetados em prazo razoável (Art. 48
        LGPD).
      </p>

      <h2>10. Encarregado (DPO)</h2>
      <p>
        Nosso Encarregado de Proteção de Dados pode ser contatado em{' '}
        <a href="mailto:dpo@appmyfinance.com.br" className="text-brand-500 hover:underline">
          dpo@appmyfinance.com.br
        </a>{' '}
        para qualquer questão relativa ao tratamento de seus dados pessoais.
      </p>

      <h2>11. Alterações desta política</h2>
      <p>
        Podemos atualizar esta política periodicamente. Mudanças relevantes serão comunicadas por
        e-mail e exigirão novo consentimento. A versão vigente é sempre a publicada neste endereço.
      </p>
    </LegalArticle>
  );
}
