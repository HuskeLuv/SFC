'use client';

import { useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
import { Portuguese } from 'flatpickr/dist/l10n/pt';
import Label from './Label';
import { CalenderIcon } from '../../icons';
import Hook = flatpickr.Options.Hook;
import DateOption = flatpickr.Options.DateOption;

type PropsType = {
  id: string;
  mode?: 'single' | 'multiple' | 'range' | 'time';
  onChange?: Hook | Hook[];
  defaultDate?: DateOption;
  label?: string;
  placeholder?: string;
  staticPosition?: boolean;
  appendToBody?: boolean;
};

/**
 * Serializes a flatpickr `DateOption` into a stable string for shallow
 * comparison. Used to avoid re-initializing the flatpickr instance every
 * render when callers pass a fresh `new Date(...)` reference each time
 * (bug F1.3: filtros de proventos fechavam ao clicar em outros controles
 * porque o DatePicker era destruído e recriado em todo render do pai).
 */
const serializeDefaultDate = (value: DateOption | DateOption[] | undefined): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((v) => serializeDefaultDate(v)).join('|');
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export default function DatePicker({
  id,
  mode,
  onChange,
  label,
  defaultDate,
  placeholder,
  staticPosition = true,
  appendToBody = false,
}: PropsType) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Mantém a última versão do onChange num ref para que o flatpickr
  // sempre dispare o callback atual sem precisar ser recriado quando o
  // pai passa uma função inline (referência nova a cada render).
  const onChangeRef = useRef<PropsType['onChange']>(onChange);
  const instanceRef = useRef<flatpickr.Instance | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }

    const handleChange: Hook = (selectedDates, dateStr, instance) => {
      const current = onChangeRef.current;
      if (!current) return;
      if (Array.isArray(current)) {
        current.forEach((cb) => cb(selectedDates, dateStr, instance));
      } else {
        current(selectedDates, dateStr, instance);
      }
    };

    const flatPickr = flatpickr(inputRef.current, {
      mode: mode || 'single',
      static: staticPosition,
      monthSelectorType: 'static',
      dateFormat: 'Y-m-d',
      allowInput: true,
      clickOpens: true,
      disableMobile: true,
      locale: Portuguese,
      defaultDate,
      onChange: handleChange,
      ...(appendToBody ? { appendTo: document.body } : {}),
    });

    if (!Array.isArray(flatPickr)) {
      instanceRef.current = flatPickr;
    }

    return () => {
      instanceRef.current = null;
      if (!Array.isArray(flatPickr)) {
        flatPickr.destroy();
      }
    };
    // Intencionalmente NÃO listamos `onChange` nem `defaultDate` aqui:
    // - `onChange` é acessado via ref (sempre o mais recente).
    // - `defaultDate` é sincronizado no efeito abaixo via `setDate()`,
    //   sem destruir a instância (que fecharia o popover aberto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, staticPosition, appendToBody]);

  // Sincroniza mudanças de `defaultDate` sem destruir o flatpickr — só
  // chama `setDate` quando o valor serializado de fato muda.
  const lastDefaultDateRef = useRef<string>(serializeDefaultDate(defaultDate));
  useEffect(() => {
    const serialized = serializeDefaultDate(defaultDate);
    if (serialized === lastDefaultDateRef.current) return;
    lastDefaultDateRef.current = serialized;
    const instance = instanceRef.current;
    if (!instance) return;
    if (defaultDate === undefined || defaultDate === null || serialized === '') {
      instance.clear(false);
    } else {
      instance.setDate(defaultDate, false);
    }
  }, [defaultDate]);

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          placeholder={placeholder}
          className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3  dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30  bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700  dark:focus:border-brand-800"
        />

        <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
          <CalenderIcon className="size-6" />
        </span>
      </div>
    </div>
  );
}
