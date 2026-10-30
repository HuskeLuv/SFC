import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseCadastroIfData } from '../ifdataCadastro';
import { parseParticipantesStr } from '../participantesStr';
import {
  planejarImportacao,
  tokensFortes,
  type InstituicaoCatalogo,
  type MapaManual,
  type PlanoImportacao,
} from '../planejarImportacao';
import { cnpjMatriz } from '@/lib/instituicoes/cnpj';

const FIX = path.join(__dirname, 'fixtures');
const registros = parseCadastroIfData(
  JSON.parse(readFileSync(path.join(FIX, 'ifdata-cadastro-amostra.json'), 'utf8')),
);
const participantes = parseParticipantesStr(
  readFileSync(path.join(FIX, 'participantes-str-amostra.csv'), 'utf8'),
);

function inst(
  codigo: string,
  nome: string,
  cnpj: string | null = null,
  extra: Partial<InstituicaoCatalogo> = {},
): InstituicaoCatalogo {
  return {
    id: `id-${codigo}`,
    codigo,
    nome,
    cnpj,
    tipoBacen: null,
    conglomeradoBacen: null,
    apelidos: null,
    cnpjCalculado: false,
    ...extra,
  };
}

/** Recorte do catálogo de prod (prisma/referenceData.ts + scripts/seed-additional-institutions.ts). */
function catalogo(): InstituicaoCatalogo[] {
  return [
    inst('001', 'Banco do Brasil S.A.', '00000000000191'),
    inst('102', 'XP Investimentos CCTVM', '02332886000104'),
    inst('380', 'Rico Investimentos', '02332886000104'),
    inst('655', 'Banco Votorantim S.A.', '59588111000103'),
    inst('655-IC', 'BV Investimentos (Banco Votorantim)'),
    inst('066', 'Morgan Stanley CTVM'),
    inst('643', 'Banco Pine'),
    inst('085', 'Cooperativa Central Ailos'),
    inst('FIN-NUBANK', 'Nubank S.A.', '18236120000158'),
    inst('FIN-WILL', 'Will Bank'),
    inst('COR-AGORA', 'Ágora Investimentos (Bradesco BBI)'),
    inst('PREV-ICATU', 'Icatu Seguros / Previdência'),
    inst('RESERVA-1730000000000', 'Reserva'),
    inst('243', 'Banco Master'),
  ];
}

const planejar = (existentes: InstituicaoCatalogo[], mapaManual?: MapaManual) =>
  planejarImportacao({ existentes, registros, participantes, mapaManual });

/** Aplica o plano num catálogo em memória, como o --apply faz (guarda no próprio campo). */
function aplicar(existentes: InstituicaoCatalogo[], plano: PlanoImportacao): InstituicaoCatalogo[] {
  const porId = new Map(existentes.map((e) => [e.id, { ...e }]));
  for (const p of plano.preencherCnpj) {
    const e = porId.get(p.id)!;
    if (e.cnpj === null) Object.assign(e, { cnpj: p.valor, cnpjCalculado: true });
  }
  for (const p of plano.preencherTipo) {
    const e = porId.get(p.id)!;
    if (e.tipoBacen === null) e.tipoBacen = p.valor;
  }
  for (const p of plano.preencherConglomerado) {
    const e = porId.get(p.id)!;
    if (e.conglomeradoBacen === null) e.conglomeradoBacen = p.valor;
  }
  for (const p of plano.preencherApelidos) porId.get(p.id)!.apelidos = p.depois;
  for (const p of plano.marcarNaoEmissor) {
    const e = porId.get(p.id)!;
    if (e.tipoBacen === null) e.tipoBacen = 'NAO_EMISSOR';
  }
  const novas = plano.criar.map((c) => ({
    id: `id-${c.codigo}`,
    codigo: c.codigo,
    nome: c.nome,
    cnpj: c.cnpj,
    tipoBacen: c.tipoBacen,
    conglomeradoBacen: c.conglomeradoBacen,
    apelidos: c.apelidos,
    cnpjCalculado: c.cnpjCalculado,
  }));
  return [...porId.values(), ...novas];
}

const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe('planejarImportacao', () => {
  const plano = planejar(catalogo());
  const criados = new Map(plano.criar.map((c) => [c.codigo, c]));

  it('cria as raízes ativas que nenhuma linha casou (Banco XP, Daycoval, BMG, Nu Financeira...)', () => {
    expect([...criados.keys()].sort()).toEqual([
      'BCB-02801938', // Banco Morgan Stanley (o 066 do catálogo é a CTVM: ambíguo)
      'BCB-30680829', // Nu Financeira
      'BCB-33264668', // Banco XP
      'BCB-48172860', // cooperativa B3S
      'BCB-54647259', // SCD
      'BCB-61186680', // BMG
      'BCB-62232889', // Daycoval
    ]);
    expect(criados.get('BCB-33264668')).toEqual({
      codigo: 'BCB-33264668',
      nome: 'Banco XP S.A.', // nome extenso do STR
      cnpj: '33264668000103',
      cnpjCalculado: true,
      tipoBacen: 'B1',
      conglomeradoBacen: 'C0082475',
      apelidos: 'xp banco xp',
      status: 'ATIVA',
    });
    // Sem STR, o nome é o do IF.data.
    expect(criados.get('BCB-48172860')?.nome).toMatch(/^A COOPERATIVA DE ECONOMIA/);
    expect(criados.get('BCB-48172860')?.tipoBacen).toBe('B3S');
  });

  it('linha com cnpj recebe só tipo, conglomerado e apelidos (nunca entra em preencherCnpj)', () => {
    expect(ids(plano.preencherCnpj)).not.toContain('id-102');
    expect(plano.preencherTipo).toContainEqual(
      expect.objectContaining({ id: 'id-102', valor: 'N2' }),
    );
    expect(plano.preencherTipo).toContainEqual(
      expect.objectContaining({ id: 'id-380', valor: 'N2' }),
    );
    expect(plano.preencherConglomerado).toContainEqual(
      expect.objectContaining({ id: 'id-001', valor: 'C0080329' }),
    );
    expect(plano.casamentos.find((c) => c.id === 'id-001')?.regra).toBe('cnpj');
  });

  it('cnpj de corretora que aponta para um banco sem nome em comum vai para ambíguos', () => {
    // Caso real do seed: 'Avenue Securities DTVM' com a raiz do BB-Banco de Investimento (B2).
    const p = planejar([inst('508', 'Fulano Securities DTVM', '62232889000190')]);
    expect(p.ambiguos).toEqual([expect.objectContaining({ id: 'id-508', raizes: ['62232889'] })]);
    expect(p.preencherTipo).toEqual([]);
    expect(p.marcarNaoEmissor).toEqual([
      expect.objectContaining({ id: 'id-508', motivo: 'nome-corretora' }),
    ]);
    // A raiz não foi casada: o Daycoval nasce como linha nova.
    expect(p.criar.map((c) => c.codigo)).toContain('BCB-62232889');
  });

  it('cnpj sem nome em comum fora desse caso casa, marcado para conferir', () => {
    expect(plano.casamentos.find((c) => c.id === 'id-FIN-NUBANK')).toMatchObject({
      regra: 'cnpj',
      tcb: 'N4',
      nomeEmComum: false,
    });
    expect(plano.casamentos.find((c) => c.id === 'id-380')?.nomeEmComum).toBe(false); // Rico
    expect(plano.casamentos.find((c) => c.id === 'id-102')?.nomeEmComum).toBe(true);
  });

  it('casa pelo COMPE com nome em comum e preenche o cnpj calculado (Pine 643, Ailos 085)', () => {
    expect(plano.preencherCnpj).toContainEqual(
      expect.objectContaining({ id: 'id-643', valor: cnpjMatriz('62144175') }),
    );
    expect(plano.preencherCnpj).toContainEqual(
      expect.objectContaining({ id: 'id-085', valor: cnpjMatriz('05463212') }),
    );
    expect(plano.casamentos.find((c) => c.id === 'id-643')?.regra).toBe('compe');
    expect(criados.has('BCB-62144175')).toBe(false); // raiz casada não gera linha nova
    // Ailos: nome reduzido do STR vira apelido (o nome da linha não o contém)
    expect(plano.preencherApelidos).toContainEqual(
      expect.objectContaining({ id: 'id-085', antes: null, depois: 'coopcentral ailos' }),
    );
  });

  it("'066 Morgan Stanley CTVM' vai para ambíguos, não é preenchido e é marcado NAO_EMISSOR", () => {
    expect(plano.ambiguos).toContainEqual(
      expect.objectContaining({ id: 'id-066', raizes: ['02801938'] }),
    );
    expect(ids(plano.preencherCnpj)).not.toContain('id-066');
    expect(ids(plano.preencherTipo)).not.toContain('id-066');
    expect(plano.marcarNaoEmissor).toContainEqual(
      expect.objectContaining({ id: 'id-066', motivo: 'nome-corretora' }),
    );
  });

  it("marca NAO_EMISSOR por prefixo e a linha 'Reserva'; banco digital sem casamento fica nulo", () => {
    const motivos = new Map(plano.marcarNaoEmissor.map((m) => [m.codigo, m.motivo]));
    expect(motivos.get('COR-AGORA')).toBe('prefixo');
    expect(motivos.get('PREV-ICATU')).toBe('prefixo');
    expect(motivos.get('RESERVA-1730000000000')).toBe('prefixo');
    expect(motivos.get('655-IC')).toBe('nome-corretora'); // 'BV Investimentos'
    expect(motivos.has('FIN-WILL')).toBe(false);
    expect(motivos.has('243')).toBe(false); // Banco Master: COMPE de raiz em liquidação
    expect(planejar([inst('X-1', 'Reserva')]).marcarNaoEmissor.map((m) => m.motivo)).toEqual([
      'reserva',
    ]);
  });

  it("'655-IC' aparece em possiveisDuplicatas contra o 655 existente", () => {
    const dup = plano.possiveisDuplicatas.find((d) => d.codigo === '655-IC');
    expect(dup?.candidatos[0]).toMatchObject({ codigo: '655', motivo: 'nome-contido' });
  });

  it("Nu Financeira ganha o apelido 'nubank' e a Nu Pagamentos (N4) não", () => {
    expect(criados.get('BCB-30680829')?.apelidos?.split(' ')).toContain('nubank');
    expect(criados.get('BCB-30680829')?.tipoBacen).toBe('N1');
    expect(plano.preencherTipo).toContainEqual(
      expect.objectContaining({ id: 'id-FIN-NUBANK', valor: 'N4' }),
    );
    const nuPag = plano.preencherApelidos.find((a) => a.id === 'id-FIN-NUBANK');
    expect(nuPag?.depois).toBe('nu pagamentos ip');
    expect(nuPag?.depois).not.toContain('nubank');
  });

  it('rodar de novo sobre o resultado não muda nada', () => {
    const depois = aplicar(catalogo(), plano);
    const segundo = planejar(depois);
    expect(segundo.resumo.totalMudancas).toBe(0);
    expect(segundo.criar).toEqual([]);
    expect(segundo.conflitos).toEqual([]);
  });

  it('conflito de cnpj nunca sobrescreve (mapa manual aponta outra raiz)', () => {
    const p = planejar([inst('707', 'Banco Daycoval S.A.', '62232889000190')], {
      '707': '61186680',
    });
    expect(p.conflitos).toEqual([
      expect.objectContaining({ id: 'id-707', campo: 'cnpj', atual: '62232889000190' }),
    ]);
    expect(p.preencherCnpj).toEqual([]);
    expect(p.preencherTipo).toEqual([]);
    expect(p.preencherApelidos).toEqual([]);
  });

  it('tipo já preenchido e diferente vai para conflitos e não é trocado', () => {
    const p = planejar([inst('318', 'Banco BMG S.A.', '61186680000174', { tipoBacen: 'B2' })]);
    expect(p.conflitos).toEqual([
      expect.objectContaining({ campo: 'tipoBacen', atual: 'B2', bacen: 'B1' }),
    ]);
    expect(ids(p.preencherTipo)).not.toContain('id-318');
    expect(p.preencherConglomerado).toContainEqual(
      expect.objectContaining({ id: 'id-318', valor: 'C0080178' }),
    );
  });

  it('mapa manual vence: raiz para uma linha sem cnpj e NAO_EMISSOR para outra', () => {
    const p = planejar(catalogo(), { 'FIN-WILL': 'NAO_EMISSOR', '066': '02801938' });
    expect(p.marcarNaoEmissor).toContainEqual(
      expect.objectContaining({ id: 'id-FIN-WILL', motivo: 'mapa' }),
    );
    expect(p.casamentos.find((c) => c.id === 'id-066')).toMatchObject({
      regra: 'mapa',
      raiz: '02801938',
    });
    expect(p.preencherTipo).toContainEqual(expect.objectContaining({ id: 'id-066', valor: 'B1' }));
    expect(ids(p.ambiguos)).not.toContain('id-066');
    expect(p.criar.map((c) => c.codigo)).not.toContain('BCB-02801938');
  });

  it('mapa manual inválido vai para ambíguos', () => {
    const p = planejar([inst('FIN-WILL', 'Will Bank')], { 'FIN-WILL': '123' });
    expect(p.ambiguos[0].motivo).toMatch(/mapa manual inválido/);
  });

  it('linha BCB- sem cnpj (reversão parcial) volta a casar pela raiz do código', () => {
    const p = planejar([inst('BCB-33264668', 'Banco XP S.A.')]);
    expect(p.casamentos[0]).toMatchObject({ regra: 'codigo-bcb', raiz: '33264668' });
    expect(p.criar.map((c) => c.codigo)).not.toContain('BCB-33264668');
  });

  it('nome normalizado idêntico casa (regra c)', () => {
    const p = planejar([inst('FIN-DAY', 'Banco Daycoval SA')]);
    expect(p.casamentos[0]).toMatchObject({ regra: 'nome', raiz: '62232889' });
  });

  it('resumo bate com as listas e aponta apelidos sem registro ativo', () => {
    expect(plano.resumo.criar).toBe(plano.criar.length);
    expect(plano.resumo.casadosPorRegra.compe).toBe(2);
    expect(plano.apelidosSemRegistro).toContain('33923798'); // Banco Master
  });
});

describe('tokensFortes', () => {
  it('descarta palavras genéricas', () => {
    expect(tokensFortes('Banco Morgan Stanley S.A.')).toEqual(['morgan', 'stanley']);
    expect(tokensFortes('Cooperativa Central de Crédito')).toEqual([]);
  });
});
