'use client';
import React, { useEffect, useState } from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import { useCarteiraResumoContextOptional } from '@/context/CarteiraResumoContext';
import { formatBRL, formatUSD } from '@/utils/format';
import { logger } from '@/lib/logger';

/** Câmbio com até 4 casas ("5,1111"): com 2 casas a conta exibida não fecha. */
const formatCotacao = (value: number): string =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Câmbio nunca tem milhar: vírgula OU ponto é o decimal ("5,1111" e "5.1111"
 * → 5,1111). parseCurrencyInput leria "5.1111" como 51.111.
 */
const parseCotacao = (texto: string): number | undefined => {
  const limpo = texto
    .trim()
    .replace(/[^\d.,]/g, '')
    .replace(',', '.');
  if (!limpo || (limpo.match(/\./g) ?? []).length > 1) return undefined;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor > 0 ? valor : undefined;
};

interface CreditarCaixaFieldProps {
  /** Valor do resgate (na moeda do ativo). */
  valor: number;
  /** Moeda do ativo — reais credita direto; dólar converte pela cotação do câmbio. */
  moeda: string;
  checked: boolean | undefined;
  onChange: (value: boolean) => void;
  /** Reinvestimento vai direto pra outro ativo: não passa pelo caixa. */
  isReinvestimento?: boolean;
  /** Ativo em dólar: cotação do câmbio (R$ por US$). Preenchida com a cotação atual. */
  cotacaoMoeda?: number;
  onCotacaoMoedaChange?: (value: number | undefined) => void;
}

/**
 * Resgate → Caixa para Investir (17/09/2026): o valor volta ao bolso total
 * como caixa LIVRE. Ligado por padrão. Não mexe no Fluxo de Caixa.
 * Desde 21/09/2026 vale também para ativo em dólar: o crédito entra em reais
 * pela cotação do câmbio (mesma regra da compra de stock/REIT).
 */
export default function CreditarCaixaField({
  valor,
  moeda,
  checked,
  onChange,
  isReinvestimento = false,
  cotacaoMoeda,
  onCotacaoMoedaChange,
}: CreditarCaixaFieldProps) {
  const caixa = useCarteiraResumoContextOptional()?.resumo?.caixa ?? null;
  const moedaAtivo = moeda || 'BRL';
  const emDolar = moedaAtivo === 'USD' && !!onCotacaoMoedaChange;
  const suportada = moedaAtivo === 'BRL' || emDolar;
  const visivel = !isReinvestimento && valor > 0 && suportada;
  const [cotacaoTexto, setCotacaoTexto] = useState(cotacaoMoeda ? formatCotacao(cotacaoMoeda) : '');

  useEffect(() => {
    if (visivel && checked === undefined) onChange(true);
  }, [visivel, checked, onChange]);

  // Sugere a cotação atual do dólar (mesma fonte do card "Dólar Comercial").
  useEffect(() => {
    if (!visivel || !emDolar || cotacaoMoeda !== undefined) return;
    let ativo = true;
    fetch('/api/analises/indicadores', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { indicators?: { dolar?: { price?: number | null } } } | null) => {
        const price = data?.indicators?.dolar?.price;
        if (ativo && price && price > 0) {
          const arredondado = Math.round(price * 10000) / 10000;
          setCotacaoTexto(formatCotacao(arredondado));
          onCotacaoMoedaChange?.(arredondado);
        }
      })
      .catch((err: unknown) => logger.error('Erro ao buscar cotação do dólar:', err));
    return () => {
      ativo = false;
    };
    // Só na primeira exibição: depois o usuário manda na cotação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, emDolar]);

  if (!isReinvestimento && valor > 0 && !suportada) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Resgate em moeda estrangeira não volta automaticamente ao Caixa para Investir. Se quiser,
        ajuste o caixa na Carteira Consolidada.
      </p>
    );
  }
  if (!visivel) return null;

  const ligado = checked === true;
  const valorEmReais = emDolar ? (cotacaoMoeda ? valor * cotacaoMoeda : null) : valor;

  let detalhe: string;
  if (!ligado) {
    detalhe = 'O caixa não será alterado.';
  } else if (valorEmReais === null) {
    detalhe = 'Informe a cotação do dólar para converter o valor em reais.';
  } else {
    detalhe =
      (emDolar
        ? `${formatUSD(valor)} × R$ ${formatCotacao(cotacaoMoeda!)} = ${formatBRL(valorEmReais)}`
        : formatBRL(valorEmReais)) +
      ' voltam como caixa livre' +
      (caixa ? `. O caixa total fica em ${formatBRL(caixa.total + valorEmReais)}.` : '.');
  }

  return (
    <div className="rounded-lg border border-[#0079F2]/30 bg-[#0079F2]/5 p-3 dark:border-[#80BCF8]/30 dark:bg-[#0079F2]/10">
      <div className="flex items-start gap-2">
        <input
          id="creditarCaixa"
          type="checkbox"
          checked={ligado}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <Label htmlFor="creditarCaixa" className="text-[#314666] dark:text-blue-100">
            Devolver ao Caixa para Investir
          </Label>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">{detalhe}</p>
          {ligado && emDolar && (
            <div className="mt-2 max-w-xs">
              <Label htmlFor="cotacaoMoedaResgate" className="text-xs">
                Cotação do dólar no câmbio (R$)
              </Label>
              <Input
                id="cotacaoMoedaResgate"
                type="text"
                inputMode="decimal"
                value={cotacaoTexto}
                onChange={(e) => {
                  setCotacaoTexto(e.target.value);
                  onCotacaoMoedaChange?.(parseCotacao(e.target.value));
                }}
                placeholder="Ex.: 5,40"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
