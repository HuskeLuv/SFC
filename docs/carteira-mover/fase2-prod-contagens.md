# Fase 2 — contagens read-only em PROD (02/10/2026)

- (a) posições `cash`: **0**. A correção da duplicação RF × Reserva de Oportunidade não afeta ninguém hoje.
- (b) Tesouro de catálogo com `tesouroDestino`: 5 só `renda-fixa-hibrida`, 2 só `renda-fixa-prefixada`, 1 só `reserva-oportunidade` e **1 posição com destinos MISTOS** (`reserva-emergencia` + `reserva-oportunidade`). A aba base determinística (1ª compra por data) importa para essa posição.
- (c) Reservas: emergency 12 com FI e 1 sem FI; opportunity 1 com FI e 1 sem FI. Os 13 FIs de reserva têm indexer CDI e nenhum tem `tesouroBondType`.
- (d) RF legacy (`bond` sem FI): 0.
- (e) Overrides da fase 1 em prod: 0.
- (f) FIs de RF: CDB_PRE/CDI 11, CDB_HIB/IPCA 8 (4 Tesouro IPCA+, 1 Renda+), CDB_PRE/PRE 3 (2 Tesouro Prefixado c/ juros), Tesouro Selic 2 (CDB_PRE/CDI), CRI_HIB 2, LCI 2. **IPCA+ hoje = Híbrida** (o tipo `_HIB` vale antes do indexador). "Manter como hoje" = Híbrida.
