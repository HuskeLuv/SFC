/**
 * Bloco 1 (fatia 0): cópia de Salvos e dos avisos das listas. A varredura de palavras proibidas
 * está em linguagemV2Global.test.ts (os dois módulos entram em MODULOS); aqui ficam as regras
 * próprias: literais do Pedro, títulos sem R$, push genérico, "por volta das 8h" e nenhum rótulo
 * de Ranking.
 */
import { describe, expect, it } from 'vitest';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import { TEXTOS_ALERTAS } from '@/services/analiseAtivos/textosAlertas';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { folhasTexto } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { textoLiteral } from '@/services/analiseAtivos/textosLiterais';
import {
  MENSAGEM_LISTAS_PESSOAIS,
  NOME_LISTA_PADRAO,
} from '@/services/analiseAtivos/salvos/contrato';

const TODAS = [
  ...folhasTexto(TEXTOS_SALVOS, 'TEXTOS_SALVOS'),
  ...folhasTexto(TEXTOS_ALERTAS, 'TEXTOS_ALERTAS'),
];

describe('textosSalvos / textosAlertas', () => {
  it('literais do Pedro no toast (sem marcação)', () => {
    const t = TEXTOS_SALVOS.toast;
    expect(
      formatarTexto(t.salvoEm, { ticker: 'WEGE3', lista: NOME_LISTA_PADRAO }) + t.comAviso,
    ).toBe('WEGE3 salvo em Salvos · você recebe aviso de resultado e data-com');
    expect(formatarTexto(t.removidoDe, { ticker: 'WEGE3', lista: 'Salvos' })).toBe(
      'WEGE3 removido de Salvos',
    );
    expect(TEXTOS_SALVOS.pagina.tabela.adicionadoEm).toBe('Adicionado em');
    expect(TEXTOS_SALVOS.servidor.listasPessoais).toBe(MENSAGEM_LISTAS_PESSOAIS);
  });

  it('nenhuma palavra proibida, mesmo com os placeholders preenchidos', () => {
    const achados = TODAS.flatMap(([c, t]) => {
      const p = encontrarProibidasV2(t.replace(/\{(\w+)\}/g, 'X'));
      return p.length ? [`${c}: ${p.join(', ')}`] : [];
    });
    expect(achados).toEqual([]);
  });

  it('nenhum rótulo de Ranking (a pílula do bloco 3 fica reservada sem rótulo)', () => {
    expect(TODAS.filter(([, t]) => /ranking/i.test(t))).toEqual([]);
  });

  it('títulos dos avisos sem R$; push só com o corpo genérico', () => {
    const titulos = Object.entries(TEXTOS_ALERTAS.aviso)
      .filter(([k]) => k.endsWith('Titulo'))
      .map(([, v]) => v as string);
    expect(titulos.length).toBeGreaterThanOrEqual(4);
    for (const t of titulos) expect(t).not.toMatch(/R\$/);
    expect(TEXTOS_ALERTAS.push.corpoGenerico).toBe(
      'Toque para ver os detalhes na Análise de Ativos.',
    );
    expect(TEXTOS_ALERTAS.push.corpoGenerico).not.toMatch(/R\$|\d/);
  });

  it('mensagens dos avisos do desenho', () => {
    const a = TEXTOS_ALERTAS.aviso;
    expect(
      formatarTexto(a.criteriosMensagem, {
        de: 4,
        para: 5,
        total: 6,
        anoInicio: 2021,
        anoFim: 2025,
      }),
    ).toBe('De 4 de 6 para 5 de 6 na janela de 5 anos (2021–2025).');
    expect(
      formatarTexto(a.proventoMensagem, {
        tipo: a.proventoTipo.rendimento,
        valor: '1,10',
        unidade: a.proventoUnidade.cota,
        dataCom: '20/10',
        pagamento: '27/10',
      }),
    ).toBe('Rendimento de R$ 1,10 por cota · data-com 20/10 · pagamento 27/10.');
    expect(formatarTexto(a.resumoTitulo, { n: 6 })).toBe('Novidades em 6 ativos dos seus Salvos');
    expect(formatarTexto(a.fiiTrimestralTitulo, { ticker: 'HGLG11' })).toBe(
      'HGLG11: informe trimestral publicado na CVM',
    );
  });

  it('horário: "por volta das 8h" (o job roda às 11:10 UTC); nada de 8h10/08:10', () => {
    const horarios = TODAS.filter(([, t]) => /\b0?8h|08:/.test(t));
    expect(horarios.length).toBeGreaterThan(0);
    for (const [c, t] of horarios) expect(t, c).toMatch(/por volta das 8h/);
  });

  it('o aviso fixo dos alertas é o literal registrado (não duplicado aqui)', () => {
    const literal = textoLiteral('aviso-salvos-alertas');
    expect(literal).toBeDefined();
    expect(TODAS.filter(([, t]) => t === literal)).toEqual([]);
  });

  it('PDF sem opções: nenhum texto oferece incluir posição, nome ou e-mail', () => {
    const pdf = folhasTexto(TEXTOS_SALVOS.pdf, 'pdf').map(([, t]) => t);
    expect(pdf.filter((t) => /incluir|minha posição/i.test(t))).toEqual([]);
    expect(TEXTOS_SALVOS.pdf.foraItens[0]).toMatch(/posição na Carteira, seu nome e seu e-mail/);
  });
});
