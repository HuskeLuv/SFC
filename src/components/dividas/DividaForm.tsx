'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { logger } from '@/lib/logger';
import { aaToAm, amToAa } from '@/utils/rateConversion';
import {
  useCreateDivida,
  useUpdateDivida,
  type DividaDTO,
  type DividaCreatePayload,
  type DividaModalidade,
  type DividaSistema,
  type DividaIndexador,
  type DividaTipo,
} from '@/hooks/useDividas';
import {
  INDEXADOR_LABELS,
  SISTEMA_LABELS,
  TIPO_LABELS,
  TIPOS_FINANCIAMENTO,
  TIPOS_ROTATIVA,
  currentYearMonth,
} from './utils';

interface DividaFormProps {
  divida: DividaDTO | null; // null = criar
  onCancel: () => void;
  onSaved: (id: string) => void;
}

/**
 * Form de criar/editar dívida. Campos condicionais por modalidade
 * (financiamento tem cronograma; rotativa só saldo). A taxa aceita % ao mês
 * ou % ao ano — é sempre normalizada a.m. antes do POST (aaToAm), e o modo
 * digitado fica em taxaUnidadeEntrada pra reedição fiel.
 */
export default function DividaForm({ divida, onCancel, onSaved }: DividaFormProps) {
  const isEdit = divida !== null;
  const [modalidade, setModalidade] = useState<DividaModalidade>(
    divida?.modalidade ?? 'financiamento',
  );

  const [nome, setNome] = useState(divida?.nome ?? '');
  const [instituicao, setInstituicao] = useState(divida?.instituicao ?? '');
  const [tipo, setTipo] = useState<DividaTipo>(
    divida?.tipo ??
      (modalidade === 'financiamento' ? 'financiamento_imobiliario' : 'cartao_credito'),
  );
  const [notes, setNotes] = useState(divida?.notes ?? '');

  // ── Financiamento ──
  const [principal, setPrincipal] = useState(divida?.principal?.toString() ?? '');
  const [taxaUnidade, setTaxaUnidade] = useState<'am' | 'aa'>(divida?.taxaUnidadeEntrada ?? 'am');
  const [taxaPct, setTaxaPct] = useState(() => {
    if (divida?.taxaAm == null) return '';
    const decimal =
      (divida.taxaUnidadeEntrada === 'aa' ? amToAa(divida.taxaAm) : divida.taxaAm) * 100;
    return decimal.toFixed(4).replace(/\.?0+$/, '');
  });
  const [prazoMeses, setPrazoMeses] = useState(divida?.prazoMeses?.toString() ?? '');
  const [sistema, setSistema] = useState<DividaSistema>(divida?.sistema ?? 'PRICE');
  const [indexador, setIndexador] = useState<DividaIndexador>(divida?.indexador ?? 'PREFIXADO');
  const [primeiroVencimento, setPrimeiroVencimento] = useState(
    divida?.primeiroVencimento ?? currentYearMonth(),
  );

  // ── Rotativa ──
  const [saldoInicial, setSaldoInicial] = useState(divida?.saldoInicial?.toString() ?? '');
  const [dataSaldoInicial, setDataSaldoInicial] = useState(
    divida?.dataSaldoInicial ?? currentYearMonth(),
  );

  const [error, setError] = useState<string | null>(null);
  const createDivida = useCreateDivida();
  const updateDivida = useUpdateDivida();
  const saving = createDivida.isPending || updateDivida.isPending;

  const tiposDisponiveis = modalidade === 'financiamento' ? TIPOS_FINANCIAMENTO : TIPOS_ROTATIVA;

  // Taxa normalizada a.m. (decimal) a partir do que foi digitado.
  const taxaAmNormalizada = useMemo(() => {
    const pct = Number(taxaPct.replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0) return null;
    const decimal = pct / 100;
    return taxaUnidade === 'aa' ? aaToAm(decimal) : decimal;
  }, [taxaPct, taxaUnidade]);

  const handleSave = async () => {
    setError(null);
    if (!nome.trim()) {
      setError('Informe o nome da dívida.');
      return;
    }

    try {
      if (isEdit) {
        const payload =
          modalidade === 'financiamento'
            ? {
                nome: nome.trim(),
                instituicao: instituicao.trim() || null,
                tipo,
                notes: notes.trim() || null,
                principal: Number(principal),
                taxaAm: taxaAmNormalizada ?? 0,
                taxaUnidadeEntrada: taxaUnidade,
                prazoMeses: Number(prazoMeses),
                sistema,
                indexador,
                primeiroVencimento,
              }
            : {
                nome: nome.trim(),
                instituicao: instituicao.trim() || null,
                tipo,
                notes: notes.trim() || null,
                saldoInicial: Number(saldoInicial),
                dataSaldoInicial,
              };
        const updated = await updateDivida.mutateAsync({ id: divida.id, payload });
        onSaved(updated.id);
        return;
      }

      const payload: DividaCreatePayload =
        modalidade === 'financiamento'
          ? {
              modalidade: 'financiamento',
              nome: nome.trim(),
              instituicao: instituicao.trim() || null,
              tipo,
              notes: notes.trim() || null,
              principal: Number(principal),
              taxaAm: taxaAmNormalizada ?? 0,
              taxaUnidadeEntrada: taxaUnidade,
              prazoMeses: Number(prazoMeses),
              sistema,
              indexador,
              primeiroVencimento,
            }
          : {
              modalidade: 'rotativa',
              nome: nome.trim(),
              instituicao: instituicao.trim() || null,
              tipo,
              notes: notes.trim() || null,
              saldoInicial: Number(saldoInicial),
              dataSaldoInicial,
            };
      const created = await createDivida.mutateAsync(payload);
      onSaved(created.id);
    } catch (err) {
      logger.error('Erro ao salvar dívida:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar dívida.');
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white/90">
        {isEdit ? `Editar — ${divida.nome}` : 'Nova dívida'}
      </h3>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {/* Modalidade (só na criação) */}
      {!isEdit ? (
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
          {(
            [
              ['financiamento', 'Financiamento (SAC/Price)'],
              ['rotativa', 'Rotativa (cartão, cheque especial)'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setModalidade(value);
                setTipo(value === 'financiamento' ? 'financiamento_imobiliario' : 'cartao_credito');
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                modalidade === value
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              aria-pressed={modalidade === value}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="divida-nome">Nome</Label>
          <Input
            id="divida-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Financiamento do apartamento"
          />
        </div>
        <div>
          <Label htmlFor="divida-instituicao">Instituição (opcional)</Label>
          <Input
            id="divida-instituicao"
            value={instituicao}
            onChange={(e) => setInstituicao(e.target.value)}
            placeholder="Ex.: Caixa"
          />
        </div>
        <div>
          <Label htmlFor="divida-tipo">Tipo</Label>
          <Select
            id="divida-tipo"
            value={tipo}
            onChange={(v) => setTipo(v as DividaTipo)}
            options={tiposDisponiveis.map((t) => ({ value: t, label: TIPO_LABELS[t] }))}
          />
        </div>

        {modalidade === 'financiamento' ? (
          <>
            <div>
              <Label htmlFor="divida-principal">Valor financiado (R$)</Label>
              <Input
                id="divida-principal"
                type="number"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                min="0"
                step="1000"
              />
            </div>
            <div>
              <Label htmlFor="divida-taxa">Taxa de juros (%)</Label>
              <div className="flex gap-2">
                <Input
                  id="divida-taxa"
                  type="number"
                  value={taxaPct}
                  onChange={(e) => setTaxaPct(e.target.value)}
                  min="0"
                  step="0.01"
                  className="flex-1"
                />
                <div className="inline-flex shrink-0 rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
                  {(['am', 'aa'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setTaxaUnidade(u)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                        taxaUnidade === u
                          ? 'bg-brand-500 text-white'
                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                      aria-pressed={taxaUnidade === u}
                    >
                      {u === 'am' ? 'a.m.' : 'a.a.'}
                    </button>
                  ))}
                </div>
              </div>
              {taxaUnidade === 'aa' && taxaAmNormalizada != null && taxaAmNormalizada > 0 ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  ≈ {(taxaAmNormalizada * 100).toFixed(4)}% a.m.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="divida-prazo">Prazo (meses)</Label>
              <Input
                id="divida-prazo"
                type="number"
                value={prazoMeses}
                onChange={(e) => setPrazoMeses(e.target.value)}
                min="1"
                max="480"
                step="1"
              />
            </div>
            <div>
              <Label htmlFor="divida-sistema">Sistema de amortização</Label>
              <Select
                id="divida-sistema"
                value={sistema}
                onChange={(v) => setSistema(v as DividaSistema)}
                options={(['PRICE', 'SAC'] as const).map((s) => ({
                  value: s,
                  label: SISTEMA_LABELS[s],
                }))}
              />
            </div>
            <div>
              <Label htmlFor="divida-indexador">Indexador</Label>
              <Select
                id="divida-indexador"
                value={indexador}
                onChange={(v) => setIndexador(v as DividaIndexador)}
                options={(['PREFIXADO', 'TR', 'IPCA', 'CDI'] as const).map((i) => ({
                  value: i,
                  label: INDEXADOR_LABELS[i],
                }))}
              />
            </div>
            <div>
              <Label htmlFor="divida-vencimento">Primeiro vencimento</Label>
              <Input
                id="divida-vencimento"
                type="month"
                value={primeiroVencimento}
                onChange={(e) => setPrimeiroVencimento(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="divida-saldo">Saldo devedor atual (R$)</Label>
              <Input
                id="divida-saldo"
                type="number"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                min="0"
                step="100"
              />
            </div>
            <div>
              <Label htmlFor="divida-data-saldo">Data do saldo</Label>
              <Input
                id="divida-data-saldo"
                type="month"
                value={dataSaldoInicial}
                onChange={(e) => setDataSaldoInicial(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="divida-notes">Observações (opcional)</Label>
          <Input
            id="divida-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: contrato nº 1234"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel} size="sm" variant="outline">
          Cancelar
        </Button>
        <Button onClick={handleSave} size="sm" disabled={saving}>
          {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Cadastrar dívida'}
        </Button>
      </div>
    </div>
  );
}
