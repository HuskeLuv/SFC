import type { Metadata } from 'next';
import LegalArticle from '@/components/legal/LegalArticle';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';

export const metadata: Metadata = {
  title: 'Termos de Uso — MyFinance',
  description: 'Termos de Uso e Condições de Serviço da plataforma My Finance.',
};

/**
 * Termos de Uso e Condições de Serviço — texto dos advogados (setembro/2026,
 * "Termos de Uso My Finance - Open Finance e Pluggy - LIMPO.docx"), transcrito
 * sem alterar a redação. Única troca: o e-mail do DPO, que no original estava em
 * outro domínio, virou privacidade@appmyfinance.com.br.
 *
 * Mudou o texto? Suba `version` aqui e `termsVersion` no SignUpForm.
 */
export default function TermosDeUso() {
  return (
    <LegalArticle
      title="Termos de Uso e Condições de Serviço"
      updatedAt="25 de setembro de 2026"
      version="2.0"
    >
      <h2>1. Da ciência e concordância com os presentes termos de uso</h2>
      <p>
        1.1. O acesso e o uso da plataforma <strong>My Finance</strong> implicam na{' '}
        <strong>aceitação plena, livre, informada e expressa</strong> de todas as condições,
        cláusulas e diretrizes estabelecidas neste instrumento.
      </p>
      <p>
        1.2. Ao utilizar os serviços, o <strong>USUÁRIO</strong> declara ter lido, compreendido e
        concordado com os presentes <strong>Termos de Uso</strong>. Caso não concorde com qualquer
        disposição, o <strong>USUÁRIO</strong> deverá abster-se de utilizar o software
        imediatamente.
      </p>
      <p>
        1.3. <strong>Definições</strong>
      </p>
      <ul>
        <li>
          <strong>Plataforma</strong>: conjunto de interface web, aplicativos móveis (Android/iOS) e
          APIs de integração.
        </li>
        <li>
          <strong>Software</strong>: código-fonte, algoritmos, arquitetura de banco de dados e
          demais ativos de propriedade intelectual da <strong>CONTRATADA</strong>.
        </li>
        <li>
          <strong>USUÁRIO</strong>: pessoa física <strong>maior de 18 anos</strong> ou pessoa
          jurídica devidamente representada.
        </li>
        <li>
          <strong>CONTRATADA</strong>: <strong>MY FINANCE SOFTWARES LTDA</strong>, empresa
          proprietária da Plataforma <strong>My Finance</strong>, inscrita no CNPJ nº
          65.655.251/0001-50, com sede em Rua Cerro Cora, 2175, bairro Vila Romana, cidade e Estado
          de São Paulo, CEP 05.061-450.
        </li>
        <li>
          <strong>Conexão Financeira</strong>: funcionalidade que permite ao Usuário conectar uma ou
          mais contas financeiras à Plataforma e compartilhar os dados disponibilizados pela
          respectiva instituição de origem.
        </li>
        <li>
          <strong>Open Finance</strong>: sistema regulado de compartilhamento de dados e serviços
          financeiros, realizado mediante autorização do Usuário e conforme as regras aplicáveis.
        </li>
        <li>
          <strong>Pluggy</strong>: Pluggy Brasil Instituição de Pagamento Ltda., fornecedora de
          tecnologia de conexão e agregação de dados financeiros utilizada pela My Finance.
        </li>
      </ul>
      <h2>2. Do objeto e da natureza do serviço</h2>
      <p>
        2.1. O <strong>My Finance</strong> é uma plataforma tecnológica operada sob o modelo de
        Software as a Service (SaaS), destinada à consolidação, organização e gestão de ativos
        financeiros e investimentos, bem como à disponibilização de um hub de finanças pessoais, com
        conteúdos educacionais, cursos próprios e de terceiros, comunidades para assinantes premium
        e diversas ferramentas voltadas à educação financeira.
      </p>
      <p>
        2.2. A plataforma atua, em regra, como ferramenta tecnológica de processamento, consolidação
        e organização de dados. Sem prejuízo disso, o My Finance poderá disponibilizar, em planos
        específicos, serviços de consultoria e orientação financeira, prestados por consultores
        contratados para esse fim, sempre dentro do escopo contratado. Tais serviços possuem
        natureza de obrigação de meio, não implicando promessa ou garantia de resultado.
      </p>
      <p>
        2.2.1. A CONTRATADA não realiza, por meio da plataforma, gestão discricionária de patrimônio
        nem presta assessoria jurídica, contábil ou fiscal. As análises, recomendações e orientações
        eventualmente fornecidas no âmbito dos serviços contratados não substituem a avaliação
        individualizada da situação do USUÁRIO, nem afastam sua responsabilidade exclusiva pelas
        decisões tomadas e pelos eventuais efeitos delas decorrentes.
      </p>
      <p>
        2.3. A Plataforma poderá disponibilizar funcionalidade de conexão de contas bancárias e de
        investimento, utilizando os serviços tecnológicos da Pluggy, incluindo API e interface de
        conexão, e, conforme a modalidade disponível, a estrutura do Open Finance. A funcionalidade
        permite obter e apresentar, em modo de leitura, os dados disponibilizados pela instituição
        financeira de origem, para uso nas funcionalidades contratadas pelo Usuário.
      </p>
      <h2>3. Do acesso à plataforma e aplicativos</h2>
      <p>
        3.1. O acesso ao <strong>My Finance</strong>, via software SaaS, ocorre através da URL{' '}
        <strong>
          <a href="https://www.appmyfinance.com.br" target="_blank" rel="noopener noreferrer">
            www.appmyfinance.com.br
          </a>
          ,
        </strong>{' '}
        mediante a inserção, pelo Usuário, de login e senha exclusivos na{' '}
        <strong>&quot;Área do Cliente&quot;</strong>.
      </p>
      <h2>4. Da responsabilidade pelos dados e integrações</h2>
      <p>
        4.1. <strong>Input de Dados:</strong> O <strong>USUÁRIO</strong> é o único responsável pela
        veracidade e integridade das informações inseridas manualmente na plataforma. O{' '}
        <strong>My Finance</strong> não realiza auditoria sobre os valores ou ativos declarados.
      </p>
      <p>
        4.2. <strong>APIs de Terceiros:</strong> A plataforma permite a integração com APIs de
        instituições financeiras e entidades como a B3. A <strong>CONTRATADA</strong> não garante a
        estabilidade, precisão ou disponibilidade ininterrupta desses serviços de terceiros, sendo
        isenta de qualquer responsabilidade por erros de consolidação derivados de falhas nas
        referidas APIs.
      </p>
      <p>
        4.2.1. A conexão poderá envolver dados disponibilizados pela instituição de origem, como
        identificação e informações da conta, saldos, transações e dados relacionados ao titular,
        conforme a modalidade de conexão e as permissões concedidas pelo Usuário. A disponibilidade,
        atualização, exatidão e completude desses dados dependem da instituição de origem e dos
        participantes técnicos do fluxo. A My Finance poderá organizá-los e apresentá-los na
        Plataforma, mas não controla os registros mantidos pela instituição de origem.
      </p>
      <p>
        4.3. <strong>Autorização da conexão:</strong> A conexão e o compartilhamento de dados
        dependerão da autorização do Usuário, solicitada antes da obtenção dos dados, por meio do
        fluxo aplicável. Conforme a modalidade utilizada, a confirmação poderá ocorrer na interface
        da instituição participante ou em componente tecnológico disponibilizado pela Pluggy em nome
        da My Finance. O Usuário deverá verificar, no momento da autorização, as instituições
        envolvidas, os dados abrangidos e as finalidades informadas.
      </p>
      <p>
        4.4. <strong>Relatórios de Imposto de Renda:</strong> As funcionalidades de auxílio à
        declaração de IRPF são meramente informativas. O <strong>USUÁRIO</strong> deve conferir os
        dados antes do envio à Receita Federal, permanecendo como o único responsável perante as
        autoridades fiscais.
      </p>
      <p>
        4.5. <strong>Revogação e encerramento.</strong> O Usuário poderá revogar a autorização ou
        solicitar o encerramento da conexão pelos mecanismos disponibilizados no fluxo, pela
        instituição participante, quando aplicável, ou pelos canais da My Finance. Recebida a
        revogação, a My Finance interromperá novas consultas e cessará a conexão, observados os
        procedimentos técnicos necessários. A revogação não invalida tratamentos realizados
        anteriormente nem implica, por si só, a eliminação de dados que devam ser mantidos nos casos
        previstos no Aviso de Privacidade e na legislação aplicável.
      </p>
      <h2>5. Compliance, anticorrupção e PLD/FT</h2>
      <p>
        5.1. <strong>Licitude de Origem:</strong> O <strong>USUÁRIO</strong> declara e garante que
        todos os recursos e ativos registrados na plataforma possuem origem lícita, não sendo fruto
        de atividades criminosas, conforme a Lei nº 9.613/1998.
      </p>
      <p>
        5.2. <strong>Anticorrupção:</strong> Ambas as partes declaram cumprir integralmente a Lei nº
        12.846/2013 (Lei Anticorrupção). O <strong>USUÁRIO</strong> compromete-se a não utilizar a
        plataforma para práticas de suborno, ocultação de bens ou qualquer ato lesivo à
        administração pública.
      </p>
      <p>
        5.3. <strong>Monitoramento e Rescisão:</strong> A <strong>CONTRATADA</strong> reserva-se o
        direito de suspender ou encerrar contas que apresentem indícios de violação às normas de
        Compliance ou Prevenção à Lavagem de Dinheiro e Financiamento ao Terrorismo (PLD/FT), sem
        direito a qualquer reembolso ou indenização.
      </p>
      <h2>6. Da propriedade intelectual e titularidade do software</h2>
      <p>
        6.1. A plataforma <strong>My Finance</strong>, em sua totalidade, é cedida de maneira
        exclusiva, por seu proprietário, à empresa <strong>MY FINANCE SOFTWARES LTDA</strong>,
        inscrita no CNPJ sob o nº 65.655.251/0001-50, que poderá exercer todos os direitos sobre o
        software, nos termos do respectivo contrato de cessão de uso de licença, concedendo aos
        USUÁRIOS, nos termos destes Termos de Uso,{' '}
        <strong>direito de uso limitado, não exclusivo, intransferível e revogável</strong> da
        plataforma, na forma e condições aqui previstas.
      </p>
      <p>
        6.2. O proprietário da plataforma My Finance, exerce todos os direitos de propriedade
        previstos em lei, de forma irrestrita, abrangendo também o <strong>código-fonte</strong>,{' '}
        <strong>algoritmos</strong>, <strong>arquitetura de sistemas</strong>,{' '}
        <strong>design de interface</strong>, <strong>identidade visual</strong>,{' '}
        <strong>marcas</strong>, <strong>logotipos</strong>, <strong>bases de dados</strong> e
        quaisquer outras criações intelectuais ou ativos tecnológicos relacionados à plataforma.
      </p>
      <p>
        6.3. A licença de uso concedida ao <strong>USUÁRIO</strong> através deste instrumento é de
        caráter pessoal, temporário, não exclusivo e revogável,{' '}
        <strong>não implicando em qualquer hipótese na transferência de propriedade</strong>, cessão
        de direitos ou outorga de direitos de propriedade intelectual sobre o software ou suas
        funcionalidades.
      </p>
      <h2>7. Dos planos, pagamento e fidelidade</h2>
      <p>
        7.1. <strong>Estrutura de Planos:</strong> O acesso à Plataforma é segmentado conforme o
        plano contratado pelo <strong>USUÁRIO</strong>, com as seguintes especificações e valores:
      </p>
      <div className={`not-prose ${TABLE_STYLES.wrapper}`}>
        <table className={TABLE_STYLES.table}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <th className={`${TABLE_STYLES.th} text-left`}>Plano</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Valor e Recorrência*</th>
              <th className={`${TABLE_STYLES.th} text-left`}>Funcionalidades Entregues</th>
            </tr>
          </thead>
          <tbody>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Plano Standard
              </td>
              <td className={TABLE_STYLES.td}>R$ 99,00 / ano</td>
              <td className={TABLE_STYLES.td}>
                <ul>
                  <li>Fluxo de Caixa manual</li>
                  <li>App Celular</li>
                </ul>
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Plano Silver
              </td>
              <td className={TABLE_STYLES.td}>R$ 29,90 / mês</td>
              <td className={TABLE_STYLES.td}>
                <ul>
                  <li>Fluxo de Caixa manual</li>
                  <li>Carteira de Investimento manual (Básica)</li>
                  <li>Ferramenta de Planejamento de Aposentadoria</li>
                  <li>App Celular e iPad/Tablet</li>
                </ul>
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Plano Gold
              </td>
              <td className={TABLE_STYLES.td}>R$ 59,90 / mês</td>
              <td className={TABLE_STYLES.td}>
                <ul>
                  <li>Tudo do Plano Silver</li>
                  <li>Balanço Patrimonial Dinâmico</li>
                  <li>Emissão de Relatórios de Performance</li>
                  <li>Carteira de Investimento Completa (Ilimitada)</li>
                  <li>
                    Ferramenta de Análise da Carteira (Histórico de Dividendos, YoC, Cobertura FGC,
                    Comparativo de Índices, Índice Sharpe)
                  </li>
                  <li>Notificações de Proventos e Aportes</li>
                  <li>
                    Área Educacional (Acesso Total à Comunidade My Finance com mais de 11 cursos em
                    vídeo)
                  </li>
                </ul>
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Plano Premium
              </td>
              <td className={TABLE_STYLES.td}>R$ 99,00 / mês</td>
              <td className={TABLE_STYLES.td}>
                <ul>
                  <li>Tudo do Plano Gold</li>
                  <li>
                    Ferramenta de Análise Fundamentalista de Ativos Completa (Acesso total a dados
                    corporativos históricos)
                  </li>
                  <li>Ferramenta de Auxílio da Declaração de Imposto de Renda (IRPF)</li>
                </ul>
              </td>
            </tr>
            <tr className={`${TABLE_STYLES.row} align-top`}>
              <td className={`${TABLE_STYLES.td} font-medium text-gray-900 dark:text-white/90`}>
                Plano para Consultores
              </td>
              <td className={TABLE_STYLES.td}>R$ 495,00 / mês</td>
              <td className={TABLE_STYLES.td}>
                <ul>
                  <li>Painel de Controle Master para o Consultor</li>
                  <li>
                    Gestão, consolidação e visualização das carteiras e orçamentos dos clientes
                    vinculados
                  </li>
                  <li>
                    Permissão para criar planejamentos financeiros personalizados para terceiros
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>*</strong> Para todos os planos, o USUÁRIO pode optar por parcelamento através do
        Gateway de pagamento.
      </p>
      <p>
        7.2. <strong>Regras de Fidelidade:</strong> Os planos com modalidade de contratação anual
        possuem cláusula de fidelidade de <strong>12 (doze) meses</strong>. Optando-se pela rescisão
        antecipada, seu acesso continuará ativo até o final dos 12 meses contratados, interrompendo
        apenas a renovação automática para o ano seguinte, não havendo possibilidade de reembolso de
        valores.
      </p>
      <p>
        7.3. <strong>Renovação Automática</strong>: A assinatura será renovada automaticamente ao
        final de cada período, salvo manifestação expressa de não renovação pelo{' '}
        <strong>USUÁRIO</strong>.
      </p>
      <p>
        7.4. <strong>Cancelamento e Direito de Arrependimento</strong>: Para consumidores (B2C), o{' '}
        <strong>USUÁRIO</strong> pode exercer o direito de arrependimento previsto no{' '}
        <strong>Código de Defesa do Consumidor</strong> (art. 49) no prazo de{' '}
        <strong>7 (sete) dias</strong> a contar da contratação, mediante solicitação ao canal de
        suporte. Neste caso, o valor pago será reembolsado em sua integralidade.
      </p>
      <h2>8. Do pagamento e arquitetura Stripe</h2>
      <p>
        8.1. <strong>Processamento de Pagamentos:</strong> Todas as transações financeiras são
        processadas via plataforma Stripe, que atua como gateway de pagamento e Operador de Dados
        para fins da Lei Geral de Proteção de Dados (LGPD).
      </p>
      <p>
        8.2. <strong>Segurança Transacional:</strong> A <strong>CONTRATADA</strong> utiliza a
        tecnologia de <strong>tokenização de cartões</strong>, garantindo que dados sensíveis de
        pagamento não sejam armazenados em servidores próprios, mas sim em ambiente seguro com
        certificação PCI-DSS. Para maiores informações, consulte mais informações diretamente junto
        ao gateway de pagamento através do endereço{' '}
        <a href="https://support.stripe.com/" target="_blank" rel="noopener noreferrer">
          https://support.stripe.com/
        </a>
      </p>
      <p>
        8.3. <strong>Sincronização de Assinaturas:</strong> A gestão de status de pagamento,
        renovações e cancelamentos é realizada através de <strong>webhooks</strong> (tecnologia que
        permite a comunicação automática e instantânea entre sistemas), garantindo a sincronização
        em tempo real entre o <strong>Stripe</strong> e o banco de dados da plataforma{' '}
        <strong>My Finance</strong>.
      </p>
      <h2>
        9. Da governança de dados, privacidade, segurança da informação, segurança cibernética e
        infraestrutura (AWS)
      </h2>
      <p>
        9.1. <strong>Conformidade com a LGPD</strong>: A <strong>CONTRATADA</strong> declara que o
        tratamento de dados pessoais realizado na plataforma observa rigorosamente a Lei nº
        13.709/2018 (Lei Geral de Proteção de Dados), pautando-se pelos princípios da finalidade,
        necessidade e transparência.
      </p>
      <p>
        9.2. <strong>Instrumentos de Governança:</strong> A plataforma possui e mantém atualizados
        os seguintes documentos e processos:
      </p>
      <ul>
        <li>
          <strong>Aviso de Privacidade:</strong> Informações claras ao usuário sobre a coleta de
          dados;
        </li>
        <li>
          <strong>Política de Privacidade:</strong> Diretrizes internas e externas sobre o ciclo de
          vida dos dados;
        </li>
        <li>
          <strong>RoPA (Records of Processing Activities):</strong> Registros detalhados do
          mapeamento de dados pessoais processados pela ferramenta;
        </li>
        <li>
          <strong>Política de Segurança da Informação (PSI)</strong>;
        </li>
        <li>
          <strong>Plano de Resposta a Incidentes de Segurança (PRIS)</strong>;
        </li>
        <li>demais documentos internos de governança;</li>
      </ul>
      <p>
        9.3. <strong>Encarregado de Dados (DPO):</strong> Fica designado o Sr.{' '}
        <strong>Marcelo Pereira</strong> como{' '}
        <strong>Encarregado pelo Tratamento de Dados Pessoais (DPO)</strong>, atuando como canal de
        comunicação entre a <strong>CONTRATADA</strong>, os titulares dos dados e a Agência Nacional
        de Proteção de Dados (ANPD). Os canais oficiais para exercício dos direitos dos titulares
        são o e-mail{' '}
        <a href="mailto:privacidade@appmyfinance.com.br">privacidade@appmyfinance.com.br</a> e o{' '}
        <a
          href="https://dponote.com.br/dponote/requisicao-do-titular-de-dados/333"
          target="_blank"
          rel="noopener noreferrer"
        >
          Portal de Requisição dos Titulares
        </a>
        .
      </p>
      <p>
        9.4. <strong>Controle de Acesso (IAM):</strong> Utiliza-se sistema de{' '}
        <strong>Identity and Access Management</strong> para garantir que o acesso aos dados seja
        restrito apenas a pessoas autorizadas, mediante autenticação robusta e níveis de permissão
        segregados.
      </p>
      <p>
        9.5. <strong>Infraestrutura e Criptografia</strong>: Os dados são hospedados em servidores
        AWS (Amazon Web Services) no Brasil, protegidos por criptografia AES-256 (repouso) e
        protocolos HTTPS/TLS (trânsito).
      </p>
      <p>
        9.6. <strong>Segregação Lógica (Multilocação):</strong> Especialmente para o{' '}
        <strong>Plano Consultores</strong>, a arquitetura garante a{' '}
        <strong>segregação lógica de dados</strong>, impedindo acesso cruzado não autorizado entre
        clientes de consultores diferentes.
      </p>
      <p>
        9.7. No contexto dos serviços de conexão e agregação contratados pela My Finance, a Pluggy
        trata dados pessoais em nome da My Finance e conforme as instruções aplicáveis. Essa
        descrição se limita às operações realizadas no âmbito do serviço contratado e não determina,
        por si só, o papel das instituições financeiras ou dos demais participantes do fluxo, que
        poderão atuar sob responsabilidades próprias. O tratamento de dados relacionados à conexão é
        detalhado no Aviso de Privacidade.
      </p>
      <h2>10. Do bloqueio e cancelamento de acesso</h2>
      <p>
        10.1. <strong>Suspensão por Descumprimento:</strong> O descumprimento, pelo USUÁRIO, de
        quaisquer obrigações, restrições ou condições previstas neste instrumento, tais como, mas
        não se limitando, fraude, uso ilícito, risco à segurança da plataforma, dos dados ou de
        terceiros, ensejará a suspensão imediata do acesso.
      </p>
      <p>
        10.2. <strong>Cancelamento Definitivo</strong>: Apurado o motivo da suspensão e, a critério
        da My Finance LTDA, não havendo possibilidade de sanar o descumprimento das obrigações,
        tendo em vista as condições presentes nestes Termos de Uso, ocorrerá o cancelamento
        definitivo da assinatura e da conta do USUÁRIO, sem prejuízo da cobrança de multas
        contratuais, encargos, valores em aberto e demais perdas e danos eventualmente devidos,
        observadas as disposições legais aplicáveis.
      </p>
      <p>
        10.3. <strong>Conservação e Disponibilização de Dados:</strong> O cancelamento definitivo da
        conta não implicará, de forma imediata, a eliminação integral e irreversível dos dados do{' '}
        <strong>USUÁRIO</strong>. Por liberalidade da empresa e comodidade do usuário, a{' '}
        <strong>CONTRATADA</strong> manterá o banco de dados do <strong>USUÁRIO</strong> pelo prazo
        de mais 12 (doze) meses, a contar do encerramento da relação contratual, podendo, inclusive,
        referidos dados serem tratados para fins de aprimoramento do próprio aplicativo em benesse
        aos demais usuários.
      </p>
      <h2>11. Da limitação de responsabilidade</h2>
      <p>
        11.1. <strong>Natureza da Obrigação</strong>: O <strong>USUÁRIO</strong> reconhece e aceita
        que a prestação dos serviços objeto deste contrato constitui uma obrigação de meio e não de
        resultado. A <strong>CONTRATADA</strong> compromete-se a disponibilizar a ferramenta
        tecnológica, mas não garante qualquer rentabilidade, lucro, sucesso financeiro ou precisão
        absoluta de projeções futuras decorrentes do uso da plataforma.
      </p>
      <p>
        11.2. <strong>Exclusão de Danos</strong>: Em nenhuma hipótese a <strong>CONTRATADA</strong>,
        seus diretores ou funcionários serão responsáveis perante o <strong>USUÁRIO</strong> ou
        terceiros por danos indiretos, incidentais, especiais, punitivos ou consequentes, incluindo,
        sem limitação, danos por lucros cessantes, perda de receitas, interrupção de negócios, perda
        de dados, perda de informações financeiras ou perda de chances.
      </p>
      <p>
        11.3. <strong>Teto Indenizatório</strong> (Cláusula Penal Compensatória): Na ocorrência de
        eventuais falhas técnicas ou operacionais de responsabilidade comprovadamente exclusiva da{' '}
        <strong>CONTRATADA</strong>, a responsabilidade civil total e agregada da{' '}
        <strong>CONTRATADA</strong> perante o <strong>USUÁRIO</strong> estará limitada, a título de
        cláusula penal compensatória, ao valor correspondente a 3 (três) mensalidades do plano
        efetivamente contratado e pago pelo <strong>USUÁRIO</strong> à época do evento danoso.
      </p>
      <p>
        11.4. <strong>Excludentes de Responsabilidade</strong> (Caso Fortuito e Força Maior): A{' '}
        <strong>CONTRATADA</strong> não será responsabilizada por falhas de desempenho, interrupções
        de serviço ou danos decorrentes de eventos de caso fortuito ou força maior, nos termos do
        Artigo 393 do Código Civil Brasileiro, incluindo, mas não se limitando a falhas na rede
        mundial de computadores (internet), instabilidade em serviços de nuvem (AWS) ou
        indisponibilidade de sistemas de terceiros (APIs de Instituições Financeiras e B3).
      </p>
      <h2>12. Do plano para consultores e gestão de dados de terceiros</h2>
      <p>
        12.1. <strong>Consentimento Explícito, Específico e Revogável</strong>: O acesso de um{' '}
        <strong>USUÁRIO</strong> do plano &quot;Consultores&quot; aos dados financeiros e
        patrimoniais de seus respectivos clientes finais está estritamente condicionado à obtenção
        de um consentimento inequívoco (opt-in). Este consentimento deve ser realizado
        obrigatoriamente pelo cliente final, de dentro de sua própria conta na plataforma,
        autorizando especificamente a visualização por aquele consultor. O cliente final detém o
        direito de revogar esta autorização a qualquer momento, cessando imediatamente o acesso do
        consultor aos seus dados.
      </p>
      <p>
        12.2. <strong>Segregação Lógica de Dados (Multilocação)</strong>: A{' '}
        <strong>CONTRATADA</strong> garante que a arquitetura do software utiliza mecanismos de
        segregação lógica rigorosos (multilocação), baseados em chaves estrangeiras e restrições de
        integridade no banco de dados, assegurando que um consultor jamais acesse, visualize ou
        manipule dados de clientes vinculados a outros consultores.
      </p>
      <p>
        12.3. <strong>Trilha de Auditoria e Logs de Acesso Imutáveis</strong>: A plataforma manterá
        registros de auditoria (logs) protegidos contra alteração indevida de todos os acessos
        realizados pelo consultor aos dados de seus clientes. Cada registro identificará
        obrigatoriamente:
      </p>
      <ul>
        <li>Identificação única (ID) do consultor;</li>
        <li>Data e hora exata do acesso;</li>
        <li>Identificação do cliente acessado;</li>
        <li>Natureza dos dados visualizados ou ações realizadas.</li>
      </ul>
      <p>
        12.4. <strong>Responsabilidade do Consultor</strong>: O <strong>USUÁRIO</strong> do plano
        &quot;Consultores&quot; assume a responsabilidade civil e criminal pela guarda e sigilo das
        informações de seus clientes às quais tiver acesso, comprometendo-se a utilizá-las
        exclusivamente para os fins contratados pelo seu cliente, sob pena de banimento imediato da
        plataforma e responsabilização legal.
      </p>
      <h2>13. Disposições gerais e foro</h2>
      <p>
        13.1. <strong>Canal de Comunicação e Suporte</strong>: Todas as comunicações oficiais,
        solicitações de suporte técnico ou esclarecimento de dúvidas deverão ser encaminhadas
        exclusivamente através do canal oficial de atendimento via e-mail:{' '}
        <strong>
          <a href="mailto:suporte@appmyfinance.com.br">suporte@appmyfinance.com.br</a>
        </strong>
      </p>
      <p>
        13.2. <strong>Independência das Cláusulas (Severabilidade)</strong>: Se qualquer disposição
        destes Termos de Uso for considerada inválida, ilegal ou inexequível por qualquer autoridade
        judicial ou administrativa competente, tal invalidade não afetará as demais cláusulas, que
        permanecerão em pleno vigor e efeito para todos os fins de direito.
      </p>
      <p>
        13.3. <strong>Tolerância e Não Renúncia</strong>: A tolerância ou o não exercício imediato,
        por qualquer das partes, de qualquer direito ou prerrogativa prevista nestes termos, ou a
        concordância com o atraso no cumprimento de obrigações, não constituirá novação, nem
        renúncia a tal direito, sendo considerado mera liberalidade que não impede o exercício
        futuro de tais prerrogativas.
      </p>
      <p>
        13.4. <strong>Integralidade do Acordo</strong>: O presente instrumento constitui o acordo
        integral e completo entre as partes em relação ao seu objeto, substituindo e revogando todos
        os entendimentos, propostas, comunicações, contratos ou tratativas anteriores, sejam elas
        verbais ou escritas.
      </p>
      <p>
        13.5. <strong>Cessão de Direitos e Obrigações</strong>: A <strong>CONTRATADA</strong>{' '}
        reserva-se o direito de ceder ou transferir, total ou parcialmente, os direitos e obrigações
        decorrentes deste contrato a terceiros, independentemente de anuência prévia do{' '}
        <strong>USUÁRIO</strong>, especialmente em casos de fusão, aquisição, cisão, incorporação ou
        qualquer forma de reorganização societária.
      </p>
      <p>
        13.6. <strong>Alterações dos Termos</strong>: Estes termos podem ser atualizados
        periodicamente pela <strong>CONTRATADA</strong> para refletir melhorias técnicas ou
        adequações legais. O uso continuado da plataforma após a notificação de atualização implica
        na aceitação plena das novas condições.
      </p>
      <p>
        13.7. <strong>Lei Aplicável</strong>: Este contrato e a relação entre as partes serão
        regidos, interpretados e executados de acordo com a Legislação Brasileira vigente.
      </p>
      <p>
        13.8. <strong>Foro</strong>: Fica eleito o Foro Central da Comarca de São Paulo/SP para
        dirimir quaisquer controvérsias, dúvidas ou litígios oriundos deste instrumento, ressalvado
        o foro do domicílio do consumidor, quando aplicável, com expressa renúncia a qualquer outro
        foro, por mais privilegiado que seja.
      </p>
    </LegalArticle>
  );
}
