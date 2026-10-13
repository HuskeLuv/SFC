/**
 * Regra ÚNICA de perfil dos Filtros de Fundamentos (params):
 * - ação: ehFinanceira (o mesmo flag do universo — bancos, seguradoras e holdings financeiras como
 *   ITSA) → 'acao_financeira' (D4: n de 3), senão 'acao';
 * - FII: 'papel' → 'fii_papel'; 'tijolo' → 'fii_tijolo'; híbrido, indefinido, FoF ou sem tipo
 *   (params.regraHibrido.aplicaA) → (imóveis + SPE)/PL ≥ limiarImoveisPlPct ? 'fii_tijolo' :
 *   'fii_papel' (rec. 3). Sem dado de composição = papel. Funções puras.
 */
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { formatarTexto, TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { FiiTipoTela } from '@/types/analiseAtivosApi';
import type { EntradaPerfilCriterios, PerfilCriterio } from '@/types/analiseAtivosCriterios';

type CategoriaHibrido = CriteriaParams['regraHibrido']['aplicaA'][number];

function categoriaFii(fiiTipo: FiiTipoTela | null): FiiTipoTela | 'sem_tipo' {
  return fiiTipo ?? 'sem_tipo';
}

export function perfilCriterios(
  entrada: EntradaPerfilCriterios,
  params: Pick<CriteriaParams, 'regraHibrido'>,
): PerfilCriterio {
  if (entrada.classe === 'acao') return entrada.ehFinanceira ? 'acao_financeira' : 'acao';
  const categoria = categoriaFii(entrada.fiiTipo);
  if (categoria === 'papel') return 'fii_papel';
  if (categoria === 'tijolo') return 'fii_tijolo';
  const regra = params.regraHibrido;
  if ((regra.aplicaA as readonly string[]).includes(categoria as CategoriaHibrido)) {
    const pct = entrada.imoveisPlPct;
    return typeof pct === 'number' && Number.isFinite(pct) && pct >= regra.limiarImoveisPlPct
      ? 'fii_tijolo'
      : 'fii_papel';
  }
  // categoria fora da regra (params sem ela): a regra conservadora é a de papel
  return 'fii_papel';
}

/** (imóveis + SPE) ÷ PL em % (null sem PL positivo ou sem nenhuma das duas parcelas). */
export function imoveisSobrePlPct(m: {
  pl: number | null;
  imoveis: number | null;
  spe: number | null;
}): number | null {
  if (typeof m.pl !== 'number' || !Number.isFinite(m.pl) || m.pl <= 0) return null;
  if (m.imoveis === null && m.spe === null) return null;
  return (((m.imoveis ?? 0) + (m.spe ?? 0)) / m.pl) * 100;
}

/**
 * Nota curta do perfil para FII avaliado pela regra de composição (tooltip da contagem e
 * CriteriosAtivo.observacaoPerfil): FoF, híbrido e indefinido/sem tipo. null nos demais.
 */
export function observacaoPerfil(
  fiiTipo: FiiTipoTela | null | undefined,
  perfil: PerfilCriterio,
  classe: 'acao' | 'fii',
): string | null {
  if (classe !== 'fii') return null;
  const t = TEXTOS_CRITERIOS.perfil;
  const nome = t.nomes[perfil];
  if (fiiTipo === 'fof') {
    // o texto registrado diz 'papel' (caso comum); FoF com imóveis ≥ limiar troca só o perfil
    return perfil === 'fii_papel' ? t.fof : t.fof.replace(t.nomes.fii_papel, nome);
  }
  if (fiiTipo === 'hibrido') return formatarTexto(t.hibrido, { perfil: nome });
  if (fiiTipo === 'indefinido' || fiiTipo === null || fiiTipo === undefined) {
    return formatarTexto(t.indefinido, { perfil: nome });
  }
  return null;
}
