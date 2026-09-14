import type { BankAccount, BankConnection, BankTransaction } from '@prisma/client';

export interface BankAccountDTO {
  id: string;
  connectionId: string;
  providerAccountId: string;
  type: string;
  subtype: string | null;
  name: string;
  number: string | null;
  currencyCode: string;
  balance: number;
  balanceAt: string | null;
  creditLimit: number | null;
  creditAvailable: number | null;
  creditBrand: string | null;
  creditDueDate: string | null;
  creditClosingDate: string | null;
  ativa: boolean;
}

export interface BankConnectionDTO {
  id: string;
  provider: string;
  providerItemId: string;
  connectorId: number;
  connectorName: string;
  connectorImageUrl: string | null;
  isOpenFinance: boolean;
  isSandbox: boolean;
  status: string;
  executionStatus: string | null;
  errorMessage: string | null;
  consentExpiresAt: string | null;
  providerUpdatedAt: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastManualUpdateAt: string | null;
  createdAt: string;
  accounts: BankAccountDTO[];
}

export interface BankTransactionDTO {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  status: string;
  currencyCode: string;
  providerCategory: string | null;
  merchantName: string | null;
  paymentMethod: string | null;
  counterpartName: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  ignorada: boolean;
  cashflowItemId: string | null;
  appliedAt: string | null;
  duplicadaDe: string | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const num = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v));

export function serializeAccount(a: BankAccount): BankAccountDTO {
  return {
    id: a.id,
    connectionId: a.connectionId,
    providerAccountId: a.providerAccountId,
    type: a.type,
    subtype: a.subtype,
    name: a.name,
    number: a.number,
    currencyCode: a.currencyCode,
    balance: Number(a.balance),
    balanceAt: iso(a.balanceAt),
    creditLimit: num(a.creditLimit),
    creditAvailable: num(a.creditAvailable),
    creditBrand: a.creditBrand,
    creditDueDate: iso(a.creditDueDate),
    creditClosingDate: iso(a.creditClosingDate),
    ativa: a.ativa,
  };
}

export function serializeConnection(
  c: BankConnection & { accounts?: BankAccount[] },
): BankConnectionDTO {
  return {
    id: c.id,
    provider: c.provider,
    providerItemId: c.providerItemId,
    connectorId: c.connectorId,
    connectorName: c.connectorName,
    connectorImageUrl: c.connectorImageUrl,
    isOpenFinance: c.isOpenFinance,
    isSandbox: c.isSandbox,
    status: c.status,
    executionStatus: c.executionStatus,
    errorMessage: c.errorMessage,
    consentExpiresAt: iso(c.consentExpiresAt),
    providerUpdatedAt: iso(c.providerUpdatedAt),
    lastSyncAt: iso(c.lastSyncAt),
    lastSyncError: c.lastSyncError,
    lastManualUpdateAt: iso(c.lastManualUpdateAt),
    createdAt: c.createdAt.toISOString(),
    accounts: (c.accounts ?? []).map(serializeAccount),
  };
}

export function serializeTransaction(t: BankTransaction): BankTransactionDTO {
  return {
    id: t.id,
    accountId: t.accountId,
    date: t.date.toISOString(),
    description: t.description,
    amount: Number(t.amount),
    type: t.type,
    status: t.status,
    currencyCode: t.currencyCode,
    providerCategory: t.providerCategory,
    merchantName: t.merchantName,
    paymentMethod: t.paymentMethod,
    counterpartName: t.counterpartName,
    installmentNumber: t.installmentNumber,
    installmentTotal: t.installmentTotal,
    ignorada: t.ignorada,
    cashflowItemId: t.cashflowItemId,
    appliedAt: iso(t.appliedAt),
    duplicadaDe: t.duplicadaDe,
  };
}
