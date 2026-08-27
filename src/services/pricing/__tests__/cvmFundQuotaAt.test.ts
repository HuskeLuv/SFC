import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdmZip from 'adm-zip';

const mockPrisma = vi.hoisted(() => ({
  cvmFundQuota: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
}));
const mockAxiosGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('axios', () => ({
  default: { get: mockAxiosGet, isAxiosError: () => false },
  isAxiosError: () => false,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ensureCvmQuotaAt, findCvmQuotaAt } from '../cvmFundSync';

const CNPJ = '12345678000190';

/** ZIP mensal INF_DIARIO fake com 2 fundos — só o CNPJ alvo deve ser persistido. */
const buildZip = (rows: string[]): Buffer => {
  const header =
    'TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST';
  const zip = new AdmZip();
  zip.addFile('inf_diario_fi_202406.csv', Buffer.from([header, ...rows].join('\n'), 'latin1'));
  return zip.toBuffer();
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cvmFundQuota.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe('findCvmQuotaAt', () => {
  it('busca a última cota em [alvo−30d, alvo] com CNPJ normalizado', async () => {
    mockPrisma.cvmFundQuota.findFirst.mockResolvedValue({
      date: new Date('2024-06-25T00:00:00Z'),
      quotaValue: '12.5',
    });
    const r = await findCvmQuotaAt('12.345.678/0001-90', new Date('2024-06-26T00:00:00Z'));
    expect(r).toEqual({ date: new Date('2024-06-25T00:00:00Z'), quotaValue: 12.5 });
    const where = mockPrisma.cvmFundQuota.findFirst.mock.calls[0][0].where;
    expect(where.cnpj).toBe(CNPJ);
    expect(where.date.lte).toEqual(new Date('2024-06-26T00:00:00Z'));
    expect(where.date.gte).toEqual(new Date('2024-05-27T00:00:00Z'));
  });
});

describe('ensureCvmQuotaAt (lookup sob demanda — ticket Pedro 27/08/2026)', () => {
  it('devolve direto do banco sem baixar nada quando a cota já existe', async () => {
    mockPrisma.cvmFundQuota.findFirst.mockResolvedValue({
      date: new Date('2024-06-26T00:00:00Z'),
      quotaValue: '10',
    });
    const r = await ensureCvmQuotaAt(CNPJ, new Date('2024-06-26T00:00:00Z'));
    expect(r?.quotaValue).toBe(10);
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('sem cota no banco: baixa o mês alvo filtrado pelo CNPJ, persiste e reconsulta', async () => {
    mockPrisma.cvmFundQuota.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ date: new Date('2024-06-26T00:00:00Z'), quotaValue: '12.34' });
    const zip = buildZip([
      `FI;${CNPJ};2024-06-26;1000;12.34;1000;0;0;10`,
      `FI;${CNPJ};2024-06-25;1000;12.30;1000;0;0;10`,
      `FI;99999999000199;2024-06-26;1000;99.9;1000;0;0;10`, // outro fundo — ignorado
    ]);
    mockAxiosGet.mockImplementation((url: string) =>
      url.includes('202406')
        ? Promise.resolve({ data: zip })
        : Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } })),
    );

    const r = await ensureCvmQuotaAt(CNPJ, new Date('2024-06-26T00:00:00Z'));

    expect(r).toEqual({ date: new Date('2024-06-26T00:00:00Z'), quotaValue: 12.34 });
    const urls = mockAxiosGet.mock.calls.map((c) => c[0] as string);
    // Mês alvo trouxe a cota → o anterior NÃO é baixado (latência interativa).
    expect(urls).toEqual([expect.stringMatching(/inf_diario_fi_202406\.zip$/)]);
    // Só as 2 linhas do CNPJ alvo viram upsert.
    expect(mockPrisma.cvmFundQuota.upsert).toHaveBeenCalledTimes(2);
    expect(
      mockPrisma.cvmFundQuota.upsert.mock.calls.every((c) => c[0].where.cnpj_date.cnpj === CNPJ),
    ).toBe(true);
  });

  it('null (sem download) para datas anteriores ao formato mensal da CVM (< 2021-01)', async () => {
    mockPrisma.cvmFundQuota.findFirst.mockResolvedValue(null);
    const r = await ensureCvmQuotaAt(CNPJ, new Date('2019-03-01T00:00:00Z'));
    expect(r).toBeNull();
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('mês alvo sem o CNPJ: tenta o mês anterior (início de mês/feriado) antes de desistir', async () => {
    mockPrisma.cvmFundQuota.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ date: new Date('2024-05-31T00:00:00Z'), quotaValue: '11' });
    mockAxiosGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes('202405')
          ? buildZip([`FI;${CNPJ};2024-05-31;1;11;1;0;0;1`])
          : buildZip([`FI;99999999000199;2024-06-03;1;1;1;0;0;1`]),
      }),
    );
    const r = await ensureCvmQuotaAt(CNPJ, new Date('2024-06-03T00:00:00Z'));
    expect(r?.quotaValue).toBe(11);
    const urls = mockAxiosGet.mock.calls.map((c) => c[0] as string);
    expect(urls.map((u) => u.slice(-10))).toEqual(['202406.zip', '202405.zip']);
  });

  it('null quando a CVM não tem o CNPJ no mês (download ok, zero linhas)', async () => {
    mockPrisma.cvmFundQuota.findFirst.mockResolvedValue(null);
    mockAxiosGet.mockResolvedValue({
      data: buildZip([`FI;99999999000199;2024-06-26;1;1;1;0;0;1`]),
    });
    const r = await ensureCvmQuotaAt(CNPJ, new Date('2024-06-26T00:00:00Z'));
    expect(r).toBeNull();
    expect(mockPrisma.cvmFundQuota.upsert).not.toHaveBeenCalled();
  });
});
