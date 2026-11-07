/**
 * Cobertura do FGC da seção 4b (Advanced). Mesma apuração de Análises > Cobertura FGC
 * (carregarGruposCoberturaFgc: valoração da aba Renda Fixa, grupo por raiz do CNPJ do emissor,
 * corretora no fallback, limite de R$ 250 mil por emissor e teto global de R$ 1 milhão). Aqui só
 * se recorta o que o relatório mostra. Só leitura.
 *
 * Uma carga por entrada de cache dos insumos (trocar de período não recarrega). Falha na carga
 * vira null (o front mostra o link para a tela) em vez de derrubar o relatório.
 */
import {
  faixaLimiteFgc,
  pedeEmissor,
  type ResultadoCoberturaFgc,
} from '@/services/analises/agruparCoberturaFgc';
import { carregarGruposCoberturaFgc } from '@/services/analises/coberturaFgc';
import type {
  AvisoFgcRelatorio,
  BlocoFgcRelatorio,
  EmissorFgcRelatorio,
  StatusEmissorFgc,
} from '@/types/relatorioFinanceiroFgc';
import type { ContextoMontador, Insumos } from './insumos';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Cortes da tela (faixaLimiteFgc, a mesma de components/analises/CoberturaFgc.tsx). */
export function statusDoEmissor(pctLimite: number): StatusEmissorFgc {
  return faixaLimiteFgc(pctLimite);
}

/** Recorte do relatório (puro) a partir do resultado da tela. */
export function montarBlocoFgc(res: ResultadoCoberturaFgc): BlocoFgcRelatorio {
  const { grupos, resumo, avisosConglomerado } = res;
  const limite = resumo.limitePorInstituicao;

  const emissores: EmissorFgcRelatorio[] = grupos
    .filter((g) => g.totalCoberto > 0)
    .map((g) => ({
      chave: g.chave,
      nome: g.instituicaoNome,
      valorCoberto: g.totalCoberto,
      nTitulos: g.ativos.filter((a) => a.coberto).length,
      pctLimite: g.percentualUtilizado,
      excedente: g.excedente,
      status: statusDoEmissor(g.percentualUtilizado),
      usaCorretora: g.usaCorretoraComoEmissor && g.ativosSemEmissor > 0,
    }));

  const avisos: AvisoFgcRelatorio[] = avisosConglomerado.map((a) => {
    const total = r2(
      grupos.filter((g) => a.chaves.includes(g.chave)).reduce((s, g) => s + g.totalCoberto, 0),
    );
    return { tipo: 'conglomerado', nomes: a.nomes, total, acima: r2(Math.max(0, total - limite)) };
  });
  const pendentes = grupos.reduce(
    (s, g) => s + g.ativos.filter((a) => a.coberto && pedeEmissor(a)).length,
    0,
  );
  if (pendentes > 0) avisos.push({ tipo: 'emissorPendente', n: pendentes });

  return {
    limitePorEmissor: limite,
    tetoGlobal: resumo.limiteGlobal,
    emissores,
    totalCoberto: resumo.totalEfetivamenteCoberto,
    pctTetoGlobal:
      resumo.limiteGlobal > 0
        ? r2((resumo.totalEfetivamenteCoberto / resumo.limiteGlobal) * 100)
        : 0,
    totalExcedente: resumo.totalExcedente,
    rendaFixaSemCobertura: resumo.totalNaoCoberto,
    avisos,
  };
}

const cargas = new WeakMap<Insumos, Promise<BlocoFgcRelatorio | null>>();

/** Bloco FGC do dono dos dados (memo por insumos); null se a carga falhar. */
export function montarFgc(ctx: ContextoMontador): Promise<BlocoFgcRelatorio | null> {
  let p = cargas.get(ctx.insumos);
  if (!p) {
    p = carregarGruposCoberturaFgc(ctx.userId).then(montarBlocoFgc, (erro: unknown) => {
      cargas.delete(ctx.insumos);
      console.error(
        JSON.stringify({
          evento: 'relatorio-financeiro-fgc-erro',
          erro: erro instanceof Error ? erro.message : String(erro),
        }),
      );
      return null;
    });
    cargas.set(ctx.insumos, p);
  }
  return p;
}
