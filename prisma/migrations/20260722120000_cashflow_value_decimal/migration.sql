-- CashflowValue.value: double precision (Float) → numeric(15,2), alinhado ao
-- resto do schema monetário (carteira/renda-fixa já usam Decimal). Valores
-- existentes são arredondados a 2 casas — mesma precisão que a UI sempre exibiu.
ALTER TABLE "CashflowValue"
  ALTER COLUMN "value" TYPE DECIMAL(15, 2) USING ROUND("value"::numeric, 2);
