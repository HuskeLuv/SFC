/**
 * Saneamento do Informe Mensal de FII (regras 21 e 22 do relatório da Fase A §4.3). Função pura.
 *
 * - VP/cota ≠ PL/cotas em mais de vpCotaTolPct (1%) ⇒ VP/cota recomputado = PL/cotas.
 * - PL ≤ 0 ⇒ flag pl_nao_positivo (fora do Índice MF — a régua sai 'fora_do_indice').
 * - Cotas × ≥ cotasDesdobramentoFator (5) no mês ⇒ fatorDesdobramento (HFOF11 1:10 mai/25 = 10);
 *   cotas ÷ ≥ 5 ⇒ grupamento (fator < 1).
 * - DY do mês da CVM (já em p.p.) < 0 ou > dyMesCvmMaxPct (5) ⇒ descartado (nunca é rendimento; é só
 *   checagem — XPML11 jan/26 −5,88% sobre o VP).
 * - Obrigações/PL > obrigacoesRevisaoPct (100) ⇒ flag obrigacoes_revisao.
 * - Cotistas ±50% (base > 1.000) e VP/cota ±30% sem mudar cotas ⇒ só alerta.
 */
import type { AlertaJob, ScoringParams } from '@/services/analiseAtivos/tipos';
import { obrigacoesSobrePl } from '@/services/analiseAtivos/regras/fii/tipoFii';

/** Mês do informe já convertido (frações da CVM ×100 ⇒ p.p.; valores em R$). */
export interface FiiMesBruto {
  cnpj: string;
  refMonth: string; // 'AAAA-MM-01'
  versao: number;
  dtEntrega: string | null;
  vpCota: number | null;
  pl: number | null;
  cotas: number | null;
  cotistas: number | null;
  dyMesCvmPct: number | null;
  rentEfetivaMesPct: number | null;
  taxaAdmPct: number | null;
  ativoTotal: number | null;
  passivoTotal: number | null;
  rendDistribuir: number | null;
  obrigAquisicao: number | null;
  obrigSecuritizacao: number | null;
  imoveis: number | null;
  spe: number | null;
  cri: number | null;
  lciLca: number | null;
  cotasFii: number | null;
  rendaFixa: number | null;
  acoes: number | null;
  segmentoCvm: string | null;
  /** o mês tem linha no ativo_passivo (composição informada) */
  temComposicao: boolean;
}

export interface FiiMesSaneado extends FiiMesBruto {
  vpCotaRecalculado: boolean;
  obrigacoesPlPct: number | null;
  fatorDesdobramento: number | null;
}

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/** Fator "redondo" quando perto de inteiro (10,0003 ⇒ 10); senão 4 casas. */
function arredondarFator(f: number): number {
  const inteiro = Math.round(f);
  if (inteiro > 0 && Math.abs(f - inteiro) / inteiro < 0.01) return inteiro;
  return Math.round(f * 10_000) / 10_000;
}

/** VP/cota do mês (PL ÷ cotas quando houver; senão o informado). */
function vpCotaDoMes(m: FiiMesBruto): number | null {
  if (finito(m.pl) && m.pl > 0 && finito(m.cotas) && m.cotas > 0) return m.pl / m.cotas;
  return finito(m.vpCota) ? m.vpCota : null;
}

export function sanearMes(
  atual: FiiMesBruto,
  anterior: FiiMesBruto | null,
  p: ScoringParams,
): { mes: FiiMesSaneado; flags: string[]; alertas: AlertaJob[] } {
  const s = p.sanidade.fii;
  const flags: string[] = [];
  const alertas: AlertaJob[] = [];
  const ref = `${atual.cnpj}@${atual.refMonth}`;

  // VP/cota × PL/cotas
  let vpCota = atual.vpCota;
  let vpCotaRecalculado = false;
  if (finito(atual.pl) && atual.pl > 0 && finito(atual.cotas) && atual.cotas > 0) {
    const calculado = atual.pl / atual.cotas;
    const divergente =
      !finito(vpCota) || Math.abs(vpCota - calculado) / calculado > s.vpCotaTolPct / 100;
    if (divergente) {
      vpCota = calculado;
      vpCotaRecalculado = true;
      flags.push('vp_cota_recalculado');
    }
  }

  if (finito(atual.pl) && atual.pl <= 0) flags.push('pl_nao_positivo');

  // desdobramento/grupamento pela razão de cotas
  let fatorDesdobramento: number | null = null;
  if (finito(atual.cotas) && finito(anterior?.cotas) && atual.cotas > 0 && anterior!.cotas! > 0) {
    const razao = atual.cotas / anterior!.cotas!;
    const salto = razao >= s.cotasDesdobramentoFator || razao <= 1 / s.cotasDesdobramentoFator;
    // desdobramento de verdade: o VP/cota cai (sobe) na MESMA proporção — PL estável. Incorporação,
    // emissão, fundo novo ou informe com cotas erradas mudam as cotas sem mexer no VP/cota
    // (IRIM11 nov/25: cotas ×18,3 com VP/cota 83,39 → 84,10) ⇒ só flag + alerta, sem fator.
    const vpAnt = vpCotaDoMes(anterior!);
    const razaoVp = finito(vpAnt) && finito(vpCota) && vpCota > 0 ? vpAnt / vpCota : null;
    const vpAcompanha =
      razaoVp !== null &&
      Math.abs(razaoVp / razao - 1) <= p.sanidade.eventos.confirmacaoTolPct / 100;
    if (salto && !vpAcompanha) {
      flags.push('salto_cotas_sem_desdobramento');
      alertas.push({
        codigo: 'fii_salto_cotas',
        nivel: 'aviso',
        mensagem: `cotas ×${razao.toFixed(4)} sem o VP/cota acompanhar (${razaoVp === null ? 'VP ausente' : `VP ÷${razaoVp.toFixed(4)}`})`,
        ref,
      });
    } else if (razao >= s.cotasDesdobramentoFator) {
      fatorDesdobramento = arredondarFator(razao);
      flags.push('desdobramento');
    } else if (razao <= 1 / s.cotasDesdobramentoFator) {
      fatorDesdobramento = 1 / arredondarFator(1 / razao);
      flags.push('grupamento');
    }
  }

  // DY do mês da CVM: só checagem
  let dyMesCvmPct = atual.dyMesCvmPct;
  if (finito(dyMesCvmPct) && (dyMesCvmPct < 0 || dyMesCvmPct > s.dyMesCvmMaxPct)) {
    flags.push('dy_cvm_descartado');
    dyMesCvmPct = null;
  }

  // Obrigações/PL
  const obrig = obrigacoesSobrePl(atual);
  const obrigacoesPlPct = obrig.estado === 'ok' ? obrig.valor : null;
  if (obrigacoesPlPct !== null && obrigacoesPlPct > s.obrigacoesRevisaoPct) {
    flags.push('obrigacoes_revisao');
  }

  // alertas (não mudam dado)
  if (anterior) {
    if (
      finito(atual.cotistas) &&
      finito(anterior.cotistas) &&
      anterior.cotistas > s.cotistasBaseMin &&
      Math.abs(atual.cotistas - anterior.cotistas) / anterior.cotistas >
        s.cotistasVariacaoAlertaPct / 100
    ) {
      alertas.push({
        codigo: 'fii_cotistas_variacao',
        nivel: 'aviso',
        mensagem: `cotistas ${anterior.cotistas} → ${atual.cotistas}`,
        ref,
      });
    }
    const vpAnt = anterior.vpCota;
    const mesmasCotas =
      finito(atual.cotas) && finito(anterior.cotas) && atual.cotas === anterior.cotas;
    if (
      mesmasCotas &&
      finito(vpCota) &&
      finito(vpAnt) &&
      vpAnt > 0 &&
      Math.abs(vpCota - vpAnt) / vpAnt > s.vpCotaSaltoAlertaPct / 100
    ) {
      flags.push('vp_cota_salto');
      alertas.push({
        codigo: 'fii_vp_cota_salto',
        nivel: 'aviso',
        mensagem: `VP/cota ${vpAnt.toFixed(2)} → ${vpCota.toFixed(2)} sem mudar cotas`,
        ref,
      });
    }
  }

  return {
    mes: {
      ...atual,
      vpCota,
      dyMesCvmPct,
      vpCotaRecalculado,
      obrigacoesPlPct,
      fatorDesdobramento,
    },
    flags,
    alertas,
  };
}
