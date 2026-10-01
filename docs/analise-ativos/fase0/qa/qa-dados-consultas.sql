-- QA de dados (30/09/2026) — consultas SÓ LEITURA no Neon dev usadas como evidência.
-- Rodar com: PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -f este_arquivo

-- A1. Contagem de ações com escala ×1000 aplicada duas vezes (status 'ok' porque o LPA também foi "corrigido")
select cnpj, data, total, fonte, status, flags from asset_share_counts
 where cnpj in ('02.149.205/0001-69','28.127.603/0001-78','89.086.144/0001-16') and data >= '2025-12-31' order by cnpj, data;

-- A2. Múltiplos atuais absurdos sem selo (PSSA3, BEES3/4, RAPT3/4, PDGR3, CTKA3/4)
select m.symbol, m.vpa, m."lpaTtm", m.pl, m.pvp, s."indiceMf", s."cPreco", s.incompleto
  from asset_multiples_current m join asset_scores s on s.symbol = m.symbol
 where m.symbol in ('PSSA3','BEES3','BEES4','RAPT3','RAPT4','PDGR3','CTKA3','CTKA4');

-- A3. VPA atual vs VPA FY2025 ajustado com razão > 20× ou < 0,05×
select m.symbol, m.vpa, p."vpaAjHoje", m.vpa / nullif(p."vpaAjHoje",0) razao, s.incompleto
  from asset_multiples_current m
  join asset_per_share_yearly p on p.symbol = m.symbol and p."anoFiscal" = 2025
  left join asset_scores s on s.symbol = m.symbol
 where m.classe = 'acao' and (abs(m.vpa / nullif(p."vpaAjHoje",0)) > 20 or abs(m.vpa / nullif(p."vpaAjHoje",0)) < 0.05);

-- B1. Base de proventos parada em jun/2026 e cobertura 'OK' de 10/06/2026
select symbol, max("dataComReal"), max("dataPagamento") from asset_proventos_auditados
 where symbol in ('HGLG11','KNCR11','MXRF11','BBSE3') group by 1;
select status, max("lastCheckedAt"), count(*) from market_data_coverage group by 1;
select count(*) filter (where "mesesComRendimento" = 0), count(*) from asset_multiples_current where classe = 'fii';

-- C1. SBSP3: evento YAHOO 1,028346 confirmado; produto 5,15 vs razão CVM 5,008
select "dataEvento", fator, tipo, status, "razaoCvm", "fatorProdutoAno", fontes
  from asset_corporate_action_checks where symbol = 'SBSP3' and "anoBase" >= 2025;
select data, total, tesouraria from asset_share_counts where cnpj = '43.776.517/0001-80' and data >= '2025-12-31';

-- D1. Sequência de anos de lucro quebrada por ano 'ausente' (controladora_zero) e contada como 'calculado'
select "anoFiscal", escopo, "lucroLiquido", "lucroAtribuivel", flags from asset_fundamentals_period
 where "tipoPeriodo" = 'FY' and "emissorId" = '22.543.331/0001-00' and "anoFiscal" between 2022 and 2025 order by 1, 2;
select symbol, "cLucro", componentes->'lucro' from asset_scores where symbol in ('CXSE3','LREN3');
