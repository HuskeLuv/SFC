'use client';

import { useState } from 'react';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import { logger } from '@/lib/logger';
import { useUpdateSaudeConfig, type SaudeFinanceiraConfig } from '@/hooks/useSaudeFinanceira';

interface MetasConfigFormProps {
  config: SaudeFinanceiraConfig;
  defaults: SaudeFinanceiraConfig;
  onClose: () => void;
}

/**
 * Personalização dos parâmetros da metodologia. O fator do patrimônio ideal
 * é digitado em % (10 = 10%) e convertido pra fração no payload.
 */
export default function MetasConfigForm({ config, defaults, onClose }: MetasConfigFormProps) {
  const [multReserva, setMultReserva] = useState(String(config.multReserva));
  const [multSeguranca, setMultSeguranca] = useState(String(config.multSeguranca));
  const [fatorIdealPct, setFatorIdealPct] = useState(String(config.fatorIdeal * 100));
  const [coberturaMinima, setCoberturaMinima] = useState(String(config.coberturaMinimaMeses));
  const [error, setError] = useState<string | null>(null);

  const updateConfig = useUpdateSaudeConfig();

  const parse = (raw: string) => Number(raw.replace(',', '.'));

  const handleSave = async (values?: SaudeFinanceiraConfig) => {
    setError(null);
    const payload = values ?? {
      multReserva: parse(multReserva),
      multSeguranca: parse(multSeguranca),
      fatorIdeal: parse(fatorIdealPct) / 100,
      coberturaMinimaMeses: parse(coberturaMinima),
    };
    if (Object.values(payload).some((v) => !Number.isFinite(v) || v <= 0)) {
      setError('Preencha todos os campos com valores positivos.');
      return;
    }
    try {
      await updateConfig.mutateAsync(payload);
      onClose();
    } catch (err) {
      logger.error('Erro ao salvar configuração de metas:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuração.');
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800 print:hidden">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Personalizar metas</h4>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Ajuste os parâmetros à sua realidade — ex.: renda volátil pede reserva maior que 3×.
      </p>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="cfg-reserva">Reserva de emergência (× gasto)</Label>
          <Input
            id="cfg-reserva"
            type="number"
            value={multReserva}
            onChange={(e) => setMultReserva(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cfg-seguranca">Patrimônio de segurança (× gasto)</Label>
          <Input
            id="cfg-seguranca"
            type="number"
            value={multSeguranca}
            onChange={(e) => setMultSeguranca(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cfg-ideal">Patrimônio ideal (% × renda anual × idade)</Label>
          <Input
            id="cfg-ideal"
            type="number"
            value={fatorIdealPct}
            onChange={(e) => setFatorIdealPct(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cfg-cobertura">Cobertura mínima p/ Equilibrado (meses)</Label>
          <Input
            id="cfg-cobertura"
            type="number"
            value={coberturaMinima}
            onChange={(e) => setCoberturaMinima(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => handleSave()} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleSave(defaults)}
          disabled={updateConfig.isPending}
        >
          Restaurar padrão
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} disabled={updateConfig.isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
