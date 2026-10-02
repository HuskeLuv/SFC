/**
 * Lista do beta da Análise de Ativos (tabela feature_beta_users, recurso 'analise-ativos').
 * Admins (User.role = 'admin') entram sem estar na lista. Decisão 10 do Wellington.
 *
 * Sempre DRY-RUN; só grava com --apply. Usuários por e-mail (ou id).
 *
 *   npx tsx --env-file=.env scripts/analise-ativos/beta.ts --listar
 *   npx tsx --env-file=.env scripts/analise-ativos/beta.ts --adicionar a@x.com,b@y.com \
 *       [--motivo "interno"] [--por "wellington"] [--apply]
 *   npx tsx --env-file=.env scripts/analise-ativos/beta.ts --remover a@x.com [--apply]
 *   npx tsx --env-file=.env scripts/analise-ativos/beta.ts --arquivo lista.txt [--motivo ...] [--apply]
 *       (um e-mail por linha; linhas vazias e com # são ignoradas; adiciona todos)
 *
 * Em produção (Lightsail): cd /opt/myfinance/current && node/tsx com o app.env carregado — ver
 * docs/analise-ativos/fase1/ATIVACAO.md. O servidor guarda o acesso por 60 s por usuário
 * (TTL_ACESSO_MS): a mudança vale em até 1 minuto, sem reiniciar.
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

export const RECURSO = 'analise-ativos';

export type Acao = 'listar' | 'adicionar' | 'remover';

export interface Opcoes {
  acao: Acao;
  alvos: string[];
  motivo: string | null;
  por: string;
  aplicar: boolean;
}

function valorDe(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

const lista = (s: string | null) =>
  (s ?? '')
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Lê o arquivo do --arquivo: um e-mail/id por linha, # = comentário. */
export function lerArquivo(conteudo: string): string[] {
  return conteudo
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
}

export function lerOpcoes(
  argv: string[],
  ler: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): Opcoes {
  const aplicar = argv.includes('--apply');
  const motivo = valorDe(argv, '--motivo');
  const por = valorDe(argv, '--por') ?? process.env.USER ?? 'script';
  if (argv.includes('--listar')) return { acao: 'listar', alvos: [], motivo, por, aplicar };
  if (argv.includes('--adicionar')) {
    return { acao: 'adicionar', alvos: lista(valorDe(argv, '--adicionar')), motivo, por, aplicar };
  }
  if (argv.includes('--remover')) {
    return { acao: 'remover', alvos: lista(valorDe(argv, '--remover')), motivo, por, aplicar };
  }
  const arquivo = valorDe(argv, '--arquivo');
  if (arquivo) return { acao: 'adicionar', alvos: lerArquivo(ler(arquivo)), motivo, por, aplicar };
  throw new Error('Use --listar, --adicionar <e-mails>, --remover <e-mails> ou --arquivo <txt>');
}

const ehUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

async function resolverUsuarios(prisma: PrismaClient, alvos: string[]) {
  const emails = alvos.filter((a) => !ehUuid(a)).map((a) => a.toLowerCase());
  const ids = alvos.filter(ehUuid);
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { in: emails } }, { id: { in: ids } }] },
    select: { id: true, email: true, role: true },
  });
  const porChave = new Map<string, (typeof users)[number]>();
  for (const u of users) {
    porChave.set(u.email.toLowerCase(), u);
    porChave.set(u.id, u);
  }
  const encontrados: typeof users = [];
  const naoEncontrados: string[] = [];
  for (const a of alvos) {
    const u = porChave.get(ehUuid(a) ? a : a.toLowerCase());
    if (u) {
      if (!encontrados.some((x) => x.id === u.id)) encontrados.push(u);
    } else naoEncontrados.push(a);
  }
  return { encontrados, naoEncontrados };
}

async function listar(prisma: PrismaClient) {
  const [beta, admins] = await Promise.all([
    prisma.featureBetaUser.findMany({
      where: { recurso: RECURSO },
      select: {
        createdAt: true,
        adicionadoPor: true,
        motivo: true,
        user: { select: { email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({ where: { role: 'admin' }, select: { email: true } }),
  ]);
  console.log(`=== Beta '${RECURSO}': ${beta.length} na lista + ${admins.length} admin(s) ===`);
  for (const b of beta) {
    console.log(
      `  ${b.user.email} · ${b.user.role} · desde ${b.createdAt.toISOString().slice(0, 10)} · por ${b.adicionadoPor}${b.motivo ? ` · ${b.motivo}` : ''}`,
    );
  }
  console.log('Admins (entram sem estar na lista):');
  for (const a of admins) console.log(`  ${a.email}`);
}

async function main() {
  const op = lerOpcoes(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    if (op.acao === 'listar') {
      await listar(prisma);
      return;
    }
    if (op.alvos.length === 0) throw new Error('Nenhum e-mail/id informado');
    const { encontrados, naoEncontrados } = await resolverUsuarios(prisma, op.alvos);
    const atuais = await prisma.featureBetaUser.findMany({
      where: { recurso: RECURSO, userId: { in: encontrados.map((u) => u.id) } },
      select: { userId: true },
    });
    const naLista = new Set(atuais.map((a) => a.userId));

    const mudar =
      op.acao === 'adicionar'
        ? encontrados.filter((u) => !naLista.has(u.id))
        : encontrados.filter((u) => naLista.has(u.id));
    const semMudanca = encontrados.filter((u) => !mudar.includes(u));

    console.log(`=== ${op.acao} '${RECURSO}' (${op.aplicar ? 'APPLY' : 'dry-run'}) ===`);
    for (const u of mudar) {
      const nota = u.role === 'admin' ? ' (admin: já entra sem a lista)' : '';
      console.log(`  ${op.acao === 'adicionar' ? '+' : '-'} ${u.email}${nota}`);
    }
    for (const u of semMudanca) {
      console.log(`  = ${u.email} (${op.acao === 'adicionar' ? 'já está' : 'não está'} na lista)`);
    }
    for (const a of naoEncontrados) console.log(`  ? ${a} (usuário não encontrado)`);

    if (!op.aplicar) {
      console.log(`\nDry-run: nada gravado (${mudar.length} mudança(s)). Use --apply para gravar.`);
      return;
    }
    if (mudar.length === 0) {
      console.log('\nNada a gravar.');
      return;
    }
    if (op.acao === 'adicionar') {
      const r = await prisma.featureBetaUser.createMany({
        data: mudar.map((u) => ({
          recurso: RECURSO,
          userId: u.id,
          adicionadoPor: op.por,
          motivo: op.motivo,
        })),
        skipDuplicates: true,
      });
      console.log(`\nGravado: ${r.count} adicionado(s). Vale em até 60 s (cache do acesso).`);
    } else {
      const r = await prisma.featureBetaUser.deleteMany({
        where: { recurso: RECURSO, userId: { in: mudar.map((u) => u.id) } },
      });
      console.log(`\nGravado: ${r.count} removido(s). Vale em até 60 s (cache do acesso).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
