'use client';

/**
 * Estado da calculadora de "Meus cenários" (Bloco D, fatia B). O que o usuário digita fica como
 * TEXTO (vírgula ou ponto) — nunca é reescrito enquanto ele digita; a conta sai de montarCenarios
 * a cada mudança, sobre os números lidos dos textos.
 *
 * - Ao abrir: valores do ativo + premissas padrão, ou o cenário salvo por cima (premissas e só os
 *   dados que o usuário editou; o P/L alvo vazio salvo continua vazio).
 * - "editado": o dado do ativo digitado difere do valor que o campo mostrava (arredondado).
 * - "mudou desde que você salvou": o campo editado guardou o valor do ativo no salvamento e o
 *   ativo hoje mostra outro valor ⇒ aviso + "Usar o valor atual".
 * - `referencia` = o que está salvo (ou o padrão): diferente ⇒ "Alterações não salvas".
 * - Sem salvamento automático. `corpoParaSalvar` devolve o PUT ou os campos com erro.
 *
 * As funções puras ficam exportadas (testes sem React).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  CAMPOS_DADO,
  CASAS_CAMPO,
  PREMISSAS_CLASSE,
  montarCenarios,
  type CampoDadoCenario,
  type SaidaCenarios,
} from '@/services/analiseAtivos/regras/valuation/montarCenarios';
import {
  aplicarCenarioSalvo,
  diffDadosEditados,
  lerNumeroDigitado,
  validarPremissa,
  type NomePremissa,
} from '@/services/analiseAtivos/regras/valuation/cenario';
import {
  arredondar,
  formatarNumeroBR,
} from '@/services/analiseAtivos/regras/valuation/arredondamento';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type { CenarioPutBody, CenariosResposta } from '@/types/analiseAtivosBlocoD';
import type { Estado, ExibicaoConferenciaTela } from '@/types/analiseAtivosApi';

const TV = TEXTOS_CENARIOS.validacao;

/** Premissa digitável (a margem é o slider). */
export type PremissaCampo = Exclude<NomePremissa, 'margemPct'>;
export type CampoForm = CampoDadoCenario | PremissaCampo;

export interface SnapshotCenario {
  textos: Partial<Record<CampoForm, string>>;
  margemPct: number;
}

function valorEstado(e: Estado<number> | undefined): number | null {
  return e && e.estado === 'ok' ? e.valor : null;
}

/** Texto do campo para um número (como o campo mostra). */
export function textoDoNumero(campo: CampoForm, v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  // renda inteira sem centavos ("1.000"): cabe na caixa de 108px
  const casas = campo === 'rendaMensal' && Number.isInteger(v) ? 0 : CASAS_CAMPO[campo];
  return formatarNumeroBR(v, casas);
}

/** Valores do ativo (Estado ok ⇒ número) por campo de dado. */
export function valoresDoAtivo(
  r: CenariosResposta,
): Partial<Record<CampoDadoCenario, number | null>> {
  if (r.classe === 'fii') {
    return { rend12m: valorEstado(r.base.rend12m), vpCota: valorEstado(r.base.vpCota) };
  }
  return {
    lpa: valorEstado(r.base.lpa),
    vpa: valorEstado(r.base.vpa),
    dpa: valorEstado(r.base.dpa),
  };
}

/** Política de conferência por campo de dado. */
export function conferenciasDoAtivo(
  r: CenariosResposta,
): Partial<Record<CampoDadoCenario, ExibicaoConferenciaTela>> {
  const out: Partial<Record<CampoDadoCenario, ExibicaoConferenciaTela>> = {};
  for (const c of r.base.conferencias) {
    if (c.campo !== 'cotacao') out[c.campo] = c.exibicao;
  }
  return out;
}

/** Padrão: valores do ativo + premissas padrão. */
export function snapshotPadrao(r: CenariosResposta): SnapshotCenario {
  const base = valoresDoAtivo(r);
  const textos: Partial<Record<CampoForm, string>> = {};
  for (const c of CAMPOS_DADO[r.classe]) textos[c] = textoDoNumero(c, base[c]);
  const p = r.premissasPadrao as unknown as Record<string, number | null | undefined>;
  for (const n of PREMISSAS_CLASSE[r.classe])
    textos[n as PremissaCampo] = textoDoNumero(n as PremissaCampo, p[n]);
  return { textos, margemPct: r.premissasPadrao.margemPct };
}

/** Ao abrir: o cenário salvo por cima do padrão. */
export function snapshotInicial(r: CenariosResposta): SnapshotCenario {
  const padrao = snapshotPadrao(r);
  if (!r.salvo) return padrao;
  const premissas = aplicarCenarioSalvo(
    r.premissasPadrao as unknown as Record<string, unknown>,
    r.salvo.premissas as unknown as Record<string, unknown>,
    ['plAlvo'],
  ).premissas as Record<string, number | null | undefined>;
  const textos = { ...padrao.textos };
  for (const n of PREMISSAS_CLASSE[r.classe]) {
    textos[n as PremissaCampo] = textoDoNumero(n as PremissaCampo, premissas[n]);
  }
  const editados = (r.salvo.dadosEditados ?? {}) as Partial<Record<CampoDadoCenario, number>>;
  for (const c of CAMPOS_DADO[r.classe]) {
    if (typeof editados[c] === 'number') textos[c] = textoDoNumero(c, editados[c]);
  }
  const margem = typeof premissas.margemPct === 'number' ? premissas.margemPct : padrao.margemPct;
  return { textos, margemPct: margem };
}

function lerCampo(campo: CampoForm, texto: string | undefined): number | null {
  return lerNumeroDigitado(texto ?? '', { milhar: campo === 'rendaMensal' });
}

/** Mensagem de validação do campo (null = ok). */
export function erroDoCampo(
  r: CenariosResposta,
  campo: CampoForm,
  texto: string | undefined,
): string | null {
  const v = lerCampo(campo, texto);
  const ehDado = (CAMPOS_DADO[r.classe] as readonly string[]).includes(campo);
  if (v === null) {
    // dado do ativo vazio e P/L alvo vazio são válidos (o método diz o que falta)
    return ehDado || campo === 'plAlvo' ? null : TV.numero;
  }
  if (Number.isNaN(v)) return TV.numero;
  if (ehDado) {
    const max = r.limites.dadoAbsMax;
    return Math.abs(v) > max
      ? formatarTexto(TV.faixa, { valor: formatarNumeroBR(-max, 0), max: formatarNumeroBR(max, 0) })
      : null;
  }
  if (validarPremissa(campo as NomePremissa, v) !== null) return null;
  const faixa = r.limites[campo as PremissaCampo] as readonly [number, number];
  const casas = (n: number) => (Number.isInteger(n) ? 0 : 1);
  return formatarTexto(TV.faixa, {
    valor: formatarNumeroBR(faixa[0], casas(faixa[0])),
    max: formatarNumeroBR(faixa[1], casas(faixa[1])),
  });
}

/** O dado do ativo foi editado (difere do valor que o campo mostrava). */
export function campoEditado(
  r: CenariosResposta,
  campo: CampoDadoCenario,
  texto: string | undefined,
): boolean {
  const v = lerCampo(campo, texto);
  const b = valoresDoAtivo(r)[campo];
  const tb = textoDoNumero(campo, b);
  if (v === null) return tb !== '';
  if (Number.isNaN(v) || typeof b !== 'number') return true;
  return arredondar(v, CASAS_CAMPO[campo]) !== arredondar(b, CASAS_CAMPO[campo]);
}

/**
 * Valor ATUAL do ativo quando o campo editado guardou outro valor do ativo no salvamento (o ativo
 * mudou depois); null = sem aviso.
 */
export function valorMudouDesdeSalvamento(
  r: CenariosResposta,
  campo: CampoDadoCenario,
  texto: string | undefined,
): number | null {
  const noSalvamento = (r.salvo?.valoresDoAtivoNoSalvamento ?? null) as Partial<
    Record<CampoDadoCenario, number>
  > | null;
  const antes = noSalvamento?.[campo];
  const agora = valoresDoAtivo(r)[campo];
  if (typeof antes !== 'number' || typeof agora !== 'number') return null;
  if (!campoEditado(r, campo, texto)) return null;
  const c = CASAS_CAMPO[campo];
  return arredondar(antes, c) !== arredondar(agora, c) ? agora : null;
}

/** PUT do cenário ou os campos com erro. */
export function corpoParaSalvar(
  r: CenariosResposta,
  s: SnapshotCenario,
): { ok: true; corpo: CenarioPutBody } | { ok: false; campos: CampoForm[] } {
  const campos = [...CAMPOS_DADO[r.classe], ...PREMISSAS_CLASSE[r.classe]] as CampoForm[];
  const comErro = campos.filter((c) => erroDoCampo(r, c, s.textos[c]) !== null);
  if (comErro.length > 0) return { ok: false, campos: comErro };
  const n = (c: CampoForm) => lerCampo(c, s.textos[c]);
  const atuais: Partial<Record<CampoDadoCenario, number | null>> = {};
  for (const c of CAMPOS_DADO[r.classe]) atuais[c] = n(c);
  const dados = diffDadosEditados(valoresDoAtivo(r), atuais, CASAS_CAMPO);
  if (r.classe === 'fii') {
    return {
      ok: true,
      corpo: {
        classe: 'fii',
        premissas: {
          yieldPct: n('yieldPct') as number,
          margemPct: s.margemPct,
          rendaMensal: n('rendaMensal') as number,
          pvpAlvo: n('pvpAlvo') as number,
        },
        dados,
      },
    };
  }
  return {
    ok: true,
    corpo: {
      classe: 'acao',
      premissas: {
        yieldPct: n('yieldPct') as number,
        gPct: n('gPct') as number,
        kPct: n('kPct') as number,
        margemPct: s.margemPct,
        plAlvo: n('plAlvo'),
      },
      dados,
    },
  };
}

/** Calcula a saída da tela para o snapshot. */
export function calcular(
  r: CenariosResposta,
  s: SnapshotCenario,
  posicao: { pm: number | null; quantidade: number } | null,
): SaidaCenarios {
  const premissas: Partial<Record<NomePremissa, number | null>> = {};
  for (const p of PREMISSAS_CLASSE[r.classe])
    premissas[p] = lerCampo(p as PremissaCampo, s.textos[p as PremissaCampo]);
  const dadosEditados: Partial<Record<CampoDadoCenario, number | null>> = {};
  for (const c of CAMPOS_DADO[r.classe]) {
    if (campoEditado(r, c, s.textos[c])) dadosEditados[c] = lerCampo(c, s.textos[c]);
  }
  return montarCenarios({
    classe: r.classe,
    base: { valores: valoresDoAtivo(r), conferencias: conferenciasDoAtivo(r) },
    premissas,
    dadosEditados,
    margemPct: s.margemPct,
    cotacao: valorEstado(r.cotacao.valor),
    cotacaoConferencia: r.cotacao.conferencia
      ? (r.cotacao.conferencia.vsCotacao ?? r.cotacao.conferencia.exibicao)
      : null,
    posicao,
  });
}

function mesmo(a: SnapshotCenario, b: SnapshotCenario): boolean {
  if (a.margemPct !== b.margemPct) return false;
  const chaves = new Set([...Object.keys(a.textos), ...Object.keys(b.textos)]) as Set<CampoForm>;
  for (const k of chaves)
    if ((a.textos[k] ?? '').trim() !== (b.textos[k] ?? '').trim()) return false;
  return true;
}

export function useEstadoCenario(
  resposta: CenariosResposta,
  posicao: { pm: number | null; quantidade: number } | null,
) {
  const [snap, setSnap] = useState<SnapshotCenario>(() => snapshotInicial(resposta));
  const [referencia, setReferencia] = useState<SnapshotCenario>(() => snapshotInicial(resposta));

  const setTexto = useCallback((campo: CampoForm, texto: string) => {
    setSnap((s) => ({ ...s, textos: { ...s.textos, [campo]: texto } }));
  }, []);
  const setMargem = useCallback((margemPct: number) => setSnap((s) => ({ ...s, margemPct })), []);
  const voltarAoAtivo = useCallback(
    (campo: CampoDadoCenario) =>
      setSnap((s) => ({
        ...s,
        textos: { ...s.textos, [campo]: textoDoNumero(campo, valoresDoAtivo(resposta)[campo]) },
      })),
    [resposta],
  );

  const saida = useMemo(() => calcular(resposta, snap, posicao), [resposta, snap, posicao]);
  const sujo = !mesmo(snap, referencia);
  const padrao = useMemo(() => snapshotPadrao(resposta), [resposta]);
  const ehPadrao = mesmo(snap, padrao);

  return {
    snap,
    sujo,
    ehPadrao,
    saida,
    setTexto,
    setMargem,
    voltarAoAtivo,
    /** troca tudo (restaurar, desfazer) e, com `comoReferencia`, marca como salvo */
    aplicar: useCallback((s: SnapshotCenario, comoReferencia = true) => {
      setSnap(s);
      if (comoReferencia) setReferencia(s);
    }, []),
    marcarSalvo: useCallback(() => setReferencia(snap), [snap]),
    referencia,
    padrao,
    erro: useCallback(
      (campo: CampoForm) => erroDoCampo(resposta, campo, snap.textos[campo]),
      [resposta, snap],
    ),
    editado: useCallback(
      (campo: CampoDadoCenario) => campoEditado(resposta, campo, snap.textos[campo]),
      [resposta, snap],
    ),
    mudou: useCallback(
      (campo: CampoDadoCenario) => valorMudouDesdeSalvamento(resposta, campo, snap.textos[campo]),
      [resposta, snap],
    ),
    corpo: useCallback(() => corpoParaSalvar(resposta, snap), [resposta, snap]),
  };
}

export type EstadoCenario = ReturnType<typeof useEstadoCenario>;
