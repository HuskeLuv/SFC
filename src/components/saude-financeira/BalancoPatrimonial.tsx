'use client';

import Link from 'next/link';
import type {
  SaudeFinanceiraIndicadores,
  SaudeFinanceiraPayload,
  TendenciasSaude,
} from '@/hooks/useSaudeFinanceira';
import { TIPO_LABELS } from '@/components/dividas/utils';
import type { DividaTipo } from '@/hooks/useDividas';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { formatBRL, formatPercent, tendenciaSeta } from './utils';
import BalancoMobile from './mobile/BalancoMobile';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_SECTION_STYLE,
} from '@/components/ui/table/tableStyles';

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

/** Celular sem verde (PWA fase 3): a seta "boa" vira azul da paleta só na tela abaixo de lg. */
const SETA_SEM_VERDE = (className: string) =>
  className.includes('green')
    ? ' mscreen:text-mf-patrimonio dark:mscreen:text-mf-tranquilidade'
    : '';

function Seta({ seta }: { seta: ReturnType<typeof tendenciaSeta> }) {
  if (!seta) return null;
  return (
    <span
      className={`ml-1 text-sm font-semibold ${seta.className}${SETA_SEM_VERDE(seta.className)}`}
      title="vs mês anterior"
    >
      {seta.glyph}
    </span>
  );
}

export type BalancoItem = { key: string; label: string; valor: number };
type Item = BalancoItem;

/** Célula de item (rótulo + valor) de um dos lados; vazia quando o outro lado tem mais linhas. */
function ItemCells({ item }: { item: Item | undefined }) {
  if (!item) return <td colSpan={2} className={TABLE_STYLES.td} />;
  return (
    <>
      <td className={TABLE_STYLES.td}>{item.label}</td>
      <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-medium`}>
        <span
          className={
            item.valor === 0
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-900 dark:text-white/90'
          }
        >
          {formatBRL(item.valor)}
        </span>
      </td>
    </>
  );
}

/** Linha TOTAL de um quadrante (formato da planilha: negrito, faixa clara). */
function TotalCells({ label, valor }: { label: string; valor: number }) {
  return (
    <>
      <td className={`${TABLE_STYLES.td} font-semibold`}>{label}</td>
      <td className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-semibold`}>
        {formatBRL(valor)}
      </td>
    </>
  );
}

export interface QuadranteBalanco {
  titulo: string;
  itens: BalancoItem[];
  totalLabel: string;
  total: number;
}

export interface QuadrantesBalanco {
  ativo: { curto: QuadranteBalanco; longo: QuadranteBalanco };
  passivo: { curto: QuadranteBalanco; longo: QuadranteBalanco };
  patrimonioLiquido: number;
}

/**
 * Extração pura dos quadrantes do balanço (PWA fase 3): as MESMAS linhas e totais da tabela da
 * planilha, para a tabela (desktop/impressão) e o BalancoMobile (celular) lerem a mesma fonte.
 */
export function montarQuadrantes(
  composicao: SaudeFinanceiraPayload['composicao'],
  indicadores: SaudeFinanceiraIndicadores,
): QuadrantesBalanco {
  const { balanco } = indicadores;
  const ativosCurto: BalancoItem[] = composicao.altaLiquidez.map((l) => ({
    key: l.chave,
    label: l.label,
    valor: l.valor,
  }));
  const ativosLongo: BalancoItem[] = composicao.baixaLiquidez.map((l) => ({
    key: l.chave,
    label: l.label,
    valor: l.valor,
  }));
  const passivoItem = (
    p: SaudeFinanceiraPayload['composicao']['passivos'][number],
  ): BalancoItem => ({
    key: p.id,
    label: `${p.nome} (${TIPO_LABELS[p.tipo as DividaTipo] ?? p.tipo})`,
    valor: p.saldo,
  });
  // Formato planilha (ticket 21/08/2026): tipos de dívida SEM cadastro também
  // aparecem, zerados ("Outro" só aparece com dívida real). Reais vêm antes.
  const tiposCadastrados = new Set(composicao.passivos.map((p) => p.tipo as DividaTipo));
  const placeholdersPassivo = (tipos: readonly DividaTipo[]): BalancoItem[] =>
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

  return {
    ativo: {
      curto: {
        titulo: 'Ativos curto prazo',
        itens: ativosCurto,
        totalLabel: 'TOTAL Ativos Curto Prazo',
        total: balanco.ativosAltaLiquidez,
      },
      longo: {
        titulo: 'Ativos longo prazo',
        itens: ativosLongo,
        totalLabel: 'TOTAL Ativos Longo Prazo',
        total: balanco.ativosBaixaLiquidez,
      },
    },
    passivo: {
      curto: {
        titulo: 'Passivos curto prazo',
        itens: passivosCurto,
        totalLabel: 'TOTAL Passivos Curto Prazo',
        total: balanco.passivosCurtoPrazo,
      },
      longo: {
        titulo: 'Passivos longo prazo',
        itens: passivosLongo,
        totalLabel: 'TOTAL Passivos Longo Prazo',
        total: balanco.passivosLongoPrazo,
      },
    },
    patrimonioLiquido: balanco.patrimonioLiquido,
  };
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
  const isBelowLg = useIsBelowLg();
  const quadrantes = montarQuadrantes(composicao, indicadores);
  const ativosCurto = quadrantes.ativo.curto.itens;
  const ativosLongo = quadrantes.ativo.longo.itens;
  const passivosCurto = quadrantes.passivo.curto.itens;
  const passivosLongo = quadrantes.passivo.longo.itens;

  const pares = (a: Item[], b: Item[]): Array<[Item | undefined, Item | undefined]> =>
    Array.from({ length: Math.max(a.length, b.length, 1) }, (_, i) => [a[i], b[i]]);

  // Sub-cabeçalhos "curto/longo prazo": linha de seção (azul tranquilidade)
  // do padrão único de tabelas; totais de quadrante: linha de total.
  const subHeaderClass = `${TABLE_STYLES.td} text-center text-white`;

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div
        className={`flex items-center justify-between${isBelowLg ? ' mscreen:justify-end' : ''}`}
      >
        <h3
          className={`text-base font-semibold text-gray-900 dark:text-white/90${
            isBelowLg ? ' mscreen:hidden' : ''
          }`}
        >
          Balanço Patrimonial
        </h3>
        <Link
          href="/dividas"
          className="text-xs font-medium text-mf-patrimonio hover:underline dark:text-mf-tranquilidade print:hidden mscreen:inline-flex mscreen:min-h-11 mscreen:items-center mscreen:text-sm"
        >
          Gerenciar dívidas →
        </Link>
      </div>

      {isBelowLg ? (
        <div className="hidden mscreen:block">
          <BalancoMobile quadrantes={quadrantes} />
        </div>
      ) : null}

      <div className={`mt-4 ${TABLE_STYLES.wrapper}${isBelowLg ? ' mscreen:hidden' : ''}`}>
        <table className={`${TABLE_STYLES.table} min-w-[640px]`}>
          <thead>
            {/* Cabeçalho da planilha: faixa azul Ativo | Passivo */}
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <th colSpan={2} className={`${TABLE_STYLES.th} text-center`}>
                Ativo
              </th>
              <th colSpan={2} className={`${TABLE_STYLES.th} text-center`}>
                Passivo
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Quadrante curto prazo */}
            <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
              <td colSpan={2} className={subHeaderClass}>
                Ativos curto prazo
              </td>
              <td colSpan={2} className={subHeaderClass}>
                Passivos curto prazo
              </td>
            </tr>
            {pares(ativosCurto, passivosCurto).map(([a, p], i) => (
              <tr key={`curto-${a?.key ?? 'x'}-${p?.key ?? 'x'}-${i}`} className={TABLE_STYLES.row}>
                <ItemCells item={a} />
                <ItemCells item={p} />
              </tr>
            ))}
            <tr className={TABLE_STYLES.totalRow}>
              <TotalCells label="TOTAL Ativos Curto Prazo" valor={balanco.ativosAltaLiquidez} />
              <TotalCells label="TOTAL Passivos Curto Prazo" valor={balanco.passivosCurtoPrazo} />
            </tr>

            {/* Quadrante longo prazo */}
            <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
              <td colSpan={2} className={subHeaderClass}>
                Ativos longo prazo
              </td>
              <td colSpan={2} className={subHeaderClass}>
                Passivos longo prazo
              </td>
            </tr>
            {pares(ativosLongo, passivosLongo).map(([a, p], i) => (
              <tr key={`longo-${a?.key ?? 'x'}-${p?.key ?? 'x'}-${i}`} className={TABLE_STYLES.row}>
                <ItemCells item={a} />
                <ItemCells item={p} />
              </tr>
            ))}
            <tr className={TABLE_STYLES.totalRow}>
              <TotalCells label="TOTAL Ativos Longo Prazo" valor={balanco.ativosBaixaLiquidez} />
              <TotalCells label="TOTAL Passivos Longo Prazo" valor={balanco.passivosLongoPrazo} />
            </tr>

            {/* Barra do PL: linha de total destacada (antes faixa #244061 fora da paleta) */}
            <tr className={`${TABLE_STYLES.totalRow} font-semibold`}>
              <td colSpan={2} className={`${TABLE_STYLES.td} font-semibold`}>
                Total do Patrimônio Líquido
              </td>
              <td colSpan={2} className={`${TABLE_STYLES.td} text-right font-semibold`}>
                <span
                  className={`text-base ${
                    balanco.patrimonioLiquido < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-900 dark:text-white/90'
                  }`}
                >
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
