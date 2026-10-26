'use client';

import { useEffect, useState } from 'react';
import { useCashflowYear } from '@/context/CashflowYearContext';
import { useOrcamentoV2, type UseOrcamentoV2 } from '@/hooks/useOrcamentoV2';
import {
  useOrcamentoV2Estrutura,
  type UseOrcamentoV2Estrutura,
} from '@/hooks/useOrcamentoV2Estrutura';
import { useStableIsBelowLg } from '@/hooks/useStableIsBelowLg';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { FonteOrcamento, OrcamentoV2Response, VisaoOrcamento } from '@/types/orcamentoV2';
import AvisoGeral from './AvisoGeral';
import CopiarMes from './CopiarMes';
import KpisOrcamento from './KpisOrcamento';
import OrcamentoV2Moldura from './OrcamentoV2Moldura';
import OrcamentoV2Tabela from './OrcamentoV2Tabela';
import { plural } from './apresentacao';

/** Mês aberto por padrão (1–12): o corrente no ano corrente; dezembro no passado; janeiro no futuro. */
function mesPadrao(ano: number): number {
  const hoje = new Date();
  if (ano === hoje.getFullYear()) return hoje.getMonth() + 1;
  return ano < hoje.getFullYear() ? 12 : 1;
}

/** Texto de referência à direita dos controles (spec §4.1, Q7, Q18). */
export function textoReferencia(data: OrcamentoV2Response): string {
  const { referencia: r, fonte, visao } = data;
  const mm = String(data.mes).padStart(2, '0');
  const dd = String(r.dia || r.diasNoMes).padStart(2, '0');
  if (visao === 'ano') {
    return r.fase === 'futuro'
      ? `Acumulado de janeiro a ${mm}/${data.ano}`
      : `Acumulado de janeiro até ${dd}/${mm}`;
  }
  if (r.fase === 'corrente') {
    const restantes = r.diasNoMes - r.dia;
    return `${fonte === 'lancado' ? 'Lançado' : 'Realizado'} até ${dd}/${mm} · ${plural(
      restantes,
      'dia para fechar o mês',
      'dias para fechar o mês',
    )}`;
  }
  if (r.fase === 'passado') return `Mês fechado em ${dd}/${mm}`;
  return fonte === 'lancado'
    ? 'Mês futuro: mostra o previsto no Fluxo de Caixa'
    : 'Mês futuro: ainda sem realizado';
}

/** Esqueleto do Orçamento v2 (KPIs + tabela), também usado pela página enquanto o acesso carrega. */
export function EsqueletoOrcamentoV2() {
  const bloco = 'rounded-xl bg-gray-200 motion-safe:animate-pulse dark:bg-gray-800';
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando orçamento">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 min-[1180px]:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`h-24 ${bloco}`} />
        ))}
      </div>
      <div className="space-y-2">
        <div className={`h-10 ${bloco}`} />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`h-9 ${bloco} opacity-70`} />
        ))}
      </div>
    </div>
  );
}

/** Estado e ações comuns às duas apresentações (tabela no desktop, cartões no celular). */
export interface ConteudoOrcamentoV2Props {
  data: OrcamentoV2Response | null;
  loading: boolean;
  error: string | null;
  ano: number;
  /** 1–12. */
  mes: number;
  onMesChange: (mes: number) => void;
  visao: VisaoOrcamento;
  onVisaoChange: (visao: VisaoOrcamento) => void;
  fonte: FonteOrcamento;
  onFonteChange: (fonte: FonteOrcamento) => void;
  orcamento: UseOrcamentoV2;
  estrutura: UseOrcamentoV2Estrutura;
}

/**
 * Abaixo de lg: ponto de troca da PR 11 — vira `<OrcamentoV2Cartoes {...props} />` (cartões
 * mínimos do celular). Até lá, só os KPIs e um aviso: a tabela de 860 px nunca aparece no celular
 * (desenho técnico §8) e ninguém é ativado antes da E1 completa.
 */
export function OrcamentoV2Celular({ data, loading, error }: ConteudoOrcamentoV2Props) {
  if (loading) return <EsqueletoOrcamentoV2 />;
  if (error || !data) {
    return (
      <p role="alert" className={`py-8 text-center text-sm ${SELO_TEXTO.estourou}`}>
        {error ?? 'Erro ao carregar o orçamento.'}
      </p>
    );
  }
  return (
    <div className="space-y-4" data-mf-orcamento-v2-celular="">
      <KpisOrcamento data={data} />
      <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
        A edição do orçamento por subcategoria no celular chega na próxima versão. Use uma tela
        maior para editar.
      </p>
    </div>
  );
}

type Aviso = { tipo: 'ok' | 'erro'; texto: string };

/**
 * Orçamento v2 (ticket 86e3v8p3u, desenho técnico §8, PR 10): só para `liberada && ativado` (a
 * página decide). Decide a apresentação com o mesmo `useStableIsBelowLg` da página: abaixo de lg
 * os cartões do celular; acima, a moldura da aba atual (D10) com os KPIs e a tabela categoria ›
 * subcategoria. Status, ritmo e totais vêm prontos do GET v2; as escritas passam pelos hooks
 * (`useOrcamentoV2` otimista + `useOrcamentoV2Estrutura`).
 */
export default function OrcamentoV2Section() {
  const { year: ano } = useCashflowYear();
  const isBelowLg = useStableIsBelowLg();
  const [mes, setMes] = useState(() => mesPadrao(ano));
  const [visao, setVisao] = useState<VisaoOrcamento>('mes');
  /** `undefined` = a fonte salva nas prefs (o payload diz qual é). */
  const [fonteEscolhida, setFonteEscolhida] = useState<FonteOrcamento | undefined>(undefined);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Trocou o ano no seletor do Fluxo: volta ao mês padrão daquele ano.
  const [anoVisto, setAnoVisto] = useState(ano);
  if (anoVisto !== ano) {
    setAnoVisto(ano);
    setMes(mesPadrao(ano));
  }

  const orcamento = useOrcamentoV2({ ano, mes, visao, fonte: fonteEscolhida });
  const estrutura = useOrcamentoV2Estrutura(ano);
  const { data, loading, error } = orcamento;
  const fonte: FonteOrcamento = data?.fonte ?? fonteEscolhida ?? 'lancado';

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const trocarFonte = (f: FonteOrcamento) => {
    if (f === fonte) return;
    setFonteEscolhida(f);
    orcamento.salvarPrefs.mutate({ fonte: f });
  };

  const props: ConteudoOrcamentoV2Props = {
    data,
    loading,
    error,
    ano,
    mes,
    onMesChange: setMes,
    visao,
    onVisaoChange: setVisao,
    fonte,
    onFonteChange: trocarFonte,
    orcamento,
    estrutura,
  };

  if (isBelowLg) {
    return (
      <div data-mf-orcamento-v2="">
        <OrcamentoV2Celular {...props} />
      </div>
    );
  }

  const destinoTemOrcado =
    data?.categorias.some((c) => c.subcategorias.some((s) => s.valor !== null || s.pct !== null)) ??
    false;

  return (
    <div data-mf-orcamento-v2="">
      <OrcamentoV2Moldura
        ano={ano}
        mes={mes}
        onMesChange={setMes}
        visao={visao}
        onVisaoChange={setVisao}
        fonte={fonte}
        onFonteChange={trocarFonte}
        referencia={data ? textoReferencia(data) : ''}
        acoes={
          data && data.visao === 'mes' ? (
            <CopiarMes
              de={data.copiarDe}
              para={{ ano: data.ano, mes: data.mes }}
              destinoTemOrcado={destinoTemOrcado}
              onCopiar={(sobrescrever) =>
                orcamento.copiarMes.mutateAsync({
                  de: { ano: data.copiarDe.ano, mes: data.copiarDe.mes },
                  sobrescrever,
                })
              }
              onResultado={setAviso}
            />
          ) : null
        }
      >
        {loading ? (
          <EsqueletoOrcamentoV2 />
        ) : error || !data ? (
          <div className={`flex h-48 items-center justify-center text-sm ${SELO_TEXTO.estourou}`}>
            {error ?? 'Erro ao carregar o orçamento.'}
          </div>
        ) : (
          <>
            <AvisoGeral
              pendente={data.prefs.avisoGeralPendente}
              onVisto={() => orcamento.salvarPrefs.mutate({ avisoGeralVisto: true })}
            />
            {aviso && (
              <div
                role={aviso.tipo === 'erro' ? 'alert' : 'status'}
                className={`rounded-lg border px-4 py-2 text-sm ${
                  aviso.tipo === 'erro'
                    ? `border-[#D92D20]/40 bg-white dark:border-[#F97066]/40 dark:bg-white/[0.03] ${SELO_TEXTO.estourou}`
                    : 'border-[#DCE6F2] bg-[#EDF2F8] text-gray-700 dark:border-gray-800 dark:bg-white/[0.06] dark:text-gray-200'
                }`}
              >
                {aviso.texto}
              </div>
            )}
            <KpisOrcamento data={data} />
            <OrcamentoV2Tabela
              data={data}
              onSalvarOrcado={(e) => orcamento.salvarOrcado.mutateAsync(e)}
              onMarcarFixa={(e) =>
                orcamento.marcarFixa.mutate(e, {
                  onError: (err) => setAviso({ tipo: 'erro', texto: err.message }),
                })
              }
              onSalvarRecolhidas={(ids) =>
                orcamento.salvarPrefs.mutate({ categoriasRecolhidas: ids })
              }
              onCriarSub={async (categoriaId, nome) => {
                await estrutura.criar.mutateAsync({ categoriaId, nome });
              }}
              onRenomearSub={async (categoriaId, itemId, nome) => {
                await estrutura.renomear.mutateAsync({ categoriaId, itemId, nome });
              }}
              onBuscarImpacto={estrutura.buscarImpacto}
              onExcluirSub={async (itemId) => {
                await estrutura.excluir.mutateAsync({ itemId });
                setAviso({
                  tipo: 'ok',
                  texto: 'Subcategoria excluída: os lançamentos dela agora estão em Geral.',
                });
              }}
            />
          </>
        )}
      </OrcamentoV2Moldura>
    </div>
  );
}
