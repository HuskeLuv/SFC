/**
 * Job fii-mensal: Informe Mensal de FII (CVM) ⇒ FiiMonthly.
 *
 * - Zip do ano corrente (+ ano−1 se mês ≤ 2), condicional por ETag/sha256 (arquivo inalterado ⇒
 *   pula); streaming, filtrando cedo pelos CNPJs do FiiTickerMap (universo B3, regra 27).
 * - Grava os ÚLTIMOS 3 meses de referência de cada CNPJ (reenvios), maior Versao; o backfill grava
 *   todos (`todosOsMeses`).
 * - Saneamento (regras 21–22), tipo pela composição, tipo vigente com histerese de 3 meses (lê os
 *   meses anteriores do banco) e FiiTipoOverride; grava reguaVigente e obrigacoesPlPct prontos para
 *   a fatia D.
 * - Rendimento/DY/meses seguidos NÃO saem daqui (fatia D, base de proventos): dyMesCvmPct é só
 *   checagem.
 */
import { fiiOverrides } from '@/services/analiseAtivos/repositorio/fii';
import { anosDoCron, obterArquivo, urlInformeFii } from '@/services/analiseAtivos/fii/fiiArquivos';
import {
  cnpjsDoMapa,
  gravarMensal,
  lerMensalGravado,
  type LinhaFiiMensal,
  type ResultadoGravacao,
} from '@/services/analiseAtivos/fii/gravarFii';
import { lerInformeMensalZip } from '@/services/analiseAtivos/fii/parserInformeMensal';
import {
  aplicarHisterese,
  mesAnterior,
  type MesTipo,
} from '@/services/analiseAtivos/regras/fii/histerese';
import { sanearMes, type FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';
import { reguaFii, tipoPorComposicao } from '@/services/analiseAtivos/regras/fii/tipoFii';
import type {
  AlertaJob,
  FiiTipo,
  JobContexto,
  ResultadoJob,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

export const JOB_FII_MENSAL = 'fii-mensal';
export const MESES_REPROCESSADOS = 3;

/** Distribuição de tipo medida na Fase A (último mês, 464 FIIs) — referência do alerta ±10%. */
export const DISTRIBUICAO_FASE_A: Record<FiiTipo, number> = {
  tijolo: 268,
  papel: 85,
  fof: 59,
  hibrido: 7,
  indefinido: 45,
};

export interface OpcoesFiiMensal {
  anos?: number[];
  cacheDir?: string;
  /** false ⇒ baixa sem condicional (backfill) */
  condicional?: boolean;
  /** backfill: grava todos os meses do arquivo, não só os 3 últimos */
  todosOsMeses?: boolean;
  /** restringe a estes CNPJs (padrão: todos do FiiTickerMap) */
  cnpjs?: string[];
}

function somarMeses(ref: string, n: number): string {
  const [a, m] = ref.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
}

const TIPOS: readonly FiiTipo[] = ['tijolo', 'papel', 'fof', 'hibrido', 'indefinido'];
const ehTipo = (s: string | null): s is FiiTipo => s !== null && TIPOS.includes(s as FiiTipo);

function brutoDoGravado(l: LinhaFiiMensal): FiiMesBruto {
  return { ...l, temComposicao: l.tipoComposicao !== null };
}

/**
 * Núcleo puro: meses do arquivo + linhas já gravadas + overrides ⇒ linhas a gravar.
 * `escolher` recebe os meses (asc) de um CNPJ e devolve os que serão gravados.
 */
export function processarMesesFii(
  meses: FiiMesBruto[],
  gravados: Map<string, LinhaFiiMensal>,
  overrides: Map<string, FiiTipo>,
  p: ScoringParams,
  opts: { todosOsMeses: boolean; sourceUrl: string },
): { linhas: LinhaFiiMensal[]; alertas: AlertaJob[] } {
  const porCnpj = new Map<string, FiiMesBruto[]>();
  for (const m of meses) porCnpj.set(m.cnpj, [...(porCnpj.get(m.cnpj) ?? []), m]);

  const gravadosPorCnpj = new Map<string, LinhaFiiMensal[]>();
  for (const g of gravados.values()) {
    gravadosPorCnpj.set(g.cnpj, [...(gravadosPorCnpj.get(g.cnpj) ?? []), g]);
  }
  const linhas: LinhaFiiMensal[] = [];
  const alertas: AlertaJob[] = [];

  for (const [cnpj, lista] of porCnpj) {
    lista.sort((a, b) => a.refMonth.localeCompare(b.refMonth));
    const alvo = opts.todosOsMeses ? lista : lista.slice(-MESES_REPROCESSADOS);
    const doArquivo = new Map(lista.map((m) => [m.refMonth, m]));
    // estado por mês: tipoComposicao e tipoVigente (gravados + calculados nesta rodada)
    const tipos = new Map<string, { comp: FiiTipo | null; vigente: FiiTipo | null }>();
    for (const g of gravadosPorCnpj.get(cnpj) ?? []) {
      tipos.set(g.refMonth, {
        comp: ehTipo(g.tipoComposicao) ? g.tipoComposicao : null,
        vigente: ehTipo(g.tipoVigente) ? g.tipoVigente : null,
      });
    }
    const override = overrides.get(cnpj) ?? null;

    for (const atual of alvo) {
      const refAnt = mesAnterior(atual.refMonth);
      const gravAnt = gravados.get(`${cnpj}|${refAnt}`);
      const anterior = doArquivo.get(refAnt) ?? (gravAnt ? brutoDoGravado(gravAnt) : null);
      const s = sanearMes(atual, anterior, p);
      alertas.push(...s.alertas);
      const mes = s.mes;

      const tipoComposicao: FiiTipo | null = mes.temComposicao ? tipoPorComposicao(mes, p) : null;

      // vigente anterior = último vigente conhecido antes deste mês
      let vigenteAnterior: FiiTipo | null = null;
      for (const ref of [...tipos.keys()].sort().reverse()) {
        if (ref >= atual.refMonth) continue;
        const v = tipos.get(ref)?.vigente ?? null;
        if (v) {
          vigenteAnterior = v;
          break;
        }
      }

      let tipoVigente: FiiTipo | null;
      const flags = [...s.flags];
      if (tipoComposicao === null && !override) {
        tipoVigente = vigenteAnterior;
        flags.push('sem_composicao');
      } else {
        const historico: MesTipo[] = [];
        for (let i = p.fiiTipo.mesesHisterese - 1; i >= 1; i--) {
          const ref = somarMeses(atual.refMonth, -i);
          const c = tipos.get(ref)?.comp ?? null;
          if (c) historico.push({ refMonth: ref, tipoComposicao: c });
        }
        historico.push({
          refMonth: atual.refMonth,
          tipoComposicao: tipoComposicao ?? override ?? 'indefinido',
        });
        const h = aplicarHisterese(historico, vigenteAnterior, override, p);
        tipoVigente = h.tipoVigente;
        if (override) flags.push('tipo_override');
        if (h.mudouEm && vigenteAnterior !== null) {
          flags.push('tipo_mudou');
          alertas.push({
            codigo: 'fii_tipo_mudou',
            nivel: 'info',
            mensagem: `${cnpj}: ${vigenteAnterior} → ${tipoVigente} em ${atual.refMonth}`,
            ref: cnpj,
          });
        }
      }
      tipos.set(atual.refMonth, { comp: tipoComposicao, vigente: tipoVigente });

      const regua = tipoVigente ? reguaFii(tipoVigente, mes, p) : null;
      if (regua?.incompleto) flags.push('regua_incompleta');
      if (flags.includes('pl_nao_positivo')) {
        alertas.push({
          codigo: 'fii_pl_nao_positivo',
          nivel: 'aviso',
          mensagem: `${cnpj} PL ≤ 0 em ${atual.refMonth}`,
          ref: cnpj,
        });
      }
      if (flags.includes('vp_cota_recalculado')) {
        alertas.push({
          codigo: 'fii_vp_cota_recalculado',
          nivel: 'info',
          mensagem: `${cnpj} VP/cota ≠ PL/cotas > ${p.sanidade.fii.vpCotaTolPct}% em ${atual.refMonth}`,
          ref: cnpj,
        });
      }
      if (mes.fatorDesdobramento !== null) {
        alertas.push({
          codigo: 'fii_desdobramento',
          nivel: 'info',
          mensagem: `${cnpj} cotas ×${mes.fatorDesdobramento} em ${atual.refMonth}`,
          ref: cnpj,
        });
      }

      linhas.push({
        cnpj,
        refMonth: atual.refMonth,
        versao: mes.versao,
        dtEntrega: mes.dtEntrega,
        vpCota: mes.vpCota,
        vpCotaRecalculado: mes.vpCotaRecalculado,
        pl: mes.pl,
        cotas: mes.cotas,
        cotistas: mes.cotistas,
        dyMesCvmPct: mes.dyMesCvmPct,
        rentEfetivaMesPct: mes.rentEfetivaMesPct,
        taxaAdmPct: mes.taxaAdmPct,
        ativoTotal: mes.ativoTotal,
        passivoTotal: mes.passivoTotal,
        rendDistribuir: mes.rendDistribuir,
        obrigAquisicao: mes.obrigAquisicao,
        obrigSecuritizacao: mes.obrigSecuritizacao,
        imoveis: mes.imoveis,
        spe: mes.spe,
        cri: mes.cri,
        lciLca: mes.lciLca,
        cotasFii: mes.cotasFii,
        rendaFixa: mes.rendaFixa,
        acoes: mes.acoes,
        segmentoCvm: mes.segmentoCvm,
        tipoComposicao,
        tipoVigente,
        reguaVigente: regua?.regua ?? null,
        obrigacoesPlPct: mes.obrigacoesPlPct,
        fatorDesdobramento: mes.fatorDesdobramento,
        flags: [...new Set(flags)],
        sourceUrl: opts.sourceUrl,
      });
    }
  }
  return { linhas, alertas };
}

/** Distribuição de tipoVigente no mês mais recente com ≥ 50% dos fundos do run. */
export function distribuicaoTipos(linhas: LinhaFiiMensal[]): {
  refMonth: string | null;
  contagem: Record<FiiTipo | 'sem_tipo', number>;
} {
  const porMes = new Map<string, LinhaFiiMensal[]>();
  for (const l of linhas) porMes.set(l.refMonth, [...(porMes.get(l.refMonth) ?? []), l]);
  const totalCnpjs = new Set(linhas.map((l) => l.cnpj)).size;
  const ref =
    [...porMes.keys()]
      .sort()
      .reverse()
      .find((m) => porMes.get(m)!.length >= totalCnpjs * 0.5) ?? null;
  const contagem = { tijolo: 0, papel: 0, fof: 0, hibrido: 0, indefinido: 0, sem_tipo: 0 };
  for (const l of ref ? porMes.get(ref)! : []) {
    contagem[ehTipo(l.tipoVigente) ? l.tipoVigente : 'sem_tipo']++;
  }
  return { refMonth: ref, contagem };
}

export function alertaDistribuicao(
  contagem: Record<FiiTipo | 'sem_tipo', number>,
  refMonth: string,
): AlertaJob | null {
  const fora = TIPOS.filter((t) => {
    const ref = DISTRIBUICAO_FASE_A[t];
    return Math.abs(contagem[t] - ref) / ref > 0.1;
  });
  if (fora.length === 0) return null;
  return {
    codigo: 'fii_distribuicao_tipos',
    nivel: 'aviso',
    mensagem: `${refMonth}: ${fora
      .map((t) => `${t} ${contagem[t]} (Fase A ${DISTRIBUICAO_FASE_A[t]})`)
      .join(', ')} fora de ±10%`,
  };
}

/**
 * Agrega alertas repetitivos por código (o AnaliseJobRun guarda no máx. 200): mantém os primeiros
 * `porCodigo` de cada código e resume o resto numa linha "+N". Evita que um backfill com milhares
 * de meses afogue alertas únicos (distribuição de tipos, layout).
 */
export class AgregadorAlertas {
  private readonly contagem = new Map<string, { exemplo: AlertaJob; n: number }>();
  constructor(
    private readonly emitir: (a: AlertaJob) => void,
    private readonly porCodigo = 10,
  ) {}

  add = (a: AlertaJob): void => {
    const c = this.contagem.get(a.codigo) ?? { exemplo: a, n: 0 };
    c.n++;
    this.contagem.set(a.codigo, c);
    if (c.n <= this.porCodigo) this.emitir(a);
  };

  fechar(): void {
    for (const [codigo, { exemplo, n }] of this.contagem) {
      if (n <= this.porCodigo) continue;
      this.emitir({
        codigo,
        nivel: exemplo.nivel,
        mensagem: `+${n - this.porCodigo} ocorrências de ${codigo} (total ${n})`,
      });
    }
  }
}

export async function sincronizarFiiMensal(
  ctx: JobContexto,
  opts: OpcoesFiiMensal = {},
): Promise<ResultadoJob> {
  const cnpjs = opts.cnpjs ?? (await cnpjsDoMapa(ctx.prisma));
  if (cnpjs.length === 0) {
    ctx.alertar({
      codigo: 'fii_mapa_vazio',
      nivel: 'aviso',
      mensagem: 'FiiTickerMap vazio: rode fii-cadastro antes (universo B3)',
    });
    return { detalhes: { cnpjs: 0 } };
  }
  const filtro = new Set(cnpjs);
  const anos = opts.anos ?? anosDoCron(ctx.hoje, 2);
  const overrides = await fiiOverrides(ctx.prisma);
  const arquivos: Array<Record<string, unknown>> = [];
  const total: ResultadoGravacao = { criadas: 0, atualizadas: 0, iguais: 0, versaoMenor: 0 };
  let distribuicao: ReturnType<typeof distribuicaoTipos> | null = null;
  let parcial = false;
  const agregador = new AgregadorAlertas(ctx.alertar);

  for (const ano of anos) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const url = urlInformeFii('mensal', ano);
    const arq = await obterArquivo(ctx.prisma, url, {
      cacheDir: opts.cacheDir,
      condicional: opts.condicional,
    });
    try {
      if (arq.status === 'nao_modificado' || !arq.caminho) {
        arquivos.push({ url, status: arq.status });
        continue;
      }
      const lido = await lerInformeMensalZip(arq.caminho, {
        cnpjs: filtro,
        arquivo: `inf_mensal_fii_${ano}.zip`,
        params: ctx.params,
      });
      ctx.contar('linhasLidas', lido.linhasLidas);
      ctx.contar('rejeitadas', lido.rejeitadas);

      const refs = lido.meses.map((m) => m.refMonth).sort();
      const gravados =
        refs.length > 0
          ? await lerMensalGravado(
              ctx.prisma,
              [...new Set(lido.meses.map((m) => m.cnpj))],
              somarMeses(refs[0], -(ctx.params.fiiTipo.mesesHisterese + 1)),
              refs[refs.length - 1],
            )
          : new Map();
      const { linhas, alertas } = processarMesesFii(lido.meses, gravados, overrides, ctx.params, {
        todosOsMeses: opts.todosOsMeses ?? false,
        sourceUrl: url,
      });
      alertas.forEach(agregador.add);
      const g = await gravarMensal(ctx.prisma, linhas, gravados, ctx.aplicar);
      ctx.contar('linhasGravadas', g.criadas + g.atualizadas);
      for (const k of Object.keys(total) as Array<keyof ResultadoGravacao>) total[k] += g[k];
      const d = distribuicaoTipos(linhas);
      if (d.refMonth && (!distribuicao || d.refMonth > (distribuicao.refMonth ?? ''))) {
        distribuicao = d;
      }
      arquivos.push({
        url,
        status: arq.status,
        bytes: arq.bytes,
        meses: lido.meses.length,
        cnpjs: new Set(lido.meses.map((m) => m.cnpj)).size,
        ultimoMes: refs[refs.length - 1] ?? null,
        ...g,
      });
      if (ctx.aplicar) await arq.concluir(JOB_FII_MENSAL);
    } finally {
      await arq.descartar();
    }
  }

  if (distribuicao?.refMonth) {
    const a = alertaDistribuicao(distribuicao.contagem, distribuicao.refMonth);
    if (a) ctx.alertar(a);
  }
  agregador.fechar();
  return {
    parcial,
    detalhes: { anos, cnpjsUniverso: cnpjs.length, arquivos, gravacao: total, distribuicao },
  };
}

const FLAGS_DE_TIPO = new Set(['tipo_override', 'tipo_mudou', 'regua_incompleta']);

/**
 * Recalcula tipoVigente/reguaVigente de TODOS os meses gravados de um FII a partir do
 * tipoComposicao já gravado + override (script fii-tipo-override). Não relê a CVM nem mexe nos
 * demais campos. Função pura sobre as linhas.
 */
export function recalcularTiposDoFundo(
  linhas: LinhaFiiMensal[],
  override: FiiTipo | null,
  p: ScoringParams,
): LinhaFiiMensal[] {
  const ordenadas = [...linhas].sort((a, b) => a.refMonth.localeCompare(b.refMonth));
  const comp = new Map(
    ordenadas.map((l) => [l.refMonth, ehTipo(l.tipoComposicao) ? l.tipoComposicao : null]),
  );
  let vigente: FiiTipo | null = null;
  return ordenadas.map((l) => {
    const flags = l.flags.filter((f) => !FLAGS_DE_TIPO.has(f));
    const atual = comp.get(l.refMonth) ?? null;
    let tipoVigente: FiiTipo | null;
    if (atual === null && !override) {
      tipoVigente = vigente;
    } else {
      const historico: MesTipo[] = [];
      for (let i = p.fiiTipo.mesesHisterese - 1; i >= 1; i--) {
        const ref = somarMeses(l.refMonth, -i);
        const c = comp.get(ref) ?? null;
        if (c) historico.push({ refMonth: ref, tipoComposicao: c });
      }
      historico.push({ refMonth: l.refMonth, tipoComposicao: atual ?? override ?? 'indefinido' });
      const h = aplicarHisterese(historico, vigente, override, p);
      tipoVigente = h.tipoVigente;
      if (override) flags.push('tipo_override');
      if (h.mudouEm && vigente !== null) flags.push('tipo_mudou');
    }
    vigente = tipoVigente ?? vigente;
    const regua = tipoVigente ? reguaFii(tipoVigente, l, p) : null;
    if (regua?.incompleto) flags.push('regua_incompleta');
    return { ...l, tipoVigente, reguaVigente: regua?.regua ?? null, flags };
  });
}
