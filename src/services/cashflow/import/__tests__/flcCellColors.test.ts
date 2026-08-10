/**
 * Testes da extração de cor de fonte do .xlsx (report 10/08, item 4) —
 * funções puras sobre os XMLs crus do zip + snap para a legenda do app.
 */
import { describe, it, expect } from 'vitest';
import {
  applyTint,
  extractSheetFontColors,
  parseFontColorsByXf,
  parseThemeColors,
  readFlcFontColors,
  resolveSheetPath,
  snapParaLegenda,
} from '../flcCellColors';

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="11"/></font>
    <font><color rgb="FFFF0000"/><sz val="11"/></font>
    <font><color theme="4" tint="0.5"/></font>
    <font><color indexed="17"/></font>
    <font><color auto="1"/></font>
  </fonts>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" applyFont="0"/>
    <xf numFmtId="0" fontId="1" applyFont="1"/>
    <xf numFmtId="0" fontId="2" applyFont="1"/>
    <xf numFmtId="0" fontId="3" applyFont="1"/>
    <xf numFmtId="0" fontId="4" applyFont="1"/>
  </cellXfs>
</styleSheet>`;

const THEME_XML = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<a:themeElements><a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F497D"/></a:dk2>
<a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
<a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
<a:accent2><a:srgbClr val="C0504D"/></a:accent2>
<a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
<a:accent4><a:srgbClr val="8064A2"/></a:accent4>
<a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
<a:accent6><a:srgbClr val="F79646"/></a:accent6>
<a:hlink><a:srgbClr val="0000FF"/></a:hlink>
<a:folHlink><a:srgbClr val="800080"/></a:folHlink>
</a:clrScheme></a:themeElements></a:theme>`;

const SHEET_XML = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="12"><c r="F12" s="1" t="n"><v>400</v></c><c r="G12" t="n"><v>10</v></c><c r="H12" s="0"><v>5</v></c></row>
<row r="13"><c r="F13" s="3"><v>7</v></c></row>
</sheetData></worksheet>`;

const WORKBOOK_XML = `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Outra" sheetId="1" r:id="rId9"/><sheet name="Fluxo de Caixa" sheetId="2" r:id="rId1"/></sheets></workbook>`;

const RELS_XML = `<Relationships>
<Relationship Id="rId9" Type="w" Target="worksheets/sheet9.xml"/>
<Relationship Id="rId1" Type="w" Target="worksheets/sheet1.xml"/>
</Relationships>`;

describe('parseThemeColors', () => {
  it('resolve srgb/sysClr e aplica o swap de pares do índice (0=lt1, 1=dk1)', () => {
    const cores = parseThemeColors(THEME_XML);
    expect(cores[0]).toBe('#FFFFFF'); // lt1
    expect(cores[1]).toBe('#000000'); // dk1
    expect(cores[4]).toBe('#4F81BD'); // accent1
  });
});

describe('applyTint', () => {
  it('tint positivo clareia rumo ao branco, negativo escurece', () => {
    expect(applyTint('#000000', 0.5)).toBe('#808080');
    expect(applyTint('#FFFFFF', -0.5)).toBe('#808080');
    expect(applyTint('#4F81BD', 0)).toBe('#4F81BD');
  });
});

describe('parseFontColorsByXf', () => {
  const theme = parseThemeColors(THEME_XML);
  const cores = parseFontColorsByXf(STYLES_XML, theme);

  it('fonte sem cor e auto=1 viram null; rgb direto resolve', () => {
    expect(cores[0]).toBeNull();
    expect(cores[1]).toBe('#FF0000');
    expect(cores[4]).toBeNull();
  });

  it('theme+tint resolve pelo tema; indexed usa a paleta legada', () => {
    expect(cores[2]).toBe(applyTint('#4F81BD', 0.5));
    expect(cores[3]).toBe('#008000'); // indexed 17
  });
});

describe('extractSheetFontColors', () => {
  it('mapeia ref → cor só para células com estilo de fonte colorida', () => {
    const theme = parseThemeColors(THEME_XML);
    const porXf = parseFontColorsByXf(STYLES_XML, theme);
    const mapa = extractSheetFontColors(SHEET_XML, porXf);
    expect(mapa.get('F12')).toBe('#FF0000');
    expect(mapa.get('F13')).toBe('#008000');
    expect(mapa.has('G12')).toBe(false); // sem atributo s
    expect(mapa.has('H12')).toBe(false); // xf 0 → fonte sem cor
  });
});

describe('resolveSheetPath', () => {
  it('resolve a aba pelo nome via workbook.xml + rels', () => {
    expect(resolveSheetPath(WORKBOOK_XML, RELS_XML, 'Fluxo de Caixa')).toBe(
      'xl/worksheets/sheet1.xml',
    );
    expect(resolveSheetPath(WORKBOOK_XML, RELS_XML, 'Inexistente')).toBeNull();
  });
});

describe('readFlcFontColors', () => {
  const files = {
    'xl/workbook.xml': { content: Buffer.from(WORKBOOK_XML) },
    'xl/_rels/workbook.xml.rels': { content: Buffer.from(RELS_XML) },
    'xl/styles.xml': { content: Buffer.from(STYLES_XML) },
    'xl/theme/theme1.xml': { content: Buffer.from(THEME_XML) },
    'xl/worksheets/sheet1.xml': { content: Buffer.from(SHEET_XML) },
  };

  it('compõe a cadeia inteira arquivo → ref → cor', () => {
    const mapa = readFlcFontColors(files, 'Fluxo de Caixa');
    expect(mapa.get('F12')).toBe('#FF0000');
  });

  it('qualquer arquivo ausente devolve mapa vazio (cor nunca derruba o import)', () => {
    expect(readFlcFontColors({}, 'Fluxo de Caixa').size).toBe(0);
    const semStyles = { ...files, 'xl/styles.xml': undefined };
    expect(readFlcFontColors(semStyles, 'Fluxo de Caixa').size).toBe(0);
  });
});

describe('snapParaLegenda', () => {
  it('cores exatas da legenda voltam elas mesmas', () => {
    expect(snapParaLegenda('#76933C')).toBe('#76933C');
    expect(snapParaLegenda('#FF0000')).toBe('#FF0000');
    expect(snapParaLegenda('#0000FF')).toBe('#0000FF');
    expect(snapParaLegenda('#9E8A58')).toBe('#9E8A58');
    expect(snapParaLegenda('#000000')).toBe('#000000');
  });

  it('cores próximas encaixam na legenda (decisão 10/08)', () => {
    expect(snapParaLegenda('#7F9F45')).toBe('#76933C'); // verde levemente diferente
    expect(snapParaLegenda('#C00000')).toBe('#FF0000'); // vermelho escuro do Excel
    expect(snapParaLegenda('#000080')).toBe('#0000FF'); // navy
  });

  it('quase-branco (texto invisível) e entrada inválida viram null', () => {
    expect(snapParaLegenda('#FFFFFF')).toBeNull();
    expect(snapParaLegenda('#F2F2F2')).toBeNull();
    expect(snapParaLegenda('red')).toBeNull();
  });
});
