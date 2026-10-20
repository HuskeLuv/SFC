/**
 * Posição acionária do FRE para a tela (A6, item 6; fatia D). Regras PURAS:
 *
 *  - ehLinhaDireta: só os acionistas DIRETOS (ID_Acionista_Relacionado vazio). Os indiretos
 *    (cotistas das holdings) nunca são gravados.
 *  - idSintetico: as linhas 'Outros' e 'Ações em tesouraria' do FRE viram ids fixos
 *    (IDS_ACIONISTA_SINTETICO), estáveis entre versões do documento.
 *  - acionistasParaTela: até MAX_ACIONISTAS_EXIBIDOS diretos por % do total (desempate pelo nome),
 *    depois 'Outros' (o 'Outros' do FRE + os diretos que não couberam, para a tabela fechar 100%) e
 *    'Ações em tesouraria'. Só nome e % (decisão 5: nunca CPF/CNPJ do acionista).
 */
import {
  IDS_ACIONISTA_SINTETICO,
  MAX_ACIONISTAS_EXIBIDOS,
  type AcionistaFreApi,
} from '@/types/analiseAtivosComplementos';
import { TEXTOS_SOCIETARIO } from '@/services/analiseAtivos/textosSocietario';

/** Linha direta: sem acionista relacionado (o relacionado é a holding de quem o cotista participa). */
export function ehLinhaDireta(idAcionistaRelacionado: string | null | undefined): boolean {
  return (idAcionistaRelacionado ?? '').trim() === '';
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** 'Outros' ⇒ 'OUTROS'; 'Ações Tesouraria' / 'Ações em tesouraria' ⇒ 'TESOURARIA'; senão null. */
export function idSintetico(nome: string, tipoPessoa: string | null | undefined): string | null {
  if ((tipoPessoa ?? '').trim() !== '') return null;
  const n = semAcento(nome);
  if (n === 'outros') return IDS_ACIONISTA_SINTETICO.outros;
  if (/^acoes\s+(em\s+)?tesouraria$/.test(n) || n === 'tesouraria') {
    return IDS_ACIONISTA_SINTETICO.tesouraria;
  }
  return null;
}

/** Linha gravada em cia_fre_posicao_acionaria (já sem documento do acionista). */
export interface PosicaoAcionariaLinha {
  idAcionista: string;
  nome: string;
  pctOn: number | null;
  pctPn: number | null;
  pctTotal: number | null;
  controlador: boolean;
  acordoAcionistas: boolean;
  sintetica: boolean;
}

const soma = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

const arred = (n: number | null): number | null => (n === null ? null : Math.round(n * 1e4) / 1e4);

/**
 * Tabela da tela. `emitePn` = false zera a coluna PN (null, '—'). Linhas sintéticas vazias (0% e
 * sem diretos excedentes) não aparecem.
 */
export function acionistasParaTela(
  linhas: PosicaoAcionariaLinha[],
  opts: { emitePn: boolean; max?: number } = { emitePn: true },
): AcionistaFreApi[] {
  const max = opts.max ?? MAX_ACIONISTAS_EXIBIDOS;
  const diretos = linhas
    .filter((l) => !l.sintetica)
    .sort(
      (a, b) => (b.pctTotal ?? -1) - (a.pctTotal ?? -1) || a.nome.localeCompare(b.nome, 'pt-BR'),
    );
  const exibidos = diretos.slice(0, max);
  const excedentes = diretos.slice(max);
  const pn = (v: number | null) => (opts.emitePn ? arred(v) : null);

  const out: AcionistaFreApi[] = exibidos.map((l) => ({
    nome: l.nome,
    pctOn: arred(l.pctOn),
    pctPn: pn(l.pctPn),
    pctTotal: arred(l.pctTotal),
    controlador: l.controlador,
    acordoAcionistas: l.acordoAcionistas,
    sintetica: null,
  }));

  const outrosFre = linhas.find((l) => l.idAcionista === IDS_ACIONISTA_SINTETICO.outros);
  let outros = {
    pctOn: outrosFre?.pctOn ?? null,
    pctPn: outrosFre?.pctPn ?? null,
    pctTotal: outrosFre?.pctTotal ?? null,
  };
  for (const l of excedentes) {
    outros = {
      pctOn: soma(outros.pctOn, l.pctOn),
      pctPn: soma(outros.pctPn, l.pctPn),
      pctTotal: soma(outros.pctTotal, l.pctTotal),
    };
  }
  if ((outros.pctTotal ?? 0) > 0 || (outros.pctOn ?? 0) > 0 || (outros.pctPn ?? 0) > 0) {
    out.push({
      nome: TEXTOS_SOCIETARIO.acionistas.outros,
      pctOn: arred(outros.pctOn),
      pctPn: pn(outros.pctPn),
      pctTotal: arred(outros.pctTotal),
      controlador: false,
      acordoAcionistas: false,
      sintetica: 'outros',
    });
  }

  const tes = linhas.find((l) => l.idAcionista === IDS_ACIONISTA_SINTETICO.tesouraria);
  if (tes && ((tes.pctTotal ?? 0) > 0 || (tes.pctOn ?? 0) > 0 || (tes.pctPn ?? 0) > 0)) {
    out.push({
      nome: TEXTOS_SOCIETARIO.acionistas.tesouraria,
      pctOn: arred(tes.pctOn),
      pctPn: pn(tes.pctPn),
      pctTotal: arred(tes.pctTotal),
      controlador: false,
      acordoAcionistas: false,
      sintetica: 'tesouraria',
    });
  }
  return out;
}
