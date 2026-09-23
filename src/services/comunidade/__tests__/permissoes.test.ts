import { describe, it, expect } from 'vitest';
import {
  conteudoVisivel,
  estaSuspenso,
  normalizarTexto,
  podeModerar,
  podePublicarNaCategoria,
  selosDoAutor,
} from '../permissoes';

describe('podeModerar', () => {
  it('equipe e admin moderam; membro e consultor não', () => {
    expect(podeModerar({ role: 'user', cargo: 'equipe' })).toBe(true);
    expect(podeModerar({ role: 'admin', cargo: null })).toBe(true);
    expect(podeModerar({ role: 'user', cargo: 'membro' })).toBe(false);
    expect(podeModerar({ role: 'consultant', cargo: 'membro' })).toBe(false);
  });
});

describe('selosDoAutor', () => {
  it('equipe vem antes de consultor; membro comum não tem selo', () => {
    expect(selosDoAutor('consultant', 'equipe')).toEqual(['equipe', 'consultor']);
    expect(selosDoAutor('consultant', 'membro')).toEqual(['consultor']);
    expect(selosDoAutor('user', null)).toEqual([]);
  });
});

describe('podePublicarNaCategoria', () => {
  const membro = { role: 'user' as const, cargo: 'membro' as const };
  const consultor = { role: 'consultant' as const, cargo: 'membro' as const };
  const equipe = { role: 'user' as const, cargo: 'equipe' as const };

  it('categorias abertas aceitam todos', () => {
    expect(podePublicarNaCategoria(membro, 'geral')).toBe(true);
  });

  it('"servicos" só para consultores (e equipe)', () => {
    expect(podePublicarNaCategoria(membro, 'servicos')).toBe(false);
    expect(podePublicarNaCategoria(consultor, 'servicos')).toBe(true);
    expect(podePublicarNaCategoria(equipe, 'servicos')).toBe(true);
  });

  it('"avisos" só para a equipe', () => {
    expect(podePublicarNaCategoria(consultor, 'avisos')).toBe(false);
    expect(podePublicarNaCategoria(equipe, 'avisos')).toBe(true);
    expect(podePublicarNaCategoria({ role: 'admin', cargo: null }, 'avisos')).toBe(true);
  });

  it('categoria inexistente é recusada', () => {
    expect(podePublicarNaCategoria(equipe, 'nao-existe')).toBe(false);
  });
});

describe('estaSuspenso / conteudoVisivel / normalizarTexto', () => {
  const agora = new Date('2026-09-23T12:00:00Z');

  it('suspensão vale até a data', () => {
    expect(estaSuspenso(new Date('2026-09-24T00:00:00Z'), agora)).toBe(true);
    expect(estaSuspenso(new Date('2026-09-22T00:00:00Z'), agora)).toBe(false);
    expect(estaSuspenso(null, agora)).toBe(false);
  });

  it('oculto só aparece para moderador; excluído para ninguém', () => {
    const oculto = { excluidoEm: null, ocultoEm: agora };
    expect(conteudoVisivel(oculto, false)).toBe(false);
    expect(conteudoVisivel(oculto, true)).toBe(true);
    expect(conteudoVisivel({ excluidoEm: agora, ocultoEm: null }, true)).toBe(false);
  });

  it('normaliza quebras de linha e espaços nas pontas', () => {
    expect(normalizarTexto('  oi\r\n\r\n\r\n\r\ntudo bem?  ')).toBe('oi\n\ntudo bem?');
    expect(normalizarTexto('   \n  ')).toBe('');
  });
});
