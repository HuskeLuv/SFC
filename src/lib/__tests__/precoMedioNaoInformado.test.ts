import { describe, expect, it } from 'vitest';
import {
  TRECHO_MARCADOR_PRECO_MEDIO,
  comMarcadorPrecoMedio,
  notesCompraSemPrecoMedio,
  semMarcadorPrecoMedio,
  temPrecoMedioNaoInformado,
} from '@/lib/precoMedioNaoInformado';

const NOTA = 'Importado do banco (Open Finance)';

describe('precoMedioNaoInformado', () => {
  it('notes da compra importada trazem o marcador (e o trecho do filtro no banco)', () => {
    const notes = notesCompraSemPrecoMedio(NOTA);
    expect(temPrecoMedioNaoInformado(notes)).toBe(true);
    expect(notes).toContain(TRECHO_MARCADOR_PRECO_MEDIO);
  });

  it('texto solto, vazio ou JSON sem marcador: não marcado', () => {
    expect(temPrecoMedioNaoInformado(NOTA)).toBe(false);
    expect(temPrecoMedioNaoInformado(null)).toBe(false);
    expect(temPrecoMedioNaoInformado('{"operation":{"action":"compra"}}')).toBe(false);
  });

  it('tirar o marcador preserva o resto; sem marcador devolve igual', () => {
    const sem = semMarcadorPrecoMedio(notesCompraSemPrecoMedio(NOTA));
    expect(temPrecoMedioNaoInformado(sem)).toBe(false);
    expect(JSON.parse(sem!)).toEqual({
      observacoes: NOTA,
      operation: { action: 'compra', origem: 'open-finance' },
    });
    expect(semMarcadorPrecoMedio(NOTA)).toBe(NOTA);
    expect(semMarcadorPrecoMedio(null)).toBeNull();
  });

  it('marcar notes antigas: texto solto, { raw } com instituição, e idempotente', () => {
    expect(JSON.parse(comMarcadorPrecoMedio(NOTA, NOTA))).toEqual(
      JSON.parse(notesCompraSemPrecoMedio(NOTA)),
    );
    const comInst = JSON.stringify({ raw: NOTA, operation: { instituicaoId: 'inst-1' } });
    expect(JSON.parse(comMarcadorPrecoMedio(comInst, NOTA))).toEqual({
      observacoes: NOTA,
      operation: {
        action: 'compra',
        instituicaoId: 'inst-1',
        origem: 'open-finance',
        precoMedioNaoInformado: true,
      },
    });
    const marcada = notesCompraSemPrecoMedio(NOTA);
    expect(comMarcadorPrecoMedio(marcada, NOTA)).toBe(marcada);
  });
});
