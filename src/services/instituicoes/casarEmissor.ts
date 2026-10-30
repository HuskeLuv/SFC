/**
 * Casa o emissor que o Open Finance (Pluggy) informa com o catálogo de instituições
 * (ClickUp 86e2xqh69). Conservador: falso positivo é pior que nulo.
 *
 * 1. A raiz do issuerCNPJ bate com a raiz do cnpj de um registro. Com vários registros na mesma
 *    raiz, prefere o que emite (tipoBacen emissor), depois o tipo desconhecido, depois o mais
 *    antigo (e o id, para desempatar de forma determinística).
 * 2. Senão, o nome normalizado do issuer é igual ao nome normalizado ou a um apelido (a frase
 *    inteira, nunca uma palavra dela) de EXATAMENTE um registro que pode emitir (ehInstituicaoEmissora !== false).
 * 3. Senão, null.
 *
 * Também traz a seleção pura do backfill (scripts/pluggy/backfill-emissor-rf.ts): o FI cujo
 * usuário já mexeu no emissor (inclusive "Usar a corretora", gravado como null) não é tocado.
 */
import type { PrismaClient } from '@prisma/client';
import { aceitaEmissor, ehInstituicaoEmissora } from '@/lib/fgc/produtosCobertos';
import { cnpjRaiz } from '@/lib/instituicoes/cnpj';
import { normalizarNomeInstituicao } from '@/lib/instituicoes/normalizarNome';
import { separarApelidos } from './bacen/apelidos';

export interface InstituicaoIndice {
  id: string;
  nome: string;
  cnpj: string | null;
  tipoBacen: string | null;
  codigo: string;
  apelidos: string | null;
  createdAt: Date;
}

export interface IndiceEmissores {
  /** raiz do CNPJ (8 dígitos) → registros, já na ordem de preferência. */
  porRaiz: Map<string, InstituicaoIndice[]>;
  /** nome normalizado ou frase de apelido → registros que podem emitir. */
  porTermo: Map<string, InstituicaoIndice[]>;
}

export type ViaCasamento = 'cnpj' | 'nome' | 'apelido';

export interface EmissorCasado {
  id: string;
  nome: string;
  via: ViaCasamento;
}

function prioridade(inst: InstituicaoIndice): number {
  const emite = ehInstituicaoEmissora(inst);
  if (emite === true) return 0;
  if (emite === null) return 1;
  return 2;
}

function compararPreferencia(a: InstituicaoIndice, b: InstituicaoIndice): number {
  return (
    prioridade(a) - prioridade(b) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function adicionar(
  mapa: Map<string, InstituicaoIndice[]>,
  chave: string,
  inst: InstituicaoIndice,
): void {
  if (!chave) return;
  const lista = mapa.get(chave);
  if (!lista) mapa.set(chave, [inst]);
  else if (!lista.some((i) => i.id === inst.id)) lista.push(inst);
}

/**
 * Termos de um apelido: cada FRASE inteira, normalizada como nome ('mercado pago', 'banco j
 * safra'). Nunca palavra solta: 'Safra' não pode casar com o Banco J. Safra pelo apelido.
 */
function termosApelido(apelidos: string | null): string[] {
  return separarApelidos(apelidos).map((frase) => normalizarNomeInstituicao(frase));
}

/** Monta o índice a partir das instituições (puro). */
export function montarIndiceEmissores(instituicoes: InstituicaoIndice[]): IndiceEmissores {
  const porRaiz = new Map<string, InstituicaoIndice[]>();
  const porTermo = new Map<string, InstituicaoIndice[]>();
  for (const inst of instituicoes) {
    const raiz = cnpjRaiz(inst.cnpj);
    if (raiz) adicionar(porRaiz, raiz, inst);
    if (ehInstituicaoEmissora(inst) === false) continue;
    adicionar(porTermo, normalizarNomeInstituicao(inst.nome), inst);
    for (const termo of termosApelido(inst.apelidos)) adicionar(porTermo, termo, inst);
  }
  for (const lista of porRaiz.values()) lista.sort(compararPreferencia);
  return { porRaiz, porTermo };
}

/** Lê as instituições ATIVAS e monta o índice. */
export async function carregarIndiceEmissores(
  db: Pick<PrismaClient, 'institution'>,
): Promise<IndiceEmissores> {
  const rows = await db.institution.findMany({
    where: { status: 'ATIVA' },
    select: {
      id: true,
      nome: true,
      cnpj: true,
      tipoBacen: true,
      codigo: true,
      apelidos: true,
      createdAt: true,
    },
  });
  return montarIndiceEmissores(rows);
}

/** Casa o emissor informado (CNPJ e/ou nome) com o catálogo. null quando não há certeza. */
export function casarEmissor(
  indice: IndiceEmissores,
  informado: { cnpj?: string | null; nome?: string | null },
): EmissorCasado | null {
  const raiz = cnpjRaiz(informado.cnpj);
  if (raiz) {
    const candidatos = indice.porRaiz.get(raiz);
    if (candidatos && candidatos.length > 0) {
      const [escolhido] = candidatos;
      return { id: escolhido.id, nome: escolhido.nome, via: 'cnpj' };
    }
  }
  const nome = normalizarNomeInstituicao(informado.nome);
  if (!nome) return null;
  const candidatos = indice.porTermo.get(nome);
  if (!candidatos || candidatos.length !== 1) return null;
  const [unico] = candidatos;
  const via: ViaCasamento = normalizarNomeInstituicao(unico.nome) === nome ? 'nome' : 'apelido';
  return { id: unico.id, nome: unico.nome, via };
}

// ---------------------------------------------------------------------------
// Backfill (seleção pura)
// ---------------------------------------------------------------------------

/**
 * O `changes` de um UserChangeLog (array de FieldChange: {field, label, before, after}) tem uma
 * mudança no emissor? É a marca de que o usuário escolheu o emissor (ou "Usar a corretora").
 */
export function changesMexeuNoEmissor(changes: unknown): boolean {
  if (!Array.isArray(changes)) return false;
  return changes.some(
    (c) => !!c && typeof c === 'object' && (c as { field?: unknown }).field === 'emissor',
  );
}

export interface CandidatoBackfill {
  fixedIncomeAssetId: string;
  userId: string;
  /** Portfolio(s) do ativo: o UserChangeLog do 'ativo.editar' usa o portfolioId como entityId. */
  portfolioIds: string[];
  fiType: string;
  tesouroBondType: string | null;
  emissorInstitutionId: string | null;
  assetSymbol: string | null;
  pluggySubtype: string | null;
  issuer: string | null;
  issuerCnpj: string | null;
}

export interface LogEmissor {
  userId: string;
  entityId: string | null;
  changes: unknown;
}

export interface ItemBackfill {
  fixedIncomeAssetId: string;
  userId: string;
  issuer: string | null;
  issuerCnpj: string | null;
  emissor: EmissorCasado | null;
  /** O usuário já escolheu o emissor (ou "Usar a corretora"): não mexer. */
  puladoPorEscolha: boolean;
}

/**
 * Decide o que o backfill faz com cada FI do Pluggy ainda sem emissor. Pula o que não aceita
 * emissor, o que já tem emissor e o que o usuário já editou (histórico 'ativo.editar' com o campo
 * 'emissor'). Só casa os demais.
 */
export function planejarBackfillEmissor(
  candidatos: CandidatoBackfill[],
  logs: LogEmissor[],
  indice: IndiceEmissores,
): ItemBackfill[] {
  const escolhas = new Set<string>();
  for (const log of logs) {
    if (log.entityId && changesMexeuNoEmissor(log.changes)) {
      escolhas.add(`${log.userId}|${log.entityId}`);
    }
  }
  const itens: ItemBackfill[] = [];
  for (const c of candidatos) {
    if (c.emissorInstitutionId) continue;
    const aceita = aceitaEmissor({
      type: c.fiType,
      tesouroBondType: c.tesouroBondType,
      assetSymbol: c.assetSymbol,
      pluggySubtype: c.pluggySubtype,
    });
    if (!aceita) continue;
    const puladoPorEscolha = c.portfolioIds.some((p) => escolhas.has(`${c.userId}|${p}`));
    itens.push({
      fixedIncomeAssetId: c.fixedIncomeAssetId,
      userId: c.userId,
      issuer: c.issuer,
      issuerCnpj: c.issuerCnpj,
      emissor: puladoPorEscolha
        ? null
        : casarEmissor(indice, { cnpj: c.issuerCnpj, nome: c.issuer }),
      puladoPorEscolha,
    });
  }
  return itens;
}
