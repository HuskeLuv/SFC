'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { Check } from './icons';

interface Modulo {
  id: string;
  nome: string;
  icone: ReactNode;
  url: string;
  imagem: { src: string; alt: string; width: number; height: number };
  titulo: string;
  texto: string;
  beneficios?: string[];
}

// Textos do original do Pedro (sitemyfinance.html, set/2026).
const MODULOS: Modulo[] = [
  {
    id: 'fluxo',
    nome: 'Fluxo de caixa e orçamento',
    icone: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 4v16" />
      </svg>
    ),
    url: 'appmyfinance.com.br/fluxodecaixa',
    imagem: {
      src: '/site/fluxo.jpg',
      alt: 'Planilha de fluxo de caixa anual com entradas fixas e variáveis por mês',
      width: 1200,
      height: 795,
    },
    titulo: 'Fluxo de caixa e orçamento',
    texto:
      'Planilha anual completa dentro do app, com categorias, prioridades e saldo mês a mês. Importe a sua planilha em um clique.',
  },
  {
    id: 'dividas',
    nome: 'Zerando dívidas',
    icone: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18M8 15l4-3 4 3" />
      </svg>
    ),
    url: 'appmyfinance.com.br/dividas',
    imagem: {
      src: '/site/dividas.jpg',
      alt: 'Painel de dívidas com total devido, parcelas do mês e tabela por sistema de amortização',
      width: 1200,
      height: 523,
    },
    titulo: 'Zerando dívidas',
    texto: 'SAC, PRICE e rotativos com CET real. Acompanhe o saldo devedor cair parcela a parcela.',
  },
  {
    id: 'saude',
    nome: 'Saúde financeira',
    icone: (
      <svg viewBox="0 0 24 24">
        <path d="M3 12h4l2-5 4 10 2-5h6" />
      </svg>
    ),
    url: 'appmyfinance.com.br/saude-financeira',
    imagem: {
      src: '/site/saude.jpg',
      alt: 'Indicadores de saúde financeira e balanço patrimonial',
      width: 1200,
      height: 1023,
    },
    titulo: 'Veja sua independência financeira acontecendo',
    texto:
      'Quatro indicadores mostram, em porcentagem, o quão perto você está de cada meta — e o que falta para chegar lá. Sem planilhas mágicas, sem achismo.',
    beneficios: [
      'Reserva de emergência (meses de gasto cobertos)',
      'Patrimônio de segurança e patrimônio ideal para a sua idade',
      'Independência financeira com ganho real (descontada a inflação)',
    ],
  },
  {
    id: 'carteira',
    nome: 'Carteira consolidada',
    icone: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 8 8h-8z" />
      </svg>
    ),
    url: 'appmyfinance.com.br/carteira',
    imagem: {
      src: '/site/carteira.jpg',
      alt: 'Painel da carteira de investimentos no My Finance',
      width: 1200,
      height: 850,
    },
    titulo: 'Carteira consolidada',
    texto:
      'Renda fixa, fundos, FIIs, ações, stocks, REITs, ETFs, cripto, previdência e opções em uma única visão.',
  },
  {
    id: 'analise',
    nome: 'Análises profissionais',
    icone: (
      <svg viewBox="0 0 24 24">
        <path d="M4 18l6-7 4 4 6-8" />
        <path d="M15 7h5v5" />
      </svg>
    ),
    url: 'appmyfinance.com.br/carteira · Análise',
    imagem: {
      src: '/site/analise.jpg',
      alt: 'Rentabilidade TWR da carteira comparada com IBOV, CDI, IPCA e poupança',
      width: 1200,
      height: 795,
    },
    titulo: 'Esteja sempre à frente do mercado',
    texto:
      'As mesmas métricas que gestores usam, traduzidas para você: risco, retorno e proteção da sua carteira em painéis claros.',
    beneficios: [
      'Risco × Retorno — volatilidade, índice Sharpe e beta de cada ativo.',
      'Sensibilidade à carteira — quais ativos mais contribuem para o seu risco.',
      'Cobertura FGC — quanto do seu dinheiro está protegido, por instituição.',
      'Imposto de Renda — posição consolidada para declarar sem dor de cabeça.',
    ],
  },
  {
    id: 'aposentadoria',
    nome: 'Aposentadoria',
    icone: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    url: 'appmyfinance.com.br/planejamento-financeiro',
    imagem: {
      src: '/site/aposentadoria.jpg',
      alt: 'Simulador de aposentadoria com projeção de patrimônio',
      width: 1200,
      height: 976,
    },
    titulo: 'Descubra quanto você terá aos 65 — e por quantos anos dura',
    texto:
      'Ajuste idade, aportes, rentabilidade e inflação com sliders e veja a projeção mudar na hora, em reais de hoje. O app usa o CDI, o IPCA e a rentabilidade da sua própria carteira como referência.',
    beneficios: [
      'Patrimônio acumulado, saque preservando ou consumindo o patrimônio',
      '"O que isso significa?" — análise do cenário em linguagem simples',
      'Acompanhamento mês a mês: planejado × realizado',
    ],
  },
  {
    id: 'sonhos',
    nome: 'Meus sonhos',
    icone: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6L3.4 9.3l6-.8z" />
      </svg>
    ),
    url: 'appmyfinance.com.br/planejamento-financeiro · Meus Sonhos',
    imagem: {
      src: '/site/sonhos.jpg',
      alt: 'Planejamento de sonhos com metas e progresso',
      width: 1200,
      height: 811,
    },
    titulo: 'Transforme sonhos em metas com data para acontecer',
    texto:
      'Casa própria, troca de carro, viagem, educação dos filhos: cada objetivo ganha prazo, aporte mensal e barra de progresso — e o app confere se os aportes cabem na sua sobra de caixa.',
    beneficios: [
      'Reserva de emergência com meta de 3, 6 ou 12 meses de despesas',
      'Objetivos de curto, médio e longo prazo com prioridade',
      'Patrimônio alocado por sonho e progresso médio ponderado',
    ],
  },
];

export default function LandingTour() {
  const [ativo, setAtivo] = useState(0);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? i + 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? i - 1
          : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + MODULOS.length) % MODULOS.length;
    setAtivo(j);
    document.getElementById(`lp-tab-${MODULOS[j].id}`)?.focus();
  };

  return (
    <div className="tour">
      <div className="tour-list" role="tablist" aria-label="Módulos do My Finance">
        {MODULOS.map((m, i) => (
          <button
            key={m.id}
            type="button"
            id={`lp-tab-${m.id}`}
            className="tour-btn"
            role="tab"
            aria-selected={i === ativo}
            aria-controls={`lp-panel-${m.id}`}
            tabIndex={i === ativo ? 0 : -1}
            onClick={() => setAtivo(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="ic">{m.icone}</span>
            <span>
              <h3>{m.nome}</h3>
            </span>
          </button>
        ))}
      </div>

      <div className="tour-stage">
        {MODULOS.map((m, i) => (
          <div
            key={m.id}
            id={`lp-panel-${m.id}`}
            className={`tour-panel${i === ativo ? ' on' : ''}`}
            role="tabpanel"
            aria-labelledby={`lp-tab-${m.id}`}
            hidden={i !== ativo}
          >
            <div className="frame">
              <div className="bar">
                <i />
                <i />
                <i />
                <span>{m.url}</span>
              </div>
              <Image
                src={m.imagem.src}
                alt={m.imagem.alt}
                width={m.imagem.width}
                height={m.imagem.height}
                sizes="(max-width: 980px) 100vw, 820px"
                priority={i === 0}
              />
            </div>
            <div className={`tour-copy${m.beneficios ? '' : ' solo'}`}>
              <div>
                <h3>{m.titulo}</h3>
                <p>{m.texto}</p>
              </div>
              {m.beneficios && (
                <ul>
                  {m.beneficios.map((b) => (
                    <li key={b}>
                      <Check />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
