import { describe, expect, it } from 'vitest';
import { planejarMigracao, type EstadoMigracao, type ItemUsuarioIn } from '../planejarMigracao';

const tplGrupo = { id: 'g-saude', name: 'Saúde' };
const tpl = (id: string, name: string, extra: Partial<{ significado: string }> = {}) => ({
  id,
  groupId: 'g-saude',
  name,
  orderIndex: 0,
  significado: extra.significado ?? null,
  rank: null,
});
const item = (
  over: Partial<ItemUsuarioIn> & Pick<ItemUsuarioIn, 'id' | 'name'>,
): ItemUsuarioIn => ({
  userId: 'u1',
  groupId: 'ug-saude',
  templateId: null,
  hidden: false,
  temDados: false,
  espelhoOuGeral: false,
  ...over,
});

const desejado = {
  Saúde: [
    { name: 'Plano de Saúde', orderIndex: 1 },
    { name: 'Medicamentos / Farmácia', orderIndex: 2 },
    { name: 'Quiropraxia', orderIndex: 3 },
    { name: 'Outros', orderIndex: 4 },
  ],
};

const base = (itensUsuario: ItemUsuarioIn[]): EstadoMigracao => ({
  gruposTemplate: [tplGrupo],
  itensTemplate: [
    tpl('t-plano', 'Plano de Saúde', { significado: 'x' }),
    tpl('t-med', 'Medicamentos'),
    tpl('t-fisio', 'Fisioterapia'),
    tpl('t-outros', 'Outros'),
  ],
  gruposUsuario: [{ id: 'ug-saude', userId: 'u1', templateId: 'g-saude' }],
  itensUsuario,
});

describe('planejarMigracao', () => {
  it('template: mantém, renomeia no lugar, aposenta e cria, com a posição da planilha', () => {
    const p = planejarMigracao(base([]), desejado);
    expect(p.renomear).toEqual([
      { id: 't-med', grupo: 'Saúde', de: 'Medicamentos', para: 'Medicamentos / Farmácia' },
    ]);
    expect(p.aposentar).toEqual([{ id: 't-fisio', grupo: 'Saúde', name: 'Fisioterapia' }]);
    expect(p.criar).toEqual([
      {
        chave: 'Saúde|Quiropraxia',
        grupo: 'Saúde',
        groupId: 'g-saude',
        name: 'Quiropraxia',
        orderIndex: 3,
      },
    ]);
    expect(p.atualizar).toEqual(
      expect.arrayContaining([
        { id: 't-plano', orderIndex: 1, limparPorque: true },
        { id: 't-med', orderIndex: 2, limparPorque: false },
        { id: 't-outros', orderIndex: 4, limparPorque: false },
      ]),
    );
  });

  it('cópia de linha que sai: com dados fica do usuário (mesmo oculta), sem dados some', () => {
    const p = planejarMigracao(
      base([
        item({ id: 'c1', name: 'Fisioterapia', templateId: 't-fisio', temDados: true }),
        item({ id: 'c2', userId: 'u2', name: 'Fisio', templateId: 't-fisio' }),
        item({ id: 'c3', userId: 'u3', name: 'Fisioterapia', templateId: 't-fisio', hidden: true }),
        item({
          id: 'c4',
          userId: 'u4',
          name: 'Fisioterapia',
          templateId: 't-fisio',
          hidden: true,
          temDados: true,
        }),
      ]),
      desejado,
    );
    expect(p.desvincular.map((d) => d.itemId).sort()).toEqual(['c1', 'c4']);
    expect(p.apagar.map((a) => a.itemId).sort()).toEqual(['c2', 'c3']);
  });

  it('clone legado (sem templateId, mesmo nome no grupo personalizado) é vinculado antes', () => {
    const p = planejarMigracao(
      base([
        item({ id: 'l1', name: 'Fisioterapia' }),
        item({ id: 'l2', name: 'Medicamentos', temDados: true }),
      ]),
      desejado,
    );
    expect(p.vincularLegado).toEqual(
      expect.arrayContaining([
        { itemId: 'l1', userId: 'u1', templateId: 't-fisio' },
        { itemId: 'l2', userId: 'u1', templateId: 't-med' },
      ]),
    );
    // o legado vazio da linha que sai some; o renomeado continua com o nome antigo
    expect(p.apagar.map((a) => a.itemId)).toEqual(['l1']);
    expect(p.desvincular).toEqual([]);
  });

  it('linha nova com o nome de uma custom do usuário: a custom vira a cópia (sem duplicata)', () => {
    const p = planejarMigracao(base([item({ id: 'x1', name: 'quiropraxia ' })]), desejado);
    expect(p.adotar).toEqual([
      {
        itemId: 'x1',
        userId: 'u1',
        template: { criar: 'Saúde|Quiropraxia' },
        name: 'quiropraxia ',
      },
    ]);
    expect(p.ocultar).toEqual([]);
  });

  it('nome novo que colide com cópia de outra linha padrão ou espelho: nasce oculta', () => {
    const p = planejarMigracao(
      base([
        item({ id: 'o1', name: 'Quiropraxia', templateId: 't-outros' }),
        item({
          id: 'e1',
          userId: 'u1',
          name: 'Medicamentos / Farmácia',
          espelhoOuGeral: true,
          temDados: true,
        }),
      ]),
      desejado,
    );
    expect(p.adotar).toEqual([]);
    expect(p.ocultar).toEqual(
      expect.arrayContaining([
        {
          userId: 'u1',
          userGroupId: 'ug-saude',
          template: { criar: 'Saúde|Quiropraxia' },
          name: 'Quiropraxia',
        },
        {
          userId: 'u1',
          userGroupId: 'ug-saude',
          template: { id: 't-med' },
          name: 'Medicamentos / Farmácia',
        },
      ]),
    );
  });

  it('avisa sobre grupo de usuário sem templateId (clone antigo), que fica de fora', () => {
    const estado = base([]);
    estado.gruposUsuario.push({ id: 'ug-velho', userId: 'u9', templateId: null });
    expect(planejarMigracao(estado, desejado).avisos).toEqual([
      '1 grupo(s) de 1 usuário(s) sem templateId (clone antigo, casado por nome): fora da migração',
    ]);
  });

  it('idempotente: com o template já migrado, o plano não muda nada', () => {
    const estado: EstadoMigracao = {
      ...base([]),
      itensTemplate: desejado.Saúde.map((l) => ({
        id: `t-${l.orderIndex}`,
        groupId: 'g-saude',
        name: l.name,
        orderIndex: l.orderIndex,
        significado: null,
        rank: null,
      })),
    };
    const p = planejarMigracao(estado, desejado);
    expect([p.renomear, p.criar, p.aposentar, p.apagar, p.desvincular, p.adotar]).toEqual([
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
  });
});
