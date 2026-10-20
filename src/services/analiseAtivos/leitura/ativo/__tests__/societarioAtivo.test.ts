import { describe, expect, it } from 'vitest';
import {
  dtRecebExibivel,
  montarSocietario,
} from '@/services/analiseAtivos/leitura/ativo/societarioAtivo';
import { linkFreSeguro } from '@/services/analiseAtivos/acoes/freArquivos';
import type { DadosSocietarioDb } from '@/services/analiseAtivos/repositorio/societario';
import { TEXTOS_SOCIETARIO } from '@/services/analiseAtivos/textosSocietario';

const HOJE = '2026-10-19';

const ITUB: DadosSocietarioDb = {
  societario: {
    anoFre: 2026,
    versao: 4,
    dtReceb: '2026-09-15',
    pctCirculacaoOn: 8.119,
    pctCirculacaoPn: 98.683,
    pctCirculacaoTotal: 52.545,
    nAcionistasPf: 653637,
    nAcionistasPj: 12764,
    nAcionistasInst: 1397,
    linkDocFre: 'http://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?x=161558',
  },
  posicao: [
    {
      idAcionista: '8236732',
      nome: 'IUPAR - Itaú Unibanco Participações S.A.',
      pctOn: 51.713,
      pctPn: 0,
      pctTotal: 26.346,
      controlador: true,
      acordoAcionistas: true,
      sintetica: false,
    },
    {
      idAcionista: 'OUTROS',
      nome: 'Outros',
      pctOn: 9.082,
      pctPn: 92.573,
      pctTotal: 50.038,
      controlador: false,
      acordoAcionistas: false,
      sintetica: true,
    },
  ],
  direitos: [
    {
      especie: 'ON',
      classePn: '',
      pctTagAlong: 80,
      direitoDividendoTexto: 'importância não inferior a 25% do lucro líquido apurado',
      pctDividendoMinimo: 25,
    },
    {
      especie: 'PN',
      classePn: '',
      pctTagAlong: 80,
      direitoDividendoTexto: 'importância não inferior a 25% do lucro líquido apurado',
      pctDividendoMinimo: 25,
    },
  ],
  classesTickers: ['PN'],
};

describe('montarSocietario', () => {
  it('ITUB (Nível 1): acionistas, circulação, tag along com as duas bases e dividendo do FRE 2022', () => {
    const r = montarSocietario('ITUB4', ITUB, 'N1', HOJE);
    expect(r.acionistas).toMatchObject({
      estado: 'ok',
      valor: { anoFre: 2026, dtReceb: '2026-09-15' },
    });
    expect(r.circulacao).toMatchObject({
      estado: 'ok',
      valor: { pctPn: { estado: 'ok', valor: 98.683 }, nAcionistasPf: 653637 },
    });
    expect(r.tagAlong).toEqual({
      estado: 'ok',
      valor: [
        { especie: 'ON', classePn: '', pct: 80, base: 'lei_254a' },
        { especie: 'PN', classePn: '', pct: 80, base: 'fre_2022' },
        { especie: 'UNIT', classePn: '', pct: null, base: 'nao_emite' },
      ],
    });
    expect(r.dividendoMinimo).toEqual({
      estado: 'ok',
      valor: {
        anoFre: 2022,
        pctLucroAjustado: { estado: 'ok', valor: 25 },
        trecho: 'importância não inferior a 25% do lucro líquido apurado',
        linkFreVigente:
          'https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?x=161558',
      },
    });
    expect(r.segmentoListagem).toBe('Nível 1');
  });

  it('a data exibida é o DT_RECEB, nunca uma data futura', () => {
    expect(dtRecebExibivel('2026-12-31', HOJE)).toBeNull();
    expect(dtRecebExibivel('2026-10-19', HOJE)).toBe('2026-10-19');
    const futuro = { ...ITUB, societario: { ...ITUB.societario!, dtReceb: '2026-12-31' } };
    const r = montarSocietario('ITUB4', futuro, 'N1', HOJE);
    expect(r.acionistas.estado === 'ok' && r.acionistas.valor.dtReceb).toBeNull();
    expect(JSON.stringify(r)).not.toContain('2026-12-31');
  });

  it('WEGE (Novo Mercado, só ON): PN "não emite" na circulação e coluna PN vazia', () => {
    const wege: DadosSocietarioDb = {
      ...ITUB,
      societario: { ...ITUB.societario!, pctCirculacaoPn: 0 },
      posicao: ITUB.posicao.map((p) => ({ ...p, pctPn: 0 })),
      direitos: [],
      classesTickers: ['ON'],
    };
    const r = montarSocietario('WEGE3', wege, 'NM', HOJE);
    expect(r.circulacao.estado === 'ok' && r.circulacao.valor.pctPn).toEqual({
      estado: 'nao_se_aplica',
      motivo: 'nao_emite',
      texto: TEXTOS_SOCIETARIO.circulacao.naoEmite,
    });
    expect(
      r.acionistas.estado === 'ok' && r.acionistas.valor.acionistas.map((a) => a.pctPn),
    ).toEqual([null, null]);
    expect(r.tagAlong.estado === 'ok' && r.tagAlong.valor[0]).toEqual({
      especie: 'ON',
      classePn: '',
      pct: 100,
      base: 'segmento_b3',
    });
    // sem FRE 2022, mas com o link do FRE vigente
    expect(r.dividendoMinimo).toMatchObject({
      estado: 'ok',
      valor: { pctLucroAjustado: { estado: 'ausente', motivo: 'sem_fre' }, trecho: null },
    });
  });

  it('BBSE: o FRE remete à seção 18.12 ⇒ "sem dado · o FRE remete a outro item" com o trecho', () => {
    const bbse: DadosSocietarioDb = {
      ...ITUB,
      direitos: [
        {
          especie: 'ON',
          classePn: '',
          pctTagAlong: 100,
          direitoDividendoTexto: 'Informações prestadas na seção 18.12.',
          pctDividendoMinimo: null,
        },
      ],
      classesTickers: ['ON'],
    };
    const r = montarSocietario('BBSE3', bbse, 'NM', HOJE);
    expect(r.dividendoMinimo).toMatchObject({
      estado: 'ok',
      valor: {
        pctLucroAjustado: {
          estado: 'ausente',
          motivo: 'remete_outro_item',
          texto: 'sem dado · o FRE remete a outro item',
        },
        trecho: 'Informações prestadas na seção 18.12.',
      },
    });
  });

  it('sem FRE nenhum: acionistas e circulação ausentes com o motivo; tag along pela regra', () => {
    const r = montarSocietario(
      'XPTO3',
      { societario: null, posicao: [], direitos: [], classesTickers: ['ON'] },
      null,
      HOJE,
    );
    expect(r.acionistas).toEqual({
      estado: 'ausente',
      motivo: 'sem_fre',
      texto: TEXTOS_SOCIETARIO.motivos.sem_fre,
    });
    expect(r.circulacao.estado).toBe('ausente');
    expect(r.dividendoMinimo.estado).toBe('ausente');
    expect(r.tagAlong.estado === 'ok' && r.tagAlong.valor[0].base).toBe('lei_254a');
    expect(r.segmentoListagem).toBe('Tradicional');
  });

  it('nenhuma chave de resposta com documento, índice ou nota', () => {
    const chaves: string[] = [];
    const andar = (o: unknown) => {
      if (Array.isArray(o)) o.forEach(andar);
      else if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          chaves.push(k);
          andar(v);
        }
      }
    };
    andar(montarSocietario('ITUB4', ITUB, 'N1', HOJE));
    expect(
      chaves.filter((k) => /cpf|cnpj|documento|indice|nota|score|semaforo|destaque/i.test(k)),
    ).toEqual([]);
  });
});

describe('linkFreSeguro', () => {
  it('só rad.cvm.gov.br, sempre https; o resto vira null', () => {
    expect(linkFreSeguro('http://www.rad.cvm.gov.br/ENETCONSULTA/x.aspx?a=1')).toBe(
      'https://www.rad.cvm.gov.br/ENETCONSULTA/x.aspx?a=1',
    );
    expect(linkFreSeguro('javascript:alert(1)')).toBeNull();
    expect(linkFreSeguro('https://exemplo.com/fre')).toBeNull();
    expect(linkFreSeguro('https://user:x@www.rad.cvm.gov.br/')).toBeNull();
    expect(linkFreSeguro('')).toBeNull();
  });
});
