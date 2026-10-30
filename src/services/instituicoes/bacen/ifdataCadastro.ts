/**
 * IF.data Cadastro do Bacen (Olinda): lista de instituições com Tcb (tipo), segmento e
 * conglomerado prudencial. Fonte principal do import do catálogo de instituições
 * (ClickUp 86e2xqh69).
 *
 * O $filter combinado do Olinda não é respeitado, então baixamos o trimestre inteiro (~6 mil
 * linhas) e filtramos no cliente: Td='I' (instituição individual, não conglomerado), CodInst de 8
 * dígitos (a raiz do CNPJ; os 'C00xxxxx' são conglomerados) e Situacao='A' (ativa).
 */

export const IFDATA_CADASTRO_URL =
  'https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/IfDataCadastro(AnoMes=@AnoMes)';

const TAMANHO_PAGINA = 10000;
const MAX_PAGINAS = 20;

/** Uma instituição ativa do IF.data, já normalizada. */
export interface RegistroBacen {
  /** CodInst: raiz (8 dígitos) do CNPJ. */
  raiz: string;
  /** NomeInstituicao (razão social, em maiúsculas). */
  nome: string;
  /** Tcb: B1, B2, B3S, B3C, B4, N1, N2, N3, N4. */
  tcb: string;
  /** SegmentoTb ('Banco Múltiplo', 'Cooperativa de Crédito'...). */
  segmento: string | null;
  /** CodConglomeradoPrudencial (C00xxxxx). */
  conglomerado: string | null;
}

/** Linha crua do IfDataCadastro (só os campos usados). */
export interface LinhaIfDataCadastro {
  CodInst?: string | null;
  NomeInstituicao?: string | null;
  Tcb?: string | null;
  Td?: string | null;
  SegmentoTb?: string | null;
  Situacao?: string | null;
  CodConglomeradoPrudencial?: string | null;
}

function linhasDe(entrada: unknown): LinhaIfDataCadastro[] {
  if (Array.isArray(entrada)) return entrada as LinhaIfDataCadastro[];
  if (
    entrada &&
    typeof entrada === 'object' &&
    Array.isArray((entrada as { value?: unknown }).value)
  ) {
    return (entrada as { value: LinhaIfDataCadastro[] }).value;
  }
  throw new Error('IF.data: formato inesperado (esperado { value: [...] } ou uma lista)');
}

const texto = (v: string | null | undefined) => (v ?? '').trim();

/**
 * Filtra e normaliza o IfDataCadastro: só Td='I', CodInst de 8 dígitos e Situacao='A'.
 * Aceita a resposta do Olinda ({ value: [...] }) ou a lista de linhas. Raiz repetida: fica a
 * primeira.
 */
export function parseCadastroIfData(entrada: unknown): RegistroBacen[] {
  const vistos = new Set<string>();
  const registros: RegistroBacen[] = [];
  for (const linha of linhasDe(entrada)) {
    const raiz = texto(linha.CodInst);
    if (texto(linha.Td).toUpperCase() !== 'I') continue;
    if (!/^\d{8}$/.test(raiz)) continue;
    if (texto(linha.Situacao).toUpperCase() !== 'A') continue;
    if (vistos.has(raiz)) continue;
    const tcb = texto(linha.Tcb).toUpperCase();
    const nome = texto(linha.NomeInstituicao);
    if (!tcb || !nome) continue;
    vistos.add(raiz);
    registros.push({
      raiz,
      nome,
      tcb,
      segmento: texto(linha.SegmentoTb) || null,
      conglomerado: texto(linha.CodConglomeradoPrudencial).toUpperCase() || null,
    });
  }
  return registros;
}

/** Fins de trimestre (AAAAMM) a partir de `hoje`, do mais recente para trás. */
export function trimestresCandidatos(hoje: Date, quantidade = 4): string[] {
  let ano = hoje.getUTCFullYear();
  // Último fim de trimestre já encerrado (mar, jun, set, dez).
  let mes = Math.floor(hoje.getUTCMonth() / 3) * 3; // 0, 3, 6, 9 → mês (1-12) do trimestre anterior
  if (mes === 0) {
    ano -= 1;
    mes = 12;
  }
  const lista: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    lista.push(`${ano}${String(mes).padStart(2, '0')}`);
    mes -= 3;
    if (mes <= 0) {
      mes += 12;
      ano -= 1;
    }
  }
  return lista;
}

type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function baixarTrimestre(
  anoMes: string,
  fetchImpl: FetchLike,
): Promise<LinhaIfDataCadastro[]> {
  const linhas: LinhaIfDataCadastro[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const skip = pagina * TAMANHO_PAGINA;
    const url =
      `${IFDATA_CADASTRO_URL}?@AnoMes=${anoMes}&$format=json` +
      `&$top=${TAMANHO_PAGINA}&$skip=${skip}`;
    const resp = await fetchImpl(url);
    if (!resp.ok) throw new Error(`IF.data ${anoMes}: HTTP ${resp.status}`);
    const lote = linhasDe(await resp.json());
    linhas.push(...lote);
    if (lote.length < TAMANHO_PAGINA) break;
  }
  return linhas;
}

/**
 * Baixa o IfDataCadastro do Olinda, paginando. Sem `anoMes`, tenta os 4 últimos fins de
 * trimestre e usa o primeiro que tiver dados (o Bacen publica com ~3 meses de atraso).
 */
export async function baixarCadastroIfData(
  anoMes?: string | null,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  hoje: Date = new Date(),
): Promise<{ anoMes: string; linhas: LinhaIfDataCadastro[]; registros: RegistroBacen[] }> {
  const candidatos = anoMes ? [anoMes] : trimestresCandidatos(hoje, 4);
  for (const am of candidatos) {
    const linhas = await baixarTrimestre(am, fetchImpl);
    if (linhas.length === 0) continue;
    return { anoMes: am, linhas, registros: parseCadastroIfData(linhas) };
  }
  throw new Error(`IF.data: nenhum dado em ${candidatos.join(', ')}`);
}
