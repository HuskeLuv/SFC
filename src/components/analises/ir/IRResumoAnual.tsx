'use client';
import React, { useState } from 'react';
import { useIRPgbl, useIRResumoAnual } from '@/hooks/useIR';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IRSummaryCard from './IRSummaryCard';
import IRStateMessage from './IRStateMessage';
import { formatBRL, jcpIrrfRateLabel } from './irFormatters';
import { Sensivel } from '@/components/common/valores/Sensivel';
import { regrasIrpfDoAno } from '@/services/ir/irpfAnual';
import { tipoDoPlano, useSimulacaoPgbl } from './pgblMarcacoes';
import { balancoDaa, simularDosCampos, type BalancoDaa } from './pgblResumo';

function buildYearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2, current - 3];
}

/**
 * Card "Dedução PGBL" (HTML do Pedro, 03/11/2026): aportes do ano nos planos marcados como PGBL e
 * atalho para a aba PGBL. Logo abaixo, o "Balanço estimado da DAA" com os dados salvos na aba
 * PGBL (86e2xnyrg). Só nos anos com tabela cadastrada (regrasIrpfDoAno: 2024 a 2026).
 */
function BlocoPgbl({
  ano,
  regras,
  onAbrir,
  irExterior,
}: {
  ano: number;
  regras: NonNullable<ReturnType<typeof regrasIrpfDoAno>>;
  onAbrir?: () => void;
  irExterior: number;
}) {
  const { data } = useIRPgbl(ano);
  const sim = useSimulacaoPgbl(ano);
  const planos = data?.planos ?? [];
  const pgbl = planos.filter((p) => tipoDoPlano(p, sim.marcas) === 'pgbl');
  const total = pgbl.reduce((s, p) => s + p.aportesTotal, 0);
  const semTipo = planos.some((p) => tipoDoPlano(p, sim.marcas) === null);
  const { entrada, r } = simularDosCampos(sim.campos, total, regras);
  return (
    <>
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-5 text-left transition-colors hover:bg-brand-50 dark:border-brand-900/40 dark:bg-brand-900/10 dark:hover:bg-brand-900/20 max-lg:p-4"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Dedução PGBL
            <span className="rounded-full bg-white px-1.5 py-px text-[10px] font-bold text-mf-patrimonio dark:bg-white/10 dark:text-mf-tranquilidade">
              Novo
            </span>
          </span>
          <span className="mt-1 block text-sm text-gray-700 dark:text-gray-300">
            <strong className="text-gray-900 dark:text-white">
              <Sensivel>{formatBRL(total)}</Sensivel>
            </strong>{' '}
            aportados em PGBL no ano · até 12% da renda tributável reduzem o IR no modelo completo
            {semTipo && ' · confirme o tipo dos planos'}
          </span>
        </span>
        <span className="text-sm font-semibold text-mf-outside dark:text-mf-tranquilidade">
          Simular benefício →
        </span>
      </button>
      <BalancoDaaCard
        ano={ano}
        balanco={entrada.rendaTributavel > 0 ? balancoDaa(r, entrada.irRetido, irExterior) : null}
        semRetido={entrada.irRetido <= 0}
        carregando={sim.carregando}
        onAbrir={onAbrir}
      />
    </>
  );
}

function BalancoDaaCard({
  ano,
  balanco,
  semRetido,
  carregando,
  onAbrir,
}: {
  ano: number;
  balanco: BalancoDaa | null;
  semRetido: boolean;
  /** Simulação salva ainda chegando: não pedir o preenchimento a quem já preencheu. */
  carregando: boolean;
  onAbrir?: () => void;
}) {
  const link = (texto: string) => (
    <button
      type="button"
      onClick={onAbrir}
      className="font-medium text-mf-outside hover:underline dark:text-mf-tranquilidade"
    >
      {texto}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] max-lg:p-4">
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          Balanço estimado da DAA {ano + 1}
        </h4>
        {carregando ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Carregando…</p>
        ) : balanco ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            IR sobre investimentos (exterior){' '}
            <Sensivel curto>{formatBRL(balanco.irInvestimentos)}</Sensivel> · dedução PGBL −{' '}
            <Sensivel curto>{formatBRL(balanco.deducaoPgbl)}</Sensivel>
            {balanco.doacoes > 0 && (
              <>
                {' '}
                · doações − <Sensivel curto>{formatBRL(balanco.doacoes)}</Sensivel>
              </>
            )}{' '}
            · retido na fonte <Sensivel curto>{formatBRL(balanco.irRetido)}</Sensivel> · modelo{' '}
            {balanco.modelo}
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Informe a renda e o IR retido na fonte na aba PGBL para ver se a declaração deve dar
            restituição ou imposto a pagar. {link('Preencher agora →')}
          </p>
        )}
        {balanco && semRetido && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Sem o IR retido na fonte o balanço sai como imposto a pagar. {link('Informar →')}
          </p>
        )}
      </div>
      {balanco && (
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {balanco.saldo >= 0 ? 'Restituição projetada' : 'Imposto a pagar projetado'}
          </span>
          <span
            className={`text-xl font-bold ${
              balanco.saldo >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            <Sensivel>{formatBRL(Math.abs(balanco.saldo))}</Sensivel>
          </span>
        </div>
      )}
    </div>
  );
}

export default function IRResumoAnual({
  onAbrirPgbl,
}: { onAbrirPgbl?: (ano: number) => void } = {}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const regrasDoAno = regrasIrpfDoAno(year);
  const { data, isLoading, error } = useIRResumoAnual(year);
  const yearOptions = buildYearOptions();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Resumo anual de IR
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Ferramenta de acompanhamento — não gera DAA. Os números abaixo são projetados a partir
            das transações cadastradas no sistema.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          Ano:
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200 max-lg:h-11"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <LoadingSpinner text="Carregando resumo anual..." />}

      {error && (
        <IRStateMessage
          variant="error"
          title="Erro ao carregar resumo"
          description={(error as Error).message}
        />
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <IRSummaryCard
              label="IR total estimado no ano"
              value={formatBRL(data.irPorCategoria.total)}
              subtext="Soma de RV-BR + Stocks, REITs e ETFs EUA + Cripto + Come-cotas"
              color={
                data.irPorCategoria.total > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }
              highlight
            />
            <IRSummaryCard
              label="Renda Variável BR"
              value={formatBRL(data.irPorCategoria.rendaVariavelBr)}
              subtext="Ações / FII / ETF — DARF mensal"
            />
            <IRSummaryCard
              label="Stocks, REITs e ETFs EUA"
              value={formatBRL(data.irPorCategoria.stocksUs)}
              subtext="Ganho de capital em ME"
            />
            <IRSummaryCard
              label="Criptoativos"
              value={formatBRL(data.irPorCategoria.cripto)}
              subtext="Ganho de capital cripto"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <IRSummaryCard
              label="Come-cotas (projeção)"
              value={formatBRL(data.irPorCategoria.comecotas)}
              subtext="Retido na fonte em fundos"
            />
            <IRSummaryCard
              label="Renda fixa"
              value={formatBRL(data.irPorCategoria.rendaFixa)}
              subtext="Banco/corretora retém na fonte"
              color="text-gray-500 dark:text-gray-400"
            />
            <IRSummaryCard
              label="Rendimentos isentos"
              value={formatBRL(data.rendimentos.isentos.total)}
              subtext={`Dividendos: ${formatBRL(
                data.rendimentos.isentos.dividendosAcoesBr,
              )} • FII: ${formatBRL(data.rendimentos.isentos.rendimentosFii)}`}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <IRSummaryCard
              label="JCP recebido"
              value={formatBRL(data.rendimentos.tributacaoExclusiva.jcp)}
              subtext={`Tributação exclusiva — ${jcpIrrfRateLabel(year)} retidos na fonte`}
            />
          </div>

          {regrasDoAno && (
            <BlocoPgbl
              ano={year}
              regras={regrasDoAno}
              onAbrir={onAbrirPgbl ? () => onAbrirPgbl(year) : undefined}
              irExterior={data.irPorCategoria.stocksUs}
            />
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] max-lg:p-4">
            <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Rendimentos do ano
            </h4>
            {/* Pílula curta: nunca mais larga que "R$ 0,00", o rótulo não quebra (decisão 6). */}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3 border-b border-gray-100 py-1.5 dark:border-gray-800">
                <dt className="text-gray-500 dark:text-gray-400">
                  Dividendos de ações BR (isentos)
                </dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  <Sensivel curto>{formatBRL(data.rendimentos.isentos.dividendosAcoesBr)}</Sensivel>
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-gray-100 py-1.5 dark:border-gray-800">
                <dt className="text-gray-500 dark:text-gray-400">Rendimentos de FII (isentos)</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  <Sensivel curto>{formatBRL(data.rendimentos.isentos.rendimentosFii)}</Sensivel>
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-gray-100 py-1.5 dark:border-gray-800">
                <dt className="text-gray-500 dark:text-gray-400">
                  JCP (tributação exclusiva {jcpIrrfRateLabel(year)})
                </dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  <Sensivel curto>{formatBRL(data.rendimentos.tributacaoExclusiva.jcp)}</Sensivel>
                </dd>
              </div>
              {data.rendimentos.exterior &&
                (data.rendimentos.exterior.total > 0 ||
                  data.rendimentos.exterior.semCambio > 0) && (
                  <div className="flex justify-between gap-3 border-b border-gray-100 py-1.5 dark:border-gray-800">
                    <dt className="text-gray-500 dark:text-gray-400">
                      Exterior — Stocks, REITs e ETFs EUA (tributável)
                    </dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      <Sensivel curto>{formatBRL(data.rendimentos.exterior.total)}</Sensivel>
                    </dd>
                  </div>
                )}
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="font-medium text-gray-700 dark:text-gray-200">Total recebido</dt>
                <dd className="font-semibold text-gray-900 dark:text-white">
                  <Sensivel curto>{formatBRL(data.rendimentos.totalRecebido)}</Sensivel>
                </dd>
              </div>
            </dl>
          </div>

          {data.observacoes.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
              <h4 className="mb-2 text-sm font-medium text-blue-900 dark:text-blue-200">
                Observações
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-xs text-blue-800 dark:text-blue-300">
                {data.observacoes.map((obs, i) => (
                  <li key={i}>{obs}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
