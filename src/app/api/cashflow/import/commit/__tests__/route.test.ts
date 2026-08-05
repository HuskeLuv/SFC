import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { buildFlcWorkbook } from '@/test/fixtures/flcWorkbook';
import type { CashflowGroup } from '@/types/cashflow';

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);
const mockGetMergedCashflowGroups = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockRecordChange = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMergedCashflowGroups,
}));
vi.mock('@/services/cashflow/import/executeFlcImportPlan', () => ({
  executeFlcImportPlan: mockExecute,
}));
vi.mock('@/services/changeHistory', () => ({ recordChange: mockRecordChange }));
vi.mock('@/utils/cashflowTemplates', () => ({
  // upgrade lazy de template: irrelevante aqui, a árvore é mockada
  ensureDependentesTemplate: vi.fn().mockResolvedValue(undefined),
}));
const mockRecomputeEvolucao = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: mockRecomputeEvolucao,
}));

const grupo = (id: string, name: string, type = 'despesa'): CashflowGroup => ({
  id,
  userId: 'user-123',
  name,
  type,
  parentId: null,
  orderIndex: 0,
  items: [],
  children: [],
});

const arvore = (): CashflowGroup[] => [
  grupo('g-habitacao', 'Habitação'),
  grupo('g-cc', 'Conta Corrente', 'saldo'),
];

const relatorioOk = {
  itensCriados: 2,
  celulasGravadas: 10,
  conflitosSobrescritos: 0,
  conflitosMantidos: 0,
  erros: [],
};

const createRequest = (fields: { file?: File; ano?: string; politicaConflito?: string }) => {
  const form = new FormData();
  if (fields.file) form.append('file', fields.file);
  if (fields.ano !== undefined) form.append('ano', fields.ano);
  if (fields.politicaConflito !== undefined)
    form.append('politicaConflito', fields.politicaConflito);
  return new NextRequest('http://localhost/api/cashflow/import/commit', {
    method: 'POST',
    body: form,
  });
};

const xlsxFile = () =>
  new File([new Uint8Array(buildFlcWorkbook())], 'flc.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

describe('POST /api/cashflow/import/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMergedCashflowGroups.mockResolvedValue(arvore());
    mockExecute.mockResolvedValue(relatorioOk);
  });

  it('recalcula o plano no servidor, executa e registra no histórico', async () => {
    const response = await POST(createRequest({ file: xlsxFile(), ano: '2026' }));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.relatorio).toEqual(relatorioOk);
    expect(body.groups).toHaveLength(2);
    // plano recalculado do arquivo + árvore atual, política default sobrescrever
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ grupos: expect.any(Array) }),
      'user-123',
      2026,
      'sobrescrever',
    );
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'fluxo-caixa',
        action: 'fluxo.importar-planilha',
        entityLabel: expect.stringContaining('flc.xlsx'),
      }),
    );
    // árvore buscada antes (map) e depois (resposta) da execução
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledTimes(2);
    // import grava o ano inteiro → snapshots da Evolução recomputados do ano
    expect(mockRecomputeEvolucao).toHaveBeenCalledWith('user-123', new Date(Date.UTC(2026, 0, 1)));
  });

  it('repassa politicaConflito=manter e rejeita valor inválido', async () => {
    await POST(createRequest({ file: xlsxFile(), ano: '2026', politicaConflito: 'manter' }));
    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), 'user-123', 2026, 'manter');

    const invalida = await POST(
      createRequest({ file: xlsxFile(), ano: '2026', politicaConflito: 'mesclar' }),
    );
    expect(invalida.status).toBe(400);
  });

  it('não registra histórico quando nada foi gravado', async () => {
    mockExecute.mockResolvedValue({ ...relatorioOk, itensCriados: 0, celulasGravadas: 0 });
    const response = await POST(createRequest({ file: xlsxFile(), ano: '2026' }));
    expect(response.status).toBe(200);
    expect(mockRecordChange).not.toHaveBeenCalled();
    expect(mockRecomputeEvolucao).not.toHaveBeenCalled();
  });

  it('success=false quando o relatório tem erros', async () => {
    mockExecute.mockResolvedValue({
      ...relatorioOk,
      erros: [{ label: 'Aluguel', erro: 'boom' }],
    });
    const response = await POST(createRequest({ file: xlsxFile(), ano: '2026' }));
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.relatorio.erros).toHaveLength(1);
  });

  it('valida multipart como o preview (sem arquivo → 400, sem execução)', async () => {
    const response = await POST(createRequest({ ano: '2026' }));
    expect(response.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
