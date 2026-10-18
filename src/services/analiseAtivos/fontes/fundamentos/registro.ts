/**
 * Registro das fontes de fundamentos (v2.5; desenho final.camada_fontes §5). Assinaturas da fatia 0;
 * a fatia A preencheu FONTES com fonteCvm.ts (leitura_local) e fonteExemplo.ts (fake de teste,
 * bloqueado em produção). Contratar um provedor = registrar aqui o conector pago (fonteProvedorX.ts + host na allowlist +
 * credenciais ANALISE_FONTE_<ID>_* no app.env + ANALISE_FONTES_INGESTAO + nova versão de params).
 *
 * - 'sec' (Stocks e REITs, fatia B) é leitura_local como a CVM: nunca entra na ingestão;
 * - 'exemplo' é RECUSADO com NODE_ENV=production (obterFonte lança);
 * - rotulosFontes() alimenta a frase de fonte das telas (textosCriterios.textoNotaFonte) sem que a
 *   fatia B dependa da implementação dos conectores.
 */
import { FONTE_CVM } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import { FONTE_EXEMPLO } from '@/services/analiseAtivos/fontes/fundamentos/fonteExemplo';
import { FONTE_SEC } from '@/services/analiseAtivos/fontes/fundamentos/fonteSec';
import type { RotulosFonte } from '@/services/analiseAtivos/textosCriterios';
import {
  ENV_FONTES_INGESTAO,
  PREFIXO_ENV_CREDENCIAIS_FONTE,
  RE_ID_FONTE,
  type FonteFundamentos,
  type IdFonte,
} from '@/types/analiseAtivosFontes';

/** Fontes registradas por id (um conector pago entra aqui: { provedor_x: FONTE_PROVEDOR_X }). */
export const FONTES: Readonly<Record<string, FonteFundamentos>> = {
  cvm: FONTE_CVM,
  exemplo: FONTE_EXEMPLO,
  // Stocks e REITs (fatia B): leitura local das linhas FY da SEC (us_stocks/us_reits)
  sec: FONTE_SEC,
};

/** Rótulo curto de cada fonte conhecida (frase de fonte); o conector registrado tem o seu. */
const ROTULOS_BASE: RotulosFonte = {
  cvm: 'CVM',
  exemplo: 'Fonte de exemplo (teste)',
  sec: '10-K (SEC)',
};

export class ErroRegistroFonte extends Error {
  constructor(
    public readonly codigo: 'fonte_desconhecida' | 'exemplo_em_producao' | 'id_invalido',
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroRegistroFonte';
  }
}

/** Fonte registrada (null = desconhecida). 'exemplo' em produção = erro. */
export function obterFonte(
  id: IdFonte,
  ambiente: string | undefined = process.env.NODE_ENV,
): FonteFundamentos | null {
  if (id === 'exemplo' && ambiente === 'production') {
    throw new ErroRegistroFonte(
      'exemplo_em_producao',
      "a fonte 'exemplo' só roda fora de produção",
    );
  }
  return FONTES[id] ?? null;
}

/**
 * Ids de conectores habilitados para a INGESTÃO (ANALISE_FONTES_INGESTAO, separados por vírgula;
 * vazio = nenhum: o job 'fontes-fundamentos' termina 'pulado'). 'cvm' e 'sec' nunca entram (leitura
 * local).
 */
export function idsIngestaoHabilitados(
  env: Readonly<Record<string, string | undefined>> = process.env,
): IdFonte[] {
  const bruto = env[ENV_FONTES_INGESTAO] ?? '';
  const ids = bruto
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s !== 'cvm' && s !== 'sec');
  for (const id of ids) {
    if (!RE_ID_FONTE.test(id)) {
      throw new ErroRegistroFonte('id_invalido', `${ENV_FONTES_INGESTAO}: id inválido '${id}'`);
    }
  }
  return [...new Set(ids)];
}

/** Rótulos para a frase de fonte (registro + conhecidos). */
export function rotulosFontes(): RotulosFonte {
  const doRegistro = Object.fromEntries(Object.values(FONTES).map((f) => [f.id, f.rotulo]));
  return { ...ROTULOS_BASE, ...doRegistro };
}

/**
 * Credenciais de um conector a partir do ambiente (ANALISE_FONTE_<ID>_*, só no app.env): a chave
 * devolvida é o sufixo depois do prefixo ('API_KEY'). Nunca logar o valor.
 */
export function credenciaisDaFonte(
  id: IdFonte,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  const prefixo = `${PREFIXO_ENV_CREDENCIAIS_FONTE}${id.toUpperCase()}_`;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith(prefixo) && typeof v === 'string' && v.length > 0) {
      out[k.slice(prefixo.length)] = v;
    }
  }
  return out;
}
