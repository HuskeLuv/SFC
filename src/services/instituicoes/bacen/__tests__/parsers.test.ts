import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { baixarCadastroIfData, parseCadastroIfData, trimestresCandidatos } from '../ifdataCadastro';
import { decodificarCsv, lerCsv, parseParticipantesStr } from '../participantesStr';

const FIX = path.join(__dirname, 'fixtures');
const ifdataJson = JSON.parse(readFileSync(path.join(FIX, 'ifdata-cadastro-amostra.json'), 'utf8'));
const strCsv = readFileSync(path.join(FIX, 'participantes-str-amostra.csv'), 'utf8');

describe('parseCadastroIfData (amostra real do IF.data 202606)', () => {
  const registros = parseCadastroIfData(ifdataJson);
  const porRaiz = new Map(registros.map((r) => [r.raiz, r]));

  it('mantém só Td=I, CodInst de 8 dígitos e Situacao=A', () => {
    // fora: 2 linhas Td='C' (ABC-BRASIL, C0041856), o prudencial C0082475, o Master (LE) e o
    // Agrobanco (Situacao 'I')
    expect(registros).toHaveLength(13);
    expect(registros.every((r) => /^\d{8}$/.test(r.raiz))).toBe(true);
    expect(porRaiz.has('33923798')).toBe(false); // Banco Master, em liquidação
    expect(porRaiz.has('01542356')).toBe(false); // Agrobanco, inativo
  });

  it('normaliza raiz, nome, Tcb, segmento e conglomerado', () => {
    expect(porRaiz.get('33264668')).toEqual({
      raiz: '33264668',
      nome: 'BANCO XP S.A.',
      tcb: 'B1',
      segmento: 'Banco Múltiplo',
      conglomerado: 'C0082475',
    });
    expect(porRaiz.get('02332886')?.tcb).toBe('N2');
    expect(porRaiz.get('18236120')?.tcb).toBe('N4');
    expect(porRaiz.get('30680829')?.tcb).toBe('N1');
    expect(porRaiz.get('30680829')?.conglomerado).toBe(porRaiz.get('18236120')?.conglomerado);
    expect(porRaiz.get('05463212')).toMatchObject({ tcb: 'B3C', conglomerado: null });
    expect(porRaiz.get('54647259')?.segmento).toBe('Sociedade de Crédito Direto');
    expect(registros.some((r) => r.tcb === 'B3S')).toBe(true);
  });

  it('aceita a lista crua e rejeita formato estranho', () => {
    expect(parseCadastroIfData(ifdataJson.value)).toHaveLength(13);
    expect(() => parseCadastroIfData({ foo: 1 })).toThrow(/formato inesperado/);
  });
});

describe('trimestresCandidatos', () => {
  it('parte do último fim de trimestre e volta de 3 em 3 meses', () => {
    expect(trimestresCandidatos(new Date('2026-10-30T12:00:00Z'))).toEqual([
      '202609',
      '202606',
      '202603',
      '202512',
    ]);
    expect(trimestresCandidatos(new Date('2026-01-15T12:00:00Z'), 2)).toEqual(['202512', '202509']);
  });
});

describe('baixarCadastroIfData', () => {
  it('pula trimestre vazio, pagina e filtra', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      const vazio = url.includes('@AnoMes=202609');
      return {
        ok: true,
        status: 200,
        json: async () => ({ value: vazio ? [] : ifdataJson.value }),
      };
    });
    const r = await baixarCadastroIfData(null, fetchImpl, new Date('2026-10-30T12:00:00Z'));
    expect(r.anoMes).toBe('202606');
    expect(r.registros).toHaveLength(13);
    expect(urls[1]).toContain('$top=10000&$skip=0');
  });

  it('erro HTTP vira exceção', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(baixarCadastroIfData('202606', fetchImpl)).rejects.toThrow(/HTTP 503/);
  });
});

describe('parseParticipantesStr (amostra real do STR)', () => {
  const mapa = parseParticipantesStr(strCsv);

  it('raiz → COMPE, nome reduzido e extenso', () => {
    expect(mapa.get('62144175')).toEqual({
      compe: '643',
      nomeReduzido: 'BCO PINE S.A.',
      nomeExtenso: 'Banco Pine S.A.',
    });
    expect(mapa.get('02801938')?.compe).toBe('066');
  });

  it("COMPE 'n/a' vira null e aspas com vírgula ficam inteiras", () => {
    expect(mapa.get('00038121')?.compe).toBeNull();
    expect(mapa.get('30680829')?.nomeExtenso).toBe(
      'NU FINANCEIRA S.A. - Sociedade de Crédito, Financiamento e Investimento',
    );
  });

  it('cabeçalho errado dá erro claro', () => {
    expect(() => parseParticipantesStr('a,b\n1,2')).toThrow(/cabeçalho inesperado/);
  });

  it('lerCsv trata CRLF e aspas escapadas', () => {
    expect(lerCsv('a,"b ""c"", d"\r\n1,2\r\n')).toEqual([
      ['a', 'b "c", d'],
      ['1', '2'],
    ]);
  });

  it('decodificarCsv cai para Latin-1 quando não é UTF-8', () => {
    const latin1 = Uint8Array.from([0x4e, 0xfa, 0x6d, 0x65, 0x72, 0x6f]); // 'Número'
    expect(decodificarCsv(latin1)).toBe('Número');
    expect(decodificarCsv(new TextEncoder().encode('Número'))).toBe('Número');
  });
});
