-- Normalize cashflow group types to match the current enum/usage
UPDATE "CashflowGroup"
SET "type" = 'entrada'
WHERE LOWER("type") IN ('entradas', 'entrada');

UPDATE "CashflowGroup"
SET "type" = 'despesa'
WHERE LOWER("type") IN ('despesas', 'despesa');

UPDATE "CashflowGroup"
SET "type" = 'investimento'
WHERE LOWER("type") IN ('investimentos', 'investimento');

