import { describe, expect, it } from 'vitest';
import {
  carimboAgora,
  dobrarLinha,
  escaparTexto,
  gerarIcs,
  instanteUtc,
  periodoDoFeed,
  uidDoEvento,
} from '../ical';
import type { EventoAgenda, TipoEvento } from '../types';

const AGORA = new Date('2026-09-18T12:00:00Z');

const ev = (over: Partial<EventoAgenda> & { tipo: TipoEvento; data: string }): EventoAgenda => ({
  id: `${over.tipo}:${over.data}`,
  titulo: 'Evento',
  dataFim: null,
  hora: null,
  valor: null,
  descricao: null,
  link: null,
  detalhe: {},
  ...over,
});

describe('escape e dobra (RFC 5545)', () => {
  it('escapa barra, ponto e vírgula, vírgula e quebra de linha', () => {
    expect(escaparTexto('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('dobra linha acima de 75 octetos com espaço na continuação', () => {
    const linha = `SUMMARY:${'a'.repeat(100)}`;
    const dobrada = dobrarLinha(linha);
    const partes = dobrada.split('\r\n');
    expect(partes.length).toBeGreaterThan(1);
    expect(Buffer.byteLength(partes[0], 'utf8')).toBeLessThanOrEqual(75);
    expect(partes.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    // Nada se perde na dobra.
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(linha);
  });

  it('conta BYTES, não caracteres (acento ocupa 2)', () => {
    const dobrada = dobrarLinha(`SUMMARY:${'á'.repeat(60)}`);
    for (const parte of dobrada.split('\r\n')) {
      expect(Buffer.byteLength(parte, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('linha curta passa intacta', () => {
    expect(dobrarLinha('VERSION:2.0')).toBe('VERSION:2.0');
  });
});

describe('datas', () => {
  it('hora de Brasília vira instante UTC (+3h, sem horário de verão)', () => {
    expect(instanteUtc('2026-09-18', '14:30')).toBe('20260918T173000Z');
    // Vira o dia ao converter.
    expect(instanteUtc('2026-09-18', '22:00')).toBe('20260919T010000Z');
  });

  it('carimbo de agora em UTC', () => {
    expect(carimboAgora(AGORA)).toBe('20260918T120000Z');
  });

  it('janela do feed vai de 30 dias atrás a 365 à frente', () => {
    expect(periodoDoFeed(AGORA)).toEqual({ de: '2026-08-19', ate: '2027-09-18' });
  });
});

describe('gerarIcs', () => {
  it('monta o calendário com cabeçalho e um VEVENT de dia inteiro', () => {
    const ics = gerarIcs(
      [ev({ tipo: 'divida', data: '2026-10-10', titulo: 'Apê · parcela 3/120' })],
      AGORA,
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261010');
    // DTEND de dia inteiro é EXCLUSIVO: o dia seguinte.
    expect(ics).toContain('DTEND;VALUE=DATE:20261011');
    expect(ics).toContain('SUMMARY:Apê · parcela 3/120');
    expect(ics).toContain('DESCRIPTION:Dívida');
    // Toda linha termina em CRLF.
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
  });

  it('evento com hora vira instante, não dia inteiro', () => {
    const ics = gerarIcs([ev({ tipo: 'manual', data: '2026-11-20', hora: '14:30' })], AGORA);
    expect(ics).toContain('DTSTART:20261120T173000Z');
    expect(ics).not.toContain('VALUE=DATE');
  });

  it('evento de vários dias usa o dia seguinte ao fim', () => {
    const ics = gerarIcs(
      [ev({ tipo: 'manual', data: '2026-12-20', dataFim: '2026-12-27' })],
      AGORA,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261220');
    expect(ics).toContain('DTEND;VALUE=DATE:20261228');
  });

  it('NÃO publica valores — nem do evento, nem no texto', () => {
    const ics = gerarIcs(
      [
        ev({
          tipo: 'divida',
          data: '2026-10-10',
          titulo: 'Apê · parcela 3/120',
          valor: 4321.99,
          descricao: 'Parcela a pagar',
        }),
        ev({ tipo: 'provento', data: '2026-10-15', titulo: 'ITSA4 · JCP', valor: 80.5 }),
      ],
      AGORA,
    );
    expect(ics).not.toContain('R$');
    expect(ics).not.toContain('4321');
    expect(ics).not.toContain('80.5');
    expect(ics).not.toContain('80,5');
  });

  it('UID é estável e sem caracteres proibidos; link vira URL absoluta', () => {
    const evento = ev({
      tipo: 'divida',
      data: '2026-10-10',
      id: 'divida:abc-123:7',
      link: '/dividas',
    });
    expect(uidDoEvento(evento)).toBe('divida-abc-123-7@appmyfinance.com.br');
    const ics = gerarIcs([evento], AGORA);
    expect(ics).toContain('UID:divida-abc-123-7@appmyfinance.com.br');
    expect(ics).toContain('URL:https://appmyfinance.com.br/dividas');
  });

  it('título com vírgula e ponto e vírgula sai escapado', () => {
    const ics = gerarIcs(
      [ev({ tipo: 'manual', data: '2026-10-10', titulo: 'Contador, 1; urgente' })],
      AGORA,
    );
    expect(ics).toContain('SUMMARY:Contador\\, 1\\; urgente');
  });

  it('agenda vazia gera calendário válido sem eventos', () => {
    const ics = gerarIcs([], AGORA);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
