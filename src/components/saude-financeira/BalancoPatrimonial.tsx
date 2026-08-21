'use client';

import Link from 'next/link';
import type {
  SaudeFinanceiraIndicadores,
  SaudeFinanceiraPayload,
  TendenciasSaude,
} from '@/hooks/useSaudeFinanceira';
import { TIPO_LABELS } from '@/components/dividas/utils';
import type { DividaTipo } from '@/hooks/useDividas';
import { formatBRL, formatPercent, tendenciaSeta } from './utils';

// Linhas-modelo do lado Passivo (formato planilha): tipos exibidos zerados
// quando não há dívida cadastrada. Não usar TIPOS_ROTATIVA/TIPOS_FINANCIAMENTO
// aqui — 'emprestimo_pessoal' e 'outro' constam nas duas listas e duplicariam
// a linha nos dois quadrantes. Na planilha, empréstimo pessoal fica no longo.
const TIPOS_MODELO_CURTO: readonly DividaTipo[] = ['cheque_especial', 'cartao_credito'];
const TIPOS_MODELO_LONGO: readonly DividaTipo[] = [
  'financiamento_imobiliario',
  'financiamento_veiculo',
  'emprestimo_pessoal',
  'consignado',
];

interface BalancoPatrimonialProps {
  indicadores: SaudeFinanceiraIndicadores;
  composicao: SaudeFinanceiraPayload['composicao'];
  tendencias: TendenciasSaude;
}

function Seta({ seta }: { seta: ReturnType<typeof tendenciaSeta> }) {
  if (!seta) return null;
  return (
    <span className={`ml-1 text-sm font-semibold ${seta.className}`} title="vs mês anterior">
      {seta.glyph}
    </span>
  );
}

type Item = { key: string; label: string; valor: number };

/** Célula de item (rótulo + valor) de um dos lados; vazia quando o outro lado tem mais linhas. */
function ItemCells({ item }: { item: Item | undefined }) {
  if (!item) return <td colSpan={2} className="px-3 py-1" />;
  return (
    <>
      <td className="px-3 py-1 text-sm text-gray-600 dark:text-gray-300">{item.label}</td>
      <td
        className={`whitespace-nowrap px-3 py-1 text-right text-sm font-medium ${
          item.valor === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white/90'
        }`}
      >
        {formatBRL(item.valor)}
      </td>
    </>
  );
}

/** Linha TOTAL de um quadrante (formato da planilha: negrito, faixa clara). */
function TotalCells({ label, valor }: { label: string; valor: number }) {
  return (
    <>
      <td className="px-3 py-1.5 text-sm font-bold text-gray-800 dark:text-gray-100">{label}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right text-sm font-bold text-gray-900 dark:text-white/90">
        {formatBRL(valor)}
      </td>
    </>
  );
}

/**
 * Bloco ④ — balanço patrimonial no FORMATO DA PLANILHA (ticket QA 19/08/2026):
 * tabela pareada Ativo × Passivo com quadrantes "curto prazo" e "longo prazo"
 * lado a lado, TOTAL por quadrante e a barra "Total do Patrimônio Líquido".
 * Ativos de alta liquidez = curto prazo; baixa liquidez = longo prazo (mesma
 * conta de sempre — muda a apresentação, não o cálculo).
 */
export default function BalancoPatrimonial({
  indicadores,
  composicao,
  tendencias,
}: BalancoPatrimonialProps) {
  const { balanco, metricas } = indicadores;

  const ativosCurto: Item[] = composicao.altaLiquidez.map((l) => ({
    key: l.chave,
    label: l.label,
    valor: l.valor,
  }));
  const ativosLongo: Item[] = composicao.baixaLiquidez.map((l) => ({
    key: l.chave,
    label: l.label,
    valor: l.valor,
  }));
  const passivoItem = (p: SaudeFinanceiraPayload['composicao']['passivos'][number]): Item => ({
    key: p.id,
    label: `${p.nome} (${TIPO_LABELS[p.tipo as DividaTipo] ?? p.tipo})`,
    valor: p.saldo,
  });
  // Formato planilha (ticket 21/08/2026): tipos de dívida SEM cadastro também
  // aparecem, zerados ("Outro" só aparece com dívida real). Reais vêm antes.
  const tiposCadastrados = new Set(composicao.passivos.map((p) => p.tipo as DividaTipo));
  const placeholdersPassivo = (tipos: readonly DividaTipo[]): Item[] =>
    tipos
      .filter((t) => !tiposCadastrados.has(t))
      .map((t) => ({ key: `modelo-${t}`, label: TIPO_LABELS[t], valor: 0 }));
  const passivosCurto = [
    ...composicao.passivos.filter((p) => p.prazo === 'curto').map(passivoItem),
    ...placeholdersPassivo(TIPOS_MODELO_CURTO),
  ];
  const passivosLongo = [
    ...composicao.passivos.filter((p) => p.prazo === 'longo').map(passivoItem),
    ...placeholdersPassivo(TIPOS_MODELO_LONGO),
  ];

  const pares = (a: Item[], b: Item[]): Array<[Item | undefined, Item | undefined]> =>
    Array.from({ length: Math.max(a.length, b.length, 1) }, (_, i) => [a[i], b[i]]);

  const subHeaderClass =
    'bg-gray-200 px-3 py-1 text-center text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200';
  const totalRowClass =
    'border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.04]';

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">
          Balanço Patrimonial
        </h3>
        <Link
          href="/dividas"
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 print:hidden"
        >
          Gerenciar dívidas →
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <thead>
            {/* Cabeçalho da planilha: faixa azul Ativo | Passivo */}
            <tr>
              <th
                colSpan={2}
                className="border-r border-white/20 px-3 py-1.5 text-center text-sm font-bold text-white"
                style={{ backgroundColor: '#366092' }}
              >
                Ativo
              </th>
              <th
                colSpan={2}
                className="px-3 py-1.5 text-center text-sm font-bold text-white"
                style={{ backgroundColor: '#366092' }}
              >
                Passivo
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Quadrante curto prazo */}
            <tr>
              <td
                colSpan={2}
                className={`${subHeaderClass} border-r border-gray-200 dark:border-gray-600`}
              >
                Ativos curto prazo
              </td>
              <td colSpan={2} className={subHeaderClass}>
                Passivos curto prazo
              </td>
            </tr>
            {pares(ativosCurto, passivosCurto).map(([a, p], i) => (
              <tr key={`curto-${a?.key ?? 'x'}-${p?.key ?? 'x'}-${i}`}>
                <ItemCells item={a} />
                <ItemCells item={p} />
              </tr>
            ))}
            <tr className={totalRowClass}>
              <TotalCells label="TOTAL Ativos Curto Prazo" valor={balanco.ativosAltaLiquidez} />
              <TotalCells label="TOTAL Passivos Curto Prazo" valor={balanco.passivosCurtoPrazo} />
            </tr>

            {/* Quadrante longo prazo */}
            <tr>
              <td
                colSpan={2}
                className={`${subHeaderClass} border-r border-gray-200 dark:border-gray-600`}
              >
                Ativos longo prazo
              </td>
              <td colSpan={2} className={subHeaderClass}>
                Passivos longo prazo
              </td>
            </tr>
            {pares(ativosLongo, passivosLongo).map(([a, p], i) => (
              <tr key={`longo-${a?.key ?? 'x'}-${p?.key ?? 'x'}-${i}`}>
                <ItemCells item={a} />
                <ItemCells item={p} />
              </tr>
            ))}
            <tr className={totalRowClass}>
              <TotalCells label="TOTAL Ativos Longo Prazo" valor={balanco.ativosBaixaLiquidez} />
              <TotalCells label="TOTAL Passivos Longo Prazo" valor={balanco.passivosLongoPrazo} />
            </tr>

            {/* Barra do PL (formato planilha: faixa escura com o valor) */}
            <tr>
              <td
                colSpan={2}
                className="px-3 py-2 text-sm font-bold text-white"
                style={{ backgroundColor: '#244061' }}
              >
                Total do Patrimônio Líquido
              </td>
              <td
                colSpan={2}
                className="px-3 py-2 text-right text-base font-bold"
                style={{ backgroundColor: '#244061' }}
              >
                <span className={balanco.patrimonioLiquido < 0 ? 'text-red-300' : 'text-white'}>
                  {formatBRL(balanco.patrimonioLiquido)}
                  <Seta seta={tendenciaSeta(tendencias.patrimonioLiquido, true)} />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Linha B66 da planilha: grau de independência medido pelo PL */}
      <div className="mt-3 flex items-center justify-between px-1 text-sm">
        <span className="text-gray-600 dark:text-gray-300">
          Grau de independência financeira medido pelo patrimônio líquido
        </span>
        <span className="font-semibold text-gray-900 dark:text-white/90">
          {formatPercent(metricas.grauIndependencia)}
          <Seta seta={tendenciaSeta(tendencias.grauIndependencia, true)} />
        </span>
      </div>
    </div>
  );
}
