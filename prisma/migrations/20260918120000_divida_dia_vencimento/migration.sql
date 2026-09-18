-- Dia do mês do vencimento da dívida (1..31), usado pela Agenda para posicionar
-- a parcela do financiamento e a fatura da rotativa. NULL = não informado.
ALTER TABLE "dividas" ADD COLUMN IF NOT EXISTS "diaVencimento" INTEGER;
