'use client';

import { logger } from '@/lib/logger';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AutocompleteInput from '@/components/form/AutocompleteInput';
import { AutocompleteOption } from '@/types/wizard';
import { rotuloCnpj } from '@/lib/instituicoes/cnpj';
import { rotuloTipoInstituicao } from '@/lib/instituicoes/rotuloTipo';

export type InstitutionResponseShape = 'institutions' | 'instituicoes';

/**
 * Instituição escolhida. cnpj/cnpjCalculado/tipoBacen vêm só quando a resposta da API os traz
 * (shape 'institutions'); quem desestrutura {id, nome} continua funcionando.
 */
export interface InstitutionPickerValue {
  id: string;
  nome: string;
  cnpj?: string | null;
  cnpjCalculado?: boolean;
  tipoBacen?: string | null;
}

export interface InstitutionPickerProps {
  selectedId: string;
  selectedName: string;
  onChange: (institution: InstitutionPickerValue) => void;
  error?: string;
  onErrorClear?: () => void;
  endpoint: string | null;
  responseShape?: InstitutionResponseShape;
  label?: string;
  placeholder?: string;
  emptyEndpointMessage?: string;
  showSelectedSummary?: boolean;
  showHint?: boolean;
  /** id do input (padrão 'instituicao'); use outro quando houver dois pickers na tela. */
  inputId?: string;
  /** Mensagem quando a busca não acha nada (repassada ao AutocompleteInput). */
  emptyMessage?: React.ReactNode;
}

type RawInstitution = {
  id?: string;
  value?: string;
  nome?: string;
  label?: string;
  codigo?: string;
  cnpj?: string | null;
  cnpjCalculado?: boolean;
  tipoBacen?: string | null;
};

/** 'Banco · CNPJ 33.264.668' — nunca o codigo (texto técnico como 'BCB-33264668'). */
function subtituloInstituicao(raw: RawInstitution): string | undefined {
  const partes = [
    rotuloTipoInstituicao(raw.tipoBacen),
    rotuloCnpj({ cnpj: raw.cnpj, cnpjCalculado: raw.cnpjCalculado }),
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : undefined;
}

function mapInstitution(raw: RawInstitution, shape: InstitutionResponseShape): AutocompleteOption {
  if (shape === 'institutions') {
    return {
      value: String(raw.id ?? raw.value ?? ''),
      label: String(raw.nome ?? raw.label ?? ''),
      subtitle: subtituloInstituicao(raw),
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
  inputId = 'instituicao',
  emptyMessage,
}: InstitutionPickerProps) {
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Resposta crua por id, para devolver cnpj/tipoBacen no onChange. */
  const rawByIdRef = useRef<Map<string, RawInstitution>>(new Map());

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

        const rawById = new Map<string, RawInstitution>();
        const mapped = rawList
          .map((raw) => {
            const opt = mapInstitution(raw, responseShape);
            if (opt.value) rawById.set(opt.value, raw);
            return opt;
          })
          .filter((opt) => opt.value && opt.label);

        rawByIdRef.current = rawById;
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
    const raw = rawByIdRef.current.get(option.value);
    const value: InstitutionPickerValue = { id: option.value, nome: option.label };
    if (raw && 'cnpj' in raw) value.cnpj = raw.cnpj ?? null;
    if (raw && 'cnpjCalculado' in raw) value.cnpjCalculado = !!raw.cnpjCalculado;
    if (raw && 'tipoBacen' in raw) value.tipoBacen = raw.tipoBacen ?? null;
    onChange(value);
    if (onErrorClear) onErrorClear();
  };

  return (
    <div className="space-y-6">
      <AutocompleteInput
        id={inputId}
        label={label}
        placeholder={placeholder}
        value={selectedName}
        onChange={handleInputChange}
        onSelect={handleOptionSelect}
        options={options}
        loading={loading}
        error={!!error}
        hint={error}
        emptyMessage={emptyMessage}
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
