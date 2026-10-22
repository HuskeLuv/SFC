/**
 * Overrides POR CIK do universo EUA e segmentos curados dos REITs — Stocks e REITs, fatia A.
 *
 * Regras (desenho.json → final.escopo_mvp / pipeline_dados §1):
 * - o override SÓ classifica, inclui ou exclui o CIK; NUNCA fixa ticker (o ticker vem sempre do
 *   arquivo da SEC — caso medido: o CIK 906107 do EQR aparece hoje como VMRK);
 * - CIKs conferidos no company_tickers_exchange.json de 17/10/2026. AVB não está no arquivo e o
 *   submissions do CIK 915912 também vem SEM ticker (tickers: [], exchanges: []): sem ticker da SEC
 *   o CIK fica fora (foraMotivo 'sem_bolsa') com o alerta 'override_sem_ticker' — entra sozinho
 *   quando a SEC voltar a listar o ticker.
 * Mudança aqui = efeito no próximo sec-cadastro (semanal); o relatório de cobertura lista os
 * overrides aplicados.
 */
import { normalizarCik, type OverrideCikEua, type SegmentoReit } from '@/types/analiseAtivosEua';

const o = (x: OverrideCikEua): OverrideCikEua => ({ ...x, cik: normalizarCik(x.cik) });

export const OVERRIDES_EUA: readonly OverrideCikEua[] = [
  // XOM: a holding nova (2026) não tem fatos de 10-K; o histórico está no CIK antigo
  o({
    cik: '2115436',
    acao: 'classificar',
    classe: 'stock',
    cikHistorico: normalizarCik('34088'),
    motivo: 'ExxonMobil Holdings: histórico de 10-K no CIK 0000034088 (Exxon Mobil Corporation)',
  }),
  // AVB: ausente do company_tickers_exchange.json
  o({
    cik: '915912',
    acao: 'incluir',
    classe: 'reit',
    reitTipo: 'equity',
    segmento: 'residencial',
    motivo: 'AvalonBay: fora do arquivo de tickers da SEC; REIT residencial',
  }),
  // INVH: REIT com SIC 6510 (operadores de imóveis), não 6798
  o({
    cik: '1687229',
    acao: 'classificar',
    classe: 'reit',
    reitTipo: 'equity',
    segmento: 'residencial',
    motivo: 'Invitation Homes: REIT residencial com SIC 6510',
  }),
  // REITs hipotecários (fora: o MVP é só de REITs de patrimônio)
  ...(
    [
      ['1423689', 'AGNC Investment'],
      ['1043219', 'Annaly Capital Management'],
      ['1061630', 'Blackstone Mortgage Trust'],
      ['1465128', 'Starwood Property Trust'],
      ['1556593', 'Rithm Capital'],
    ] as const
  ).map(([cik, nome]) =>
    o({
      cik,
      acao: 'excluir',
      classe: 'reit',
      reitTipo: 'mortgage',
      motivo: `${nome}: REIT hipotecário`,
    }),
  ),
  // 10-K em dólar canadense: companyfacts só com unidade CAD (conferido em 22/10/2026), a extração
  // (USD) não acha nenhum FY
  ...(
    [
      ['16875', 'Canadian Pacific Kansas City'],
      ['895728', 'Enbridge'],
    ] as const
  ).map(([cik, nome]) =>
    o({ cik, acao: 'excluir', motivo: `${nome}: demonstrações em CAD (sem fatos em USD)` }),
  ),
  // SIC 6798 sem ser REIT de patrimônio: entram como stock
  o({
    cik: '1981792',
    acao: 'classificar',
    classe: 'stock',
    motivo: 'Howard Hughes Holdings: incorporadora, não REIT (SIC 6798)',
  }),
  o({
    cik: '1070985',
    acao: 'classificar',
    classe: 'stock',
    motivo: 'CoreCivic: deixou de ser REIT em 2021 (SIC 6798)',
  }),
];

const POR_CIK = new Map(OVERRIDES_EUA.map((x) => [x.cik, x]));

export function overrideDoCik(cik: string): OverrideCikEua | null {
  return POR_CIK.get(normalizarCik(cik)) ?? null;
}

/** CIKs que entram como candidatos mesmo fora do arquivo de tickers / abaixo do corte de busca. */
export function ciksComOverride(): string[] {
  return OVERRIDES_EUA.filter((x) => x.acao !== 'excluir').map((x) => x.cik);
}

/**
 * Segmento curado dos REITs de patrimônio por CIK (lista de 17/10/2026, REITs SIC 6798 com float
 * ≥ US$ 2 bi + overrides). REIT sem segmento aqui = null na tela e alerta 'reit_sem_segmento'.
 */
const SEGMENTOS: Record<string, SegmentoReit> = {
  '917251': 'net_lease', // ADC
  '1632970': 'saude', // AHR
  '899629': 'varejo', // AKR
  '1562401': 'residencial', // AMH
  '1053507': 'torres', // AMT
  '1418121': 'hotelaria', // APLE
  '1035443': 'escritorios', // ARE
  '1424182': 'net_lease', // BNL
  '1581068': 'varejo', // BRX
  '1037540': 'escritorios', // BXP
  '1051470': 'torres', // CCI
  '860546': 'escritorios', // CDP
  '1455863': 'industrial', // COLD
  '906345': 'residencial', // CPT
  '1590717': 'saude', // CTRE
  '1298675': 'self_storage', // CUBE
  '25232': 'escritorios', // CUZ
  '1364250': 'escritorios', // DEI
  '1297996': 'data_center', // DLR
  '765880': 'saude', // DOC
  '49600': 'industrial', // EGP
  '895417': 'residencial', // ELS
  '1045450': 'especial', // EPR
  '1728951': 'net_lease', // EPRT
  '1101239': 'data_center', // EQIX
  '920522': 'residencial', // ESS
  '1289490': 'self_storage', // EXR
  '1650132': 'net_lease', // FCPT
  '921825': 'industrial', // FR
  '34903': 'varejo', // FRT
  '1575965': 'especial', // GLPI
  '921082': 'escritorios', // HIW
  '1360604': 'saude', // HR
  '1070750': 'hotelaria', // HST
  '1020569': 'especial', // IRM
  '1466085': 'residencial', // IRT
  '1307748': 'varejo', // IVT
  '879101': 'varejo', // KIM
  '1025996': 'escritorios', // KRC
  '1286043': 'varejo', // KRG
  '1090425': 'especial', // LAMR
  '1868159': 'industrial', // LINE
  '910108': 'industrial', // LXP
  '912595': 'residencial', // MAA
  '912242': 'varejo', // MAC
  '1287865': 'saude', // MPT
  '877860': 'saude', // NHI
  '751364': 'net_lease', // NNN
  '726728': 'net_lease', // O
  '888491': 'saude', // OHI
  '1579877': 'especial', // OUT
  '1476204': 'varejo', // PECO
  '1045609': 'industrial', // PLD
  '1393311': 'self_storage', // PSA
  '910606': 'varejo', // REG
  '1571283': 'industrial', // REXR
  '1040829': 'hotelaria', // RHP
  '52827': 'florestal', // RYN
  '1034054': 'torres', // SBAC
  '1492298': 'saude', // SBRA
  '899715': 'varejo', // SKT
  '1040971': 'escritorios', // SLG
  '1585389': 'self_storage', // SMA
  '1063761': 'varejo', // SPG
  '1479094': 'industrial', // STAG
  '912593': 'residencial', // SUI
  '74208': 'residencial', // UDR
  '1705696': 'especial', // VICI
  '906107': 'residencial', // EQR (hoje VMRK no arquivo da SEC)
  '899689': 'escritorios', // VNO
  '740260': 'saude', // VTR
  '766704': 'saude', // WELL
  '1025378': 'net_lease', // WPC
  '106535': 'florestal', // WY
};
const SEGMENTO_POR_CIK = new Map(
  Object.entries(SEGMENTOS).map(([cik, s]) => [normalizarCik(cik), s] as const),
);

export function segmentoCuradoReit(cik: string): SegmentoReit | null {
  const c = normalizarCik(cik);
  return POR_CIK.get(c)?.segmento ?? SEGMENTO_POR_CIK.get(c) ?? null;
}
