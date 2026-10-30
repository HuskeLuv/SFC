/**
 * Import do Bacen no catálogo de instituições (ClickUp 86e2xqh69): completa CNPJ, tipo (Tcb),
 * conglomerado e apelidos das linhas existentes, cria as instituições ativas que faltam
 * ('BCB-<raiz>', inclusive cooperativas) e marca NAO_EMISSOR nas linhas antigas que não emitem.
 * O plano é src/services/instituicoes/bacen/planejarImportacao.ts (puro); aqui só lê e grava.
 *
 * Nunca muda nome, status nem codigo de linha existente, nem sobrescreve campo preenchido
 * (cada UPDATE tem guarda no próprio campo). Dry-run é o padrão.
 *
 *   npx tsx --env-file=.env scripts/instituicoes/importar-bacen.ts --saida=/var/tmp/bacen-dry.json
 *   npx tsx --env-file=.env scripts/instituicoes/importar-bacen.ts --apply --mapa=mapa.json \
 *     --saida=/var/tmp/bacen-apply.json
 *
 * Opções:
 *   --apply            grava (exige --saida, que guarda as listas para reverter)
 *   --anomes=AAAAMM    trimestre do IF.data (padrão: o último com dados, até 4 para trás)
 *   --ifdata=arq.json  IF.data baixado à mão (resposta do Olinda ou lista) em vez da API
 *   --str=arq.csv      ParticipantesSTR.csv baixado à mão em vez do site do Bacen
 *   --mapa=mapa.json   {"<codigo>": "<raiz de 8 dígitos>" | "NAO_EMISSOR"} — soma ao mapa padrão
 *                      (bacen/mapaManualPadrao.ts) e sempre vence
 *   --saida=rel.json   relatório (+ rel.json.reverter.sql com a reversão campo a campo)
 *
 * Reverter: rodar as instruções do .reverter.sql (cada campo só nos ids que o import preencheu;
 * apelidos voltam ao valor anterior; linhas criadas só saem se nada as usa).
 */
import { readFileSync, writeFileSync } from 'fs';
import { prisma } from '../../src/lib/prisma';
import { TIPO_BACEN_NAO_EMISSOR } from '../../src/lib/fgc/produtosCobertos';
import {
  baixarCadastroIfData,
  parseCadastroIfData,
  type RegistroBacen,
} from '../../src/services/instituicoes/bacen/ifdataCadastro';
import {
  baixarParticipantesStr,
  decodificarCsv,
  parseParticipantesStr,
  type ParticipanteStr,
} from '../../src/services/instituicoes/bacen/participantesStr';
import {
  planejarImportacao,
  type MapaManual,
  type PlanoImportacao,
} from '../../src/services/instituicoes/bacen/planejarImportacao';
import { MAPA_MANUAL_PADRAO } from '../../src/services/instituicoes/bacen/mapaManualPadrao';

const APLICAR = process.argv.includes('--apply');
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const ANO_MES = arg('anomes');
const IFDATA_ARQ = arg('ifdata');
const STR_ARQ = arg('str');
const MAPA_ARQ = arg('mapa');
const SAIDA = arg('saida');

const LOTE_CREATE = 200;

interface Mudancas {
  idsCnpjPreenchido: string[];
  idsTipoPreenchido: string[];
  idsConglomeradoPreenchido: string[];
  idsApelidosAlterados: { id: string; antes: string | null; depois: string }[];
  idsMarcadosNaoEmissor: string[];
  codigosCriados: string[];
}

const sqlTexto = (s: string | null) => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`);
const sqlLista = (l: string[]) => l.map((s) => sqlTexto(s)).join(', ');

/** Reversão campo a campo: cada UPDATE só nos ids em que o import preencheu aquele campo. */
export function montarReversao(m: Mudancas): string[] {
  const sql: string[] = [];
  if (m.idsCnpjPreenchido.length) {
    sql.push(
      `UPDATE institutions SET cnpj = NULL, "cnpjCalculado" = false WHERE id IN (${sqlLista(m.idsCnpjPreenchido)});`,
    );
  }
  const idsTipo = [...m.idsTipoPreenchido, ...m.idsMarcadosNaoEmissor];
  if (idsTipo.length) {
    sql.push(`UPDATE institutions SET "tipoBacen" = NULL WHERE id IN (${sqlLista(idsTipo)});`);
  }
  if (m.idsConglomeradoPreenchido.length) {
    sql.push(
      `UPDATE institutions SET "conglomeradoBacen" = NULL WHERE id IN (${sqlLista(m.idsConglomeradoPreenchido)});`,
    );
  }
  for (const a of m.idsApelidosAlterados) {
    sql.push(
      `UPDATE institutions SET apelidos = ${sqlTexto(a.antes)} WHERE id = ${sqlTexto(a.id)};`,
    );
  }
  if (m.codigosCriados.length) {
    // Só apaga linha nova que ninguém usa (emissor gravado ou instituicaoId nas notes).
    sql.push(
      `DELETE FROM institutions i WHERE i.codigo IN (${sqlLista(m.codigosCriados)})` +
        ` AND NOT EXISTS (SELECT 1 FROM fixed_income_assets f WHERE f."emissorInstitutionId" = i.id)` +
        ` AND NOT EXISTS (SELECT 1 FROM stock_transactions t WHERE t.notes LIKE '%' || i.id || '%');`,
    );
  }
  return sql;
}

function mudancasPrevistas(plano: PlanoImportacao): Mudancas {
  return {
    idsCnpjPreenchido: plano.preencherCnpj.map((p) => p.id),
    idsTipoPreenchido: plano.preencherTipo.map((p) => p.id),
    idsConglomeradoPreenchido: plano.preencherConglomerado.map((p) => p.id),
    idsApelidosAlterados: plano.preencherApelidos.map(({ id, antes, depois }) => ({
      id,
      antes,
      depois,
    })),
    idsMarcadosNaoEmissor: plano.marcarNaoEmissor.map((p) => p.id),
    codigosCriados: plano.criar.map((c) => c.codigo),
  };
}

async function carregarIfData(): Promise<{ origem: string; registros: RegistroBacen[] }> {
  if (IFDATA_ARQ) {
    const registros = parseCadastroIfData(JSON.parse(readFileSync(IFDATA_ARQ, 'utf8')));
    return { origem: `arquivo ${IFDATA_ARQ}`, registros };
  }
  const r = await baixarCadastroIfData(ANO_MES);
  return {
    origem: `Olinda IfDataCadastro ${r.anoMes} (${r.linhas.length} linhas)`,
    registros: r.registros,
  };
}

async function carregarStr(): Promise<{
  origem: string;
  participantes: Map<string, ParticipanteStr>;
}> {
  if (STR_ARQ) {
    return {
      origem: `arquivo ${STR_ARQ}`,
      participantes: parseParticipantesStr(decodificarCsv(readFileSync(STR_ARQ))),
    };
  }
  const r = await baixarParticipantesStr();
  return { origem: 'ParticipantesSTR.csv (bcb.gov.br)', participantes: r.participantes };
}

function carregarMapa(): MapaManual {
  if (!MAPA_ARQ) return {};
  const bruto: unknown = JSON.parse(readFileSync(MAPA_ARQ, 'utf8'));
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new Error('--mapa: esperado um objeto {"<codigo>": "<raiz>" | "NAO_EMISSOR"}');
  }
  const mapa: MapaManual = {};
  for (const [codigo, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (codigo.startsWith('_')) continue; // comentários
    if (typeof valor !== 'string' || !(/^\d{8}$/.test(valor) || valor === TIPO_BACEN_NAO_EMISSOR)) {
      throw new Error(`--mapa: valor inválido para "${codigo}": ${JSON.stringify(valor)}`);
    }
    mapa[codigo] = valor;
  }
  return mapa;
}

function imprimirPlano(plano: PlanoImportacao) {
  const r = plano.resumo;
  console.log('\n── Resumo ──');
  console.log(`Registros ativos do IF.data: ${r.registrosBacen} · catálogo atual: ${r.existentes}`);
  console.log(
    `Casados: ${r.casados} (${Object.entries(r.casadosPorRegra)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')})`,
  );
  console.log(
    `Criar: ${r.criar} (${Object.entries(r.criarPorTipo)
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')})`,
  );
  console.log(
    `Preencher: cnpj ${r.preencherCnpj} · tipo ${r.preencherTipo} · conglomerado ${r.preencherConglomerado} · apelidos ${r.preencherApelidos}`,
  );
  console.log(`Marcar NAO_EMISSOR: ${r.marcarNaoEmissor}`);
  console.log(
    `Revisar: conflitos ${r.conflitos} · ambíguos ${r.ambiguos} · possíveis duplicatas ${r.possiveisDuplicatas}`,
  );

  if (plano.casamentos.length) {
    console.log('\n── Casamentos de linhas existentes ──');
    for (const c of plano.casamentos) {
      const conferir = c.nomeEmComum ? '' : '  ⚠ nome sem token em comum: conferir';
      console.log(
        `  ${c.codigo} "${c.nome}" → ${c.raiz} ${c.tcb ?? '-'} "${c.nomeBacen}" [${c.regra}]${conferir}`,
      );
    }
  }
  if (plano.conflitos.length) {
    console.log('\n── Conflitos (nada é sobrescrito) ──');
    for (const c of plano.conflitos) {
      console.log(`  ${c.codigo} "${c.nome}" ${c.campo}: atual ${c.atual} × Bacen ${c.bacen}`);
    }
  }
  if (plano.ambiguos.length) {
    console.log('\n── Ambíguos (não preenchidos; decidir no --mapa) ──');
    for (const a of plano.ambiguos) console.log(`  ${a.codigo} "${a.nome}": ${a.motivo}`);
  }
  if (plano.marcarNaoEmissor.length) {
    console.log('\n── Marcar NAO_EMISSOR ──');
    for (const m of plano.marcarNaoEmissor) console.log(`  ${m.codigo} "${m.nome}" [${m.motivo}]`);
  }
  if (plano.possiveisDuplicatas.length) {
    console.log('\n── Possíveis duplicatas (linhas sem cnpj) ──');
    for (const d of plano.possiveisDuplicatas) {
      const top = d.candidatos
        .slice(0, 3)
        .map((c) => `${c.codigo} "${c.nome}" (${c.motivo}: ${c.tokens.join('/')})`)
        .join('; ');
      const mais = d.totalCandidatos > 3 ? ` … +${d.totalCandidatos - 3}` : '';
      console.log(`  ${d.codigo} "${d.nome}" ~ ${top}${mais}`);
    }
  }
  if (plano.apelidosSemRegistro.length) {
    console.log(
      `\nApelidos sem registro ativo no IF.data (conferir): ${plano.apelidosSemRegistro.join(', ')}`,
    );
  }
  const amostra = plano.criar.filter((c) => c.tipoBacen === 'B1').slice(0, 12);
  if (amostra.length) {
    console.log('\n── Amostra do criar (B1) ──');
    for (const c of amostra) console.log(`  ${c.codigo} "${c.nome}" ${c.conglomeradoBacen ?? ''}`);
  }
}

/** Grava o plano. `m` é preenchido aos poucos: se algo falhar, ele tem o que já foi gravado. */
async function aplicar(plano: PlanoImportacao, inicio: Date, m: Mudancas): Promise<void> {
  try {
    for (let i = 0; i < plano.criar.length; i += LOTE_CREATE) {
      await prisma.institution.createMany({
        data: plano.criar.slice(i, i + LOTE_CREATE),
        skipDuplicates: true,
      });
    }
  } finally {
    // No finally: se um lote falhar no meio, a reversão ainda apaga os lotes já gravados.
    if (plano.criar.length) {
      const criados = await prisma.institution.findMany({
        where: { codigo: { in: plano.criar.map((c) => c.codigo) }, createdAt: { gte: inicio } },
        select: { codigo: true },
      });
      m.codigosCriados = criados.map((c) => c.codigo).sort();
    }
  }

  for (const p of plano.preencherCnpj) {
    const r = await prisma.institution.updateMany({
      where: { id: p.id, cnpj: null },
      data: { cnpj: p.valor, cnpjCalculado: true },
    });
    if (r.count) m.idsCnpjPreenchido.push(p.id);
  }
  for (const p of plano.preencherTipo) {
    const r = await prisma.institution.updateMany({
      where: { id: p.id, tipoBacen: null },
      data: { tipoBacen: p.valor },
    });
    if (r.count) m.idsTipoPreenchido.push(p.id);
  }
  for (const p of plano.preencherConglomerado) {
    const r = await prisma.institution.updateMany({
      where: { id: p.id, conglomeradoBacen: null },
      data: { conglomeradoBacen: p.valor },
    });
    if (r.count) m.idsConglomeradoPreenchido.push(p.id);
  }
  for (const p of plano.preencherApelidos) {
    // Guarda: só troca se ninguém mexeu nos apelidos desde a leitura.
    const r = await prisma.institution.updateMany({
      where: { id: p.id, apelidos: p.antes },
      data: { apelidos: p.depois },
    });
    if (r.count) m.idsApelidosAlterados.push({ id: p.id, antes: p.antes, depois: p.depois });
  }
  for (const p of plano.marcarNaoEmissor) {
    const r = await prisma.institution.updateMany({
      where: { id: p.id, tipoBacen: null },
      data: { tipoBacen: TIPO_BACEN_NAO_EMISSOR },
    });
    if (r.count) m.idsMarcadosNaoEmissor.push(p.id);
  }
}

function gravarRelatorio(
  fontes: Record<string, unknown>,
  plano: PlanoImportacao,
  mudancas: Mudancas,
  aplicado: boolean,
) {
  if (!SAIDA) return;
  const reversao = montarReversao(mudancas);
  const relatorio = {
    geradoEm: new Date().toISOString(),
    modo: aplicado ? 'apply' : 'dry-run',
    observacao: aplicado
      ? 'As listas ids* têm só o que de fato mudou no banco.'
      : 'Dry-run: as listas ids* são o que o --apply mudaria.',
    fontes,
    resumo: plano.resumo,
    ...mudancas,
    reversao,
    plano: {
      conflitos: plano.conflitos,
      ambiguos: plano.ambiguos,
      possiveisDuplicatas: plano.possiveisDuplicatas,
      marcarNaoEmissor: plano.marcarNaoEmissor,
      casamentos: plano.casamentos,
      apelidosSemRegistro: plano.apelidosSemRegistro,
      preencherCnpj: plano.preencherCnpj,
      preencherTipo: plano.preencherTipo,
      preencherConglomerado: plano.preencherConglomerado,
      preencherApelidos: plano.preencherApelidos,
      criar: plano.criar,
    },
  };
  writeFileSync(SAIDA, JSON.stringify(relatorio, null, 2));
  writeFileSync(
    `${SAIDA}.reverter.sql`,
    [
      `-- Reversão do import do Bacen (${relatorio.modo}, ${relatorio.geradoEm}). Rodar em transação.`,
      'BEGIN;',
      ...reversao,
      'COMMIT;',
      '',
    ].join('\n'),
  );
  console.log(`\nRelatório em ${SAIDA} (reversão em ${SAIDA}.reverter.sql)`);
}

async function main() {
  if (APLICAR && !SAIDA) throw new Error('--apply exige --saida=<relatorio.json>');
  console.log(
    `=== Import do Bacen no catálogo de instituições (${APLICAR ? 'APLICANDO' : 'dry-run'}) ===`,
  );
  const inicio = new Date();

  const [ifdata, str] = await Promise.all([carregarIfData(), carregarStr()]);
  // O mapa padrão (src/services/instituicoes/bacen/mapaManualPadrao.ts) entra sempre; o --mapa vence.
  const mapaManual: MapaManual = { ...MAPA_MANUAL_PADRAO, ...carregarMapa() };
  console.log(`IF.data: ${ifdata.origem} → ${ifdata.registros.length} ativas`);
  console.log(`STR: ${str.origem} → ${str.participantes.size} participantes`);
  console.log(
    `Mapa manual: padrão${MAPA_ARQ ? ` + ${MAPA_ARQ}` : ''} (${Object.keys(mapaManual).length} códigos)`,
  );

  const existentes = await prisma.institution.findMany({
    select: {
      id: true,
      codigo: true,
      nome: true,
      cnpj: true,
      tipoBacen: true,
      conglomeradoBacen: true,
      apelidos: true,
      cnpjCalculado: true,
    },
  });

  const plano = planejarImportacao({
    existentes,
    registros: ifdata.registros,
    participantes: str.participantes,
    mapaManual,
  });
  imprimirPlano(plano);

  const fontes = {
    ifdata: ifdata.origem,
    str: str.origem,
    mapa: MAPA_ARQ,
    registrosAtivos: ifdata.registros.length,
    participantesStr: str.participantes.size,
  };

  if (!APLICAR) {
    gravarRelatorio(fontes, plano, mudancasPrevistas(plano), false);
    console.log('\nDry-run: nada foi gravado. Use --apply --saida=... para gravar.');
    return;
  }

  const mudancas: Mudancas = {
    idsCnpjPreenchido: [],
    idsTipoPreenchido: [],
    idsConglomeradoPreenchido: [],
    idsApelidosAlterados: [],
    idsMarcadosNaoEmissor: [],
    codigosCriados: [],
  };
  try {
    await aplicar(plano, inicio, mudancas);
  } finally {
    // Mesmo se falhar no meio, o relatório guarda o que já foi gravado.
    gravarRelatorio(fontes, plano, mudancas, true);
  }
  console.log(
    `\nAplicado: ${mudancas.codigosCriados.length} criadas · cnpj ${mudancas.idsCnpjPreenchido.length} · ` +
      `tipo ${mudancas.idsTipoPreenchido.length} · conglomerado ${mudancas.idsConglomeradoPreenchido.length} · ` +
      `apelidos ${mudancas.idsApelidosAlterados.length} · NAO_EMISSOR ${mudancas.idsMarcadosNaoEmissor.length}`,
  );
}

if (require.main === module) {
  main()
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
