'use client';

/**
 * Índice MF + semáforo (fatia B). Anel de 96px nos 5 estados (AnelIndice, da 0b), leitura "n de m
 * critérios atendidos", componentes do Índice num <details> (nota técnica 0–10, peso efetivo,
 * estado: '0 · regra', '0 · sem dado', 'fora da conta') e a fórmula pública num segundo <details>.
 *
 * Caixas com forma própria (decisão 4):
 * - incompleto: borda TRACEJADA, "O que falta" + motivos + "o número é recalculado…";
 * - zero_regra: borda CONTÍNUA, "Componente zerado pela regra" + "Índice baixo pela regra…";
 * - sem_score / fora_do_indice: texto próprio, sem número.
 * Critérios: lista com título (h3), status com ícone + texto (BadgeCriterio, nunca só cor) e a
 * frase factual; critério desligado aparece como "Não se aplica · critério desligado…".
 *
 * Bloco C (params v2): componente de um grupo em conferência = trilho TRACEJADO, '0 · em
 * conferência' e o chip que abre o "Por quê?"; critério do grupo = 'Sem dado' (frase do topo) com o
 * mesmo chip. Componentes e critérios saem do mesmo helper (conferenciasAtivo). Menu ⋯ no
 * cabeçalho e selo de frescor no rodapé.
 */
import AnelIndice from '@/components/analiseAtivos/comum/AnelIndice';
import BadgeCriterio from '@/components/analiseAtivos/comum/BadgeCriterio';
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import ChipConferencia from '@/components/analiseAtivos/comum/ChipConferencia';
import {
  MenuBlocoPagina,
  useConferenciaPagina,
} from '@/components/analiseAtivos/comum/PorQueConferencia';
import { RodapeFrescorBloco } from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import {
  componentesEmConferencia,
  criteriosEmConferencia,
  gruposDasConferencias,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  componentesDoGrupo,
  ehGrupoConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  BlocoIndiceSemaforoProps,
  ComponenteIndiceTela,
  ConferenciaTela,
} from '@/types/analiseAtivosApi';

export type { BlocoIndiceSemaforoProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const RESUMO =
  'inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-[#396CAA] dark:text-[#6E9DC4] focus-visible:outline-3 focus-visible:outline-[#0079F2] dark:focus-visible:outline-[#6E9DC4]';

function valorComponente(c: ComponenteIndiceTela): string {
  const t = TEXTOS_TELA;
  if (c.estado === 'zero_regra') return t.indice.zeroRegraComponente;
  if (c.estado === 'ausente') return t.ativo.zeroSemDado;
  if (c.estado === 'nao_se_aplica' || c.nota === null) return t.formato.semDado;
  return formatarAnalise(c.nota, 'numero');
}

function LinhaComponente({
  c,
  conferencia,
}: {
  c: ComponenteIndiceTela;
  /** bloco C: conferência que zera o componente (trilho tracejado + chip) */
  conferencia?: ConferenciaTela | null;
}) {
  const t = TEXTOS_TELA.ativo;
  const fora = c.estado === 'nao_se_aplica';
  const largura = !fora && c.nota !== null ? Math.max(0, Math.min(10, c.nota)) * 10 : 0;
  if (conferencia && c.estado === 'ausente') {
    return (
      <li
        data-componente-conferencia={c.nome}
        className="grid grid-cols-[minmax(0,1fr)_64px_auto] items-center gap-x-2 gap-y-0.5 text-xs"
      >
        <span className="min-w-0 text-gray-700 dark:text-gray-200">
          {c.rotulo}{' '}
          <span className="text-gray-500 dark:text-gray-400">
            ·{' '}
            {c.peso === null
              ? t.foraDaConta
              : formatarTexto(t.pesoComponente, { valor: Math.round(c.peso * 100) })}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="h-1.5 rounded-full border border-dashed border-[#667085] dark:border-[#98A2B3]"
        />
        <span className="text-right font-medium whitespace-nowrap text-gray-700 tabular-nums dark:text-gray-300">
          {TEXTOS_TELA.telaConferencia.componenteEmConferencia}
        </span>
        <span className="col-span-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
          {c.texto ? <span>{c.texto}</span> : null}
          <ChipConferencia
            conferencia={conferencia}
            campo="indiceMf"
            rotuloCampo={c.rotulo}
            bloco="indice"
          />
        </span>
      </li>
    );
  }
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_64px_auto] items-center gap-x-2 gap-y-0.5 text-xs">
      <span className="min-w-0 text-gray-700 dark:text-gray-200">
        {c.rotulo}{' '}
        <span className="text-gray-500 dark:text-gray-400">
          ·{' '}
          {fora || c.peso === null
            ? t.foraDaConta
            : formatarTexto(t.pesoComponente, { valor: Math.round(c.peso * 100) })}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
      >
        <span className="block h-full rounded-full bg-[#0079F2]" style={{ width: `${largura}%` }} />
      </span>
      <span className="text-right font-medium text-gray-800 tabular-nums dark:text-white/90">
        {valorComponente(c)}
      </span>
      {c.texto ? (
        <span className="col-span-3 text-[11px] text-gray-500 dark:text-gray-400">{c.texto}</span>
      ) : null}
    </li>
  );
}

export default function BlocoIndiceSemaforo({
  ticker,
  indice,
  semaforo,
}: BlocoIndiceSemaforoProps) {
  const t = TEXTOS_TELA;
  const temForaDaConta =
    semaforo.some((c) => c.status === 'nao_se_aplica') ||
    indice.componentes.some((c) => c.estado === 'nao_se_aplica');
  const semNumero = indice.estado === 'sem_score' || indice.estado === 'fora_do_indice';
  const provisorio = semaforo.some((c) => c.provisorio);
  // bloco C: o mesmo helper decide componentes e critérios em conferência
  const ctx = useConferenciaPagina();
  const conferencias = ctx?.conferencias ?? [];
  const classe = ctx?.classe ?? 'acao';
  const compsConf = componentesEmConferencia(conferencias, classe);
  const critConf = criteriosEmConferencia(gruposDasConferencias(conferencias));
  const conferenciaDoGrupo = (grupo: string | undefined) =>
    grupo ? (conferencias.find((x) => x.grupo === grupo) ?? null) : null;
  const conferenciaDoComponente = (nome: string) =>
    compsConf.has(nome)
      ? (conferencias.find(
          (x) =>
            x.grupo !== 'historico' &&
            ehGrupoConferencia(x.grupo) &&
            (componentesDoGrupo(x.grupo, classe) as readonly string[]).includes(nome),
        ) ?? null)
      : null;

  return (
    <section
      aria-labelledby="bloco-indice-h"
      data-bloco="indice"
      data-estado-indice={indice.estado}
      className={`${CARD} flex min-w-0 flex-col gap-4`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="bloco-indice-h"
          className="text-base font-semibold text-gray-800 dark:text-white/90"
        >
          {t.ativo.indiceTitulo}
        </h2>
        <span className="inline-flex items-center gap-2">
          {provisorio ? <SeloEstado tipo="criterios_provisorios" /> : null}
          <MenuBlocoPagina
            bloco="indice"
            dados={[
              {
                campo: 'indiceMf',
                rotulo: TEXTOS_TELA.relatos.campos.indiceMf,
                valorExibido: semNumero
                  ? TEXTOS_TELA.formato.semDado
                  : formatarAnalise(indice.valor as number, 'numero'),
                periodo: null,
              },
            ]}
          />
        </span>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col items-start gap-3 border-b border-gray-100 pb-4 lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0 dark:border-gray-800">
          <AnelIndice valor={indice.valor} estado={indice.estado} tamanho={96} />
          <p className="text-sm">
            <strong className="font-semibold text-gray-800 dark:text-white/90">
              {indice.leitura}
            </strong>
            <br />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t.ativo.indiceDescricao}
            </span>
          </p>
          {indice.componentes.length > 0 ? (
            <details className="w-full" data-componentes>
              <summary className={RESUMO}>{t.indice.componentesRotulo}</summary>
              <ul className="mt-2 flex flex-col gap-2.5">
                {indice.componentes.map((c) => (
                  <LinhaComponente
                    key={c.nome}
                    c={c}
                    conferencia={conferenciaDoComponente(c.nome)}
                  />
                ))}
              </ul>
              {indice.componentes.some((c) => c.estado === 'nao_se_aplica') ? (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t.ativo.componentesNota}
                </p>
              ) : null}
            </details>
          ) : null}
          {!semNumero ? (
            <details className="w-full">
              <summary className={RESUMO}>{t.indice.formulaRotulo}</summary>
              <p className="mt-1 text-xs break-words text-gray-600 dark:text-gray-300">
                {indice.formula}
              </p>
            </details>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {indice.estado === 'incompleto' && indice.caixaExplicativa ? (
            <div
              data-caixa="incompleto"
              className="rounded-xl border border-dashed border-gray-500 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 dark:border-gray-400 dark:bg-white/[0.02] dark:text-gray-200"
            >
              <p className="font-semibold text-gray-800 dark:text-white/90">
                {indice.caixaExplicativa.titulo}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {indice.caixaExplicativa.itens.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t.indice.incompletoRodape}
              </p>
            </div>
          ) : null}
          {indice.estado === 'zero_regra' && indice.caixaExplicativa ? (
            <div
              data-caixa="zero_regra"
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-white/[0.02] dark:text-gray-200"
            >
              <p className="font-semibold text-gray-800 dark:text-white/90">
                {indice.caixaExplicativa.titulo}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {indice.caixaExplicativa.itens.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t.indice.zeroRegraRodape}
              </p>
            </div>
          ) : null}
          {semNumero ? (
            <p
              data-caixa={indice.estado}
              className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
            >
              {indice.estado === 'sem_score' ? t.indice.semScore : t.indice.foraDoIndice}
            </p>
          ) : null}

          {semaforo.length > 0 ? (
            <>
              <h3 id={`criterios-${ticker}`} className="sr-only">
                {t.blocos.criterios}
              </h3>
              <ul className="flex flex-col" aria-labelledby={`criterios-${ticker}`}>
                {semaforo.map((c) => (
                  <li
                    key={c.codigo}
                    data-criterio={c.codigo}
                    data-status={c.status}
                    className="grid gap-1.5 border-b border-gray-100 py-2.5 last:border-b-0 sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-3.5 dark:border-gray-800"
                  >
                    <div>
                      <BadgeCriterio status={c.status} />
                    </div>
                    <div className="min-w-0">
                      <h4
                        className={`flex flex-wrap items-center gap-1.5 text-sm ${
                          c.status === 'nao_se_aplica'
                            ? 'font-medium text-gray-500 dark:text-gray-400'
                            : 'font-semibold text-gray-800 dark:text-white/90'
                        }`}
                      >
                        {c.titulo}
                        {c.provisorio ? <SeloEstado tipo="criterios_provisorios" /> : null}
                      </h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{c.frase}</p>
                      {c.status === 'sem_dado' && conferenciaDoGrupo(critConf.get(c.codigo)) ? (
                        <span className="mt-1 inline-flex" data-criterio-conferencia="">
                          <ChipConferencia
                            conferencia={conferenciaDoGrupo(critConf.get(c.codigo))}
                            campo="criterioSemaforo"
                            rotuloCampo={c.titulo}
                            bloco="criterios"
                          />
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {temForaDaConta ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t.ativo.criteriosForaDaConta}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <RodapeFrescorBloco bloco="indice" />
    </section>
  );
}
