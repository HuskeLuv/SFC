/**
 * FCA (Formulário Cadastral): cadastro das companhias (geral) e tickers negociados (valor_mobiliario).
 *
 * - Maior Versao por companhia (a CVM guarda as reentregas do mesmo formulário).
 * - Tickers: Mercado = 'Bolsa', código no padrão B3 (4 letras + 1–2 dígitos) e valor mobiliário de
 *   ações ON/PN ou units. A classe gravada vem do SUFIXO (regra 18): o FCA traz MGLU3 como PN.
 * - Units: composição em texto livre (parseComposicaoUnit); sem formato conhecido ⇒ alerta.
 * - Data_Fim_Negociacao preenchida ⇒ ticker encerrado (fecha a vigência).
 * - Só entram companhias com pelo menos um ticker de ações em bolsa (universo da análise).
 * - Linhas de ações/units que o FCA traz erradas (código "000000"/"4030"/"ADR", mercado diferente de
 *   'Bolsa') ficam em `rejeitadas`, com o cadastro da companhia em `ciasSemTicker`: a etapa
 *   completarComB3 (regras/acoes/tickersB3.ts) usa as duas para casar o ticker negociado na B3.
 */
import { cnpjOuOriginal } from '@/services/analiseAtivos/regras/comum/cnpj';
import { lerCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { linhasDaEntrada, type EntradaZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  COLUNAS_FCA_GERAL,
  COLUNAS_FCA_VALOR_MOBILIARIO,
  entradaFca,
} from '@/services/analiseAtivos/acoes/cvmArquivos';
import {
  classeDoTicker,
  parseComposicaoUnit,
} from '@/services/analiseAtivos/regras/acoes/classeTitulo';
import type { AlertaJob, ClasseTitulo } from '@/services/analiseAtivos/tipos';

export interface CiaFca {
  cnpj: string;
  cdCvm: string;
  nome: string;
  setorAtividade: string | null;
  situacao: string | null;
  mesFimExercicio: number | null;
  dataRef: string;
  versao: number;
}

export interface TituloFca {
  cnpj: string;
  symbol: string;
  classeTitulo: ClasseTitulo;
  classeFca: string | null;
  unitQtdOn: number | null;
  unitQtdPn: number | null;
  composicaoTexto: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  /** 'fca' (padrão) ou 'b3' quando o ticker veio da B3 porque o FCA estava errado (tickersB3.ts) */
  origem?: 'fca' | 'b3';
}

/** Linha de ações/units do FCA (versão vigente) que não virou título: código ou mercado errado. */
export interface LinhaFcaRejeitada {
  cnpj: string;
  /** código como veio (pode ser '000000', '4030', 'ADR', 'OBTC'…) */
  codigo: string;
  classeFca: string;
  motivo: 'codigo_invalido' | 'mercado';
  mercado: string;
  composicaoTexto: string | null;
  dataInicio: string | null;
  dataFim: string | null;
}

export interface ResultadoFca {
  cias: Map<string, CiaFca>;
  titulos: TituloFca[];
  alertas: AlertaJob[];
  linhasLidas: number;
  /** ações/units com código ou mercado errado no FCA (só a versão vigente de cada companhia) */
  rejeitadas: LinhaFcaRejeitada[];
  /** cadastro (geral) das companhias que só aparecem em `rejeitadas` */
  ciasSemTicker: Map<string, CiaFca>;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_TICKER = /^[A-Z][A-Z0-9]{3}\d{1,2}$/; // dígito na raiz: B3SA3, B1003
const data = (s: string) => (RE_DATA.test(s) ? s : null);

function classeDoFca(valorMobiliario: string): string | null {
  if (/Units?/i.test(valorMobiliario)) return 'UNIT';
  if (/^A[çc][õo]es Ordin/i.test(valorMobiliario)) return 'ON';
  if (/^A[çc][õo]es Pref/i.test(valorMobiliario)) return 'PN';
  return null;
}

export async function lerFca(
  caminho: string,
  entradas: EntradaZip[],
  ano: number,
): Promise<ResultadoFca> {
  const achar = (nome: string) => {
    const e = entradas.find((x) => x.nome === nome);
    if (!e) throw new ErroFonte('layout_mudou', `entrada ${nome} ausente no zip do FCA`);
    return e;
  };
  let linhasLidas = 0;
  const alertas: AlertaJob[] = [];

  // valor_mobiliario primeiro: define o universo (companhias com ações em bolsa)
  const nomeVm = entradaFca('valor_mobiliario', ano);
  const versaoVm = new Map<string, number>();
  const brutos: Array<TituloFca & { versao: number }> = [];
  const rejeitadasBrutas: Array<LinhaFcaRejeitada & { versao: number }> = [];
  for await (const l of lerCsv(linhasDaEntrada(caminho, achar(nomeVm)), {
    separador: ';',
    obrigatorias: COLUNAS_FCA_VALOR_MOBILIARIO,
    arquivo: nomeVm,
  })) {
    linhasLidas++;
    const cnpj = cnpjOuOriginal(l.get('CNPJ_Companhia'));
    const versao = Number(l.get('Versao'));
    versaoVm.set(cnpj, Math.max(versaoVm.get(cnpj) ?? 0, versao));
    const classeFca = classeDoFca(l.get('Valor_Mobiliario'));
    if (!classeFca) continue;
    const mercado = l.get('Mercado');
    const symbol = l.get('Codigo_Negociacao').toUpperCase().trim();
    const tickerValido = RE_TICKER.test(symbol);
    const texto = l.get('Composicao_BDR_Unit') || null;
    if (mercado !== 'Bolsa' || !tickerValido) {
      // debênture/ação de balcão sem código é normal; só guarda o que pode ser ação em bolsa
      if (mercado === 'Bolsa' || tickerValido) {
        rejeitadasBrutas.push({
          cnpj,
          codigo: symbol,
          classeFca,
          motivo: tickerValido ? 'mercado' : 'codigo_invalido',
          mercado,
          composicaoTexto: texto,
          dataInicio: data(l.get('Data_Inicio_Negociacao')),
          dataFim: data(l.get('Data_Fim_Negociacao')),
          versao,
        });
      }
      continue;
    }
    const classeTitulo = classeDoTicker(symbol);
    if (!classeTitulo) continue;
    const unit = classeTitulo === 'UNIT' ? parseComposicaoUnit(texto) : null;
    brutos.push({
      cnpj,
      symbol,
      classeTitulo,
      classeFca,
      unitQtdOn: unit?.on ?? null,
      unitQtdPn: unit?.pn ?? null,
      composicaoTexto: texto,
      dataInicio: data(l.get('Data_Inicio_Negociacao')),
      dataFim: data(l.get('Data_Fim_Negociacao')),
      versao,
    });
  }
  const titulosPorChave = new Map<string, TituloFca>();
  for (const { versao, ...t } of brutos) {
    if (versao !== versaoVm.get(t.cnpj)) continue;
    const k = `${t.symbol}|${t.cnpj}`;
    const atual = titulosPorChave.get(k);
    // mesmo ticker listado duas vezes (reentrega/segmentos): fica o aberto
    if (!atual || (atual.dataFim && !t.dataFim)) titulosPorChave.set(k, t);
  }
  const titulos = [...titulosPorChave.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  for (const t of titulos) {
    if (t.classeTitulo === 'UNIT' && t.unitQtdOn === null && !t.dataFim) {
      alertas.push({
        codigo: 'unit_sem_composicao',
        nivel: 'aviso',
        mensagem: `${t.symbol}: composição da unit não reconhecida ("${t.composicaoTexto ?? ''}")`,
        ref: t.symbol,
      });
    }
  }
  const universo = new Set(titulos.map((t) => t.cnpj));
  const rejeitadas = rejeitadasBrutas
    .filter((r) => r.versao === versaoVm.get(r.cnpj))
    .map(({ versao: _v, ...r }) => r);
  const cnpjsRejeitados = new Set(rejeitadas.map((r) => r.cnpj).filter((c) => !universo.has(c)));

  const nomeGeral = entradaFca('geral', ano);
  const cias = new Map<string, CiaFca>();
  for await (const l of lerCsv(linhasDaEntrada(caminho, achar(nomeGeral)), {
    separador: ';',
    obrigatorias: COLUNAS_FCA_GERAL,
    arquivo: nomeGeral,
  })) {
    linhasLidas++;
    const cnpj = cnpjOuOriginal(l.get('CNPJ_Companhia'));
    if (!universo.has(cnpj) && !cnpjsRejeitados.has(cnpj)) continue;
    const versao = Number(l.get('Versao'));
    const atual = cias.get(cnpj);
    if (atual && atual.versao >= versao) continue;
    const mes = Number(l.get('Mes_Encerramento_Exercicio_Social'));
    const dataRef = l.get('Data_Referencia');
    if (!RE_DATA.test(dataRef)) continue;
    cias.set(cnpj, {
      cnpj,
      cdCvm: l.get('Codigo_CVM'),
      nome: l.get('Nome_Empresarial'),
      setorAtividade: l.get('Setor_Atividade') || null,
      situacao: l.get('Situacao_Registro_CVM') || null,
      mesFimExercicio: Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : null,
      dataRef,
      versao,
    });
  }
  const ciasSemTicker = new Map<string, CiaFca>();
  for (const cnpj of cnpjsRejeitados) {
    const c = cias.get(cnpj);
    if (c) ciasSemTicker.set(cnpj, c);
    cias.delete(cnpj);
  }
  // ticker de companhia sem linha no geral não entra (sem cadastro não há universo)
  return {
    cias,
    titulos: titulos.filter((t) => cias.has(t.cnpj)),
    alertas,
    linhasLidas,
    rejeitadas,
    ciasSemTicker,
  };
}
