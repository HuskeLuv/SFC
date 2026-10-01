# Análise de Ativos — plano de execução (30/09/2026)

Base: `especificacao-v1.3.docx` (Pedro, 29/09) + `prototipo-pedro.html`. Porte: feature nova, várias telas,
decisões de produto e de compliance → **workflow completo por fase** (desenho → protótipo → pausa p/ aprovação
→ construção fatiada → 4 QAs → corretor → reverificação → PR). Exceção: a Fase A (spike de dados) é fluxo direto.

## 1. Diagnóstico — o que já temos × o que a spec pede

| Peça da spec | Situação no app hoje |
| --- | --- |
| Cotações B3 diárias | ✅ `Asset.currentPrice` + `AssetPriceHistory` (BRAPI pago, só fechamento; sem volume) |
| Proventos, splits | ✅ `AssetDividendHistory`, `AssetCorporateAction`, fila `MarketDataCoverage` |
| **Fundamentos 10 anos (ações)** | ❌ só `AssetFundamentals` (P/L, beta, DY do momento, sem histórico). Nada de DFP/ITR, balanço, DRE, fluxo |
| **FIIs estruturados** (VP/cota, cotistas, vacância, nº imóveis) | ❌ nada (só cota diária de fundos via INF_DIARIO) |
| **Stocks / REITs** | ⚠️ só os que usuários cadastraram (`type=stock/reit`, USD, manual). Sem catálogo EUA, sem feed de preço EUA, sem EDGAR, sem FFO |
| Setor / segmento | ❌ `Asset` não tem setor/segmento/bolsa |
| Posição do usuário, alvo por classe | ✅ `Portfolio` + `itemValuation`; `AlocacaoConfig` (acoes/fiis/stocks/reits) |
| Agenda | ✅ fontes plugáveis (`services/calendario/fontes/*`); **sem fonte de resultados trimestrais** |
| Comunidade (teses, curtidas, denúncia, moderação) | ✅ reaproveitável — mas **desligada em prod aguardando advogados** |
| Planos Gold/Premium | ⚠️ `User.accessLevel` existe, sem billing; hoje só a Educação usa |
| Extração de PDF via Claude | ⚠️ SDK e wrapper existem (assistente), falta bloco de documento/PDF |
| Página "Análise" | ⚠️ colisão de nome: `/api/analises/*` já é analytics da carteira → usar `/analise-ativos` |

**Conclusão:** telas e regras são a parte fácil (o protótipo já tem a lógica). O projeto é, na verdade, um
**projeto de dados**: fundamentos históricos de 10 anos não existem no app, e são eles que alimentam Índice MF,
semáforo, Lucro 10 anos, Fundamentos, Valuation e Comparador.

## 2. Pontos em que a spec precisa de ajuste

1. **Fontes de dados.** Spec sugere bolsai/Fintz (pago) no MVP e internalizar CVM só na Fase 3. Como a CVM
   Dados Abertos (DFP/ITR desde 2010; Informe Mensal FII desde 2016; Informe Trimestral FII com imóveis) é
   grátis e é o que vira "fonte de verdade" de qualquer jeito, proposta: **CVM direto desde a Fundação**, BRAPI
   pago como complemento. Decidir depois do spike (Fase A).
2. **Stocks/REITs depois.** Exigem catálogo EUA novo, feed de preço EUA (pago: EODHD/FMP), EDGAR, e FFO/AFFO que
   **não está no XBRL** (só em suplementos → extração). Proposta: lançar com **Ações + FIIs**; EUA numa fase própria.
3. **Visual.** O protótipo traz tokens próprios (#2f80f6, navy #2b3a55, Albert Sans). Regra do app: **paleta My
   Finance (`brandColors.ts`) + TABLE_STYLES + componentes existentes + casca PWA**. O protótipo vale como
   referência de conteúdo/leiaute, não de cores.
4. **Ranking com m = 200 e mínimo de 200 votos.** Com a base atual, nenhum ativo entraria no ranking por meses.
   Os limiares já são configuráveis (`scoring_params`) — sugerir ao Pedro começar baixo (ex.: m = 20) ou lançar a
   nota da comunidade sem ordenação até haver volume.
5. **Peso 1,5× de holder.** Nossa carteira é declarada pelo usuário (manual); só vira "verificada" com Pluggy.
   Aceitar a carteira declarada no MVP (limite de 20 votos/dia e quarentena seguram abuso) — decisão do Pedro.
6. **Compliance.** Ranking, teses e comunidade pedem o mesmo parecer que segura a Comunidade hoje. Tudo que é
   opinião de usuário fica atrás de flag até o OK jurídico; a parte de dados (Quadro, Ativo, Comparador,
   Valuation) pode ir para beta fechado antes.
7. **Eventos de resultado.** Não há fonte de calendário de balanços hoje; a CVM (IPE) permite montar. Entra
   junto com os fundamentos.
8. **Planos.** Sem billing, a separação Gold/Premium vira só `accessLevel` + flags — suficiente para beta.

## 3. Fases propostas

| Fase | O quê | Trilha | Depende de |
| --- | --- | --- | --- |
| **A · Spike de dados** (2–3 dias) | Provar, com ~10 ações e ~10 FIIs reais: parser DFP/ITR (10 anos, nº de ações, setor via cad_cia_aberta), Informe Mensal/Trimestral FII, profundidade dos módulos de balanço da BRAPI paga. Relatório de cobertura + escolha de fontes | fluxo direto, sem tela | — |
| **0 · Fundação** | Modelos (`fundamentals_period`, `financial_statements`, `multiples_yearly`, `scores`, `scoring_params`, setor/segmento), jobs CVM (ações + FII) no cron do Lightsail com log/frescor, cálculo Índice MF + semáforo + fórmulas do Valuation (os 23 casos da §4.6 como testes), backfill dev→prod | workflow de construção (backend; sem pausa de desenho) | A; limiares validados pelo Pedro |
| **1 · Quadro + Página do ativo** (Ações + FIIs) | Quadro (filtros, ordenação, Resumo/Detalhado, Lucro 10 anos, Na carteira), página do ativo (semáforo, KPIs + carteira/Planejamento, Lucro × Cotação, dividendos, Fundamentos Essencial, Valuation Múltiplos, pares, eventos, card Educação), busca, tese privada, sidebar "NOVO", flag `ANALISE_HABILITADA` + beta por usuário, rodapé legal | **workflow completo** (desenho → PAUSA → construção) | 0 |
| **2 · Comparador + Raio-X + Cenários** | Comparador (tijolo/papel/misto, ★, mini-gráficos), Fundamentos Raio-X + CSV, Meus cenários (Bazin/Graham/Gordon/Meta de renda, salvar) | workflow completo | 1 |
| **3 · Comunidade da análise** | Voto + sentimento, ranking bayesiano diário, expiração 90d, anti-manipulação, teses públicas/riscos/denúncia (reusando a moderação da Comunidade) | workflow completo, atrás de flag | 1; **parecer jurídico** p/ ligar |
| **4 · Stocks + REITs** | Catálogo EUA, feed de preço EUA (contratar), EDGAR companyfacts, FFO/AFFO | workflow completo | escolha/contrato do provedor EUA |
| **5 · Profundidade** | Extração de PDFs (Claude) + fila de revisão no /admin, padrão construtivo, dados de papel, Salvos/listas, exportar PDF | workflow completo | curador(a) definido |

Ligação em prod: Fases 1–2 em **beta fechado** (flag + lista de usuários) com o rodapé legal; público só após o
parecer. Cada fase = 1 PR (ou poucos), merge do Wellington.

## 4. Decisões pedidas (com recomendação)

1. Ordem: **Ações + FIIs primeiro, Stocks/REITs na Fase 4** — recomendado.
2. Fontes: **CVM direto + BRAPI pago**, decisão final após o spike — recomendado (evita bolsai/Fintz agora).
3. Visual: **paleta e componentes do My Finance**, protótipo só como referência de conteúdo — recomendado.
4. Comunidade (voto/ranking/teses): **construir na Fase 3 atrás de flag, ligar após parecer** — recomendado.
5. Começar pelo **spike (Fase A)** agora — recomendado.

Para o Pedro validar antes da Fase 0: limiares da §4 (Índice MF e semáforo), m/mínimo de votos do ranking,
peso de holder com carteira declarada, quais classes em cada plano.
