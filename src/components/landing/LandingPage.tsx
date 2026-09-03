import Image from 'next/image';
import { Outfit, Titillium_Web } from 'next/font/google';
import LandingHeader from './LandingHeader';
import LandingTour from './LandingTour';
import LandingLogo from './LandingLogo';
import { Arrow, Check } from './icons';
import './landing.css';

// Display: Titillium Web (a mesma das capas da trilha). Corpo: Outfit (a mesma
// do app). Self-hosted pelo next/font — o CSP só permite font-src 'self'.
const titillium = Titillium_Web({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-td',
  display: 'swap',
});
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-tb',
  display: 'swap',
});

const FUNCIONALIDADES = [
  {
    titulo: 'Fluxo de caixa e orçamento',
    texto:
      'Planilha anual completa dentro do app, com categorias, prioridades e saldo mês a mês. Importe a sua planilha em um clique.',
    icone: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 4v16" />
      </svg>
    ),
  },
  {
    titulo: 'Zerando dívidas',
    texto: 'SAC, PRICE e rotativos com CET real. Acompanhe o saldo devedor cair parcela a parcela.',
    icone: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18M8 15l4-3 4 3" />
      </svg>
    ),
  },
  {
    titulo: 'Saúde financeira',
    texto:
      'Reserva, patrimônio ideal e independência financeira medidos automaticamente, com balanço patrimonial.',
    icone: (
      <svg viewBox="0 0 24 24">
        <path d="M12 21C7 17 4 13.5 4 9.5A4 4 0 0 1 12 7a4 4 0 0 1 8 2.5c0 4-3 7.5-8 11.5z" />
        <path d="M7 12h3l2-3 2 5 1.5-2H18" />
      </svg>
    ),
  },
  {
    titulo: 'Carteira consolidada',
    texto:
      'Renda fixa, fundos, FIIs, ações, stocks, REITs, ETFs, cripto, previdência e opções em uma única visão.',
    icone: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 8 8h-8z" />
      </svg>
    ),
  },
  {
    titulo: 'Rentabilidade de verdade',
    texto:
      'TWR e MWR comparados com CDI, IBOV, IPCA e poupança. Saiba se você ganha do mercado ou só da inflação.',
    icone: (
      <svg viewBox="0 0 24 24">
        <path d="M4 18L10 11l4 4 6-8" />
        <path d="M15 7h5v5" />
      </svg>
    ),
  },
  {
    titulo: 'Proventos e agenda',
    texto:
      'Dividendos por ativo, yield on cost, média mensal e agenda do que ainda vai cair na conta.',
    icone: (
      <svg viewBox="0 0 24 24">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 9h16M8 3v4M16 3v4M9 14h2M13 14h2" />
      </svg>
    ),
  },
  {
    titulo: 'Aposentadoria',
    texto:
      'Simule idade, aportes, inflação e rentabilidade e veja quanto terá — e por quantos anos a renda dura.',
    icone: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    titulo: 'Meus sonhos',
    texto:
      'Casa, carro, viagem, educação dos filhos: metas com prazo, aporte mensal e progresso, que cabem na sua sobra de caixa.',
    icone: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6L3.4 9.3l6-.8z" />
      </svg>
    ),
  },
];

const PASSOS = [
  {
    titulo: 'Crie sua conta',
    texto: 'Cadastro em 2 minutos. Escolha seu plano e entre com o painel pronto para usar.',
  },
  {
    titulo: 'Importe ou lance seus dados',
    texto:
      'Traga sua planilha de gastos, cadastre dívidas e investimentos — o app organiza tudo por categoria.',
  },
  {
    titulo: 'Acompanhe e evolua',
    texto:
      'Veja rentabilidade, proventos e indicadores atualizados — e siga a trilha de educação para ir mais longe.',
  },
];

const PLANOS = [
  {
    nome: 'Standard',
    quem: 'Para organizar a casa',
    preco: 'R$ 19,90',
    destaque: false,
    tag: null,
    itens: [
      'Fluxo de caixa e orçamento com importação de planilha',
      'Gestão de dívidas SAC/PRICE',
      'Saúde financeira e balanço patrimonial',
      'Carteira consolidada',
      'Trilha de educação: módulos iniciais',
    ],
    cta: 'Assinar Standard',
  },
  {
    nome: 'Gold',
    quem: 'Para quem investe',
    preco: 'R$ 39,90',
    destaque: true,
    tag: 'MAIS ESCOLHIDO',
    itens: [
      'Tudo do Standard',
      'Rentabilidade TWR/MWR vs. CDI, IBOV e IPCA',
      'Proventos, agenda e yield on cost',
      'Planejamento de sonhos e reserva de emergência',
      'Trilha de educação completa (9 módulos)',
    ],
    cta: 'Assinar Gold',
  },
  {
    nome: 'Premium',
    quem: 'Para construir patrimônio',
    preco: 'R$ 99,90',
    destaque: false,
    tag: 'HUB COMPLETO',
    itens: [
      'Tudo do Gold',
      'Risco × retorno, Sharpe, beta e sensibilidade',
      'Cobertura FGC e posição para o Imposto de Renda',
      'Planejamento de aposentadoria com cenários',
      'Relatórios completos e histórico ilimitado',
    ],
    cta: 'Assinar Premium',
  },
];

const FAQ = [
  {
    p: 'Preciso entender de investimentos para usar o My Finance?',
    r: 'Não. O app foi feito para quem está começando: você organiza primeiro o orçamento e as dívidas, e a trilha de educação ensina cada passo até o primeiro investimento. Quem já investe encontra as análises avançadas (TWR, Sharpe, beta) no mesmo lugar.',
  },
  {
    p: 'Já uso uma planilha. Vou perder meu histórico?',
    r: 'Não — o Fluxo de Caixa tem importação de planilha. Você traz seus lançamentos e continua de onde parou, agora com gráficos, indicadores e alertas.',
  },
  {
    p: 'Meus dados financeiros ficam seguros?',
    r: 'Seus dados são seus. Usamos conexão criptografada e você não precisa informar senhas de banco ou corretora para usar o app. Você pode exportar ou excluir suas informações quando quiser.',
  },
  {
    p: 'Qual a diferença para um consolidador de investimentos?',
    r: 'Consolidadores mostram só a carteira. O My Finance é um hub de finanças pessoais: além da carteira e das análises, você controla orçamento, dívidas, saúde financeira, aposentadoria e sonhos — e aprende com a trilha de educação. É a única ferramenta que você precisa abrir.',
  },
  {
    p: 'Funciona no celular?',
    r: 'Sim. O My Finance é um app web responsivo: funciona no navegador do celular, tablet e computador, com o mesmo login e os dados sempre sincronizados.',
  },
  {
    p: 'Posso cancelar quando quiser?',
    r: 'Pode. Cancele a qualquer momento pelo próprio app. Seus dados continuam disponíveis para exportação.',
  },
];

const CAPAS = [
  { src: '/site/m01.jpg', alt: 'Módulo 01 — Boas-vindas' },
  { src: '/site/m03.jpg', alt: 'Módulo 03 — Zerando Dívidas' },
  { src: '/site/m04.jpg', alt: 'Módulo 04 — Orçamento' },
  { src: '/site/m08.jpg', alt: 'Módulo 08 — Ações' },
];

export default function LandingPage() {
  return (
    <div className={`lp ${titillium.variable} ${outfit.variable}`}>
      <LandingHeader />

      <section className="hero">
        <div className="wrap grid">
          <div>
            <div className="eyebrow">O hub de finanças pessoais</div>
            <h1>
              Toda a sua vida financeira <em>em um só lugar.</em>
            </h1>
            <p className="lead">
              Orçamento, dívidas, investimentos, aposentadoria e sonhos — organizados em um único
              hub, com análises de nível profissional e um curso de educação financeira incluído.
            </p>
            <div className="ctas">
              <a className="btn btn-p" href="/signup">
                Criar minha conta <Arrow />
              </a>
              <a className="btn btn-s" href="#funcionalidades">
                Ver funcionalidades
              </a>
            </div>
            <div className="note">
              <span>
                <Check /> Planos a partir de R$ 19,90/mês
              </span>
              <span>
                <Check /> Cancele quando quiser
              </span>
            </div>
          </div>
          <div className="stage">
            <div className="frame">
              <div className="bar">
                <i />
                <i />
                <i />
                <span>appmyfinance.com.br/carteira</span>
              </div>
              <Image
                src="/site/carteira.jpg"
                alt="Painel da carteira de investimentos no My Finance"
                width={1200}
                height={850}
                sizes="(max-width: 980px) 100vw, 560px"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <div className="facts">
        <div className="wrap">
          <div>
            <b className="num">12</b>classes de ativos consolidadas
          </div>
          <div>
            <b>
              TWR<span className="u">·</span>MWR
            </b>
            rentabilidade real vs. CDI, IBOV e IPCA
          </div>
          <div>
            <b>FGC</b>cobertura calculada automaticamente
          </div>
          <div>
            <b className="num">9</b>módulos de curso incluídos
          </div>
        </div>
      </div>

      <section className="sec" id="funcionalidades">
        <div className="wrap">
          <div className="sec-head center">
            <div className="eyebrow">Funcionalidades</div>
            <h2>Simples. Completo. Seu.</h2>
            <p>
              Consolidadores só olham para os seus investimentos. O My Finance é um hub: cuida da
              sua vida financeira inteira — da conta do mês ao patrimônio de longo prazo.
            </p>
          </div>
          <div className="feat">
            {FUNCIONALIDADES.map((f) => (
              <div className="card" key={f.titulo}>
                <div className="ic">{f.icone}</div>
                <h3>{f.titulo}</h3>
                <p>{f.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="sec"
        id="analises"
        style={{
          background: 'var(--bg-2)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div className="wrap">
          <div className="sec-head">
            <div className="eyebrow">Por dentro do app</div>
            <h2>Esteja sempre à frente do mercado</h2>
            <p>
              As mesmas métricas que gestores usam, traduzidas para você: risco, retorno e proteção
              da sua carteira em painéis claros.
            </p>
          </div>
          <LandingTour />
        </div>
      </section>

      <section className="sec edu" id="educacao">
        <div className="wrap split">
          <div>
            <div className="eyebrow">Educação financeira incluída</div>
            <h2>Não é só um app. É um método.</h2>
            <p>
              A trilha <b style={{ color: '#fff' }}>Educação Financeira do Zero</b> vem dentro do My
              Finance: 9 módulos em vídeo que ensinam a usar cada ferramenta e a tomar decisões
              melhores — da planilha ao primeiro investimento em ações e fundos imobiliários.
            </p>
            <ol>
              <li>Boas-vindas</li>
              <li>Planilha</li>
              <li>Zerando dívidas</li>
              <li>Orçamento</li>
              <li>Planejamento</li>
              <li>Saúde financeira</li>
              <li>Renda fixa</li>
              <li>Ações</li>
              <li>Fundos imobiliários</li>
            </ol>
            <a className="btn btn-w" href="/signup" style={{ marginTop: 30 }}>
              Quero aprender e organizar <Arrow />
            </a>
          </div>
          <div className="covers">
            {CAPAS.map((c) => (
              <Image key={c.src} src={c.src} alt={c.alt} width={720} height={405} />
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head center">
            <div className="eyebrow">Pra começar é simples</div>
            <h2>Em 10 minutos você já tem o retrato da sua vida financeira</h2>
          </div>
          <div className="steps">
            {PASSOS.map((p, i) => (
              <div className="step" key={p.titulo}>
                <div className="n">0{i + 1}</div>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="sec"
        id="planos"
        style={{
          background: 'var(--bg-2)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div className="wrap">
          <div className="sec-head center">
            <div className="eyebrow">Planos</div>
            <h2>Um plano para cada momento da sua jornada</h2>
            <p>Assinatura anual, sem letras miúdas. Cancele quando quiser.</p>
          </div>
          <div className="plans">
            {PLANOS.map((pl) => (
              <div className={`plan${pl.destaque ? ' hi' : ''}`} key={pl.nome}>
                {pl.tag && <div className="tag">{pl.tag}</div>}
                <h3>{pl.nome}</h3>
                <div className="who">{pl.quem}</div>
                <div className="price num">
                  {pl.preco}
                  <small>/mês</small>
                </div>
                <div className="per">na assinatura anual</div>
                <ul>
                  {pl.itens.map((it, i) => (
                    <li key={it}>
                      <Check />
                      {i === 0 && pl.nome !== 'Standard' ? <b>{it}</b> : it}
                    </li>
                  ))}
                </ul>
                <a className={`btn ${pl.destaque ? 'btn-p' : 'btn-s'}`} href="/signup">
                  {pl.cta}
                </a>
              </div>
            ))}
          </div>
          <p className="plans-note">
            Distribuição de funcionalidades entre os planos é uma sugestão — ajuste conforme a
            definição final.
          </p>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap">
          <div className="sec-head center">
            <div className="eyebrow">Dúvidas frequentes</div>
            <h2>O que você precisa saber antes de começar</h2>
          </div>
          <div className="faq">
            {FAQ.map((f, i) => (
              <details key={f.p} open={i === 0}>
                <summary>{f.p}</summary>
                <p>{f.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="final">
        <div className="wrap">
          <h2>Escolha ter controle. Escolha ser rico.</h2>
          <p>
            Crie sua conta e tenha, ainda hoje, o retrato completo da sua vida financeira em um só
            hub.
          </p>
          <a className="btn btn-w" href="/signup">
            Criar minha conta <Arrow />
          </a>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="top">
            <div>
              <span className="logo">
                <LandingLogo />
              </span>
              <p style={{ maxWidth: '32ch' }}>
                O hub de finanças pessoais: orçamento, dívidas, investimentos, aposentadoria, sonhos
                e educação em um só lugar.
              </p>
            </div>
            <div>
              <h5>Produto</h5>
              <ul>
                <li>
                  <a href="#funcionalidades">Funcionalidades</a>
                </li>
                <li>
                  <a href="#analises">Análises</a>
                </li>
                <li>
                  <a href="#educacao">Educação</a>
                </li>
                <li>
                  <a href="#planos">Planos</a>
                </li>
              </ul>
            </div>
            <div>
              <h5>Conta</h5>
              <ul>
                <li>
                  <a href="/signin">Entrar</a>
                </li>
                <li>
                  <a href="/signup">Criar conta</a>
                </li>
                <li>
                  <a href="#faq">Dúvidas frequentes</a>
                </li>
              </ul>
            </div>
            <div>
              <h5>Legal</h5>
              <ul>
                <li>
                  <a href="/termos-de-uso">Termos de uso</a>
                </li>
                <li>
                  <a href="/politica-de-privacidade">Política de privacidade</a>
                </li>
                <li>
                  <a href="mailto:contato@appmyfinance.com.br">Contato</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="legal">
            <span>© 2026 My Finance · Todos os direitos reservados</span>
            <span>
              As informações do app têm caráter educativo e não constituem recomendação de
              investimento.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
