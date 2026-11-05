'use client';
import React, { useMemo, useState } from 'react';
import { useIRPgbl, type IRPlanoPrevidencia } from '@/hooks/useIR';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Input from '@/components/form/input/InputField';
import IRSummaryCard from './IRSummaryCard';
import IRStateMessage from './IRStateMessage';
import { formatBRL, formatPercent } from './irFormatters';
import {
  tipoDoPlano,
  useSimulacaoPgbl,
  type PlanoMarcado,
  type RegimeTributacao,
  type TipoPlanoMarcado,
} from './pgblMarcacoes';
import type { ItemSugerido } from '@/services/ir/sugestaoFluxoIr';
import { Sensivel, TextoSensivel, ValorVisivel } from '@/components/common/valores/Sensivel';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import { parseCurrencyInput } from '@/utils/parseCurrencyInput';
import {
  REGRAS_IRPF_2026,
  simularIrpfAnual,
  type EntradaIrpfAnual,
  type ResultadoIrpfAnual,
} from '@/services/ir/irpfAnual';

/**
 * Aba PGBL do Imposto de Renda (HTML do Pedro, 03/11/2026): benefício do PGBL no ajuste anual.
 *
 * Os aportes vêm da carteira (planos de previdência, com o tipo PGBL/VGBL marcado pelo usuário);
 * renda, INSS e demais deduções o usuário informa, com o atalho "Preencher com o fluxo de caixa"
 * (renda, saúde e educação do ano, como sugestão). Tudo é salvo na conta, por ano (86e2xnyrg).
 */

const REGRAS = REGRAS_IRPF_2026;
const ANO = REGRAS.anoCalendario;

type CampoId = Exclude<keyof EntradaIrpfAnual, 'aportesPgbl'> | 'aportesOutros';

const CAMPOS: Array<{ id: CampoId; label: string; hint?: string; inteiro?: boolean }> = [
  {
    id: 'rendaTributavel',
    label: 'Renda bruta tributável no ano',
    hint: 'Salário bruto, pró-labore, aluguéis. 13º e PLR não entram (tributação exclusiva).',
  },
  { id: 'inss', label: 'INSS / regime próprio no ano', hint: 'Exigência para deduzir o PGBL.' },
  {
    id: 'irRetido',
    label: 'IR retido na fonte no ano',
    hint: 'Informe de rendimentos + carnê-leão.',
  },
  { id: 'dependentes', label: 'Dependentes', inteiro: true },
  { id: 'saude', label: 'Saúde (sem limite)' },
  { id: 'educacao', label: 'Educação' },
  { id: 'pensaoJudicial', label: 'Pensão alimentícia judicial' },
  { id: 'livroCaixa', label: 'Livro-caixa (autônomos)' },
  { id: 'doacoesIncentivadas', label: 'Doações incentivadas' },
  {
    id: 'aportesOutros',
    label: 'Aportes em PGBL fora da carteira',
    hint: 'Planos que não estão cadastrados aqui.',
  },
];

const CARD =
  'rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] max-lg:p-4';
const TITULO = 'text-sm font-semibold text-gray-800 dark:text-white/90';
const SUB = 'text-xs text-gray-500 dark:text-gray-400';
const POSITIVO = 'text-emerald-600 dark:text-emerald-400';

function diasAte31Dez(ano: number): number {
  const hoje = new Date();
  if (hoje.getFullYear() !== ano) return 0;
  const fim = new Date(ano, 11, 31);
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((fim.getTime() - inicioHoje.getTime()) / 86_400_000);
}

const pct = (v: number) => formatPercent(v, 1).replace('.', ',');

export default function IRPgbl() {
  const { data, isLoading, error } = useIRPgbl(ANO);
  const sim = useSimulacaoPgbl(ANO);
  const { marcas, marcar } = sim;
  const campos = Object.fromEntries(CAMPOS.map((c) => [c.id, sim.campos[c.id] ?? ''])) as Record<
    CampoId,
    string
  >;
  /** Origem do valor que veio do fluxo (some quando o usuário edita o campo). */
  const [origem, setOrigem] = useState<Partial<Record<CampoId, ItemSugerido>>>({});
  const sugestao = data?.sugestaoFluxo ?? null;
  const temSugestao =
    !!sugestao &&
    (sugestao.rendaTributavel.total > 0 || sugestao.saude.total > 0 || sugestao.educacao.total > 0);
  const preencherComFluxo = () => {
    if (!sugestao) return;
    const novos: Record<string, string> = {};
    const novasOrigens: Partial<Record<CampoId, ItemSugerido>> = {};
    const pares: Array<[CampoId, ItemSugerido]> = [
      ['rendaTributavel', sugestao.rendaTributavel],
      ['saude', sugestao.saude],
      ['educacao', sugestao.educacao],
    ];
    for (const [id, item] of pares) {
      if (item.total <= 0) continue;
      novos[id] = formatarCampo(item.total);
      novasOrigens[id] = item;
    }
    sim.setCampos(novos);
    setOrigem((o) => ({ ...o, ...novasOrigens }));
  };

  const planos = useMemo(() => data?.planos ?? [], [data]);
  const planosPgbl = planos.filter((p) => tipoDoPlano(p, marcas) === 'pgbl');
  const aportesCarteira = planosPgbl.reduce((s, p) => s + p.aportesTotal, 0);
  const qtdAportes = planosPgbl.reduce((s, p) => s + p.aportesQuantidade, 0);

  const num = (id: CampoId) => parseCurrencyInput(campos[id]) ?? 0;
  const entrada: EntradaIrpfAnual = {
    rendaTributavel: num('rendaTributavel'),
    inss: num('inss'),
    aportesPgbl: aportesCarteira + num('aportesOutros'),
    dependentes: Math.floor(num('dependentes')),
    saude: num('saude'),
    educacao: num('educacao'),
    pensaoJudicial: num('pensaoJudicial'),
    livroCaixa: num('livroCaixa'),
    doacoesIncentivadas: num('doacoesIncentivadas'),
    irRetido: num('irRetido'),
  };
  const r = simularIrpfAnual(entrada, REGRAS);
  const temRenda = entrada.rendaTributavel > 0;
  const dias = diasAte31Dez(ANO);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Benefício PGBL na declaração anual
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Ferramenta de acompanhamento — não gera DAA. Ano-calendário {ANO} (declaração de {ANO + 1}
          ). Os aportes vêm da carteira (Previdência e Seguros); renda e deduções você informa
          abaixo. Os valores de IR são estimativas pela tabela progressiva vigente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <IRSummaryCard
          label="Renda bruta tributável"
          value={formatBRL(entrada.rendaTributavel)}
          subtext={temRenda ? 'Informada na simulação' : 'Informe abaixo para simular'}
          highlight
        />
        <IRSummaryCard
          label="Limite dedutível (12%)"
          value={formatBRL(r.pgbl.limiteDedutivel)}
          subtext="Teto de aportes em PGBL + FAPI que reduzem a base de cálculo"
        />
        <IRSummaryCard
          label="Aportado em PGBL no ano"
          value={formatBRL(entrada.aportesPgbl)}
          subtext={`${temRenda ? `${pct(r.pgbl.percentualUsado)} do limite · ` : ''}${qtdAportes} ${
            qtdAportes === 1 ? 'aporte' : 'aportes'
          } na carteira`}
        />
        <IRSummaryCard
          label="Economia estimada de IR"
          value={formatBRL(r.pgbl.economiaAtual)}
          color={POSITIVO}
          subtext={
            temRenda
              ? `Alíquota marginal de ${pct(r.completo.aliquotaMarginal)} · pode chegar a ${formatBRL(
                  r.pgbl.economiaPotencial,
                )} se completar o limite`
              : 'Diferença de IR com e sem o aporte'
          }
        />
      </div>

      <BarraEspaco r={r} aportes={entrada.aportesPgbl} dias={dias} temRenda={temRenda} />

      <div className={CARD}>
        <div className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className={TITULO}>Seus dados do ano</h4>
              <p className={SUB}>
                Valores anuais, salvos na sua conta. <EstadoSalvo estado={sim.estado} />
              </p>
            </div>
            {temSugestao && (
              <button
                type="button"
                onClick={preencherComFluxo}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-mf-patrimonio hover:bg-gray-50 max-lg:min-h-11 dark:border-gray-700 dark:bg-gray-900 dark:text-mf-tranquilidade dark:hover:bg-white/5"
              >
                Preencher com o fluxo de caixa
              </button>
            )}
          </div>
          {Object.keys(origem).length > 0 && (
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
              Confira antes de usar: no fluxo de caixa o salário costuma estar líquido, e o IR usa o
              valor bruto (veja o informe de rendimentos). Medicamentos, material escolar e cursos
              livres não são dedutíveis e ficaram de fora. INSS e IR retido não estão no fluxo:
              informe à mão.
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {CAMPOS.map((c) => (
            <div key={c.id}>
              <label
                htmlFor={`ir-pgbl-${c.id}`}
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {c.label}
              </label>
              <Input
                id={`ir-pgbl-${c.id}`}
                inputMode={c.inteiro ? 'numeric' : 'decimal'}
                placeholder={c.inteiro ? '0' : 'R$ 0,00'}
                value={campos[c.id]}
                onChange={(e) => {
                  sim.setCampo(c.id, e.target.value);
                  if (origem[c.id]) setOrigem(({ [c.id]: _, ...resto }) => resto);
                }}
                hint={c.hint}
                autoComplete="off"
              />
              {origem[c.id] && <OrigemFluxo item={origem[c.id]!} />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Condicoes r={r} entrada={entrada} planosPgbl={planosPgbl.length} temRenda={temRenda} />
        <Simulacao r={r} renda={entrada.rendaTributavel} irRetido={entrada.irRetido} />
      </div>

      <div className={CARD}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className={TITULO}>Aportes em previdência no ano</h4>
          <p className={SUB}>
            Marque o tipo de cada plano (só PGBL deduz) e a tabela de tributação. Fica salvo na sua
            conta.
          </p>
        </div>
        {isLoading && <LoadingSpinner text="Carregando planos de previdência..." />}
        {error && (
          <IRStateMessage
            variant="error"
            title="Erro ao carregar os planos"
            description={(error as Error).message}
          />
        )}
        {data && planos.length === 0 && (
          <IRStateMessage
            variant="empty"
            title="Nenhum plano de previdência na carteira"
            description="Cadastre o plano na aba Previdência e Seguros ou informe os aportes no campo “Aportes em PGBL fora da carteira”."
          />
        )}
        {planos.length > 0 && (
          <TabelaPlanos
            planos={planos}
            marcas={marcas}
            onMarcar={marcar}
            planosMarcados={sim.planos}
            onMarcarRegime={sim.marcarRegime}
            totalPgbl={aportesCarteira}
            qtdPgbl={qtdAportes}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <h4 className={`${TITULO} mb-3`}>Onde lançar na declaração</h4>
          <ul className="space-y-2.5 text-sm text-gray-700 dark:text-gray-300">
            <Marcador>
              <strong>Pagamentos Efetuados → código 36</strong> (Previdência complementar — PGBL).
              Um lançamento por entidade, com o CNPJ da seguradora e o total do ano.
            </Marcador>
            <Marcador>
              <strong>Não vai em Bens e Direitos.</strong> O saldo do PGBL não é declarado como bem
              — só o VGBL é.
            </Marcador>
            <Marcador>
              <strong>Resgates</strong> entram pelo informe da seguradora: tributação exclusiva
              (regressivo) ou rendimentos tributáveis com 15% retido (progressivo).
            </Marcador>
            <Marcador>
              <strong>Confira com o Informe de Contribuições</strong> que a seguradora envia até o
              último dia útil de fevereiro — ele é o documento oficial.
            </Marcador>
          </ul>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-900/50 dark:bg-brand-900/20">
          <h4 className="mb-2 text-sm font-medium text-brand-900 dark:text-brand-200">
            Observações
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-xs text-brand-800 dark:text-brand-300">
            <li>
              A dedução é um diferimento: o IR incide no resgate sobre o valor total (aportes +
              rendimentos).
            </li>
            <li>
              Rendimentos isentos ou com tributação exclusiva (dividendos, JCP, renda fixa) não
              entram na base dos 12%.
            </li>
            <li>
              Aportes em nome de dependentes só deduzem se o dependente também contribuir ao INSS (a
              partir de 16 anos).
            </li>
            <li>
              Renda tributável até{' '}
              <ValorVisivel>{formatBRL(REGRAS.redutor?.rendaFaixaAte ?? 0)}</ValorVisivel> no ano: o
              redutor da Lei 15.270/2025 já zera ou reduz o IR, e o benefício do PGBL pode ser
              menor. Renda total acima de{' '}
              <ValorVisivel>{formatBRL(REGRAS.irpfmRendaAPartirDe ?? 0)}</ValorVisivel>: o IRPFM
              (imposto mínimo) pode neutralizar a dedução — não calculado aqui.
            </li>
            <li>
              Educação: o teto é por pessoa; a simulação aplica{' '}
              <ValorVisivel>{formatBRL(REGRAS.tetoEducacaoPorPessoa)}</ValorVisivel> × (você +
              dependentes) sobre o total informado.
            </li>
            <li>
              Os valores de IR usam a tabela progressiva vigente e não substituem o cálculo da
              Receita Federal.
            </li>
          </ul>
        </div>
      </div>

      <GastosDedutiveis r={r} entrada={entrada} />
    </div>
  );
}

function Marcador({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-[7px] h-2 w-2 flex-none rounded-sm bg-mf-outside" />
      <span>{children}</span>
    </li>
  );
}

function BarraEspaco({
  r,
  aportes,
  dias,
  temRenda,
}: {
  r: ResultadoIrpfAnual;
  aportes: number;
  dias: number;
  temRenda: boolean;
}) {
  const largura = `${Math.round(r.pgbl.percentualUsado * 1000) / 10}%`;
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className={TITULO}>Espaço de dedução até 31/12/{ANO}</h4>
        {temRenda && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {r.pgbl.espacoRestante > 0 ? (
              <>
                Faltam{' '}
                <strong className="text-gray-800 dark:text-white/90">
                  <Sensivel>{formatBRL(r.pgbl.espacoRestante)}</Sensivel>
                </strong>{' '}
                para usar 100% do limite
              </>
            ) : (
              'Limite de 12% atingido'
            )}
            {dias > 0 && ` · ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
          </p>
        )}
      </div>
      <div
        role="img"
        aria-label={`Aportado ${pct(r.pgbl.percentualUsado)} do limite dedutível`}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      >
        <div className="h-full rounded-full bg-mf-outside" style={{ width: largura }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          Aportado <Sensivel>{formatBRL(aportes)}</Sensivel>
        </span>
        <span>
          Limite <Sensivel>{formatBRL(r.pgbl.limiteDedutivel)}</Sensivel>
        </span>
      </div>
      {temRenda && r.pgbl.espacoRestante > 0 && r.pgbl.economiaAdicional > 0 && (
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          Aporte único de{' '}
          <strong>
            <Sensivel>{formatBRL(r.pgbl.espacoRestante)}</Sensivel>
          </strong>{' '}
          ainda em {ANO} reduz o IR em cerca de{' '}
          <strong className={POSITIVO}>
            <Sensivel>{formatBRL(r.pgbl.economiaAdicional)}</Sensivel>
          </strong>
          .
        </p>
      )}
      {temRenda && r.pgbl.excedente > 0 && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          <TextoSensivel
            texto={`${formatBRL(r.pgbl.excedente)} aportados acima do limite não reduzem o IR deste ano.`}
          />
        </p>
      )}
    </div>
  );
}

type Estado = 'ok' | 'alerta' | 'info';

function IconeEstado({ estado }: { estado: Estado }) {
  const fundo =
    estado === 'ok'
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
      : estado === 'alerta'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
        : 'bg-brand-50 text-mf-patrimonio dark:bg-white/5 dark:text-mf-tranquilidade';
  return (
    <span
      aria-hidden
      className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full ${fundo}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {estado === 'ok' && <path d="M5 12l5 5L20 7" />}
        {estado === 'alerta' && (
          <>
            <path d="M12 7v6" />
            <path d="M12 17h.01" />
          </>
        )}
        {estado === 'info' && (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l3 2" />
          </>
        )}
      </svg>
    </span>
  );
}

function Condicao({ estado, titulo, texto }: { estado: Estado; titulo: string; texto: string }) {
  const rotulo = estado === 'ok' ? 'atendida' : estado === 'alerta' ? 'atenção' : 'informativo';
  return (
    <li className="flex items-start gap-3">
      <IconeEstado estado={estado} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
          {titulo}
          <span className="sr-only"> ({rotulo})</span>
        </p>
        <p className={SUB}>
          <TextoSensivel texto={texto} />
        </p>
      </div>
    </li>
  );
}

function Condicoes({
  r,
  entrada,
  planosPgbl,
  temRenda,
}: {
  r: ResultadoIrpfAnual;
  entrada: EntradaIrpfAnual;
  planosPgbl: number;
  temRenda: boolean;
}) {
  const completo = r.melhorModelo === 'completo';
  return (
    <div className={CARD}>
      <h4 className={TITULO}>Condições para deduzir</h4>
      <p className={`${SUB} mb-4`}>Verificadas com os dados desta simulação</p>
      <ul className="space-y-3.5">
        <Condicao
          estado={!temRenda ? 'info' : completo ? 'ok' : 'alerta'}
          titulo="Declaração pelo modelo completo"
          texto={
            !temRenda
              ? 'O PGBL só reduz o IR no modelo completo. Informe a renda para comparar.'
              : completo
                ? `Suas deduções somam ${formatBRL(r.deducoesCompleto.total)} — acima do desconto simplificado de ${formatBRL(r.descontoSimplificado)}. O modelo completo é o indicado.`
                : `No simplificado (desconto de ${formatBRL(r.descontoSimplificado)}) você paga menos — o PGBL só reduz o IR no completo.${
                    r.pgbl.economiaPotencial > 0
                      ? ' Completar o limite de 12% faria o completo valer a pena.'
                      : ''
                  }`
          }
        />
        <Condicao
          estado={entrada.inss > 0 ? 'ok' : 'alerta'}
          titulo="Contribuição ao INSS no ano"
          texto={
            entrada.inss > 0
              ? `${formatBRL(entrada.inss)} informados. Exigência para deduzir o PGBL.`
              : 'Sem contribuição ao INSS ou a regime próprio, o PGBL não é dedutível.'
          }
        />
        <Condicao
          estado={planosPgbl > 0 ? 'ok' : 'alerta'}
          titulo="Plano é PGBL (não VGBL)"
          texto={
            planosPgbl > 0
              ? `${planosPgbl} ${planosPgbl === 1 ? 'plano marcado' : 'planos marcados'} como PGBL. VGBL não é dedutível e entra em Bens e Direitos.`
              : 'Nenhum plano da carteira marcado como PGBL — marque o tipo na tabela de aportes.'
          }
        />
        <Condicao
          estado="alerta"
          titulo={`Aportes até 31/12/${ANO}`}
          texto={`Vale a data de processamento pela seguradora, que costuma fechar dias antes do fim de dezembro.${
            temRenda && r.pgbl.espacoRestante > 0
              ? ` Ainda há ${formatBRL(r.pgbl.espacoRestante)} de espaço.`
              : ''
          }`}
        />
        <Condicao
          estado="info"
          titulo="Regime de tributação"
          texto="Progressivo ou regressivo (a alíquota cai de 35% para 10% após 10 anos). A escolha pode ser feita até o primeiro resgate."
        />
      </ul>
    </div>
  );
}

function Simulacao({
  r,
  renda,
  irRetido,
}: {
  r: ResultadoIrpfAnual;
  renda: number;
  irRetido: number;
}) {
  const temRenda = renda > 0;
  const d = r.deducoesCompleto;
  const linhas: Array<{
    rotulo: string;
    completo: number | null;
    simplificado: number | null;
    abate?: boolean;
    destaque?: boolean;
  }> = [
    { rotulo: 'Renda tributável', completo: renda, simplificado: renda },
    { rotulo: 'PGBL', completo: d.pgbl, simplificado: null, abate: true, destaque: true },
    { rotulo: 'INSS', completo: d.inss, simplificado: null, abate: true },
    {
      rotulo: 'Dependentes, saúde e educação',
      completo: d.dependentes + d.saude + d.educacao,
      simplificado: null,
      abate: true,
    },
    ...(d.pensaoJudicial + d.livroCaixa > 0
      ? [
          {
            rotulo: 'Pensão e livro-caixa',
            completo: d.pensaoJudicial + d.livroCaixa,
            simplificado: null,
            abate: true,
          },
        ]
      : []),
    {
      rotulo: 'Desconto simplificado (20%, teto)',
      completo: null,
      simplificado: r.descontoSimplificado,
      abate: true,
    },
    {
      rotulo: 'Base de cálculo',
      completo: r.completo.baseCalculo,
      simplificado: r.simplificado.baseCalculo,
    },
    {
      rotulo: 'IR pela tabela',
      completo: r.completo.impostoTabela,
      simplificado: r.simplificado.impostoTabela,
    },
    ...(r.avisos.redutorAplicado
      ? [
          {
            rotulo: 'Redutor Lei 15.270/2025',
            completo: r.completo.redutor,
            simplificado: r.simplificado.redutor,
            abate: true,
            destaque: true,
          },
        ]
      : []),
    {
      rotulo: 'Doações incentivadas (abatem o imposto)',
      completo: r.completo.doacoes,
      simplificado: null,
      abate: true,
      destaque: true,
    },
  ];
  const cel = (v: number | null, abate?: boolean, destaque?: boolean) =>
    v === null ? (
      <span className="text-gray-400 dark:text-gray-500">—</span>
    ) : (
      <span className={abate && destaque && v > 0 ? POSITIVO : undefined}>
        <Sensivel>{`${abate && v > 0 ? '− ' : ''}${formatBRL(v)}`}</Sensivel>
      </span>
    );
  const completoMelhor = r.melhorModelo === 'completo';
  const th = 'py-2 pl-3 text-right text-[11px] font-semibold uppercase tracking-wide';

  return (
    <div className={CARD}>
      <h4 className={TITULO}>Simulação: completa × simplificada</h4>
      <p className={`${SUB} mb-3`}>
        Projeção para a declaração de {ANO + 1} (ano-calendário {ANO})
      </p>
      <table className="w-full text-xs text-gray-700 dark:text-gray-200 sm:text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="py-2 text-left" aria-label="Item" />
            <th
              className={`${th} ${completoMelhor ? 'text-mf-outside' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Completa
            </th>
            <th
              className={`${th} ${!completoMelhor ? 'text-mf-outside' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Simplificada
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.rotulo} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-2 pr-2 text-gray-500 dark:text-gray-400">{l.rotulo}</td>
              <td className="whitespace-nowrap py-2 pl-3 text-right">
                {cel(l.completo, l.abate, l.destaque)}
              </td>
              <td className="whitespace-nowrap py-2 pl-3 text-right">
                {cel(l.simplificado, l.abate, l.destaque)}
              </td>
            </tr>
          ))}
          <tr className="bg-brand-50 dark:bg-white/[0.04]">
            <td className="rounded-l-md px-2 py-2.5 font-semibold text-gray-800 dark:text-white/90">
              IR devido estimado
            </td>
            <td
              className={`whitespace-nowrap py-2.5 pl-3 text-right font-bold ${completoMelhor ? 'text-mf-outside' : ''}`}
            >
              <Sensivel>{formatBRL(r.completo.irDevido)}</Sensivel>
            </td>
            <td
              className={`whitespace-nowrap rounded-r-md py-2.5 pl-3 pr-2 text-right font-bold ${!completoMelhor ? 'text-mf-outside' : ''}`}
            >
              <Sensivel>{formatBRL(r.simplificado.irDevido)}</Sensivel>
            </td>
          </tr>
        </tbody>
      </table>
      {temRenda && (
        <div className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <p>
            {completoMelhor ? (
              <>
                Completa economiza{' '}
                <strong className={POSITIVO}>
                  <Sensivel>{formatBRL(r.economiaCompletoVsSimplificado)}</Sensivel>
                </strong>
                {r.pgbl.economiaAtual > 0 && (
                  <>
                    {' '}
                    — o PGBL responde por <Sensivel>{formatBRL(r.pgbl.economiaAtual)}</Sensivel>
                  </>
                )}
                .
              </>
            ) : (
              <>
                Simplificada economiza{' '}
                <strong className={POSITIVO}>
                  <Sensivel>{formatBRL(-r.economiaCompletoVsSimplificado)}</Sensivel>
                </strong>
                .
              </>
            )}
          </p>
          {irRetido > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <TextoSensivel
                texto={`Retido na fonte no ano: ${formatBRL(irRetido)} → ${
                  r.saldoAjuste >= 0 ? 'restituição projetada' : 'imposto a pagar projetado'
                } ${formatBRL(Math.abs(r.saldoAjuste))}`}
              />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const TIPO_LABEL: Record<TipoPlanoMarcado, string> = { pgbl: 'PGBL', vgbl: 'VGBL' };

const REGIME_LABEL: Record<RegimeTributacao, string> = {
  progressivo: 'Progressiva',
  regressivo: 'Regressiva',
};

function TabelaPlanos({
  planos,
  marcas,
  onMarcar,
  planosMarcados,
  onMarcarRegime,
  totalPgbl,
  qtdPgbl,
}: {
  planos: IRPlanoPrevidencia[];
  marcas: Record<string, TipoPlanoMarcado>;
  onMarcar: (assetId: string, tipo: TipoPlanoMarcado) => void;
  planosMarcados: Record<string, PlanoMarcado>;
  onMarcarRegime: (assetId: string, regime: RegimeTributacao) => void;
  totalPgbl: number;
  qtdPgbl: number;
}) {
  const colunas: ResponsiveColumn<IRPlanoPrevidencia>[] = [
    {
      id: 'plano',
      header: 'Plano',
      mobile: 'primary',
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 dark:text-white">{p.nome}</div>
          {p.cnpj && (
            <div className="text-xs text-gray-500 dark:text-gray-400">CNPJ do fundo {p.cnpj}</div>
          )}
        </div>
      ),
    },
    {
      id: 'tipo',
      header: 'Tipo',
      mobile: 'field',
      valor: 'visivel',
      cell: (p) => {
        const tipo = tipoDoPlano(p, marcas);
        return (
          <select
            aria-label={`Tipo do plano ${p.nome}`}
            value={tipo ?? ''}
            onChange={(e) => onMarcar(p.assetId, e.target.value as TipoPlanoMarcado)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            {tipo === null && <option value="">Confirmar</option>}
            <option value="pgbl">{TIPO_LABEL.pgbl}</option>
            <option value="vgbl">{TIPO_LABEL.vgbl}</option>
          </select>
        );
      },
    },
    {
      id: 'regime',
      header: 'Tributação',
      mobile: 'field',
      valor: 'visivel',
      cell: (p) => {
        const regime = planosMarcados[p.assetId]?.regime;
        return (
          <select
            aria-label={`Tabela de tributação do plano ${p.nome}`}
            title="Progressiva: IR pela tabela do ano no resgate. Regressiva: cai de 35% para 10% com o tempo."
            value={regime ?? ''}
            onChange={(e) => onMarcarRegime(p.assetId, e.target.value as RegimeTributacao)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            {!regime && <option value="">Não sei</option>}
            <option value="progressivo">{REGIME_LABEL.progressivo}</option>
            <option value="regressivo">{REGIME_LABEL.regressivo}</option>
          </select>
        );
      },
    },
    {
      id: 'aportes',
      header: 'Aportes',
      align: 'right',
      mobile: 'field',
      valor: 'sensivel-curto',
      cell: (p) => String(p.aportesQuantidade),
    },
    {
      id: 'total',
      header: 'Total no ano',
      align: 'right',
      mobile: 'value',
      cell: (p) => formatBRL(p.aportesTotal),
    },
    {
      id: 'saldo',
      header: 'Saldo atual',
      align: 'right',
      mobile: 'field',
      cell: (p) => formatBRL(p.saldoAtual),
    },
  ];
  return (
    <ResponsiveTable
      ariaLabel="Aportes em previdência no ano"
      strategy="js"
      columns={colunas}
      rows={planos}
      getRowKey={(p) => p.assetId}
      total={{
        label: 'Total dedutível (PGBL)',
        cells: {
          aportes: String(qtdPgbl),
          total: <Sensivel>{formatBRL(totalPgbl)}</Sensivel>,
        },
      }}
    />
  );
}

function CartaoGasto({
  titulo,
  limite,
  descricao,
  naoDedutivel,
  valor,
  rotuloValor = 'Informado na simulação',
  largo,
}: {
  titulo: string;
  limite: React.ReactNode;
  descricao: React.ReactNode;
  naoDedutivel?: React.ReactNode;
  valor: number;
  rotuloValor?: React.ReactNode;
  largo?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl border border-gray-200 p-4 dark:border-gray-800 ${
        largo ? 'sm:col-span-2 xl:col-span-3' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">{titulo}</p>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mf-patrimonio dark:bg-white/5 dark:text-mf-tranquilidade">
          {limite}
        </span>
      </div>
      <p className={SUB}>{descricao}</p>
      {naoDedutivel && (
        <p className="text-[11.5px] text-amber-700 dark:text-amber-400">{naoDedutivel}</p>
      )}
      <div className="mt-auto flex flex-wrap justify-between gap-2 pt-1 text-xs">
        <span className="text-gray-500 dark:text-gray-400">{rotuloValor}</span>
        <strong className="text-gray-800 dark:text-white/90">
          <Sensivel>{formatBRL(valor)}</Sensivel>
        </strong>
      </div>
    </div>
  );
}

function GastosDedutiveis({ r, entrada }: { r: ResultadoIrpfAnual; entrada: EntradaIrpfAnual }) {
  const d = r.deducoesCompleto;
  const v = (n: number) => <ValorVisivel>{formatBRL(n)}</ValorVisivel>;
  return (
    <div className="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800">
      <div>
        <h4 className={TITULO}>Gastos dedutíveis no modelo completo</h4>
        <p className={SUB}>
          Além do PGBL, estes gastos reduzem a base de cálculo (ou o imposto devido).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CartaoGasto
          titulo="Saúde"
          limite="Sem limite"
          descricao="Plano de saúde, consultas médicas, dentistas, psicólogos, fisioterapeutas, exames, internações, cirurgias e próteses — do titular e dos dependentes."
          naoDedutivel="Não dedutível: remédios, vacinas, óculos e lentes (salvo em nota de hospital)."
          valor={d.saude}
        />
        <CartaoGasto
          titulo="Educação"
          limite={<>{v(REGRAS.tetoEducacaoPorPessoa)} / pessoa</>}
          descricao="Creche, educação infantil, fundamental, médio, técnico, graduação e pós-graduação (titular e dependentes)."
          naoDedutivel="Não dedutível: cursos de idiomas, cursinho pré-vestibular, material escolar, transporte e uniforme."
          valor={d.educacao}
          rotuloValor={
            entrada.educacao > d.educacao ? 'Dedutível (teto atingido)' : 'Informado na simulação'
          }
        />
        <CartaoGasto
          titulo="Dependentes"
          limite={<>{v(REGRAS.deducaoPorDependente)} / dependente</>}
          descricao="Filhos e enteados até 21 anos (24 se universitários), cônjuge ou companheiro, pais e avós com renda até o limite de isenção, entre outros casos previstos."
          naoDedutivel="A renda do dependente passa a ser somada à sua — avalie se compensa."
          valor={d.dependentes}
          rotuloValor={`${Math.max(0, entrada.dependentes)} ${entrada.dependentes === 1 ? 'dependente' : 'dependentes'}`}
        />
        <CartaoGasto
          titulo="Previdência"
          limite="INSS integral · PGBL 12%"
          descricao="INSS (ou regime próprio) sem limite; PGBL, FAPI e previdência fechada até 12% da renda tributável; previdência de dependentes só se também contribuírem ao INSS."
          naoDedutivel="Não dedutível: VGBL."
          valor={d.inss + d.pgbl}
          rotuloValor="Dedutível na simulação"
        />
        <CartaoGasto
          titulo="Pensão alimentícia"
          limite="Sem limite"
          descricao="Fixada por decisão judicial, acordo homologado ou escritura pública. Informe o CPF do beneficiário."
          naoDedutivel="Não dedutível: pensão paga de forma voluntária, sem decisão ou escritura."
          valor={d.pensaoJudicial}
        />
        <CartaoGasto
          titulo="Livro-caixa (autônomos)"
          limite="Até a receita"
          descricao="Autônomo sem CNPJ: despesas necessárias à atividade (administrativas, material consumido, taxas, salários e encargos, publicidade e comissões), limitadas aos rendimentos do trabalho não assalariado."
          naoDedutivel="Não dedutível: maquinário e equipamentos (nem depreciação), despesas financeiras, locomoção (exceto representante comercial), gastos pessoais."
          valor={d.livroCaixa}
        />
        <CartaoGasto
          largo
          titulo="Doações incentivadas — abatem o imposto devido, não a base"
          limite="Até 6% do imposto devido"
          descricao="Fundos dos Direitos da Criança e do Adolescente e da Pessoa Idosa, projetos culturais (Lei Rouanet), audiovisual, incentivo ao esporte, PRONAS/PCD e PRONON. Doações a outras ONGs e igrejas não são dedutíveis."
          valor={r.completo.doacoes}
          rotuloValor={
            <>
              Dedutível na simulação · limite estimado{' '}
              <Sensivel>{formatBRL(r.limiteDoacoes)}</Sensivel>
            </>
          }
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-gray-700 dark:bg-white/[0.04] dark:text-gray-300">
        <p>
          Total de deduções:{' '}
          <strong>
            <Sensivel>{formatBRL(d.total)}</Sensivel>
          </strong>{' '}
          na base +{' '}
          <strong>
            <Sensivel>{formatBRL(r.completo.doacoes)}</Sensivel>
          </strong>{' '}
          no imposto — já aplicados na simulação acima.
        </p>
        <p className={SUB}>
          Guarde recibos e notas com CPF/CNPJ do prestador por 5 anos — a Receita pode pedir.
        </p>
      </div>
    </div>
  );
}

/** "12500.5" → "12.500,50", o formato que o campo aceita (parseCurrencyInput). */
function formatarCampo(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function EstadoSalvo({ estado }: { estado: ReturnType<typeof useSimulacaoPgbl>['estado'] }) {
  if (estado === 'salvando') return <span>Salvando…</span>;
  if (estado === 'salvo') return <span>Salvo.</span>;
  if (estado === 'erro')
    return (
      <span className="text-red-600 dark:text-red-400">
        Não foi possível salvar agora; tente de novo.
      </span>
    );
  return null;
}

/** De onde veio o valor preenchido pelo fluxo de caixa (até 4 linhas). */
function OrigemFluxo({ item }: { item: ItemSugerido }) {
  const primeiras = item.linhas.slice(0, 4);
  const resto = item.linhas.length - primeiras.length;
  return (
    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
      Do fluxo de caixa:{' '}
      {primeiras.map((l, i) => (
        <React.Fragment key={`${l.grupo}-${l.linha}`}>
          {i > 0 ? ', ' : ''}
          {l.linha} <Sensivel>{formatBRL(l.total)}</Sensivel>
        </React.Fragment>
      ))}
      {resto > 0 ? ` e mais ${resto}` : ''}.
    </p>
  );
}
