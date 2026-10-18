import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsUser } from '@/test/mocks/auth';

const m = vi.hoisted(() => ({
  exigir: vi.fn(),
  exigirClasse: vi.fn(),
  flagsEua: vi.fn(),
  montar: vi.fn(),
  essencial: vi.fn(),
  essencialEua: vi.fn(),
}));

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: m.exigir,
  exigirClasseAnalise: m.exigirClasse,
  flagsEua: m.flagsEua,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/montarTopoAtivo', () => ({
  montarTopoAtivo: m.montar,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/fundamentosEssencial', () => ({
  obterFundamentosEssencial: m.essencial,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/fundamentosEssencialEua', () => ({
  obterFundamentosEssencialEua: m.essencialEua,
}));

import { GET as GET_TOPO } from '../route';
import { GET as GET_FUND } from '../fundamentos/route';
import { ApiError } from '@/utils/apiErrorHandler';
import { API_AAPL } from '@/test/fixtures/analiseAtivos/respostas';

const chamar = (rota: typeof GET_TOPO, ticker: string) =>
  rota(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}`), {
    params: Promise.resolve({ ticker }),
  });

describe('página do ativo EUA (topo e Essencial)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.exigir.mockResolvedValue(mockAuthAsUser('u1'));
    m.exigirClasse.mockResolvedValue(mockAuthAsUser('u1'));
    m.flagsEua.mockReturnValue({ eua: true, euaPreco: false });
    m.montar.mockResolvedValue({ ticker: 'AAPL', classe: 'stock', nome: API_AAPL.nome });
    m.essencialEua.mockResolvedValue({ dados: { variante: 'stock' }, cache: false });
  });

  it('sem a chave EUA o ticker EUA segue 400 (nada muda) e nada é lido', async () => {
    m.flagsEua.mockReturnValue({ eua: false, euaPreco: false });
    for (const rota of [GET_TOPO, GET_FUND]) {
      const res = await chamar(rota, 'AAPL');
      expect(res.status).toBe(400);
    }
    expect(m.montar).not.toHaveBeenCalled();
    expect(m.essencialEua).not.toHaveBeenCalled();
    expect(m.exigirClasse).not.toHaveBeenCalled();
  });

  it('área desligada ou fora do beta: 404 pela checagem da classe EUA', async () => {
    m.exigirClasse.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    expect((await chamar(GET_TOPO, 'AAPL')).status).toBe(404);
    expect((await chamar(GET_FUND, 'O')).status).toBe(404);
    expect(m.montar).not.toHaveBeenCalled();
  });

  it('com a chave: ticker EUA (BRK-B → BRK.B) com a chave de preço repassada', async () => {
    expect((await chamar(GET_TOPO, 'brk-b')).status).toBe(200);
    expect(m.montar).toHaveBeenCalledWith('BRK.B', { eua: { habilitado: true, preco: false } });
    expect((await chamar(GET_FUND, 'O')).status).toBe(200);
    expect(m.essencialEua).toHaveBeenCalledWith('O');
    expect(m.essencial).not.toHaveBeenCalled();
  });

  it('ticker da B3 segue o caminho de sempre com a chave ligada', async () => {
    m.essencial.mockResolvedValue({ dados: { variante: 'acao' }, cache: true });
    await chamar(GET_TOPO, 'WEGE3');
    expect(m.montar).toHaveBeenCalledWith('WEGE3');
    await chamar(GET_FUND, 'WEGE3');
    expect(m.essencial).toHaveBeenCalledWith('WEGE3');
    expect(m.exigirClasse).not.toHaveBeenCalled();
  });

  it('ticker EUA fora da área = 404', async () => {
    m.montar.mockResolvedValue(null);
    m.essencialEua.mockResolvedValue(null);
    expect((await chamar(GET_TOPO, 'ZZZZ')).status).toBe(404);
    expect((await chamar(GET_FUND, 'ZZZZ')).status).toBe(404);
  });
});
