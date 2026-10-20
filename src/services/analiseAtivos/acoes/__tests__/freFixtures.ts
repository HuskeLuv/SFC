/**
 * Recortes do FRE (CVM dados abertos) para os testes da fatia D da A6 — SÓ A ESTRUTURA: cabeçalhos
 * e layout reais do FRE 2026/2022 (ITUB e WEGE), com acionistas pessoa física FICTÍCIOS e
 * documentos falsos (DOC_FALSO_*) nas colunas CPF_CNPJ_*, para provar que nunca são gravados.
 */
import { montarZip } from '@/services/analiseAtivos/acoes/__tests__/zipFixtures';

export const ITUB = '60872504000123';
export const WEGE = '84429695000111';
export const BBSE = '17344597000194';

/** Documentos falsos que NÃO podem aparecer em nenhuma gravação nem resposta. */
export const DOC_FALSO_PF = '000.111.222-33';
export const DOC_FALSO_PJ = '11.222.333/0001-44';

const IDX_CAB = 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;CATEG_DOC;ID_DOC;DT_RECEB;LINK_DOC';
const link = (n: number) =>
  `http://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=${n}`;

export const INDICE_2026 = [
  IDX_CAB,
  `60.872.504/0001-23;2026-12-31;3;ITAU UNIBANCO HOLDING S.A.;019348;FRE WEB;160142;2026-08-04;${link(160142)}`,
  `60.872.504/0001-23;2026-12-31;4;ITAU UNIBANCO HOLDING S.A.;019348;FRE WEB;161558;2026-09-15;${link(161558)}`,
  `84.429.695/0001-11;2026-12-31;3;WEG S.A.;005410;FRE WEB;161418;2026-09-22;${link(161418)}`,
  // fora do universo dos testes
  `33.000.167/0001-01;2026-12-31;2;PETROLEO BRASILEIRO S.A. PETROBRAS;009512;FRE WEB;160000;2026-06-01;${link(160000)}`,
].join('\n');

const POS_CAB =
  'CNPJ_Companhia;Data_Referencia;Versao;ID_Documento;Nome_Companhia;ID_Acionista;Acionista;Tipo_Pessoa_Acionista;CPF_CNPJ_Acionista;ID_Acionista_Relacionado;Acionista_Relacionado;Tipo_Pessoa_Acionista_Relacionado;CPF_CNPJ_Acionista_Relacionado;Quantidade_Acao_Ordinaria_Circulacao;Percentual_Acao_Ordinaria_Circulacao;Quantidade_Acao_Preferencial_Circulacao;Percentual_Acao_Preferencial_Circulacao;Quantidade_Total_Acoes_Circulacao;Percentual_Total_Acoes_Circulacao;Nacionalidade;Sigla_UF;Residente_Exterior;Representante_Legal;Tipo_Pessoa_Representante_Legal;CPF_CNPJ_Representante_legal;Data_Composicao_Capital_Social;Data_Ultima_Alteracao;Acionista_Controlador;Participante_Acordo_Acionistas';

const I = '60.872.504/0001-23;2026-12-31;4;161558;ITAU UNIBANCO HOLDING S.A.';
const I3 = '60.872.504/0001-23;2026-12-31;3;160142;ITAU UNIBANCO HOLDING S.A.';
const W = '84.429.695/0001-11;2026-12-31;3;161418;WEG S.A.';

export const POSICAO_2026 = [
  POS_CAB,
  // versão 3 do ITUB (descartada: a 4 vem depois no arquivo)
  `${I3};8000001;Itaúsa S.A.;PJ;${DOC_FALSO_PJ};;;;;1;40.000000;0;0.000000;1;20.000000;Brasil;;N;;;;;2026-05-19;S;S`,
  `${I};8236637;Ações Tesouraria;;;;;;;0;0.000000;4606000;0.094000;4606000;0.046000;;;N;;;;;;N;N`,
  `${I};8236638;BlackRock,INC;PJ;${DOC_FALSO_PJ};;;;;0;0.000000;359000000;7.330000;359000000;3.595000;Estados Unidos;;S;;;;;2026-05-19;N;N`,
  `${I};8236642;Itaúsa S.A.;PJ;${DOC_FALSO_PJ};;;;;2202446151;39.205000;191842;0.004000;2202637993;19.975000;Brasil;;N;;;;;2026-05-19;S;S`,
  // indiretos (cotistas da Itaúsa): nunca gravados
  `${I};8236643;PESSOA FICTICIA UM;PF;${DOC_FALSO_PF};8236642;Itaúsa S.A.;PJ;${DOC_FALSO_PJ};492999776;12.793000;289078174;3.928000;782077950;6.974000;Brasil;;N;;;;;2025-12-31;S;S`,
  `${I};8236650;Outros;;;8236642;Itaúsa S.A.;PJ;${DOC_FALSO_PJ};0;0.000000;0;0.000000;0;0.000000;;;N;;;;;;N;N`,
  `${I};8236732;IUPAR - Itaú Unibanco Participações S.A.;PJ;${DOC_FALSO_PJ};;;;;2865000000;51.713000;0;0.000000;2865000000;26.346000;Brasil;;N;;;;;2026-05-19;S;S`,
  `${I};8236833;Outros;;;;;;;503000000;9.082000;4532000000;92.573000;5035000000;50.038000;;;N;;;;;;N;N`,
  // linha repetida do mesmo acionista direto: não duplica a PK
  `${I};8236732;IUPAR - Itaú Unibanco Participações S.A.;PJ;${DOC_FALSO_PJ};;;;;2865000000;51.713000;0;0.000000;2865000000;26.346000;Brasil;;N;;;;;2026-05-19;S;S`,
  `${W};8228789;WPA Participações e Serviços S.A.;PJ;${DOC_FALSO_PJ};;;;;2101000000;50.088000;0;0.000000;2101000000;50.088000;Brasil;;N;;;;;2024-04-23;S;N`,
  `${W};8228533;PESSOA FICTICIA DOIS;PF;${DOC_FALSO_PF};;;;;9302119;0.222000;0;0.000000;9302119;0.222000;Brasil;;N;;;;;2026-04-23;S;N`,
  `${W};8228895;Outros;;;;;;;1460506056;34.796000;0;0.000000;1460506056;34.796000;;;N;;;;;;N;N`,
  `${W};8228896;Ações Tesouraria;;;;;;;0;0.000000;0;0.000000;0;0.000000;;;N;;;;;;N;N`,
].join('\n');

const DIST_CAB =
  'CNPJ_Companhia;Data_Referencia;Versao;ID_Documento;Nome_Companhia;Quantidade_Acionistas_PF;Quantidade_Acionistas_PJ;Quantidade_Acionistas_Investidores_Institucionais;Quantidade_Acoes_Ordinarias_Circulacao;Percentual_Acoes_Ordinarias_Circulacao;Quantidade_Acoes_Preferenciais_Circulacao;Percentual_Acoes_Preferenciais_Circulacao;Quantidade_Total_Acoes_Circulacao;Percentual_Total_Acoes_Circulacao;Data_Ultima_Assembleia';

export const DISTRIBUICAO_2026 = [
  DIST_CAB,
  `${I};653637;12764;1397;456130473;8.119000;5337898685;98.683000;5794029158;52.545000;2026-05-19`,
  `${W};359032;2900;1130;1460506056;34.796000;0;0.000000;1460506056;34.796000;2026-04-23`,
].join('\n');

export const INDICE_2022 = [
  IDX_CAB,
  `60.872.504/0001-23;2022-01-01;15;ITAU UNIBANCO HOLDING S.A.;019348;FRE NOVO;127205;2023-05-24;${link(127205)}`,
].join('\n');

const DIR_CAB =
  'CNPJ_Companhia;Data_Referencia;Versao;ID_Documento;Nome_Companhia;Especie_Acao;Classe_Acao_Preferencial;Percentual_Tag_Along;Direito_Dividendo;Direito_Voto;Conversibilidade;Descricao_Voto_Restrito;Condicao_Conversibilidade_Efeito_Capital_Social;Direito_Reembolso_Capital;Restricao_Circulacao;Caracteristicas_Reembolso_Capital;Descricao_Restricao_Circulacao;Resgatavel;Hipotese_Resgate_Formula_Calculo;Condicao_Alteracao_Direitos;Outras_Caracteristicas_Relevantes';

const TEXTO_ITUB =
  'Os acionistas têm direito a receber como dividendo obrigatório, em cada exercício, importância não inferior a 25% do lucro líquido apurado no mesmo exercício, ajustado pela diminuição ou acréscimo dos valores especificados nas letras "a" e "b" do inciso I do artigo 202 da Lei das Sociedades por Ações.';

export const DIREITO_2022 = [
  DIR_CAB,
  `60.872.504/0001-23;2022-01-01;15;127205;ITAU UNIBANCO HOLDING S.A.;Ordinária;;80.000000;${TEXTO_ITUB};Pleno;N;;;N;N;;;;;Não se aplica;Não se aplica`,
  `60.872.504/0001-23;2022-01-01;15;127205;ITAU UNIBANCO HOLDING S.A.;Preferencial;;80.000000;${TEXTO_ITUB};Sem Direito;N;;;N;N;;;;;Não se aplica;Não se aplica`,
  `84.429.695/0001-11;2022-01-01;5;123176;WEG S.A.;Ordinária;;100.000000;25% (vinte e cinco por cento) no mínimo, do lucro líquido ajustado na forma do artigo 202 da Lei das Sociedades por Ações, para distribuição de dividendos e/ou juros sobre capital próprio.;Pleno;N;;;N;N;;;;;Não se aplica;Não se aplica`,
  `17.344.597/0001-94;2022-01-01;10;126989;BB SEGURIDADE PARTICIPAÇÕES S.A.;Ordinária;;100.000000;Informações prestadas na seção 18.12.;Pleno;N;;;N;N;;;;;Não se aplica;Não se aplica`,
  // espécie que não é ação: fora
  `17.344.597/0001-94;2022-01-01;10;126989;BB SEGURIDADE PARTICIPAÇÕES S.A.;Certificados de Depósito de Valores Mobiliários;;0.000000;;Pleno;N;;;N;N;;;;;;`,
].join('\n');

/** Zips mínimos no layout da CVM (latin1, CRLF). */
/** FRE do ano com o conteúdo do recorte de 2026 (o de 2025 só muda o nome das entradas). */
export function zipFre2026(dir: string, ano = 2026): string {
  return montarZip(dir, `fre_cia_aberta_${ano}.zip`, {
    [`fre_cia_aberta_${ano}.csv`]: INDICE_2026,
    [`fre_cia_aberta_posicao_acionaria_${ano}.csv`]: POSICAO_2026,
    [`fre_cia_aberta_distribuicao_capital_${ano}.csv`]: DISTRIBUICAO_2026,
  });
}

export function zipFre2022(dir: string): string {
  return montarZip(dir, 'fre_cia_aberta_2022.zip', {
    'fre_cia_aberta_2022.csv': INDICE_2022,
    'fre_cia_aberta_direito_acao_2022.csv': DIREITO_2022,
  });
}
