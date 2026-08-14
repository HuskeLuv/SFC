import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildFlcWorkbook, modeloSpec, type FixtureLinha } from '@/test/fixtures/flcWorkbook';
import { FlcParseError, normalizeLabel, parseFlcXlsx, repararMojibake } from '../parseFlcXlsx';

const parseModelo = () => parseFlcXlsx(buildFlcWorkbook());

const secao = (result: ReturnType<typeof parseFlcXlsx>, chave: string) => {
  const s = result.secoes.find((s) => s.chave === chave);
  if (!s) throw new Error(`seção ${chave} não encontrada`);
  return s;
};

describe('normalizeLabel', () => {
  it('remove acentos, caixa e pontuação', () => {
    expect(normalizeLabel('Despesas Temporárias / Variáveis')).toBe(
      'despesas temporarias variaveis',
    );
    expect(normalizeLabel('índice Paz Financeira')).toBe('indice paz financeira');
    expect(normalizeLabel('Aporte/ Resgate Investimentos')).toBe('aporte resgate investimentos');
    expect(normalizeLabel('Fii´s  ')).toBe('fii s');
  });
});

describe('parseFlcXlsx — estrutura modelo', () => {
  it('encontra as 17 seções importáveis na ordem da planilha', () => {
    const result = parseModelo();
    expect(result.secoes.map((s) => s.chave)).toEqual([
      'entradas-fixas',
      'sem-tributacao',
      'receita-investimentos',
      'com-tributacao',
      'habitacao',
      'transporte',
      'saude',
      'despesas-pessoais',
      'lazer',
      'educacao',
      'animais-estimacao',
      'despesas-financeiras',
      'impostos',
      'despesas-dependentes',
      'despesas-empresa',
      'despesas-temporarias',
      'conta-corrente',
    ]);
  });

  it('extrai valores literais nos meses certos; zero e vazio viram null', () => {
    const result = parseModelo();
    const salario = secao(result, 'entradas-fixas').itens[0];
    expect(salario.label).toBe('Salário / Pró-labore Parte 1');
    expect(salario.valores).toEqual(Array(12).fill(5000));

    const alugueis = secao(result, 'entradas-fixas').itens.find(
      (i) => i.label === 'Receita Alugúeis',
    );
    expect(alugueis?.valores).toEqual([1000, ...Array(11).fill(null)]);

    const zerado = secao(result, 'entradas-fixas').itens.find(
      (i) => i.label === 'Salário / Pró-labore Parte 2',
    );
    expect(zerado?.valores).toEqual(Array(12).fill(null));
  });

  it('mantém decimais e negativos', () => {
    const result = parseModelo();
    const banco = secao(result, 'conta-corrente').itens[0];
    expect(banco.valores[0]).toBe(639.9);
    const outrosImpostos = secao(result, 'impostos').itens.find((i) => i.label === 'Outros');
    expect(outrosImpostos?.valores[10]).toBe(-75);
  });

  it('linha sem célula alguma nos meses ainda vira item (valores vazios)', () => {
    const result = parseModelo();
    const auxilio = secao(result, 'entradas-fixas').itens.find(
      (i) => i.label === 'Auxilio home office',
    );
    expect(auxilio).toBeDefined();
    expect(auxilio?.valores).toEqual(Array(12).fill(null));
  });

  it('captura significado (col. C) e rank (col. D)', () => {
    const result = parseModelo();
    const aluguel = secao(result, 'habitacao').itens[0];
    expect(aluguel.significado).toBe('Moradia');
    expect(aluguel.rank).toBe(1);
    expect(secao(result, 'habitacao').itens[1].significado).toBeNull();
  });

  it('"Despesas Financeiras" é seção E item de Despesas Empresa (desempate por fórmula)', () => {
    const result = parseModelo();
    expect(secao(result, 'despesas-financeiras').itens.map((i) => i.label)).toContain(
      'Taxas Bancárias',
    );
    const homonimo = secao(result, 'despesas-empresa').itens.find(
      (i) => i.label === 'Despesas Financeiras',
    );
    expect(homonimo?.valores[3]).toBe(89.9);
  });

  it('Conta Corrente aceita itens de rótulo repetido ("Banco")', () => {
    const result = parseModelo();
    expect(secao(result, 'conta-corrente').itens.map((i) => i.label)).toEqual([
      'Banco',
      'Banco',
      'Banco',
    ]);
  });
});

describe('parseFlcXlsx — seções e linhas ignoradas', () => {
  it('Aporte/Resgate inteiro vai para ignorados com motivo, inclusive linha com fórmula', () => {
    const result = parseModelo();
    const aporte = result.ignorados.filter((i) => i.motivo.includes('Aporte/Resgate'));
    expect(aporte.map((i) => i.label)).toEqual([
      'Reserva Emergência',
      'Reserva Oportunidade',
      'Ações',
    ]);
    const oportunidade = aporte.find((i) => i.label === 'Reserva Oportunidade');
    expect(oportunidade?.valores?.[0]).toBe(2000);
  });

  it('Planejamento Financeiro (objetivos) vai para ignorados', () => {
    const result = parseModelo();
    const objetivos = result.ignorados.filter((i) => i.label.startsWith('Objetivo'));
    expect(objetivos).toHaveLength(2);
    expect(objetivos[0].motivo).toContain('sonhos');
  });

  it('linhas avulsas conhecidas são ignoradas com valores capturados para o relatório', () => {
    const result = parseModelo();
    const porLabel = (l: string) => result.ignorados.find((i) => i.label === l);
    expect(porLabel('Saldo conta corrente mês anterior')?.valores?.[0]).toBe(123);
    expect(porLabel('Inflação Pessoal')?.valores?.[0]).toBe(0.5);
    expect(porLabel('Rendimentos Recebidos')?.valores?.[0]).toBe(300);
    expect(porLabel('Evolução do  Patrimônio')?.motivo).toContain('automaticamente');
    // e não viram itens de seção nenhuma
    const todosItens = result.secoes.flatMap((s) => s.itens.map((i) => i.label));
    expect(todosItens).not.toContain('Saldo conta corrente mês anterior');
    expect(todosItens).not.toContain('Rendimentos Recebidos');
  });

  it('modelo intacto gera SÓ os avisos de seção ignorada com valores', () => {
    // Report 10/08 (bug #3): aporte digitado na planilha era descartado em
    // silêncio — a lista de ignorados saiu do preview (PR #59) e o usuário
    // não tinha como saber que a linha não entra na Evolução do Patrimônio.
    const avisos = parseModelo().avisos;
    expect(avisos).toHaveLength(2);
    expect(
      avisos.some(
        (a) =>
          a.includes('Aporte/ Resgate Investimentos') &&
          a.includes('NÃO importada') &&
          a.includes('vem da carteira'),
      ),
    ).toBe(true);
    expect(avisos.some((a) => a.includes('Planejamento Financeiro'))).toBe(true);
  });

  it('seção ignorada SEM valores não gera aviso', () => {
    const spec = modeloSpec().map((l): FixtureLinha => {
      if (l.tipo === 'item' && l.label === 'Reserva Oportunidade') return { ...l, valores: {} }; // zera a única linha com valor do Aporte/Resgate
      return l;
    });
    const result = parseFlcXlsx(buildFlcWorkbook(spec));
    expect(result.avisos.some((a) => a.includes('Aporte/ Resgate'))).toBe(false);
  });
});

describe('parseFlcXlsx — cópias personalizadas de cliente', () => {
  it('item renomeado é importado com o nome do cliente', () => {
    const spec = modeloSpec().map((l): FixtureLinha => {
      if (l.tipo === 'item' && l.label === 'Combustível')
        return { ...l, label: 'Gasolina Posto X' };
      return l;
    });
    const result = parseFlcXlsx(buildFlcWorkbook(spec));
    const transporte = secao(result, 'transporte');
    expect(transporte.itens.map((i) => i.label)).toContain('Gasolina Posto X');
    expect(transporte.itens.find((i) => i.label === 'Gasolina Posto X')?.valores[0]).toBe(400);
  });

  it('item extra desconhecido vira item da seção corrente', () => {
    const spec = modeloSpec();
    const idx = spec.findIndex((l) => l.tipo === 'item' && l.label === 'Uber');
    spec.splice(idx + 1, 0, { tipo: 'item', label: 'Aluguel de patinete', valores: { 5: 42 } });
    const result = parseFlcXlsx(buildFlcWorkbook(spec));
    const extra = secao(result, 'transporte').itens.find((i) => i.label === 'Aluguel de patinete');
    expect(extra?.valores[5]).toBe(42);
  });

  it('seção renomeada gera avisos (âncora não reconhecida + valores órfãos), sem erro', () => {
    const spec = modeloSpec().map((l): FixtureLinha => {
      if (l.tipo === 'ancora' && l.label === 'Habitação') return { ...l, label: 'Casa' };
      return l;
    });
    const result = parseFlcXlsx(buildFlcWorkbook(spec));
    expect(result.secoes.map((s) => s.chave)).not.toContain('habitacao');
    expect(result.avisos.some((a) => a.includes('"Casa"') && a.includes('renomeada'))).toBe(true);
    expect(result.avisos.some((a) => a.includes('Aluguel / Prestação'))).toBe(true);
  });

  it('linha de TOTALIZAÇÃO (SUM) dentro de seção importável vai para ignorados', () => {
    const spec = modeloSpec();
    const idx = spec.findIndex((l) => l.tipo === 'item' && l.label === 'Uber');
    spec.splice(idx + 1, 0, {
      tipo: 'item',
      label: 'Subtotal carro',
      formulaSum: true,
      valores: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, 999])),
    });
    const result = parseFlcXlsx(buildFlcWorkbook(spec));
    expect(secao(result, 'transporte').itens.map((i) => i.label)).not.toContain('Subtotal carro');
    const ign = result.ignorados.find((i) => i.label === 'Subtotal carro');
    expect(ign?.motivo).toContain('computada');
  });

  it('item com fórmula ARITMÉTICA importa o resultado cacheado (report ago/2026: =anual/12)', () => {
    // Caso real: Conta de energia/IPVA/Seguro Carro escritos como "=2980/12"
    // eram descartados em bloco e o total da seção não batia.
    const spec = modeloSpec();
    const idx = spec.findIndex((l) => l.tipo === 'item' && l.label === 'Combustível');
    spec.splice(idx + 1, 0, {
      tipo: 'item',
      label: 'IPVA + Seguro Obrigatório Carro',
      formula: true,
      valores: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, 416.67])),
    });
    const result = parseFlcXlsx(buildFlcWorkbook(spec));

    const ipva = secao(result, 'transporte').itens.find(
      (i) => i.label === 'IPVA + Seguro Obrigatório Carro',
    );
    expect(ipva).toBeDefined();
    expect(ipva?.valores.every((v) => v === 416.67)).toBe(true);
    expect(result.ignorados.some((i) => i.label === 'IPVA + Seguro Obrigatório Carro')).toBe(false);
    expect(
      result.avisos.some(
        (a) => a.includes('IPVA + Seguro Obrigatório Carro') && a.includes('resultado'),
      ),
    ).toBe(true);
  });

  it('linha mista literal + SUM: literais importam, células de totalização viram null', () => {
    const spec = modeloSpec();
    const idx = spec.findIndex((l) => l.tipo === 'item' && l.label === 'Uber');
    // constrói manualmente: não há açúcar na fixture pra célula-a-célula mista;
    // usa item normal e sobrescreve um mês com SUM via segunda passada abaixo.
    spec.splice(idx + 1, 0, {
      tipo: 'item',
      label: 'Linha Mista',
      valores: { 0: 100, 1: 200 },
    });
    const buffer = buildFlcWorkbook(spec);
    // reabre e injeta SUM no mês 1 da Linha Mista
    // (XLSX é zip; mais simples: reparse → achar linha → regravar)
    const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true });
    const ws = wb.Sheets['Fluxo de Caixa'];
    const linhaMista = Object.keys(ws).find(
      (k) => k.startsWith('B') && ws[k]?.v === 'Linha Mista',
    )!;
    const row = linhaMista.slice(1);
    ws[`G${row}`] = { t: 'n', v: 200, f: 'SUM(G1:G2)' };
    const rebuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = parseFlcXlsx(rebuffer);
    const mista = secao(result, 'transporte').itens.find((i) => i.label === 'Linha Mista');
    expect(mista?.valores[0]).toBe(100); // literal preservado
    expect(mista?.valores[1]).toBeNull(); // SUM ignorada
    expect(result.avisos.some((a) => a.includes('Linha Mista') && a.includes('SUM'))).toBe(true);
  });
});

describe('parseFlcXlsx — comentários de célula', () => {
  const comComentarios = () => {
    const spec = modeloSpec().map((l): FixtureLinha => {
      if (l.tipo === 'item' && l.label === 'Combustível')
        // mês 0 tem valor 400; mês 1 é célula zerada (valor null no IR)
        return { ...l, comentarios: { 0: '  Posto Ipiranga da esquina  ', 1: 'Sem carro em fev' } };
      return l;
    });
    return parseFlcXlsx(buildFlcWorkbook(spec));
  };

  it('captura comentário (com trim) em célula com valor e em célula zerada', () => {
    const result = comComentarios();
    const combustivel = secao(result, 'transporte').itens.find((i) => i.label === 'Combustível');
    expect(combustivel?.comentarios[0]).toBe('Posto Ipiranga da esquina');
    expect(combustivel?.valores[1]).toBeNull(); // zerada: sem valor…
    expect(combustivel?.comentarios[1]).toBe('Sem carro em fev'); // …mas com comentário
    expect(combustivel?.comentarios[2]).toBeNull();
  });

  it('item sem comentários tem os 12 meses null e o parse segue intacto', () => {
    const result = comComentarios();
    expect(result.secoes).toHaveLength(17);
    // só os 2 avisos estruturais do modelo (seções ignoradas com valores)
    expect(result.avisos).toHaveLength(2);
    const uber = secao(result, 'transporte').itens.find((i) => i.label === 'Uber');
    expect(uber?.comentarios).toEqual(Array(12).fill(null));
  });

  it('trunca comentário no limite do app (1000 chars, mesmo do manual)', () => {
    const spec = modeloSpec().map((l): FixtureLinha => {
      if (l.tipo === 'item' && l.label === 'Combustível')
        return { ...l, comentarios: { 0: 'x'.repeat(1500) } };
      return l;
    });
    const result = parseFlcXlsx(buildFlcWorkbook(spec));
    const combustivel = secao(result, 'transporte').itens.find((i) => i.label === 'Combustível');
    expect(combustivel?.comentarios[0]).toHaveLength(1000);
    expect(combustivel?.comentarios[0]?.endsWith('…')).toBe(true);
  });
});

describe('repararMojibake', () => {
  it('reverte double-decode do parser de threaded comments (SheetJS 0.18.5)', () => {
    expect(repararMojibake('O cliente faz lanÃ§amentos manuais')).toBe(
      'O cliente faz lançamentos manuais',
    );
    expect(repararMojibake('PARA NÃ£o alterar')).toBe('PARA Não alterar');
  });

  it('não altera texto legítimo com acentos (notas legadas chegam corretas)', () => {
    expect(repararMojibake('Reajuste previsto em março')).toBe('Reajuste previsto em março');
    expect(repararMojibake('SÃO PAULO — ação e emoção')).toBe('SÃO PAULO — ação e emoção');
    expect(repararMojibake('sem acento nenhum')).toBe('sem acento nenhum');
  });
});

describe('parseFlcXlsx — erros e tolerâncias', () => {
  it('lança FlcParseError se a aba não existe', () => {
    const buf = buildFlcWorkbook(modeloSpec(), 'Outra Coisa');
    expect(() => parseFlcXlsx(buf)).toThrow(FlcParseError);
    expect(() => parseFlcXlsx(buf)).toThrow(/Fluxo de Caixa/);
  });

  it('tolera espaços ao redor do nome da aba', () => {
    const result = parseFlcXlsx(buildFlcWorkbook(modeloSpec(), ' Fluxo de Caixa '));
    expect(result.secoes.length).toBe(17);
  });

  it('lança FlcParseError para buffer que não é planilha', () => {
    expect(() => parseFlcXlsx(Buffer.from('não sou xlsx'))).toThrow(FlcParseError);
  });
});

describe('parseFlcXlsx — cores de fonte das células (report 10/08, item 4)', () => {
  // A fixture (SheetJS CE) não escreve estilos — injeta via cirurgia de zip:
  // styles.xml próprio (fonte 1 = vermelho, fonte 2 = verde da legenda) e o
  // atributo s= nas células-alvo do sheet1.xml.
  const STYLES_COLORIDO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/></font><font><color rgb="FFFF0000"/></font><font><color rgb="FF76933C"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellXfs count="3"><xf numFmtId="0" fontId="0"/><xf numFmtId="0" fontId="1" applyFont="1"/><xf numFmtId="0" fontId="2" applyFont="1"/></cellXfs>
</styleSheet>`;

  const comCores = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buildFlcWorkbook());
    zip.updateFile('xl/styles.xml', Buffer.from(STYLES_COLORIDO));
    let sheet = zip.readAsText('xl/worksheets/sheet1.xml');
    // Combustível jan = 400 → fonte vermelha; 1ª célula com 1000 no XML é
    // Receita Alugúeis jan → verde
    sheet = sheet.replace(/<c r="([A-Z]+\d+)"([^>]*)><v>400<\/v>/, '<c r="$1" s="1"$2><v>400</v>');
    sheet = sheet.replace(
      /<c r="([A-Z]+\d+)"([^>]*)><v>1000<\/v>/,
      '<c r="$1" s="2"$2><v>1000</v>',
    );
    zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(sheet));
    return parseFlcXlsx(zip.toBuffer());
  };

  const secaoPorChave = (r: ReturnType<typeof parseFlcXlsx>, chave: string) =>
    r.secoes.find((s) => s.chave === chave)!;

  it('captura a cor de fonte crua por mês nas células estilizadas', () => {
    const result = comCores();
    const combustivel = secaoPorChave(result, 'transporte').itens.find(
      (i) => i.label === 'Combustível',
    );
    expect(combustivel?.cores[0]).toBe('#FF0000');
    expect(combustivel?.cores[1]).toBeNull();

    const receitaAlugueis = secaoPorChave(result, 'entradas-fixas').itens.find(
      (i) => i.label === 'Receita Alugúeis',
    );
    expect(receitaAlugueis?.cores[0]).toBe('#76933C');
  });

  it('planilha sem estilos coloridos produz cores todas null (fixture pura)', () => {
    const result = parseFlcXlsx(buildFlcWorkbook());
    const todos = result.secoes.flatMap((s) => s.itens.flatMap((i) => i.cores));
    expect(todos.every((c) => c === null)).toBe(true);
  });
});
