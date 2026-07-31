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

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMergedCashflowGroups,
}));

const grupo = (
  id: string,
  name: string,
  type: string,
  children: CashflowGroup[] = [],
): CashflowGroup => ({
  id,
  userId: 'user-123',
  name,
  type,
  parentId: null,
  orderIndex: 0,
  items: [],
  children,
});

/** árvore mínima: só os grupos estruturais, sem itens */
const arvore = (): CashflowGroup[] => [
  grupo('g-entradas', 'Entradas', 'entrada', [
    grupo('g-ent-fixas', 'Entradas Fixas', 'entrada'),
    grupo('g-ent-var', 'Entradas Variáveis', 'entrada', [
      grupo('g-sem-trib', 'Sem Tributação', 'entrada'),
      grupo('g-com-trib', 'Com Tributação', 'entrada'),
    ]),
  ]),
  grupo('g-despesas', 'Despesas', 'despesa', [
    grupo('g-desp-fixas', 'Despesas Fixas', 'despesa', [
      grupo('g-habitacao', 'Habitação', 'despesa'),
      grupo('g-transporte', 'Transporte', 'despesa'),
      grupo('g-saude', 'Saúde', 'despesa'),
      grupo('g-desp-pessoais', 'Despesas Pessoais', 'despesa'),
      grupo('g-lazer', 'Lazer', 'despesa'),
      grupo('g-educacao', 'Educação', 'despesa'),
      grupo('g-animais', 'Animais de Estimação', 'despesa'),
      grupo('g-impostos', 'Impostos', 'despesa'),
      grupo('g-desp-empresa', 'Despesas Empresa', 'despesa'),
    ]),
    grupo('g-desp-var', 'Despesas Variáveis', 'despesa'),
  ]),
  grupo('g-conta-corrente', 'Conta Corrente', 'saldo'),
];

const createRequest = (fields: { file?: File | string; ano?: string }) => {
  const form = new FormData();
  if (fields.file !== undefined) form.append('file', fields.file);
  if (fields.ano !== undefined) form.append('ano', fields.ano);
  return new NextRequest('http://localhost/api/cashflow/import/preview', {
    method: 'POST',
    body: form,
  });
};

const xlsxFile = (buffer: Buffer = buildFlcWorkbook(), name = 'flc.xlsx') =>
  new File([new Uint8Array(buffer)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

describe('POST /api/cashflow/import/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMergedCashflowGroups.mockResolvedValue(arvore());
  });

  it('devolve o plano de importação sem gravar nada', async () => {
    const response = await POST(createRequest({ file: xlsxFile(), ano: '2026' }));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.ano).toBe(2026);
    expect(body.arquivo).toBe('flc.xlsx');
    expect(body.plan.grupos.length).toBeGreaterThan(0);
    expect(body.plan.resumo.celulas).toBeGreaterThan(0);
    // fixture: Receita Investimentos não existe na árvore → criação sob Entradas Variáveis
    const receitaInv = body.plan.grupos.find(
      (g: { chave: string }) => g.chave === 'receita-investimentos',
    );
    expect(receitaInv.destino).toMatchObject({ tipo: 'criar', paiGroupId: 'g-ent-var' });
    // árvore buscada para o usuário-alvo e o ano pedido
    expect(mockGetMergedCashflowGroups).toHaveBeenCalledWith('user-123', 2026);
  });

  it('rejeita ano ausente ou inválido com 400', async () => {
    for (const ano of [undefined, 'abc', '1800']) {
      const response = await POST(createRequest({ file: xlsxFile(), ano }));
      expect(response.status).toBe(400);
    }
    expect(mockGetMergedCashflowGroups).not.toHaveBeenCalled();
  });

  it('rejeita requisição sem arquivo com 400', async () => {
    const response = await POST(createRequest({ ano: '2026' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Arquivo ausente');
  });

  it('rejeita arquivo acima de 10 MB com 413', async () => {
    const grande = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.xlsx');
    const response = await POST(createRequest({ file: grande, ano: '2026' }));
    expect(response.status).toBe(413);
  });

  it('devolve 400 com a mensagem do parser para arquivo que não é planilha', async () => {
    const invalido = new File([new Uint8Array([1, 2, 3, 4])], 'nao-e-planilha.xlsx');
    const response = await POST(createRequest({ file: invalido, ano: '2026' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    // SheetJS é leniente com binário arbitrário: pode falhar na leitura ou
    // produzir workbook sem a aba esperada — ambos são FlcParseError → 400
    expect(body.error).toMatch(/Arquivo inválido|não encontrada/);
  });

  it('devolve 400 quando a aba "Fluxo de Caixa" não existe', async () => {
    const semAba = buildFlcWorkbook(undefined, 'Outra Aba');
    const response = await POST(createRequest({ file: xlsxFile(semAba), ano: '2026' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Fluxo de Caixa');
  });
});
