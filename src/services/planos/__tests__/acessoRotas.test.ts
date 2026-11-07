import { describe, expect, it } from 'vitest';
import { ACESSO_ROTAS, classificarRota, planoExigidoPelaRota } from '../acessoRotas';

describe('ACESSO_ROTAS', () => {
  it('prefixo mais longo vence', () => {
    expect(planoExigidoPelaRota('/api/saude-financeira')).toBe('adv');
    expect(planoExigidoPelaRota('/api/saude-financeira/seguros/123')).toBe('adv');
    expect(planoExigidoPelaRota('/api/saude-financeira/config')).toBeNull();
    expect(classificarRota('/api/saude-financeira/config')?.prefixo).toBe(
      '/api/saude-financeira/config',
    );
    expect(planoExigidoPelaRota('/api/analises/indicadores')).toBeNull();
    expect(planoExigidoPelaRota('/api/analises/indices')).toBeNull();
    expect(planoExigidoPelaRota('/api/pluggy/connections')).toBeNull();
    expect(planoExigidoPelaRota('/api/pluggy/carteira/importar')).toBe('pro');
    expect(planoExigidoPelaRota('/api/relatorios/financeiro/config')).toBeNull();
    expect(planoExigidoPelaRota('/api/relatorios/movimentacoes')).toBe('pro');
  });

  it("prefixo terminado em '-' casa o começo do segmento (IR)", () => {
    for (const r of [
      'ir-mensal',
      'ir-pgbl',
      'ir-pgbl/simulacao',
      'ir-cripto',
      'ir-comecotas',
      'ir-resumo-anual',
      'ir-stocks-us',
    ]) {
      expect(planoExigidoPelaRota(`/api/analises/${r}`)).toBe('adv');
    }
  });

  it('sem "-" casa por segmento: /api/historico não pega /api/historico-alteracoes', () => {
    expect(planoExigidoPelaRota('/api/historico/transacao/1')).toBe('pro');
    expect(planoExigidoPelaRota('/api/historico-alteracoes')).toBeNull();
    expect(classificarRota('/api/historico-alteracoes/1/undo')?.prefixo).toBe(
      '/api/historico-alteracoes',
    );
    expect(planoExigidoPelaRota('/api/planejamento')).toBe('pro');
    expect(classificarRota('/api/planejamento-sonhos/1')?.prefixo).toBe('/api/planejamento-sonhos');
    expect(classificarRota('/api/carteiraX')).toBeNull();
  });

  it('DELETE livre na carteira, ativos, histórico, Tesouro e assets', () => {
    for (const p of [
      '/api/carteira/operacao',
      '/api/ativos/1',
      '/api/historico/transacao/1',
      '/api/tesouro-direto/details',
      '/api/assets',
    ]) {
      expect(planoExigidoPelaRota(p, 'GET')).toBe('pro');
      expect(planoExigidoPelaRota(p, 'POST')).toBe('pro');
      expect(planoExigidoPelaRota(p, 'DELETE')).toBeNull();
      expect(planoExigidoPelaRota(p, 'delete')).toBeNull();
    }
  });

  it('ignora query, hash e barra final', () => {
    expect(planoExigidoPelaRota('/api/analises/proventos?ano=2026')).toBe('adv');
    expect(planoExigidoPelaRota('/api/analises/proventos/')).toBe('adv');
    expect(planoExigidoPelaRota('/api/cashflow#x')).toBeNull();
  });

  it('isentos e não classificados não exigem plano', () => {
    expect(classificarRota('/api/webhooks/stripe')?.acesso).toBe('isento');
    expect(classificarRota('/api/assinaturas/me')?.acesso).toBe('isento');
    expect(classificarRota('/api/cron/x')?.acesso).toBe('isento');
    expect(classificarRota('/api/nao-existe')).toBeNull();
    expect(planoExigidoPelaRota('/api/nao-existe')).toBeNull();
  });

  it('chaves bem formadas: começam com /api/, sem barra final', () => {
    for (const k of Object.keys(ACESSO_ROTAS)) {
      expect(k.startsWith('/api/')).toBe(true);
      expect(k.endsWith('/')).toBe(false);
    }
  });
});
