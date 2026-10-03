'use client';

/**
 * Os 8 indicadores do ativo (fatia B). Grade por CONTÊINER (o card): 4 colunas com espaço, 2 no
 * card estreito/celular e 1 quando o conteúdo do card fica abaixo de 300px (página abaixo de
 * ~340px, como a 320). Valor ausente = '—' com o motivo em texto visível embaixo
 * (não só no title); n/a = 'n/a' com o motivo. Proventos em conferência: borda tracejada + selo.
 *
 * Bloco C: KPI com selo 'em_conferencia' (flags 'conf:', params v2) = borda tracejada + chip
 * "em conferência" que abre o "Por quê?" ('ocultar' mostra '—'; 'selo' mostra o valor). Menu ⋯ no
 * cabeçalho e selo de frescor no rodapé (só com relato ligado / params v2). FII: a vacância leva a
 * nota fixa "a tela segue a CVM" (decisão 16) quando o bloco C está ativo.
 */
import ChipConferencia, {
  BORDA_CONFERENCIA,
  naoPublicado,
} from '@/components/analiseAtivos/comum/ChipConferencia';
import {
  MenuBlocoPagina,
  blocoCAtivo,
  useConferenciaPagina,
} from '@/components/analiseAtivos/comum/PorQueConferencia';
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import ValorAnalise from '@/components/analiseAtivos/comum/ValorAnalise';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { RodapeFrescorBloco } from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import { conferenciaDoCampo } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { CAMPOS_REPORTAVEIS } from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoKpisProps, KpiAtivo } from '@/types/analiseAtivosApi';
import type { DadoBlocoReporte } from '@/types/analiseAtivosCuradoria';

export type { BlocoKpisProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';

/** KPIs reportáveis no "Qual dado?" (rótulo · valor como na tela). */
function dadosDosKpis(kpis: KpiAtivo[]): DadoBlocoReporte[] {
  const reportaveis = CAMPOS_REPORTAVEIS.kpis as readonly string[];
  return kpis
    .filter((k) => reportaveis.includes(k.codigo))
    .map((k) => ({
      campo: k.codigo as DadoBlocoReporte['campo'],
      rotulo: k.rotulo,
      valorExibido: formatarEstado(k.valor, k.formato),
      periodo: null,
    }));
}

function IconeInfo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v6M12 7.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export default function BlocoKpis({ classe, kpis }: BlocoKpisProps) {
  const ctx = useConferenciaPagina();
  const notaCvm = classe === 'fii' && blocoCAtivo(ctx);
  return (
    <section
      aria-labelledby="bloco-kpis-h"
      data-bloco="kpis"
      data-classe={classe}
      className={`${CARD} @container flex min-w-0 flex-col gap-3`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="bloco-kpis-h" className="text-base font-semibold text-gray-800 dark:text-white/90">
          {TEXTOS_TELA.blocos.kpis}
        </h2>
        <MenuBlocoPagina bloco="kpis" dados={dadosDosKpis(kpis)} />
      </div>
      <ul
        data-kpis
        className="grid grid-cols-1 gap-3 @min-[300px]:grid-cols-2 @min-[720px]:grid-cols-4"
      >
        {kpis.map((k) => {
          const conferencia = k.selo === 'proventos_em_conferencia';
          const emConf = k.selo === 'em_conferencia';
          return (
            <li
              key={k.codigo}
              data-kpi={k.codigo}
              data-conferencia={conferencia || emConf || undefined}
              className={`flex min-w-0 flex-col gap-0.5 rounded-xl bg-gray-50 px-3.5 py-3 dark:bg-white/[0.02] ${
                emConf
                  ? BORDA_CONFERENCIA
                  : conferencia
                    ? 'border border-dashed border-gray-500 dark:border-gray-400'
                    : 'border border-gray-100 dark:border-gray-800'
              }`}
            >
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {k.rotulo}
              </span>
              <ValorAnalise
                valor={k.valor}
                formato={k.formato}
                mostrarMotivo
                className="text-lg font-semibold text-gray-800 dark:text-white/90"
              />
              {emConf ? (
                <span className="mt-0.5 self-start">
                  <ChipConferencia
                    conferencia={conferenciaDoCampo(ctx?.conferencias, k.codigo)}
                    campo={k.codigo}
                    rotuloCampo={k.rotulo}
                    valorNaoPublicado={naoPublicado(k.valor, k.formato)}
                    bloco="kpis"
                  />
                </span>
              ) : null}
              {k.sub ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">{k.sub}</span>
              ) : null}
              {k.selo && !emConf && k.valor.estado === 'ok' ? (
                <SeloEstado tipo={k.selo} className="mt-1 self-start" />
              ) : null}
              {notaCvm && k.codigo === 'vacanciaCvm' && k.valor.estado !== 'nao_se_aplica' ? (
                <span
                  data-nota-cvm=""
                  className="mt-1 flex items-start gap-1 text-xs text-gray-500 dark:text-gray-400"
                >
                  <IconeInfo />
                  {TEXTOS_TELA.conferencia.segueCvm}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <RodapeFrescorBloco bloco="kpis" />
    </section>
  );
}
