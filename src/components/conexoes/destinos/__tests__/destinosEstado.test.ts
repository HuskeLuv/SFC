import { describe, expect, it } from 'vitest';
import {
  agruparFaixas,
  alternarSelecao,
  aplicarLote,
  aposParcial,
  comFalhas,
  contarMudancas,
  corpoDoPost,
  destinosDoLote,
  ehRevisavel,
  escolher,
  estadoInicial,
  itemMudou,
  marcarVarios,
  opcoesDoLote,
  podeServirDeReserva,
  rotuloVigente,
  voltarASugestao,
  type ItemRevisavel,
} from '../destinosEstado';
import { listaPadrao } from './fixtures';

const rev = (i: unknown) => i as ItemRevisavel;

describe('destinosEstado', () => {
  it('itens sem escolha (fixo, já estava, sem suporte) não são revisáveis', () => {
    const l = listaPadrao();
    expect(ehRevisavel(l.knca11)).toBe(true);
    expect(ehRevisavel(l.cdb)).toBe(true);
    expect(ehRevisavel(l.prev)).toBe(false);
    expect(ehRevisavel(l.jaEstava)).toBe(false);
    expect(ehRevisavel(l.semSuporte)).toBe(false);
  });

  it('faixas na ordem do servidor, só com revisáveis em "revisaveis"', () => {
    const l = listaPadrao();
    const faixas = agruparFaixas(l.itens);
    expect(faixas.map((f) => f.grupo)).toEqual([
      'acoes',
      'fiis',
      'rf',
      'previdencia',
      'ja-estava',
      'sem-suporte',
    ]);
    expect(faixas[0].rotulo).toBe('Ações');
    expect(faixas[1].revisaveis).toEqual([l.hglg11.bankInvestmentId, l.knca11.bankInvestmentId]);
    expect(faixas[3].revisaveis).toEqual([]);
  });

  it('escolher: guarda a troca; escolher a sugestão de novo limpa; voltarASugestao limpa', () => {
    const l = listaPadrao();
    const knca = rev(l.knca11);
    let e = escolher(estadoInicial(), knca, 'fimFia', 'fiagro');
    expect(e.escolhas[knca.bankInvestmentId]).toEqual({ categoria: 'fimFia', subgrupo: 'fiagro' });
    expect(itemMudou(knca, e)).toBe(true);
    expect(rotuloVigente(knca, e)).toBe('Fundos › Fiagro');

    const sugestao = knca.opcoes.atual;
    const voltou = escolher(e, knca, 'fiis', sugestao.subgrupo);
    expect(voltou.escolhas).toEqual({});

    e = voltarASugestao(e, knca.bankInvestmentId);
    expect(e.escolhas).toEqual({});
    expect(rotuloVigente(knca, e)).toBe(knca.atual!.rotulo);
  });

  it('escolher um destino recusado pelo servidor não muda nada', () => {
    const l = listaPadrao();
    const knca = rev(l.knca11);
    const e0 = estadoInicial();
    expect(escolher(e0, knca, 'stocks', 'growth')).toBe(e0);
    expect(escolher(e0, knca, 'reservaEmergencia')).toBe(e0);
  });

  it('lote: só os destinos aceitos por TODOS os marcados', () => {
    const l = listaPadrao();
    let e = marcarVarios(
      estadoInicial(),
      [l.knca11.bankInvestmentId, l.petr4.bankInvestmentId],
      true,
    );
    const comuns = destinosDoLote(l.itens, e.selecionados).map((d) => d.categoria);
    expect(comuns).toContain('acoes');
    expect(comuns).toContain('fimFia');
    expect(comuns).not.toContain('reservaEmergencia');

    e = alternarSelecao(e, l.cdb.bankInvestmentId);
    expect(destinosDoLote(l.itens, e.selecionados)).toEqual([]);
    expect(opcoesDoLote([])).toEqual([]);
  });

  it('aplicarLote aplica a cada um pelas próprias opções e limpa a seleção', () => {
    const l = listaPadrao();
    const ids = [l.petr4.bankInvestmentId, l.wege3.bankInvestmentId];
    const e = aplicarLote([rev(l.petr4), rev(l.wege3)], marcarVarios(estadoInicial(), ids, true), {
      categoria: 'acoes',
      subgrupo: 'growth',
    });
    expect(e.selecionados.size).toBe(0);
    expect(contarMudancas(l.itens, e)).toBe(2);
    expect(e.escolhas[l.petr4.bankInvestmentId]).toEqual({
      categoria: 'acoes',
      subgrupo: 'growth',
    });
  });

  it('corpoDoPost: itens só com o que mudou; confirmarIds com todos os para-revisar exibidos', () => {
    const l = listaPadrao();
    const e = escolher(estadoInicial(), rev(l.knca11), 'fimFia', 'fiagro');
    const corpo = corpoDoPost(l.itens, e);
    expect(corpo.itens).toEqual([
      { id: l.knca11.bankInvestmentId, categoria: 'fimFia', subgrupo: 'fiagro' },
    ]);
    expect(corpo.confirmarIds).toEqual(
      [l.petr4, l.wege3, l.hglg11, l.knca11, l.cdb].map((i) => i.bankInvestmentId),
    );
    expect(corpo.confirmarIds).not.toContain(l.prev.bankInvestmentId);
  });

  it('corpoDoPost: aba sem seção (Reserva) vai sem subgrupo', () => {
    const l = listaPadrao();
    const e = escolher(estadoInicial(), rev(l.cdb), 'reservaEmergencia');
    expect(corpoDoPost(l.itens, e).itens).toEqual([
      { id: l.cdb.bankInvestmentId, categoria: 'reservaEmergencia' },
    ]);
  });

  it('409: marca as falhas e preserva as escolhas', () => {
    const l = listaPadrao();
    const e = comFalhas(escolher(estadoInicial(), rev(l.knca11), 'fimFia', 'fiagro'), [
      { id: l.knca11.bankInvestmentId, nome: 'KNCA11', motivo: 'Mudou' },
    ]);
    expect(e.falhas[l.knca11.bankInvestmentId]).toBe('Mudou');
    expect(contarMudancas(l.itens, e)).toBe(1);
  });

  it('parcial: os que deram certo saem do próximo POST; os que falharam continuam', () => {
    const l = listaPadrao();
    let e = escolher(estadoInicial(), rev(l.knca11), 'fimFia', 'fiagro');
    e = escolher(e, rev(l.wege3), 'acoes', 'growth');
    e = aposParcial(l.itens, e, [{ id: l.wege3.bankInvestmentId, nome: 'WEGE3', motivo: 'x' }]);
    expect(e.salvos.has(l.knca11.bankInvestmentId)).toBe(true);
    expect(e.salvos.has(l.petr4.bankInvestmentId)).toBe(true);
    expect(e.salvos.has(l.wege3.bankInvestmentId)).toBe(false);
    const corpo = corpoDoPost(l.itens, e);
    expect(corpo.itens.map((i) => i.id)).toEqual([l.wege3.bankInvestmentId]);
    expect(corpo.confirmarIds).toEqual([l.wege3.bankInvestmentId]);
  });

  it('dica "pode servir de reserva" só lê as opções do servidor', () => {
    const l = listaPadrao();
    expect(podeServirDeReserva(l.cdb)).toBe(true);
    expect(podeServirDeReserva(l.knca11)).toBe(false);
  });
});
