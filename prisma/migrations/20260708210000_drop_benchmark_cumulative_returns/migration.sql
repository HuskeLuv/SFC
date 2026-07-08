-- Remove a tabela de benchmarks ingeridos de captura do Kinvo (série acumulada do
-- concorrente, sem rotina de atualização). A rota /api/analises/indices passa a
-- servir exclusivamente as fontes próprias: economic_indexes (BACEN) + IBOV do banco.
DROP TABLE IF EXISTS "benchmark_cumulative_returns";
