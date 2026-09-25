import type { Metadata } from 'next';
import LegalArticle from '@/components/legal/LegalArticle';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';

export const metadata: Metadata = {
  title: 'Aviso de Privacidade — MyFinance',
  description: 'Como o My Finance trata dados pessoais conforme a Lei nº 13.709/2018 (LGPD).',
};

/**
 * Aviso de Privacidade — texto dos advogados (setembro/2026, "Aviso de
 * Privacidade - My Finance - Open Finance LIMPO.docx"), transcrito sem alterar a
 * redação. Única troca: o e-mail do DPO, que no original estava em outro domínio,
 * virou privacidade@appmyfinance.com.br. A rota continua /politica-de-privacidade
 * para não quebrar links já publicados.
 *
 * Mudou o texto? Suba `version` aqui e `privacyVersion` no SignUpForm.
 */
export default function AvisoDePrivacidade() {
  return (
    <LegalArticle title="Aviso de Privacidade" updatedAt="25 de setembro de 2026" version="2.0">
      <h2>1. Objetivo</h2>
      <p>
        Este Aviso de Privacidade (“Aviso” ou “Aviso de Privacidade”) tem como objetivo estabelecer
        normas e diretrizes sobre o tratamento de dados pessoais no âmbito do{' '}
        <strong>My Finance</strong> (“<strong>Plataforma</strong>”), operada por{' '}
        <strong>MY FINANCE SOFTWARES LTDA</strong>, empresa proprietária da Plataforma My Finance,
        inscrita no CNPJ nº 65.655.251/0001-50, com sede em Rua Cerro Cora, 2175, bairro Vila
        Romana, cidade e Estado de São Paulo, CEP 05.061-450 (“<strong>Controladora</strong>”, “
        <strong>CONTRATADA</strong>” ou “<strong>My Finance</strong>”).
      </p>
      <p>
        A <strong>My Finance</strong> é um ecossistema SaaS de inteligência financeira e
        consolidação de investimentos, voltado tanto ao investidor pessoa física quanto ao consultor
        financeiro, com a finalidade de permitir visão consolidada de patrimônio, fluxo de caixa,
        proventos, performance e obrigações fiscais.
      </p>
      <p>
        Entre as funcionalidades da Plataforma, a My Finance poderá oferecer a conexão de contas
        financeiras e de investimento do Usuário por meio de serviços de agregação de dados
        prestados pela Pluggy Brasil Instituição de Pagamento Ltda. (“Pluggy”), que disponibiliza
        componentes tecnológicos de conexão, incluindo API e interface de usuário (widget). Essa
        conexão poderá ocorrer por diferentes estruturas técnicas, inclusive por meio do ambiente
        regulado do Open Finance, quando disponível e aplicável.
      </p>
      <p>
        Ao utilizar a Plataforma, o titular declara ciência dos termos aqui descritos e do
        tratamento de seus dados pessoais nos limites deste Aviso e dos{' '}
        <strong>Termos de Uso</strong> da Plataforma.
      </p>
      <p>
        Embora os dados financeiros e patrimoniais tratados pela My Finance não se enquadrem, em
        regra, como dados pessoais sensíveis na definição legal da LGPD, a Plataforma adota{' '}
        <strong>medidas reforçadas de segurança, confidencialidade e segregação lógica</strong>, em
        razão da natureza altamente reservada dessas informações.
      </p>
      <h2>2. Abrangência</h2>
      <p>
        O presente Aviso é aplicável às atividades que envolvam o tratamento de dados pessoais e
        abrange todos os websites, portais, aplicativos, formulários, integrações, canais de
        suporte, comunicações e demais ambientes digitais da My Finance.
      </p>
      <p>
        Este Aviso também se aplica, no que couber, ao fluxo de dados relacionado ao{' '}
        <strong>Plano para Consultores</strong>, quando houver acesso autorizado a dados de clientes
        finais dentro da Plataforma.
      </p>
      <h2>3. Termos e definições</h2>
      <p>
        Para o entendimento deste Aviso devemos considerar as definições e terminologias conforme o
        detalhamento a seguir:
      </p>
      <p>
        <strong>Agência Nacional / Agência Nacional de Proteção de Dados (ANPD):</strong> autarquia
        federal especial responsável por zelar, implementar e fiscalizar o cumprimento da Lei Geral
        de Proteção de Dados (“LGPD”) em todo o território nacional.
      </p>
      <p>
        <strong>Anonimização:</strong> utilização de meios técnicos razoáveis e disponíveis no
        momento do tratamento, por meio dos quais um dado perde a possibilidade de associação,
        direta ou indireta, a um indivíduo.
      </p>
      <p>
        <strong>Banco de Dados:</strong> conjunto estruturado de dados, estabelecido em um ou em
        vários locais, em suporte eletrônico ou físico.
      </p>
      <p>
        <strong>Bloqueio:</strong> suspensão temporária de qualquer operação de tratamento, mediante
        guarda do dado pessoal ou do banco de dados.
      </p>
      <p>
        <strong>Cliente Final:</strong> titular cujos dados financeiros e patrimoniais podem ser
        acessados por consultor autorizado no âmbito do plano consultor.
      </p>
      <p>
        <strong>Colaboradores:</strong> pessoas contratadas para integrar o quadro de funcionários
        do My Finance.
      </p>
      <p>
        <strong>Consentimento:</strong> manifestação livre, informada e inequívoca pela qual o
        titular concorda com o tratamento de seus dados pessoais para uma finalidade determinada.
      </p>
      <p>
        <strong>Controlador:</strong> pessoa natural ou jurídica, de direito público ou privado, a
        quem competem as decisões referentes ao tratamento de dados pessoais.
      </p>
      <p>
        <strong>Cookies:</strong> arquivos que contêm pequenas partes de dados que são
        compartilhados entre um dispositivo tecnológico e um servidor web com intuito de tornar a
        navegação mais amigável e melhorar a experiência do usuário.
      </p>
      <p>
        <strong>Dado Pessoal:</strong> informação relacionada a pessoa natural identificada ou
        identificável.
      </p>
      <p>
        <strong>Dado Pessoal Sensível:</strong> dado pessoal sobre origem racial ou étnica,
        convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter
        religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou
        biométrico, quando vinculado a uma pessoa natural.
      </p>
      <p>
        <strong>Eliminação:</strong> exclusão de dado ou de conjunto de dados armazenados em banco
        de dados, independentemente do procedimento empregado.
      </p>
      <p>
        <strong>
          Encarregado pelo Tratamento de Dados Pessoais (“Encarregado”) / DPO (Data Protection
          Officer):
        </strong>{' '}
        pessoa indicada pelo controlador e operador para atuar como canal de comunicação entre o
        controlador, os titulares dos dados e a ANPD.
      </p>
      <p>
        <strong>Finalidade:</strong> motivo pelo qual é realizado o tratamento do dado pessoal do
        titular.
      </p>
      <p>
        <strong>Instituição participante ou parceira:</strong> instituição autorizada ou
        participante do ecossistema aplicável que, conforme o fluxo utilizado, possa viabilizar a
        autenticação, a obtenção ou a transmissão dos dados financeiros.
      </p>
      <p>
        <strong>Lei Geral de Proteção de Dados Pessoais (LGPD):</strong> a Lei nº 13.709/2018 ou
        LGPD, que dispõe sobre o tratamento de dados pessoais de pessoas naturais, independente do
        meio, por pessoa natural ou por pessoa jurídica de direito público ou privado, com o
        objetivo de proteger os direitos fundamentais de liberdade e de privacidade e o livre
        desenvolvimento da personalidade da pessoa natural.
      </p>
      <p>
        <strong>Open Finance:</strong> sistema regulado de compartilhamento padronizado de dados e
        serviços financeiros, nos termos da regulamentação aplicável, realizado mediante autorização
        do cliente e com participação das instituições envolvidas.
      </p>
      <p>
        <strong>Operador:</strong> pessoa natural ou jurídica, de direito público ou privado, que
        realiza o tratamento de dados pessoais em nome do controlador.
      </p>
      <p>
        <strong>Plataforma:</strong> ambiente web, aplicativos móveis, APIs, integrações e demais
        componentes que compõem o ecossistema My Finance.
      </p>
      <p>
        <strong>Pluggy:</strong> Pluggy Brasil Instituição de Pagamento Ltda., fornecedora de
        tecnologia de agregação e conexão de dados financeiros contratada pela My Finance.
      </p>
      <p>
        <strong>Site / Website:</strong> endereço virtual de pessoa física ou jurídica, composto por
        um conjunto de páginas eletrônicas.
      </p>
      <p>
        <strong>Titular / Usuário:</strong> pessoa natural a quem se referem os dados pessoais que
        são objeto de tratamento.
      </p>
      <p>
        <strong>Transferência Internacional de Dados:</strong> transferência de dados pessoais para
        país estrangeiro ou organismo internacional do qual o país seja membro.
      </p>
      <p>
        <strong>Tratamento:</strong> toda operação realizada com dados pessoais, como as que se
        referem a coleta, produção, recepção, classificação, utilização, acesso, reprodução,
        transmissão, distribuição, processamento, arquivamento, armazenamento, eliminação, avaliação
        ou controle da informação, modificação, comunicação, transferência, difusão ou extração.
      </p>
      <p>
        <strong>Uso Compartilhado de Dados:</strong> comunicação, difusão, transferência
        internacional, interconexão de dados pessoais ou tratamento compartilhado de bancos pessoais
        por órgãos e entidades públicas no cumprimento de suas competências legais, ou entre entes
        privados, reciprocamente, com autorização específica, para uma ou mais modalidades de
        tratamento permitidas por esses entes públicos, ou entre entes privados.
      </p>
      <h2>
        4. Dos tratamentos, finalidades, hipóteses legais, titulares afetados e categorias de dados
        pessoais
      </h2>
      <p>
        Os tratamentos realizados pelo My Finance têm como objetivo a prestação dos serviços
        contratados, a segurança da Plataforma, a gestão de assinaturas, a consolidação financeira e
        o cumprimento de obrigações legais e regulatórias aplicáveis.
      </p>
      <div className={`not-prose ${TABLE_STYLES.wrapper}`}>
        <table className={TABLE_STYLES.table}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <th className={`${TABLE_STYLES.th} text-left`}>Tratamento</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Finalidade</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Hipótese Legal</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Titulares</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Categorias de Dados Pessoais</th>
            </tr>
          </thead>
          <tbody>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Cadastro e gestão da conta
              </td>
              <td className={TABLE_STYLES.td}>
                Criação, autenticação, manutenção e recuperação da conta do usuário; identificação e
                comunicação essencial sobre a Plataforma
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta.</td>
              <td className={TABLE_STYLES.td}>
                Nome, e-mail, CPF quando informado, telefone quando informado, credenciais de
                acesso, perfil de conta.
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Fluxo de Caixa manual
              </td>
              <td className={TABLE_STYLES.td}>
                Registro e organização de receitas, despesas e categorias de gastos pessoais
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta</td>
              <td className={TABLE_STYLES.td}>
                Receitas, despesas, categorias de gastos, datas, valores, observações.
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Carteira de Investimento manual
              </td>
              <td className={TABLE_STYLES.td}>
                Controle patrimonial básico e gestão manual de ativos financeiros
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta.</td>
              <td className={TABLE_STYLES.td}>
                Ativos financeiros, quantidades, valores de aquisição, posições declaradas
                manualmente
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Planejamento de aposentadoria
              </td>
              <td className={TABLE_STYLES.td}>Apoio ao planejamento financeiro de longo prazo</td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta.</td>
              <td className={TABLE_STYLES.td}>
                Idade, projeções financeiras, aportes, metas, dados patrimoniais e de renda
                inseridos pelo usuário
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Consolidação automática de dados financeiros
              </td>
              <td className={TABLE_STYLES.td}>
                Integração com instituições financeiras, APIs e B3 para exibição consolidada do
                patrimônio e movimentações
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta.</td>
              <td className={TABLE_STYLES.td}>
                Saldos, transações, posições, proventos, histórico de operações, dados de integração
                autorizada
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Balanço patrimonial dinâmico e relatórios de performance
              </td>
              <td className={TABLE_STYLES.td}>
                Consolidação, análise e visualização do desempenho financeiro
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta.</td>
              <td className={TABLE_STYLES.td}>
                Dados agregados de rentabilidade, alocações, indicadores, desempenho de carteira,
                históricos de proventos.
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Notificações de proventos, aportes e alertas de serviço
              </td>
              <td className={TABLE_STYLES.td}>Envio de alertas operacionais e informativos.</td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta</td>
              <td className={TABLE_STYLES.td}>
                E-mail, token de dispositivo, preferências de notificação, histórico de
                notificações.
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Auxílio à declaração de IRPF
              </td>
              <td className={TABLE_STYLES.td}>
                Apoio à conferência de informações fiscais e geração de relatórios para fins de
                declaração
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta</td>
              <td className={TABLE_STYLES.td}>
                Receita bruta, gastos dedutíveis, dividendos, Juros sobre Capital Próprio, proventos
                fiscais, dados de conferência fiscal.
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Gestão de cobrança, assinatura e inadimplência
              </td>
              <td className={TABLE_STYLES.td}>
                Processar pagamentos, renovações, suspensões, cancelamentos e cobrança de valores
                devidos
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>Usuário titular da conta</td>
              <td className={TABLE_STYLES.td}>
                Dados cadastrais, status da assinatura, histórico de cobrança, status de
                inadimplência, registros financeiros
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Plano para Consultores
              </td>
              <td className={TABLE_STYLES.td}>
                Permitir gestão, consolidação e visualização de dados de clientes finais com
                consentimento específico
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>
                  EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD), com o Consultor e CONSENTIMENTO (art. 7º,
                  I, LGPD) do Cliente Final
                </strong>
              </td>
              <td className={TABLE_STYLES.td}>Consultor e Cliente Final</td>
              <td className={TABLE_STYLES.td}>
                Dados cadastrais, dados patrimoniais, carteira, fluxo de caixa, orçamento,
                planejamentos e logs de acesso.
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Suporte, atendimento e resolução de incidentes
              </td>
              <td className={TABLE_STYLES.td}>
                Atendimento ao usuário, registro de solicitações e suporte técnico
              </td>
              <td className={TABLE_STYLES.td}>
                <strong>EXECUÇÃO DE CONTRATO (art. 7º, V, LGPD)</strong>
              </td>
              <td className={TABLE_STYLES.td}>
                Usuário titular da conta, consultor e, quando aplicável, cliente final
              </td>
              <td className={TABLE_STYLES.td}>
                Nome, e-mail, mensagens, anexos, histórico de atendimento, identificadores de conta
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Além dos tratamentos acima, o My Finance poderá tratar dados pessoais de colaboradores,
        prestadores de serviço, fornecedores e candidatos a vagas, quando existentes, para fins de
        gestão contratual, recursos humanos, acesso físico e lógico, compliance e cumprimento de
        obrigações legais e regulatórias
      </p>
      <p>
        A Plataforma não foi concebida para tratar dados de crianças e adolescentes como finalidade
        principal. Caso dados de terceiros sejam inseridos pelo titular, por exemplo, em contextos
        de consultoria ou planejamento familiar, o usuário declara possuir a base legal, autorização
        ou legitimidade necessária para tal tratamento.
      </p>
      <p>
        A base de dados formada por meio da coleta e armazenamento de dados pessoais do titular é de
        propriedade e responsabilidade do My Finance, sendo que seu uso, acesso e compartilhamento,
        quando necessários, serão realizados dentro dos limites e propósitos de suas atividades,
        podendo, neste sentido, serem disponibilizados para consulta, compartilhados e cedidos a
        fornecedores e autoridades, desde que obedecido ao disposto no presente Aviso de Privacidade
        e na legislação/regulamentação aplicável.
      </p>
      <p>
        Nenhum documento, informação e/ou dado pessoal será divulgado e/ou compartilhado em nenhuma
        hipótese, exceto nas situações descritas neste Aviso , para fins de cumprimento dos serviços
        contratados ou mediante ordem judicial ou determinação legal/regulatória.
      </p>
      <p>
        Poderá ser necessário que sejam transmitidos os dados pessoais a outra entidade vinculada ao
        My Finance, um parceiro ou prestador de serviços externo. O My Finance exige que seus
        prestadores de serviço tratem tais dados apenas em conformidade com este Aviso de
        Privacidade e com a regulamentação aplicável.
      </p>
      <p>
        Internamente, os dados pessoais são acessados somente por colaboradores devidamente
        autorizados, respeitando os princípios de finalidade, adequação, necessidade e demais
        princípios inerentes ao tratamento de dados pessoais, sempre para os objetivos do My
        Finance, além do compromisso de confidencialidade e preservação da privacidade nos termos
        deste Aviso de Privacidade.
      </p>
      <h2>5. Dos demais dados coletados</h2>
      <p>
        Para que o My Finance realize suas finalidades, poderá coletar dados pessoais fornecidos
        diretamente pelo titular, por terceiros autorizados, por integrações técnicas, ou coletados
        automaticamente durante o uso da Plataforma.
      </p>
      <p>
        Dados pessoais fornecidos diretamente pelo titular: Serão coletados os dados pessoais
        inseridos pelo próprio usuário ao criar a conta, usar as funcionalidades da Plataforma,
        abrir chamados de suporte, contratar planos ou preencher formulários.
      </p>
      <p>
        Dados pessoais fornecidos por terceiros: O My Finance poderá receber dados de instituições
        financeiras, APIs de mercado, B3, provedores de pagamento, provedores de autenticação,
        parceiros tecnológicos e, no caso do plano consultor, dos clientes finais autorizados.
      </p>
      <p>
        Conexão de contas financeiras: Quando o Usuário optar por conectar uma conta financeira, a
        Plataforma poderá direcioná-lo a um fluxo de conexão disponibilizado por meio da tecnologia
        da Pluggy. Conforme a modalidade de conexão, o Usuário poderá autenticar-se perante a
        instituição financeira ou participante responsável pelo fluxo e autorizar o compartilhamento
        dos dados selecionados.
      </p>
      <p>
        Após a conexão, os dados disponibilizados pela instituição poderão ser transmitidos à Pluggy
        e, por meio da integração, à My Finance, para apresentação e utilização nas funcionalidades
        contratadas. A disponibilidade e o conteúdo dos dados dependem da instituição de origem, da
        modalidade de conexão e das autorizações concedidas pelo Usuário.
      </p>
      <p>
        Dados coletados automaticamente: Ao navegar na Plataforma, a My Finance poderá coletar dados
        técnicos e de uso, como IP, data e hora de acesso, dispositivo, navegador, sistema
        operacional, logs de atividade, cookies e identificadores de sessão.
      </p>
      <p>
        Para toda a coleta de dados pessoais, sempre serão seguidas as seguintes regras essenciais:
      </p>
      <ul>
        <li>Apenas serão coletados dados necessários para as finalidades informadas;</li>
        <li>O usuário será informado sempre que novos dados forem necessários;</li>
        <li>
          Os dados coletados serão utilizados somente para as finalidades descritas neste Aviso e
          nos Termos de Uso.
        </li>
        <li>
          Quando houver tratamento de dados de terceiros, o usuário ou consultor declara possuir
          legitimidade, base legal ou autorização adequada para esse compartilhamento.
        </li>
      </ul>
      <p>Dados financeiros tratados por plano:</p>
      <ul>
        <li>
          <strong>Plano Standard:</strong> nome, e-mail, registros manuais de receitas, despesas e
          categorias de gastos pessoais.
        </li>
        <li>
          <strong>Plano Silver:</strong> além dos dados do Standard, dados patrimoniais inseridos
          manualmente, como ativos financeiros, quantidades e valores de aquisição.
        </li>
        <li>
          <strong>Plano Gold:</strong> além dos dados do Silver, dados agregados de rentabilidade,
          histórico de proventos, preferências de notificações e consumo educacional.
        </li>
        <li>
          <strong>Plano Premium:</strong> além dos dados do Gold, dados fiscais e de conferência
          para IRPF, incluindo receita bruta, gastos dedutíveis, dividendos e JCP.
        </li>
        <li>
          <strong>Plano para Consultores:</strong> dados do consultor e dados financeiros e
          patrimoniais de clientes finais vinculados, mediante consentimento específico do titular
          final.
        </li>
      </ul>
      <h2>6. Compartilhamento de dados com terceiros</h2>
      <p>
        Os dados pessoais tratados pelo My Finance, quando aplicável, poderão ser compartilhados com
        terceiros, conforme a seguir:
      </p>
      <h3>Para cumprimento dos objetivos da Plataforma</h3>
      <p>
        O My Finance compartilha dados estritamente necessários para viabilizar suas
        funcionalidades, incluindo:
      </p>
      <ul>
        <li>
          <strong>Stripe</strong> – processamento de pagamentos, tokenização e prevenção a fraudes;
        </li>
        <li>
          <strong>AWS (Amazon Web Services)</strong> – hospedagem, armazenamento, processamento e
          backups;
        </li>
        <li>
          <strong>APIs de instituições financeiras e B3</strong> – consolidação de dados financeiros
          autorizados pelo titular;
        </li>
        <li>
          <strong>Provedores de e-mail, push notifications e infraestrutura de comunicação</strong>{' '}
          – envio de comunicações operacionais e alertas;
        </li>
        <li>
          <strong>Pluggy Brasil Instituição de Pagamento Ltda.</strong> – tecnologia de conexão,
          agregação e transmissão de dados de contas financeiras, inclusive por meio de API e
          interface de conexão, conforme a modalidade disponibilizada ao Usuário.
        </li>
      </ul>
      <h3>Para razões estratégicas</h3>
      <p>
        O My Finance poderá compartilhar dados com fornecedores e prestadores de serviços técnicos,
        de auditoria, segurança da informação, suporte, desenvolvimento, manutenção, análise de
        dados e prevenção a fraudes, sempre com limitação de escopo e obrigação de
        confidencialidade.
      </p>
      <h3>Por razões legais e regulamentares</h3>
      <p>
        O My Finance poderá compartilhar dados pessoais com autoridades públicas, órgãos
        reguladores, juízos, autoridades tributárias e demais entidades competentes quando
        necessário para:
      </p>
      <ul>
        <li>cumprimento de obrigação legal ou regulatória;</li>
        <li>exercício regular de direitos;</li>
        <li>prevenção de fraudes;</li>
        <li>defesa da própria Plataforma ou dos titulares;</li>
        <li>atendimento a ordens judiciais ou administrativas.</li>
      </ul>
      <h3>Compartilhamento com Consultores</h3>
      <p>
        No Plano para Consultores, o compartilhamento de dados dos Clientes Finais somente ocorre
        mediante:
      </p>
      <ul>
        <li>
          consentimento <strong>específico, inequívoco e revogável</strong>;
        </li>
        <li>autorização expressa dentro da Plataforma;</li>
        <li>indicação clara da finalidade;</li>
        <li>trilha de auditoria e logs de acesso</li>
      </ul>
      <h3>Bases e garantias do compartilhamento</h3>
      <p>
        Os terceiros contratados pelo My Finance somente tratam dados conforme instruções da
        Controladora, em conformidade com este Aviso, com os Termos de Uso e com a legislação
        aplicável.
      </p>
      <h3>Conexão via Open Finance</h3>
      <p>
        Para consolidar dados financeiros, a My Finance poderá utilizar os serviços da Pluggy e,
        conforme a modalidade disponível, o Open Finance. A conexão e o compartilhamento dependerão
        de autorização específica do Usuário, obtida antes da coleta, na interface da instituição
        participante ou por meio do componente da Pluggy. O Usuário deverá verificar as
        instituições, os dados e as finalidades informados no fluxo.
      </p>
      <p>
        A Pluggy tratará os dados em nome da My Finance e conforme suas instruções, na qualidade de
        operadora. Instituições financeiras e demais participantes poderão atuar sob
        responsabilidades próprias. A autorização para compartilhamento não substitui a informação
        sobre as finalidades do tratamento nem define, por si só, a base legal das operações
        posteriores da My Finance, que poderá ser a execução do contrato, quando aplicável.
      </p>
      <h3>Transferência internacional de dados</h3>
      <p>
        Em razão do uso de serviços de terceiros, como infraestrutura em nuvem, plataformas de
        pagamento e provedores de comunicação, pode haver transferência internacional de dados
        pessoais. Nessas hipóteses, o My Finance adota salvaguardas contratuais, técnicas e
        organizacionais adequadas, observando a LGPD e as exigências aplicáveis.
      </p>
      <p>
        A base principal de infraestrutura informada para a Plataforma é AWS com servidores no
        Brasil, mas eventuais fluxos técnicos de terceiros podem envolver processamento fora do
        território nacional.
      </p>
      <h2>7. Sobre os direitos e requerimentos dos titulares</h2>
      <p>Em conformidade com a Lei, o My Finance assegura os seguintes direitos ao titular:</p>
      <ul>
        <li>A confirmação da existência de tratamento;</li>
        <li>O acesso aos seus dados;</li>
        <li>A correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>
          A anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em
          desconformidade com a regulamentação aplicável;
        </li>
        <li>
          A portabilidade dos dados a outro fornecedor de serviço ou produto, mediante requisição
          expressa, de acordo com a regulamentação da ANPD;
        </li>
        <li>
          A eliminação dos dados pessoais tratados com o consentimento do titular, com exceções
          previstas na regulamentação aplicável;
        </li>
        <li>
          A informação das entidades públicas e privadas com as quais o My Finance realizou uso
          compartilhado de dados;
        </li>
        <li>
          A informação sobre a possibilidade de não fornecer consentimento e sobre as consequências
          da negativa;
        </li>
        <li>A revogação do consentimento, nos termos da regulamentação aplicável;</li>
        <li>Revisão de decisões automatizadas, caso venham a existir;</li>
      </ul>
      <p>
        Os direitos dos titulares previstos na regulamentação aplicável e neste Aviso poderão ser
        exercidos mediante a requisição expressa por parte do titular ou do se representante legal e
        poderá ser realizada através do{' '}
        <strong>
          <a
            href="https://dponote.com.br/dponote/requisicao-do-titular-de-dados/333"
            target="_blank"
            rel="noopener noreferrer"
          >
            Portal de Requisição do Titular de Dados
          </a>
        </strong>
        .
      </p>
      <h3>Responsabilidade do titular</h3>
      <p>
        Cabe ao titular fornecer informações corretas e atualizadas. O My Finance não será
        responsável pela veracidade dos dados prestados pelo usuário ou por terceiros autorizados a
        inserir informações na Plataforma.
      </p>
      <h3>Exclusão de dados essenciais</h3>
      <p>
        A eventual solicitação de exclusão de informações essenciais para a operação da conta,
        quando cabível, poderá implicar o encerramento da relação contratual ou a limitação do uso
        de determinadas funcionalidades.
      </p>
      <h3>Prazos de resposta</h3>
      <p>
        O My Finance empregará esforços razoáveis para atender às requisições no menor tempo
        possível, informando o titular sempre que houver justificativa legal para limitação, recusa
        ou necessidade de complementação.
      </p>
      <h2>8. Sobre segurança</h2>
      <p>
        Os dados pessoais tratados pelo My Finance são armazenados de acordo com padrões elevados de
        segurança, incluindo, sem limitação:
      </p>
      <ul>
        <li>controle de acesso por perfis e permissões;</li>
        <li>autenticação segura;</li>
        <li>criptografia em repouso e em trânsito;</li>
        <li>
          segregação lógica de dados entre usuários e, especialmente, entre consultores e clientes
          finais;
        </li>
        <li>tokenização de dados de pagamento;</li>
        <li>logs de auditoria e rastreabilidade;</li>
        <li>monitoramento de eventos de segurança;</li>
        <li>backups e políticas de recuperação;</li>
        <li>revisão periódica de acessos e privilégios;</li>
        <li>testes de vulnerabilidade e medidas preventivas;</li>
        <li>procedimentos internos de resposta a incidentes.</li>
      </ul>
      <p>
        A Plataforma utiliza controles de identidade e acesso (IAM) para restringir o tratamento
        apenas a pessoas autorizadas e adota salvaguardas adicionais para o Plano Consultores, em
        razão da sensibilidade operacional do fluxo de dados de terceiros.
      </p>
      <p>
        Além dos esforços supramencionados, o My Finance também adota outras medidas de segurança
        técnicas e administrativas visando a proteção de dados pessoais, de modo que mantém programa
        de governança em privacidade aplicado às suas atividades e estrutura de governança,
        constantemente atualizado.
      </p>
      <p>
        Em caso de incidente de segurança, o My Finance adotará medidas de contenção, investigação,
        remediação e, quando aplicável, comunicação aos titulares e às autoridades competentes.
      </p>
      <h2>9. Sobre links para outros sites</h2>
      <p>
        A My Finance poderá disponibilizar links, integrações ou redirecionamentos para sites,
        serviços ou ambientes de terceiros, como instituições financeiras, provedores de dados, B3,
        serviços de pagamento, plataformas educacionais e outras ferramentas integradas.
      </p>
      <p>
        Cabe ressaltar que o My Finance não se responsabiliza pelas práticas de privacidade, termos
        de uso, segurança ou tratamento de dados praticados por terceiros fora do seu ambiente
        controlado.
      </p>
      <p>
        Recomenda-se que o titular consulte os avisos de privacidade e políticas próprias desses
        terceiros antes de interagir com seus serviços.
      </p>
      <h2>10. Sobre cookies</h2>
      <p>
        Cookies são arquivos que podem ser armazenados no dispositivo do usuário, contendo pequenas
        partes de dados que são compartilhados quando um dispositivo visita ou utiliza os serviços
        on-line do My Finance.
      </p>
      <p>
        O site do My Finance utiliza cookies estritamente necessários, com base na hipótese legal do
        legítimo interesse, que não podem ser desativados nos sistemas. Esses cookies permitem
        funcionalidades essenciais para o fornecimento dos serviços, tais como segurança,
        verificação de identidade e gestão de rede.
      </p>
      <p>
        O titular poderá gerenciar suas preferências de cookies conforme os mecanismos
        disponibilizados na Plataforma e nas configurações do navegador.
      </p>
      <h2>11. Eliminação dos Dados Pessoais</h2>
      <p>
        Os dados pessoais serão excluídos após o cumprimento das finalidades para as quais foram
        coletados, em conformidade com os prazos de retenção aplicáveis e com as regras sobre
        término de tratamento, eliminação e conservação de dados, nos termos dos artigos 15 e 16 da
        LGPD.
      </p>
      <h3>Forma de eliminação</h3>
      <p>
        Após o término do prazo aplicável, os dados serão eliminados de forma segura, anonimizados
        ou bloqueados, conforme o caso, salvo quando houver obrigação legal, regulatória ou
        necessidade de preservação para exercício regular de direitos.
      </p>
      <h2>12. Lei aplicável e disposições gerais</h2>
      <p>
        Este documento foi elaborado com base na regulamentação aplicável sobre segurança da
        informação, privacidade e proteção de dados, inclusive (sempre e quando aplicáveis) a
        Constituição da República Federativa do Brasil, o Código de Defesa do Consumidor, o Código
        Civil, o Marco Civil da Internet (Lei Federal nº. 12.965/2014), seu decreto regulamentador
        (Decreto nº. 8.771/2016), a LGPD, e demais normas setoriais ou gerais sobre o tema.
      </p>
      <p>
        Este Aviso será interpretado segundo a legislação brasileira, no idioma português, sendo
        eleito o Foro Central da Comarca de São Paulo/Capital para dirimir qualquer litígio, questão
        ou dúvida superveniente, com expressa renúncia de qualquer outro, por mais privilegiado que
        seja.
      </p>
      <p>
        Caso alguma disposição deste Aviso de Privacidade seja considerada ilegal ou ilegítima por
        autoridade pública, as demais condições permanecerão em pleno vigor e efeito.
      </p>
      <p>
        O usuário/titular reconhece que toda comunicação realizada por e-mail (aos endereços por ele
        informados), SMS, aplicativos de comunicação instantânea ou qualquer outra forma digital e
        virtual também são válidas como prova documental, sendo eficazes e suficientes para a
        divulgação de qualquer assunto que se refira aos serviços prestados pelo My Finance, bem
        como às condições de sua prestação, ressalvadas as disposições expressamente diversas
        previstas neste Aviso de Privacidade.
      </p>
      <h2>13. Fale com o DPO</h2>
      <p>
        Caso o titular deseje esclarecer alguma dúvida adicional sobre a privacidade e proteção de
        seus dados pessoais, pedimos a gentileza de nos contatar pelo{' '}
        <a
          href="https://dponote.com.br/dponote/requisicao-do-titular-de-dados/333"
          target="_blank"
          rel="noopener noreferrer"
        >
          Portal de Requisição do Titular de Dados Pessoais
        </a>{' '}
        ou, caso prefira, diretamente junto ao{' '}
        <strong>encarregado pelo tratamento de dados pessoais (DPO)</strong>, Sr.{' '}
        <strong>Marcelo Pereira</strong>, através do e-mail{' '}
        <a href="mailto:privacidade@appmyfinance.com.br">privacidade@appmyfinance.com.br</a>.
      </p>
      <p>
        Em caso de ausência do encarregado titular, o atendimento será realizado por Luciana Lago,
        designada como substituta oficial, garantindo a continuidade e a eficiência no atendimento
        aos direitos dos titulares.
      </p>
      <h2>14. Atualizações deste aviso</h2>
      <p>O Aviso de Privacidade da My Finance poderá ser atualizado a qualquer tempo para:</p>
      <ul>
        <li>aprimoramento de segurança;</li>
        <li>adequação legal;</li>
        <li>inclusão de novas funcionalidades;</li>
        <li>novos parceiros ou integrações;</li>
        <li>ajustes operacionais e de governança.</li>
      </ul>
      <p>
        Sempre que houver alteração relevante, a versão atualizada será disponibilizada na
        Plataforma, com indicação da data de revisão.
      </p>
      <p>
        Recomenda-se que o titular revise periodicamente este Aviso para se manter informado sobre a
        forma como seus dados estão sendo tratados.
      </p>
    </LegalArticle>
  );
}
