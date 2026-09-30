/**
 * Monta zips MÍNIMOS no formato da CVM a partir dos recortes reais em fixtures/ (CSV em UTF-8 no repo,
 * gravados em latin1 dentro do zip, como a CVM publica).
 */
import AdmZip from 'adm-zip';
import { readFileSync } from 'fs';
import path from 'path';

export function fixture(nome: string): string {
  return readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8');
}

export function montarZip(dir: string, nome: string, entradas: Record<string, string>): string {
  const zip = new AdmZip();
  for (const [entrada, texto] of Object.entries(entradas)) {
    zip.addFile(entrada, Buffer.from(texto.replace(/\n/g, '\r\n'), 'latin1'));
  }
  const caminho = path.join(dir, nome);
  zip.writeZip(caminho);
  return caminho;
}

const DFP_2025 = [
  'dfp_cia_aberta_2025.csv',
  'dfp_cia_aberta_DRE_con_2025.csv',
  'dfp_cia_aberta_DRE_ind_2025.csv',
  'dfp_cia_aberta_BPA_con_2025.csv',
  'dfp_cia_aberta_BPP_con_2025.csv',
  'dfp_cia_aberta_DFC_MI_con_2025.csv',
  'dfp_cia_aberta_composicao_capital_2025.csv',
];

/** Cabeçalho de uma entrada vazia (entrada exigida sem linhas no recorte). */
function vazia(de: string): string {
  return `${fixture(de).split('\n')[0]}\n`;
}

export function zipDfp2025(dir: string): string {
  const entradas: Record<string, string> = Object.fromEntries(DFP_2025.map((n) => [n, fixture(n)]));
  entradas['dfp_cia_aberta_BPA_ind_2025.csv'] = vazia('dfp_cia_aberta_BPA_con_2025.csv');
  entradas['dfp_cia_aberta_BPP_ind_2025.csv'] = vazia('dfp_cia_aberta_BPP_con_2025.csv');
  return montarZip(dir, 'dfp_cia_aberta_2025.zip', entradas);
}

export function zipItr(dir: string, ano: 2025 | 2026): string {
  const nomes = [
    `itr_cia_aberta_${ano}.csv`,
    `itr_cia_aberta_DRE_con_${ano}.csv`,
    `itr_cia_aberta_DRE_ind_${ano}.csv`,
    `itr_cia_aberta_BPA_con_${ano}.csv`,
    `itr_cia_aberta_BPP_con_${ano}.csv`,
    `itr_cia_aberta_composicao_capital_${ano}.csv`,
  ];
  const entradas: Record<string, string> = Object.fromEntries(nomes.map((n) => [n, fixture(n)]));
  entradas[`itr_cia_aberta_BPA_ind_${ano}.csv`] = vazia(`itr_cia_aberta_BPA_con_${ano}.csv`);
  entradas[`itr_cia_aberta_BPP_ind_${ano}.csv`] = vazia(`itr_cia_aberta_BPP_con_${ano}.csv`);
  return montarZip(dir, `itr_cia_aberta_${ano}.zip`, entradas);
}

/** FCA do ano; `ajustar` altera o texto do valor_mobiliario (ex.: troca de CNPJ de um ticker). */
export function zipFca(dir: string, ano: number, ajustar?: (vm: string) => string): string {
  const trocaAno = (t: string) => t.replace(/2026-01-01/g, `${ano}-01-01`);
  const vm = trocaAno(fixture('fca_cia_aberta_valor_mobiliario_2026.csv'));
  return montarZip(dir, `fca_cia_aberta_${ano}.zip`, {
    [`fca_cia_aberta_geral_${ano}.csv`]: trocaAno(fixture('fca_cia_aberta_geral_2026.csv')),
    [`fca_cia_aberta_valor_mobiliario_${ano}.csv`]: ajustar ? ajustar(vm) : vm,
  });
}
