'use client';

import { logger } from '@/lib/logger';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AutocompleteInput from '@/components/form/AutocompleteInput';
import { AutocompleteOption } from '@/types/wizard';

export type InstitutionResponseShape = 'institutions' | 'instituicoes';

export interface InstitutionPickerProps {
  selectedId: string;
  selectedName: string;
  onChange: (institution: { id: string; nome: string }) => void;
  error?: string;
  onErrorClear?: () => void;
  endpoint: string | null;
  responseShape?: InstitutionResponseShape;
  label?: string;
  placeholder?: string;
  emptyEndpointMessage?: string;
  showSelectedSummary?: boolean;
  showHint?: boolean;
}

type RawInstitution = {
  id?: string;
  value?: string;
  nome?: string;
  label?: string;
  codigo?: string;
};

function mapInstitution(raw: RawInstitution, shape: InstitutionResponseShape): AutocompleteOption {
  if (shape === 'institutions') {
    return {
      value: String(raw.id ?? raw.value ?? ''),
      label: String(raw.nome ?? raw.label ?? ''),
      subtitle: raw.codigo,
    };
  }
  return {
    value: String(raw.value ?? raw.id ?? ''),
    label: String(raw.label ?? raw.nome ?? ''),
  };
}

export default function InstitutionPicker({
  selectedId,
  selectedName,
  onChange,
  error,
  onErrorClear,
  endpoint,
  responseShape = 'institutions',
  label = 'Instituição Financeira *',
  placeholder = 'Digite o nome da instituição (ex: Itaú, XP)',
  emptyEndpointMessage,
  showSelectedSummary = false,
  showHint = false,
}: InstitutionPickerProps) {
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchInstitutions = useCallback(
    async (search: string, signal: AbortSignal) => {
      if (!endpoint) {
        setOptions([]);
        return;
      }

      if (search.length > 0 && search.length < 2) return;

      setLoading(true);
      try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${endpoint}${separator}search=${encodeURIComponent(search)}&limit=200`;

        const response = await fetch(url, { credentials: 'include', signal });
        if (!response.ok) return;

        const data = await response.json().catch(() => null);
        if (!data) return;

        const rawList: RawInstitution[] =
          responseShape === 'institutions' ? data.institutions || [] : data.instituicoes || [];

        const mapped = rawList
          .map((raw) => mapInstitution(raw, responseShape))
          .filter((opt) => opt.value && opt.label);

        setOptions(mapped);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        logger.error('Erro ao buscar instituições:', err);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [endpoint, responseShape],
  );

  useEffect(() => {
    if (!endpoint) {
      setOptions([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const delay = selectedName ? 250 : 0;
    const timer = setTimeout(() => {
      fetchInstitutions(selectedName, controller.signal);
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, fetchInstitutions, selectedName]);

  const handleInputChange = (value: string) => {
    onChange({ id: value === selectedName ? selectedId : '', nome: value });
    if (error && onErrorClear) onErrorClear();
  };

  const handleOptionSelect = (option: AutocompleteOption) => {
    onChange({ id: option.value, nome: option.label });
    if (onErrorClear) onErrorClear();
  };

  return (
    <div className="space-y-6">
      <AutocompleteInput
        id="instituicao"
        label={label}
        placeholder={placeholder}
        value={selectedName}
        onChange={handleInputChange}
        onSelect={handleOptionSelect}
        options={options}
        loading={loading}
        error={!!error}
        hint={error}
      />

      {!endpoint && emptyEndpointMessage && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-100">
          {emptyEndpointMessage}
        </div>
      )}

      {showHint && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Dica</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Digite pelo menos 2 caracteres para buscar instituições. Você pode procurar por:
          </p>
          <ul className="text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1">
            <li>• Nome da instituição (ex: &quot;Itaú&quot;, &quot;Bradesco&quot;)</li>
            <li>• Tipo de instituição (ex: &quot;banco&quot;, &quot;corretora&quot;)</li>
            <li>• Nome da corretora (ex: &quot;XP&quot;, &quot;Rico&quot;, &quot;Clear&quot;)</li>
          </ul>
        </div>
      )}

      {showSelectedSummary && selectedId && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            Instituição Selecionada
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">{selectedName}</p>
        </div>
      )}
    </div>
  );
}
