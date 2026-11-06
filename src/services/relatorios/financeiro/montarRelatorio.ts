/**
 * Orquestrador do Relatório financeiro: um objeto `RelatorioFinanceiro` (contrato versão 1) por
 * geração.
 *
 *  - Fase 1 (Promise.all, só o que o plano libera): orçamento e dívidas (sempre), carteira,
 *    planejamento e sonhos (Pro), carteira avançada e IR (Advanced) ou o gancho do IR (abaixo do
 *    Advanced). Montador de bloco bloqueado não roda, então o insumo dele não é lido.
 *  - Fase 2 (pura): saúde, com os blocos da fase 1 (só no Advanced).
 *  - aplicarCadeado repete a máscara no fim (defesa dupla).
 *
 * Loga o tempo de cada montador (console.info estruturado, userId em hash) para a medição antes
 * de ligar a chave em prod.
 */
import { createHash } from 'node:crypto';
import { ACESSO_BLOCOS, aplicarCadeado, temAcesso, type Plano } from '@/lib/planos';
import {
  VERSAO_RELATORIO_FINANCEIRO,
  type BlocoBloqueavel,
  type MesesRelatorio,
  type RelatorioFinanceiro,
} from '@/types/relatorioFinanceiro';
import { carregarInsumos, type ContextoMontador, type Insumos } from './insumos';
import { geradoEmISO, mesesDaJanela, periodoDoRelatorio } from './periodo';
import { montarOrcamento } from './orcamento';
import { montarDividas } from './dividas';
import { montarCarteira } from './carteira';
import { montarCarteiraAvancada } from './carteiraAvancada';
import { montarPlanejamento } from './planejamento';
import { montarSonhos } from './sonhos';
import { montarSaude } from './saude';
import { montarIr, montarIrGancho } from './ir';

export { aplicarCadeado };

export interface ParamsRelatorioFinanceiro {
  /** Dono dos dados (targetUserId). */
  userId: string;
  meses: MesesRelatorio;
  plano: Plano;
  /** Nome do cliente. */
  cliente: string;
  /** Nome do consultor, SÓ quando há acting; null senão. */
  consultor: string | null;
  agora: Date;
  /** Injeção para testes; padrão = carregarInsumos (cache de 60 s por userId). */
  insumos?: Insumos;
}

/** Tempos em ms por montador + total (o que vai para o log). */
export type TemposRelatorio = Record<string, number>;

const hashUsuario = (userId: string) =>
  createHash('sha256').update(userId).digest('hex').slice(0, 12);

export async function montarRelatorioFinanceiro(
  params: ParamsRelatorioFinanceiro,
): Promise<RelatorioFinanceiro> {
  const { userId, meses, plano, cliente, consultor, agora } = params;
  const inicio = performance.now();
  const insumos = params.insumos ?? carregarInsumos(userId, agora);
  const periodo = periodoDoRelatorio(meses, agora);
  const ctx: ContextoMontador = {
    userId,
    meses,
    periodo,
    mesesDoPeriodo: mesesDaJanela(insumos.hojeSP, meses),
    agora,
    hojeSP: insumos.hojeSP,
    comConsultor: consultor !== null,
    insumos,
  };

  const tempos: TemposRelatorio = {};
  const cronometrar = async <T>(nome: string, f: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    try {
      return await f();
    } finally {
      tempos[nome] = Math.round(performance.now() - t0);
    }
  };
  const libera = (b: BlocoBloqueavel) => temAcesso(plano, ACESSO_BLOCOS[b]);
  const seLiberado = <T>(b: BlocoBloqueavel, nome: string, f: () => Promise<T>) =>
    libera(b) ? cronometrar(nome, f) : Promise.resolve(null);

  // Fase 1 (a base da saúde já carrega aqui, em paralelo, para a fase 2 não esperar)
  const [
    orcamento,
    dividas,
    carteira,
    carteiraAvancada,
    planejamento,
    sonhos,
    ir,
    irGancho,
    saudeBase,
  ] = await Promise.all([
    cronometrar('orcamento', () => montarOrcamento(ctx)),
    cronometrar('dividas', () => montarDividas(ctx)),
    seLiberado('carteira', 'carteira', () => montarCarteira(ctx)),
    seLiberado('carteiraAvancada', 'carteiraAvancada', () => montarCarteiraAvancada(ctx)),
    seLiberado('planejamento', 'planejamento', () => montarPlanejamento(ctx)),
    seLiberado('sonhos', 'sonhos', () => montarSonhos(ctx)),
    seLiberado('ir', 'ir', () => montarIr(ctx)),
    libera('ir') ? Promise.resolve(null) : cronometrar('irGancho', () => montarIrGancho(ctx)),
    seLiberado('saude', 'saudeBase', () => insumos.saudeBase()),
  ]);

  // Fase 2
  let saude: RelatorioFinanceiro['saude'] = null;
  if (saudeBase) {
    const t0 = performance.now();
    saude = montarSaude({ ctx, saudeBase, orcamento, dividas, carteiraAvancada });
    tempos.saude = Math.round(performance.now() - t0);
  }

  const relatorio: RelatorioFinanceiro = {
    versao: VERSAO_RELATORIO_FINANCEIRO,
    cliente,
    consultor,
    plano,
    periodo,
    geradoEm: geradoEmISO(agora),
    orcamento,
    dividas,
    carteira,
    carteiraAvancada,
    planejamento,
    sonhos,
    saude,
    ir,
    irGancho,
  };

  tempos.total = Math.round(performance.now() - inicio);
  console.info(
    JSON.stringify({
      evento: 'relatorio-financeiro',
      usuario: hashUsuario(userId),
      meses,
      plano,
      ms: tempos,
    }),
  );

  return aplicarCadeado(relatorio, plano);
}
