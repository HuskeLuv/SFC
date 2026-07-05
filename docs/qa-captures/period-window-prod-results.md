# QA — Janelas de período alinhadas ao mês-calendário (prod)

Endpoint: `GET /api/analises/rentabilidade-janelas` em https://appmyfinance.com.br
Conta QA: `qa.teste@appmyfinance.com.br` · asOf do servidor: **2026-06-08** · 1º ponto da série: 2023-01-16
Script: `scripts/qa-prod-period-window.ts`

## Antes (baseline, comportamento rolante dia-a-dia) — commit c8223ce

| Janela | fromDate | Esperado (alinhado) | Resultado |
| --- | --- | --- | --- |
| in12Months | 2025-06-08 | 2025-07-01 | ✗ rolante |
| in24Months | 2024-06-08 | 2024-07-01 | ✗ rolante |
| in36Months | 2023-06-08 | 2023-07-01 | ✗ rolante |
| inTheMonth | 2026-06-01 | 2026-06-01 | ✓ |
| inTheYear | 2026-01-01 | 2026-01-01 | ✓ |

**Relatório: 3 PASS, 0 WARN, 9 FAIL** (raw: `period-window-prod-BEFORE.txt`)

## Deploy

- Commits: `56a223b` (front+helper), `8e4aa03` (back), `6d75041` (qa)
- Deploy prod via AWS SSM na EC2 `i-09099b2b041adcdb6` (sa-east-1) — clone main + npm ci + `prisma migrate deploy` (no-op, sem migration nova) + build + `systemctl restart myfinance`. CommandId `09d7a006-455e-49bf-8d36-1426259ea035`, Status Success, health `ok`.
- HEAD em prod após deploy: `6d75041`.

## Depois (alinhado ao mês-calendário, estilo Kinvo) — commit 6d75041

| Janela | fromDate | Esperado (alinhado) | Resultado |
| --- | --- | --- | --- |
| in12Months | **2025-07-01** | 2025-07-01 | ✓ dia 1º |
| in24Months | **2024-07-01** | 2024-07-01 | ✓ dia 1º (= 01/07/2024 do Kinvo) |
| in36Months | **2023-07-01** | 2023-07-01 | ✓ dia 1º |
| inTheMonth | 2026-06-01 | 2026-06-01 | ✓ |
| inTheYear | 2026-01-01 | 2026-01-01 | ✓ |

**Relatório: 12 PASS, 0 WARN, 0 FAIL** (raw: `period-window-prod-AFTER.txt`)

## Conclusão

`in24Months` saiu de **2024-06-08** (rolante) para **2024-07-01** (mês-alinhado), batendo
exatamente com o **01/07/2024** que o Kinvo mostra para "últimos 24 meses". Guarda de
regressão ativa: o teste falha se qualquer janela voltar à data rolante dia-exato.
