import { describe, it, expect } from 'vitest';
import {
  chaveDoGrupo,
  getStatusLabel,
  linhaViaGrupo,
  notaDoGrupo,
  pedeEmissor,
  pillsDoGrupo,
  textoExcedente,
} from '../CoberturaFgc';

describe('getStatusLabel', () => {
  it('"Dentro do limite" quando há cobertura abaixo de 80%', () => {
    const s = getStatusLabel(50, 100_000, 0);
    expect(s.text).toBe('Dentro do limite');
    expect(s.tooltip).toBeUndefined();
  });

  it('"Atenção" entre 80% e 100%', () => {
    const s = getStatusLabel(85, 200_000, 0);
    expect(s.text).toBe('Atenção');
  });

  it('"Limite excedido" >= 100%', () => {
    const s = getStatusLabel(120, 300_000, 0);
    expect(s.text).toBe('Limite excedido');
  });

  // Bug #12
  describe('Bug #12 — sem cobertura FGC', () => {
    it('"Sem cobertura FGC" quando totalCoberto=0 e totalNaoCoberto>0', () => {
      const s = getStatusLabel(0, 0, 35_000);
      expect(s.text).toBe('Sem cobertura FGC');
      expect(s.className).toContain('red');
      expect(s.tooltip).toContain('FGC');
      expect(s.tooltip).toMatch(/CRI|CRA|debêntures/);
    });

    it('Se há QUALQUER cobertura positiva, regras de percentual valem (não sinaliza "sem cobertura")', () => {
      // Mesmo um centavo de produto coberto significa que a categoria existe;
      // o badge segue lógica de percentual normal.
      const s = getStatusLabel(0, 0.01, 100);
      expect(s.text).toBe('Dentro do limite');
    });

    it('"Dentro do limite" prevalece se há cobertura mesmo com produtos não-cobertos coexistindo', () => {
      // Ex.: CDB + CRI no mesmo banco → coberto > 0 → segue regra de percentual
      const s = getStatusLabel(30, 75_000, 50_000);
      expect(s.text).toBe('Dentro do limite');
      expect(s.tooltip).toBeUndefined();
    });

    it('totalCoberto=0 e totalNaoCoberto=0 cai no fallback "Dentro do limite"', () => {
      const s = getStatusLabel(0, 0, 0);
      expect(s.text).toBe('Dentro do limite');
    });
  });
});

// ── Emissor (ClickUp 86e2xqh69): via, pills e link "Informar emissor" ─────────────────────

type Grupo = Parameters<typeof linhaViaGrupo>[0];
type Ativo = Grupo['ativos'][number];

const ativo = (over: Partial<Ativo> = {}): Ativo => ({
  id: 'p1',
  nome: 'CDB 2028',
  produto: 'CDB',
  valorAtual: 100,
  valorInvestido: 100,
  vencimento: null,
  coberto: true,
  isentoIR: false,
  corretoraNome: 'BTG Pactual',
  fonteInstituicao: 'emissor',
  aceitaEmissor: true,
  origem: 'manual',
  emissorInformadoTexto: null,
  editarEmissorHref: '/ativos/p1/editar?editar=emissor',
  ...over,
});

const grupo = (over: Partial<Grupo> = {}): Grupo => ({
  instituicaoId: 'bxp',
  instituicaoNome: 'Banco XP S.A.',
  cnpj: '33264668000103',
  ativos: [ativo()],
  totalCoberto: 100,
  totalNaoCoberto: 0,
  totalValor: 100,
  limiteFgc: 250_000,
  percentualUtilizado: 0,
  excedente: 0,
  chave: '33264668',
  corretoras: [{ id: 'btg', nome: 'BTG Pactual' }],
  ativosSemEmissor: 0,
  usaCorretoraComoEmissor: false,
  titularNaoEmissor: false,
  conglomerado: null,
  temOpenFinance: false,
  cnpjCalculado: true,
  ...over,
});

function brl(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(v);
}

describe('linha "via" e excedente', () => {
  it('CNPJ calculado mostra só a raiz e lista as corretoras', () => {
    const g = grupo({
      corretoras: [
        { id: 'btg', nome: 'BTG Pactual' },
        { id: 'xp', nome: 'XP Investimentos' },
      ],
    });
    expect(linhaViaGrupo(g)).toBe('CNPJ 33.264.668 · via BTG Pactual e XP Investimentos');
  });

  it('fallback ganha o prefixo "Corretora"; desconhecido diz "Sem CNPJ do emissor"', () => {
    const fb = grupo({
      usaCorretoraComoEmissor: true,
      ativosSemEmissor: 1,
      cnpj: '30306294000145',
      cnpjCalculado: false,
    });
    expect(linhaViaGrupo(fb)).toBe('Corretora · CNPJ 30.306.294/0001-45 · via BTG Pactual');
    const unk = grupo({
      chave: 'desconhecida',
      instituicaoId: 'desconhecida',
      cnpj: null,
      corretoras: [],
    });
    expect(linhaViaGrupo(unk)).toBe('Sem CNPJ do emissor');
  });

  it('excedente soma "N títulos de M corretoras" só com mais de uma corretora', () => {
    expect(textoExcedente(grupo({ excedente: 60_730 }))).toBe(`${brl(60_730)} acima do limite FGC`);
    const duas = grupo({
      excedente: 60_730,
      ativos: [ativo({ id: 'a' }), ativo({ id: 'b' })],
      corretoras: [
        { id: 'btg', nome: 'BTG Pactual' },
        { id: 'xp', nome: 'XP Investimentos' },
      ],
    });
    expect(textoExcedente(duas)).toBe(
      `${brl(60_730)} acima do limite FGC, somando 2 títulos de 2 corretoras`,
    );
  });
});

describe('pills e "Informar emissor"', () => {
  it('grupo normal: sem pill e sem nota', () => {
    expect(pillsDoGrupo(grupo())).toEqual([]);
    expect(notaDoGrupo(grupo())).toBeNull();
  });

  it('fallback da corretora: "Usando a corretora" + nota com a contagem', () => {
    const g = grupo({
      usaCorretoraComoEmissor: true,
      ativosSemEmissor: 2,
      ativos: [
        ativo({ id: 'a', fonteInstituicao: 'corretora' }),
        ativo({ id: 'b', fonteInstituicao: 'corretora' }),
      ],
    });
    expect(pillsDoGrupo(g)).toEqual(['usando-corretora']);
    expect(notaDoGrupo(g)).toBe('Emissor não informado em 2 investimentos.');
  });

  it('corretora gravada como emissor: "Confira o banco emissor"', () => {
    const g = grupo({
      titularNaoEmissor: true,
      ativos: [ativo({ fonteInstituicao: 'emissor-nao-emissor' })],
    });
    expect(pillsDoGrupo(g)).toEqual(['confira-emissor']);
    expect(notaDoGrupo(g)).toContain('não emite títulos');
  });

  it('Open Finance sem casamento: "Emissor a confirmar" + "Open Finance"', () => {
    const g = grupo({
      chave: 'desconhecida',
      instituicaoId: 'desconhecida',
      temOpenFinance: true,
      ativosSemEmissor: 1,
      ativos: [
        ativo({
          fonteInstituicao: 'desconhecida',
          origem: 'openFinance',
          emissorInformadoTexto: 'ARBI',
        }),
      ],
    });
    expect(pillsDoGrupo(g)).toEqual(['emissor-a-confirmar', 'open-finance']);
    expect(notaDoGrupo(g)).toBe('Não reconhecemos o banco que veio do Open Finance.');
  });

  it('conglomerado: pill só nos grupos do aviso', () => {
    const aviso = { conglomerado: 'C1', chaves: ['33264668', '11111111'], nomes: ['A', 'B'] };
    expect(pillsDoGrupo(grupo(), [aviso])).toEqual(['conglomerado']);
    expect(pillsDoGrupo(grupo({ chave: '22222222' }), [aviso])).toEqual([]);
  });

  it('debênture/fundo como CDB (sem href) nunca pedem emissor', () => {
    const semHref = { editarEmissorHref: null };
    expect(pedeEmissor(ativo({ fonteInstituicao: 'nao-se-aplica', ...semHref }))).toBe(false);
    expect(pedeEmissor(ativo({ fonteInstituicao: 'corretora', ...semHref }))).toBe(false);
    expect(pedeEmissor(ativo({ fonteInstituicao: 'emissor' }))).toBe(false);
    expect(pedeEmissor(ativo({ fonteInstituicao: 'corretora' }))).toBe(true);
    expect(pedeEmissor(ativo({ fonteInstituicao: 'desconhecida' }))).toBe(true);
    expect(pedeEmissor(ativo({ fonteInstituicao: 'emissor-nao-emissor' }))).toBe(true);
  });

  it('grupo com debênture sem href não ganha nota nem pill de emissor', () => {
    const g = grupo({
      ativos: [ativo({ fonteInstituicao: 'nao-se-aplica', editarEmissorHref: null })],
    });
    expect(pillsDoGrupo(g)).toEqual([]);
    expect(notaDoGrupo(g)).toBeNull();
  });

  it('respostas antigas (sem chave) caem no CNPJ/id como antes', () => {
    expect(chaveDoGrupo({ chave: '', cnpj: '123', instituicaoId: 'x' })).toBe('123');
    expect(chaveDoGrupo({ chave: '', cnpj: null, instituicaoId: 'x' })).toBe('x');
  });
});
