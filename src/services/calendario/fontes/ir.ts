/**
 * Fonte "ir": prazos de imposto de renda do investidor.
 *
 *  - DARF de renda variável: apuração mensal (ações BR / FII / ETF BR) com IR
 *    devido → vence no ÚLTIMO DIA ÚTIL do mês seguinte ao da venda.
 *  - Come-cotas: 31/05 e 30/11, quando há fundo sujeito à cobrança.
 *  - Declaração anual do IRPF: 31/05 (prazo final).
 *
 * Os números vêm dos MESMOS loaders da tela de IR (`@/services/ir/*Loader`),
 * então Agenda e Análises nunca divergem. Ambos percorrem todo o histórico de
 * transações, por isso o resultado é cacheado 5 min por usuário.
 */
import { getTtlCache } from '@/lib/simpleTtlCache';
import { carregarApuracaoRendaVariavel } from '@/services/ir/rendaVariavelLoader';
import { carregarComecotas } from '@/services/ir/comecotasLoader';
import type { ApuracaoResult } from '@/services/ir/rendaVariavelIR';
import type { ComecotasResult } from '@/services/ir/comecotasIR';
import { prevBusinessDayB3 } from '@/utils/feriadosB3';
import type { EventoAgenda, Periodo } from '../types';
import { dataCivil, diasNoMes, montar, partes } from '../datas';

const CACHE_NS = 'agenda-ir';
const CACHE_TTL_MS = 5 * 60 * 1000;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Último dia ÚTIL do mês (feriados B3 + fim de semana). `mes` é 0-indexado,
 * como em `datas.ts`.
 *
 * `feriadosB3` cobre os 12 feriados NACIONAIS; pregões que a B3 fecha sem ser
 * feriado nacional (31/12) contam como dia útil aqui. Na prática o DARF pode
 * ser pago no dia útil bancário seguinte, então a data segue servindo de aviso.
 */
export function ultimoDiaUtilDoMes(ano: number, mes: number): string {
  const ultimo = Date.UTC(ano, mes, diasNoMes(ano, mes));
  return dataCivil(new Date(prevBusinessDayB3(ultimo)));
}

/** "AAAA-MM" da apuração → vencimento do DARF (último dia útil do mês seguinte). */
export function vencimentoDarf(yearMonth: string): string {
  const [ano, mes] = yearMonth.split('-').map(Number);
  return ultimoDiaUtilDoMes(ano, mes); // mes (1-indexado) = mês seguinte 0-indexado
}

const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function mesPorExtenso(yearMonth: string): string {
  const [ano, mes] = yearMonth.split('-').map(Number);
  return `${MESES_PT[mes - 1]}/${ano}`;
}

/** DARF de renda variável: um por mês apurado com IR devido. */
export function darfComoEventos(apuracao: ApuracaoResult, periodo: Periodo): EventoAgenda[] {
  const out: EventoAgenda[] = [];
  for (const mes of apuracao.meses) {
    if (mes.irTotalDevido <= 0) continue;
    const data = vencimentoDarf(mes.yearMonth);
    if (data < periodo.de || data > periodo.ate) continue;
    const categorias = Object.values(mes.porCategoria)
      .filter((c) => c && c.irDevido > 0)
      .map(
        (c) =>
          `${c!.category === 'fii' ? 'FII' : c!.category === 'etf_br' ? 'ETF' : 'ações'}: ${round2(c!.irDevido)}`,
      );
    out.push({
      id: `ir:darf:${mes.yearMonth}`,
      tipo: 'ir',
      titulo: `DARF · vendas de ${mesPorExtenso(mes.yearMonth)}`,
      data,
      dataFim: null,
      hora: null,
      valor: round2(mes.irTotalDevido),
      descricao: `IR sobre renda variável apurado em ${mesPorExtenso(mes.yearMonth)}. Código 6015, vence no último dia útil do mês.`,
      link: '/analises',
      detalhe: {
        evento: 'darf',
        competencia: mes.yearMonth,
        irTotalDevido: round2(mes.irTotalDevido),
        porCategoria: categorias,
      },
    });
  }
  return out;
}

/**
 * Come-cotas: 31/05 e 30/11 dentro do período. Datas fixas (não recuam para o
 * dia útil anterior) para bater com a projeção da tela de IR — ver
 * `proximaDataComecotas` em comecotasIR.ts.
 */
export function comecotasComoEventos(comecotas: ComecotasResult, periodo: Periodo): EventoAgenda[] {
  const sujeitos = comecotas.fundos.filter((f) => !f.isentoComeCotas);
  if (sujeitos.length === 0) return [];

  const proxima = comecotas.proximaCobrancaGlobal?.slice(0, 10) ?? null;
  const out: EventoAgenda[] = [];
  const { ano: anoDe } = partes(periodo.de);
  const { ano: anoAte } = partes(periodo.ate);
  for (let ano = anoDe; ano <= anoAte; ano++) {
    for (const [mes, dia] of [
      [4, 31],
      [10, 30],
    ] as const) {
      const data = montar(ano, mes, dia);
      if (data < periodo.de || data > periodo.ate) continue;
      // O valor projetado só vale para a PRÓXIMA cobrança; as seguintes
      // dependem do rendimento que ainda vai acontecer.
      const ehProxima = data === proxima;
      out.push({
        id: `ir:comecotas:${data}`,
        tipo: 'ir',
        titulo: 'Come-cotas dos fundos',
        data,
        dataFim: null,
        hora: null,
        valor: ehProxima ? round2(comecotas.totalProximaCobranca) : null,
        descricao: ehProxima
          ? `Cobrança semestral estimada em ${sujeitos.length} fundo(s). O valor sai em cotas, sem precisar pagar nada.`
          : `Cobrança semestral em ${sujeitos.length} fundo(s). O valor depende do rendimento até lá.`,
        link: '/analises',
        detalhe: {
          evento: 'comecotas',
          fundos: sujeitos.length,
          estimativa: ehProxima ? round2(comecotas.totalProximaCobranca) : null,
        },
      });
    }
  }
  return out;
}

/** Prazo final da declaração anual do IRPF (31/05). */
export function declaracaoComoEventos(periodo: Periodo): EventoAgenda[] {
  const out: EventoAgenda[] = [];
  const { ano: anoDe } = partes(periodo.de);
  const { ano: anoAte } = partes(periodo.ate);
  for (let ano = anoDe; ano <= anoAte; ano++) {
    const data = montar(ano, 4, 31);
    if (data < periodo.de || data > periodo.ate) continue;
    out.push({
      id: `ir:declaracao:${ano}`,
      tipo: 'ir',
      titulo: 'Declaração do IRPF · prazo final',
      data,
      dataFim: null,
      hora: null,
      valor: null,
      descricao: `Último dia para entregar a declaração do ano-calendário ${ano - 1}.`,
      link: '/analises',
      detalhe: { evento: 'declaracao', anoCalendario: ano - 1 },
    });
  }
  return out;
}

interface DadosIr {
  apuracao: ApuracaoResult;
  comecotas: ComecotasResult;
}

async function dadosIr(userId: string): Promise<DadosIr> {
  const cache = getTtlCache<DadosIr>(CACHE_NS);
  const hit = cache.get(userId);
  if (hit) return hit;
  const [apuracao, comecotas] = await Promise.all([
    carregarApuracaoRendaVariavel(userId),
    carregarComecotas(userId),
  ]);
  const dados = { apuracao, comecotas };
  cache.set(userId, dados, CACHE_TTL_MS);
  return dados;
}

export async function eventosIr(userId: string, periodo: Periodo): Promise<EventoAgenda[]> {
  // A declaração não depende de posição nenhuma — vale mesmo sem carteira.
  const declaracao = declaracaoComoEventos(periodo);
  const { apuracao, comecotas } = await dadosIr(userId);
  return [
    ...darfComoEventos(apuracao, periodo),
    ...comecotasComoEventos(comecotas, periodo),
    ...declaracao,
  ];
}
