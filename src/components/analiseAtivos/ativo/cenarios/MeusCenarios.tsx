'use client';

/**
 * Valuation · Meus cenários (Bloco D, fatia B). Calculadora com as premissas do usuário:
 * entradas (300px) + resultados; abaixo de 900px de container as entradas vão para cima em 2
 * colunas, abaixo de 560px em 1. Tabela de métodos no computador, cartões no celular; barras na
 * mesma escala; Meta de renda (FII); Sua posição; barra de salvamento; rodapé LITERAL
 * (RODAPE_CENARIOS = TEXTOS_ANALISE.rodapeValuation, decisão 14), sempre visível.
 *
 * Consultor agindo (decisão 7): a API não manda o salvo; a calculadora funciona em rascunho com a
 * posição do CLIENTE (overlay da Carteira) e a caixa "Os cenários salvos são pessoais…".
 * Restaurar (decisão 13): sem confirmação; DELETE + padrão + aviso com "Desfazer" (5 s), que
 * regrava o cenário anterior.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import CartaoAnalise from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import BarraSalvamento, {
  ToastCenarios,
  type StatusSalvamento,
  type ToastCenariosDados,
} from '@/components/analiseAtivos/ativo/cenarios/BarraSalvamento';
import BarrasResultados from '@/components/analiseAtivos/ativo/cenarios/BarrasResultados';
import BlocoMetaRenda from '@/components/analiseAtivos/ativo/cenarios/BlocoMetaRenda';
import FormPremissas from '@/components/analiseAtivos/ativo/cenarios/FormPremissas';
import LinhaSuaPosicao from '@/components/analiseAtivos/ativo/cenarios/LinhaSuaPosicao';
import TabelaMetodos, { reais } from '@/components/analiseAtivos/ativo/cenarios/TabelaMetodos';
import {
  snapshotPadrao,
  useEstadoCenario,
  type SnapshotCenario,
} from '@/components/analiseAtivos/ativo/cenarios/useEstadoCenario';
import { useNaCarteiraAtivo } from '@/components/analiseAtivos/ativo/usuario/useNaCarteiraAtivo';
import { useApagarCenario, useCenarios, useSalvarCenario } from '@/hooks/useAnaliseAtivosBlocoD';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { RODAPE_CENARIOS, TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type { CenarioPutBody, CenariosResposta } from '@/types/analiseAtivosBlocoD';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const T = TEXTOS_CENARIOS;
const ROTA_PLANEJAMENTO = '/planejamento-financeiro';

interface Props {
  ticker: string;
  classe: ClasseQuadro;
  /** SeletorNivel no cabeçalho do card */
  cabecalhoExtra?: ReactNode;
}

function corpoDoSalvo(r: CenariosResposta): CenarioPutBody | null {
  if (!r.salvo) return null;
  return {
    classe: r.classe,
    premissas: r.salvo.premissas,
    dados: r.salvo.dadosEditados ?? {},
  } as CenarioPutBody;
}

function Calculadora({
  r,
  ticker,
  classe,
}: {
  r: CenariosResposta;
  ticker: string;
  classe: ClasseQuadro;
}) {
  const celular = useIsBelowLg();
  const naCarteira = useNaCarteiraAtivo(ticker, classe);
  const posicao = useMemo(() => {
    if (naCarteira.status !== 'posicao') return null;
    const quantidade = naCarteira.linha?.quantidade ?? naCarteira.quantidade ?? 0;
    return quantidade > 0 ? { pm: naCarteira.linha?.precoAquisicao ?? null, quantidade } : null;
  }, [naCarteira.status, naCarteira.linha, naCarteira.quantidade]);
  const estado = useEstadoCenario(r, posicao);
  const salvar = useSalvarCenario(ticker);
  const apagar = useApagarCenario(ticker);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [toast, setToast] = useState<ToastCenariosDados | null>(null);
  const consultor = r.motivoSemSalvar === 'consultor' || !r.podeSalvar;
  const { saida } = estado;

  const corpo = estado.corpo();
  const camposInvalidos = !corpo.ok;

  const status: StatusSalvamento = salvar.isPending
    ? 'salvando'
    : salvar.isError && estado.sujo
      ? 'erro'
      : estado.sujo
        ? 'naoSalvo'
        : r.salvo
          ? 'salvo'
          : 'padrao';
  const mensagemErro =
    salvar.error && (salvar.error as { status?: number }).status === 409
      ? salvar.error.message
      : null;

  const onSalvar = useCallback(() => {
    setTentouSalvar(true);
    const c = estado.corpo();
    if (!c.ok) return;
    const snap = estado.snap;
    salvar.mutate(c.corpo, {
      onSuccess: () => {
        estado.aplicar(snap, true);
        setTentouSalvar(false);
      },
    });
  }, [estado, salvar]);

  const onRestaurar = useCallback(() => {
    const anteriorSnap: SnapshotCenario = estado.snap;
    const anteriorRef = estado.referencia;
    const corpoAnterior = corpoDoSalvo(r);
    const padrao = snapshotPadrao(r);
    const concluir = () => {
      estado.aplicar(padrao, true);
      setTentouSalvar(false);
      salvar.reset();
      setToast({
        id: Date.now(),
        mensagem: T.salvamento.restaurado,
        desfazer: () => {
          if (corpoAnterior) {
            salvar.mutate(corpoAnterior, {
              onSuccess: () => {
                estado.aplicar(anteriorRef, true);
                estado.aplicar(anteriorSnap, false);
              },
            });
          } else {
            estado.aplicar(anteriorRef, true);
            estado.aplicar(anteriorSnap, false);
          }
        },
      });
    };
    if (r.salvo) {
      apagar.mutate(undefined, {
        onSuccess: concluir,
        onError: () => setToast({ id: Date.now(), mensagem: T.salvamento.erroRestaurar }),
      });
    } else {
      concluir();
    }
  }, [apagar, estado, r, salvar]);

  const live = saida.linhas
    .filter((l) => l.comMargem !== null)
    .map((l) =>
      formatarTexto(T.resultados.anuncio, { metodo: l.rotulo, valor: reais(l.comMargem) }),
    )
    .join('; ');
  const lpaNegativo =
    r.classe === 'acao' && typeof saida.efetivos.lpa === 'number' && saida.efetivos.lpa <= 0;

  return (
    <div className="@container flex min-w-0 flex-col gap-4" data-meus-cenarios={r.classe}>
      {consultor ? (
        <div
          className="flex items-start gap-2 rounded-[10px] bg-[#396CAA]/10 px-3 py-2.5 text-[13.5px] text-gray-700 dark:bg-[#6E9DC4]/15 dark:text-gray-200"
          data-cenarios-consultor=""
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#396CAA] dark:text-[#6E9DC4]"
          >
            <rect
              x="5"
              y="10.5"
              width="14"
              height="9.5"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
          <span>{T.consultor}</span>
        </div>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-5 @min-[900px]:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-gray-100 pb-4 @min-[900px]:border-r @min-[900px]:border-b-0 @min-[900px]:pr-5 @min-[900px]:pb-0 dark:border-gray-800">
          <FormPremissas r={r} estado={estado} />
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <TabelaMetodos
            linhas={saida.linhas}
            cotacao={saida.barras.cotacao}
            margemPct={estado.snap.margemPct}
            celular={celular}
          />
          <BarrasResultados
            barras={saida.barras}
            nenhumResultado={saida.nenhumResultado}
            explicacaoAcao={lpaNegativo}
          />
          {r.classe === 'fii' ? (
            <BlocoMetaRenda
              ticker={ticker}
              meta={saida.metaRenda}
              temPosicao={!!posicao}
              consultor={consultor}
              onCriado={(mensagem) =>
                setToast({
                  id: Date.now(),
                  mensagem,
                  link: { rotulo: T.objetivo.abrirPlanejamento, href: ROTA_PLANEJAMENTO },
                })
              }
            />
          ) : null}
          <LinhaSuaPosicao
            posicao={saida.suaPosicao}
            classe={r.classe}
            consultor={consultor}
            carregando={naCarteira.status === 'carregando'}
          />
          <p className="sr-only" aria-live="polite">
            {live}
          </p>
        </div>
      </div>
      <BarraSalvamento
        podeSalvar={!consultor}
        status={status}
        salvoEm={r.salvo?.atualizadoEm ?? null}
        mensagemErro={mensagemErro}
        camposInvalidos={tentouSalvar && camposInvalidos}
        mostrarRestaurar={!!r.salvo || !estado.ehPadrao}
        onSalvar={onSalvar}
        onRestaurar={onRestaurar}
      />
      <ToastCenarios toast={toast} onFechar={() => setToast(null)} />
    </div>
  );
}

export default function MeusCenarios({ ticker, classe, cabecalhoExtra }: Props) {
  const q = useCenarios(ticker);
  return (
    <CartaoAnalise
      id={`valuation-${ticker}`}
      titulo={T.titulo}
      sub={T.sub.cenarios}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={520}
      acao={cabecalhoExtra}
    >
      {q.data ? (
        <Calculadora key={`${q.data.ticker}`} r={q.data} ticker={ticker} classe={classe} />
      ) : null}
      <p
        className="rounded-[10px] border border-gray-100 bg-gray-50 px-3 py-2.5 text-[12.5px] leading-normal text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
        data-rodape-cenarios=""
      >
        {RODAPE_CENARIOS}
      </p>
    </CartaoAnalise>
  );
}
