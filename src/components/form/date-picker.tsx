'use client';

import { useEffect, useRef, useState } from 'react';
import flatpickr from 'flatpickr';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
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
  /** Limite superior de data. Prefira strings estáveis ('today') — um `new
   *  Date()` novo a cada render re-inicializaria o flatpickr (bug F1.3). */
  maxDate?: DateOption;
  /**
   * PWA fase 1: abaixo de lg, troca o flatpickr pelo `<input type="date">` do sistema (calendário
   * nativo do celular). O onChange recebe o MESMO formato do flatpickr: `[Date meia-noite local]`
   * e a string 'Y-m-d'. Só vale no modo 'single'; a partir de lg nada muda.
   */
  nativeOnMobile?: boolean;
};

const DATE_INPUT_CLASS =
  'h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3  dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30  bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700  dark:focus:border-brand-800';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD' pelo calendário LOCAL (o mesmo dia que o flatpickr mostra). */
const localIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** `DateOption` → valor do `<input type="date">` ('' quando não dá para representar). */
export const dateOptionToInputValue = (value: DateOption | undefined): string => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? localIso(value) : '';
  if (typeof value === 'number') return localIso(new Date(value));
  if (value === 'today') return localIso(new Date());
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

/** 'YYYY-MM-DD' → Date à meia-noite LOCAL (igual ao que o flatpickr entrega), ou null. */
export const inputValueToLocalDate = (iso: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(date.getTime()) ? date : null;
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

export default function DatePicker(props: PropsType) {
  const isBelowLg = useIsBelowLg();
  const single = !props.mode || props.mode === 'single';
  if (props.nativeOnMobile && single && isBelowLg) return <NativeDatePicker {...props} />;
  return <FlatpickrDatePicker {...props} />;
}

/** Calendário do sistema (celular). Mesma assinatura de onChange do flatpickr. */
function NativeDatePicker({ id, onChange, label, defaultDate, placeholder, maxDate }: PropsType) {
  const serialized = serializeDefaultDate(defaultDate);
  const [value, setValue] = useState(() => dateOptionToInputValue(defaultDate));
  const lastSerializedRef = useRef(serialized);

  // O pai controla o valor pelo defaultDate (ex.: o BusinessDayDatePicker corrige feriado).
  useEffect(() => {
    if (serialized === lastSerializedRef.current) return;
    lastSerializedRef.current = serialized;
    setValue(dateOptionToInputValue(defaultDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  const emit = (dates: Date[], iso: string) => {
    if (!onChange) return;
    // Sem instância do flatpickr: nenhum consumidor usa o 3º argumento.
    const instance = null as unknown as flatpickr.Instance;
    if (Array.isArray(onChange)) onChange.forEach((cb) => cb(dates, iso, instance));
    else onChange(dates, iso, instance);
  };

  const max = maxDate !== undefined ? dateOptionToInputValue(maxDate) || undefined : undefined;

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <input
        id={id}
        type="date"
        value={value}
        max={max}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (!next) {
            emit([], '');
            return;
          }
          const date = inputValueToLocalDate(next);
          if (date) emit([date], next);
        }}
        className={`${DATE_INPUT_CLASS} block min-w-0 max-lg:h-12 max-lg:rounded-xl max-lg:text-base`}
      />
    </div>
  );
}

function FlatpickrDatePicker({
  id,
  mode,
  onChange,
  label,
  defaultDate,
  placeholder,
  staticPosition = true,
  appendToBody = false,
  maxDate,
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
      ...(maxDate !== undefined ? { maxDate } : {}),
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
  }, [mode, staticPosition, appendToBody, maxDate]);

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
        <input id={id} ref={inputRef} placeholder={placeholder} className={DATE_INPUT_CLASS} />

        <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
          <CalenderIcon className="size-6" />
        </span>
      </div>
    </div>
  );
}
