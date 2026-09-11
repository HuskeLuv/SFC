/**
 * Fonte "divida": parcelas do cronograma de cada financiamento ATIVO (mesma
 * função de cronograma da tela de Dívidas, corrigida pelo índice realizado
 * em contratos TR/IPCA/CDI) e o vencimento mensal das rotativas.
 *
 * A dívida guarda só o MÊS do primeiro vencimento; até existir o campo de
 * dia (Fase 2), a parcela cai no dia 1 e o detalhe marca `diaInformado: false`.
 */
import prisma from '@/lib/prisma';
import type { Divida, DividaPagamento } from '@prisma/client';
import {
  corrigirCronograma,
  gerarCronograma,
  parcelasCortadasDe,
  type PagamentoDividaInput,
  type ParcelaCronograma,
} from '@/services/dividas/amortizacao';
import { isIndexadorCorrigivel, monthlyIndexFactors } from '@/services/dividas/indexacaoDivida';
import { decimalToNumber, toPagamentoInputs } from '@/app/api/dividas/_lib/serializer';
import type { EventoAgenda, Periodo } from '../types';
import { diasNoMes, montar, partes } from '../datas';

const round2 = (v: number) => Math.round(v * 100) / 100;

/** "AAAA-MM" + dia (limitado ao tamanho do mês) → data civil. */
export function diaDoMes(mes: string, dia: number): string {
  const [ano, m] = mes.split('-').map(Number);
  return montar(ano, m - 1, Math.min(dia, diasNoMes(ano, m - 1)));
}

export interface DividaResumida {
  id: string;
  nome: string;
  instituicao: string | null;
  modalidade: string;
  indexador: string;
  diaVencimento: number | null;
}

/** Parcelas do cronograma que caem no período, com marca de paga/amortizada. */
export function parcelasComoEventos(
  divida: DividaResumida,
  cronograma: ParcelaCronograma[],
  pagamentos: PagamentoDividaInput[],
  periodo: Periodo,
): EventoAgenda[] {
  const pagas = new Set(
    pagamentos
      .filter((p) => p.tipo === 'pagamento' && p.parcelaNumero != null)
      .map((p) => p.parcelaNumero as number),
  );
  const cortadas = parcelasCortadasDe(pagamentos);
  const total = Math.max(0, cronograma.length - cortadas);
  const dia = divida.diaVencimento ?? 1;
  const out: EventoAgenda[] = [];
  for (const p of cronograma) {
    if (p.numero > total) continue; // quitada por amortização de prazo
    const data = diaDoMes(p.mes, dia);
    if (data < periodo.de || data > periodo.ate) continue;
    const paga = pagas.has(p.numero);
    const valor = round2(p.parcelaCorrigida ?? p.parcela);
    out.push({
      id: `divida:${divida.id}:${p.numero}`,
      tipo: 'divida',
      titulo: `${divida.nome} · parcela ${p.numero}/${total}`,
      data,
      dataFim: null,
      hora: null,
      valor,
      descricao: paga ? 'Parcela paga' : 'Parcela a pagar',
      link: '/dividas',
      detalhe: {
        dividaId: divida.id,
        instituicao: divida.instituicao,
        numero: p.numero,
        total,
        paga,
        juros: round2(p.jurosCorrigido ?? p.juros),
        amortizacao: round2(p.amortizacaoCorrigida ?? p.amortizacao),
        saldoDevedor: round2(p.saldoDevedorCorrigido ?? p.saldoDevedor),
        indexador: divida.indexador,
        diaInformado: divida.diaVencimento != null,
      },
    });
  }
  return out;
}

/** Rotativa (cartão, cheque especial): um lembrete de vencimento por mês. */
export function rotativaComoEventos(
  divida: DividaResumida,
  dataSaldoInicial: string | null,
  periodo: Periodo,
): EventoAgenda[] {
  const dia = divida.diaVencimento ?? 1;
  const de = partes(periodo.de);
  const ate = partes(periodo.ate);
  const out: EventoAgenda[] = [];
  let ano = de.ano;
  let mes = de.mes;
  while (ano < ate.ano || (ano === ate.ano && mes <= ate.mes)) {
    const mesStr = `${ano}-${String(mes + 1).padStart(2, '0')}`;
    if (!dataSaldoInicial || mesStr >= dataSaldoInicial) {
      const data = diaDoMes(mesStr, dia);
      if (data >= periodo.de && data <= periodo.ate) {
        out.push({
          id: `divida:${divida.id}:${mesStr}`,
          tipo: 'divida',
          titulo: `${divida.nome} · vencimento`,
          data,
          dataFim: null,
          hora: null,
          valor: null,
          descricao: 'Dívida rotativa: o valor depende da fatura do mês',
          link: '/dividas',
          detalhe: {
            dividaId: divida.id,
            instituicao: divida.instituicao,
            rotativa: true,
            diaInformado: divida.diaVencimento != null,
          },
        });
      }
    }
    mes += 1;
    if (mes > 11) {
      mes = 0;
      ano += 1;
    }
  }
  return out;
}

type DividaComPagamentos = Divida & { pagamentos: DividaPagamento[] };

function resumida(d: Divida): DividaResumida {
  return {
    id: d.id,
    nome: d.nome,
    instituicao: d.instituicao,
    modalidade: d.modalidade,
    indexador: d.indexador,
    // Campo previsto para a Fase 2 (dia do vencimento); por ora não existe.
    diaVencimento: (d as { diaVencimento?: number | null }).diaVencimento ?? null,
  };
}

async function cronogramaDe(d: DividaComPagamentos): Promise<ParcelaCronograma[]> {
  if (
    d.modalidade !== 'financiamento' ||
    d.principal == null ||
    d.taxaAm == null ||
    d.prazoMeses == null ||
    !d.sistema ||
    !d.primeiroVencimento
  ) {
    return [];
  }
  let cronograma = gerarCronograma({
    principal: decimalToNumber(d.principal),
    taxaAm: decimalToNumber(d.taxaAm),
    prazoMeses: d.prazoMeses,
    primeiroVencimento: d.primeiroVencimento,
    sistema: d.sistema,
  });
  if (isIndexadorCorrigivel(d.indexador) && cronograma.length > 0) {
    const fatores = await monthlyIndexFactors(
      d.indexador,
      d.primeiroVencimento,
      cronograma[cronograma.length - 1].mes,
    );
    cronograma = corrigirCronograma(cronograma, fatores);
  }
  return cronograma;
}

export async function eventosDividas(userId: string, periodo: Periodo): Promise<EventoAgenda[]> {
  // Só dívidas 'ativa' projetam parcelas (em espera/pausada/quitada não).
  const dividas = await prisma.divida.findMany({
    where: { userId, status: 'ativa' },
    include: { pagamentos: true },
  });
  const porDivida = await Promise.all(
    dividas.map(async (d) => {
      const r = resumida(d);
      if (d.modalidade === 'rotativa') return rotativaComoEventos(r, d.dataSaldoInicial, periodo);
      const cronograma = await cronogramaDe(d);
      return parcelasComoEventos(r, cronograma, toPagamentoInputs(d.pagamentos), periodo);
    }),
  );
  return porDivida.flat();
}
