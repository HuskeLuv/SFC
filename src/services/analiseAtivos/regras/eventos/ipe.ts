/**
 * IPE da CVM (ipe_cia_aberta_AAAA.csv) → assembleias de acionistas (funções puras, sem I/O).
 *
 * Só `Categoria = Assembleia` com Tipo AGO, AGE ou AGO/E vira evento (AGDEB = debenturistas e AGESP =
 * especial de preferencialistas ficam fora). `Data_Referencia` é a data da assembleia; a mesma
 * assembleia tem vários documentos (Edital, Proposta, Boletim, Mapa, Ata…), cada um com o próprio
 * Protocolo_Entrega. O arquivo do ano traz uma linha por (protocolo, versão) — às vezes repetida.
 *
 * Consolidação: 1 evento por (cnpj, subtipo, data), vindo da MAIOR versão de cada protocolo (uma
 * versão nova pode remarcar a data). AGO e AGE na mesma data (ou um AGO/E) viram um só 'AGO/AGE'.
 * Link_Download (rad.cvm.gov.br) é guardado como texto, nunca baixado.
 */
import { normalizarCnpj as normalizarCnpjComum } from '@/services/analiseAtivos/regras/comum/cnpj';
import type { LinhaCsv } from '@/services/analiseAtivos/fontes/csvStream';

export const IPE_COLUNAS_OBRIGATORIAS = [
  'CNPJ_Companhia',
  'Data_Referencia',
  'Categoria',
  'Tipo',
  'Especie',
  'Assunto',
  'Data_Entrega',
  'Protocolo_Entrega',
  'Versao',
  'Link_Download',
];

export const CATEGORIA_ASSEMBLEIA = 'Assembleia';
export const ESPECIE_EDITAL = 'Edital de Convocação';
export const MAX_ASSUNTO = 200;
/** Data da assembleia plausível: até 3 anos antes e 1 ano depois da entrega (há '3026-04-30'). */
const ANOS_ANTES_ENTREGA = 3;
const ANOS_DEPOIS_ENTREGA = 1;

export type SubtipoAssembleia = 'AGO' | 'AGE' | 'AGO/AGE';

const SUBTIPO_POR_TIPO: Record<string, SubtipoAssembleia> = {
  AGO: 'AGO',
  AGE: 'AGE',
  'AGO/E': 'AGO/AGE',
  'AGO/AGE': 'AGO/AGE',
};

const HOSTS_LINK = new Set(['www.rad.cvm.gov.br', 'rad.cvm.gov.br']);

export interface EventoIpe {
  cnpj: string;
  subtipo: SubtipoAssembleia;
  /** data da assembleia (Data_Referencia) */
  data: string;
  especie: string;
  assunto: string | null;
  dataEntrega: string;
  protocolo: string;
  versao: number;
  /** só rad.cvm.gov.br; texto, nunca baixado */
  linkDownload: string | null;
}

export type ClassificacaoLinhaIpe =
  | { tipo: 'evento'; evento: EventoIpe }
  | { tipo: 'ignorada'; motivo: 'categoria' | 'tipo_assembleia' }
  | {
      tipo: 'rejeitada';
      motivo: 'cnpj_invalido' | 'data_invalida' | 'data_implausivel' | 'protocolo_ausente';
    };

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(s: string): boolean {
  if (!RE_DATA.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * CNPJ com ou sem máscara → 14 dígitos sem máscara (regras/comum/cnpj.ts, o formato de todas as
 * tabelas da fase); inválido, só zeros ou filial 0000 (emissor estrangeiro) ⇒ null.
 */
export function normalizarCnpj(s: string): string | null {
  const d = normalizarCnpjComum(s);
  if (d === null || d.slice(8, 12) === '0000') return null;
  return d;
}

function somarAnos(data: string, anos: number): string {
  return `${Number(data.slice(0, 4)) + anos}${data.slice(4)}`;
}

/** Data da assembleia dentro de [entrega − 3 anos, entrega + 1 ano] (comparação de texto AAAA-MM-DD). */
export function dataAssembleiaPlausivel(data: string, dataEntrega: string): boolean {
  return (
    data >= somarAnos(dataEntrega, -ANOS_ANTES_ENTREGA) &&
    data <= somarAnos(dataEntrega, ANOS_DEPOIS_ENTREGA)
  );
}

function limparAssunto(s: string): string | null {
  const t = s
    .split('||')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('; ')
    .replace(/\s+/g, ' ');
  if (!t) return null;
  return t.length > MAX_ASSUNTO ? `${t.slice(0, MAX_ASSUNTO - 1).trimEnd()}…` : t;
}

function linkPermitido(s: string): string | null {
  if (!s) return null;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && HOSTS_LINK.has(u.hostname)
      ? s
      : null;
  } catch {
    return null;
  }
}

export function classificarLinhaIpe(l: LinhaCsv): ClassificacaoLinhaIpe {
  if (l.get('Categoria') !== CATEGORIA_ASSEMBLEIA) return { tipo: 'ignorada', motivo: 'categoria' };
  const subtipo = SUBTIPO_POR_TIPO[l.get('Tipo')];
  if (!subtipo) return { tipo: 'ignorada', motivo: 'tipo_assembleia' };
  const cnpj = normalizarCnpj(l.get('CNPJ_Companhia'));
  if (!cnpj) return { tipo: 'rejeitada', motivo: 'cnpj_invalido' };
  const data = l.get('Data_Referencia');
  const dataEntrega = l.get('Data_Entrega');
  if (!dataValida(data) || !dataValida(dataEntrega)) {
    return { tipo: 'rejeitada', motivo: 'data_invalida' };
  }
  if (!dataAssembleiaPlausivel(data, dataEntrega)) {
    return { tipo: 'rejeitada', motivo: 'data_implausivel' };
  }
  const protocolo = l.get('Protocolo_Entrega');
  if (!protocolo) return { tipo: 'rejeitada', motivo: 'protocolo_ausente' };
  const versao = Number.parseInt(l.get('Versao'), 10);
  return {
    tipo: 'evento',
    evento: {
      cnpj,
      subtipo,
      data,
      especie: l.get('Especie'),
      assunto: limparAssunto(l.get('Assunto')),
      dataEntrega,
      protocolo,
      versao: Number.isFinite(versao) && versao > 0 ? versao : 1,
      linkDownload: linkPermitido(l.get('Link_Download')),
    },
  };
}

/** Linha do IPE → assembleia, ou null (outra categoria, AGDEB/AGESP ou linha rejeitada). */
export function parseLinhaIpe(l: LinhaCsv): EventoIpe | null {
  const c = classificarLinhaIpe(l);
  return c.tipo === 'evento' ? c.evento : null;
}

export function chaveAssembleia(e: { subtipo: SubtipoAssembleia; data: string }): string {
  return `${e.subtipo}:${e.data}`;
}

/** Documento que representa a assembleia: o Edital; senão o entregue primeiro. */
function preferir(a: EventoIpe, b: EventoIpe): EventoIpe {
  const ea = a.especie === ESPECIE_EDITAL;
  const eb = b.especie === ESPECIE_EDITAL;
  if (ea !== eb) return ea ? a : b;
  if (a.dataEntrega !== b.dataEntrega) return a.dataEntrega < b.dataEntrega ? a : b;
  return a.protocolo <= b.protocolo ? a : b;
}

/**
 * 1 evento por (cnpj, subtipo, data), da maior versão de cada protocolo. AGO + AGE na mesma data,
 * ou AGO/E, ⇒ 'AGO/AGE'. Saída ordenada por (cnpj, data, subtipo).
 */
export function consolidarAssembleias(eventos: EventoIpe[]): EventoIpe[] {
  const porProtocolo = new Map<string, EventoIpe>();
  for (const e of eventos) {
    const atual = porProtocolo.get(e.protocolo);
    if (
      !atual ||
      e.versao > atual.versao ||
      (e.versao === atual.versao && e.dataEntrega > atual.dataEntrega)
    ) {
      porProtocolo.set(e.protocolo, e);
    }
  }

  const porDia = new Map<string, EventoIpe[]>();
  for (const e of porProtocolo.values()) {
    const k = `${e.cnpj}|${e.data}`;
    const lista = porDia.get(k);
    if (lista) lista.push(e);
    else porDia.set(k, [e]);
  }

  const out: EventoIpe[] = [];
  for (const docs of porDia.values()) {
    const subtipos = new Set(docs.map((d) => d.subtipo));
    const conjunta = subtipos.has('AGO/AGE') || (subtipos.has('AGO') && subtipos.has('AGE'));
    if (conjunta) {
      out.push({ ...docs.reduce(preferir), subtipo: 'AGO/AGE' });
      continue;
    }
    for (const s of subtipos) {
      out.push(docs.filter((d) => d.subtipo === s).reduce(preferir));
    }
  }
  return out.sort(
    (a, b) =>
      a.cnpj.localeCompare(b.cnpj) ||
      a.data.localeCompare(b.data) ||
      a.subtipo.localeCompare(b.subtipo),
  );
}
