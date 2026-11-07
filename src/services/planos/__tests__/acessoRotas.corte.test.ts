/**
 * Assinaturas F2: o corte por plano alcança TODA rota Pro/Advanced.
 *
 * Varre src/app/api/**\/route.ts e, para cada método exportado que exige plano em ACESSO_ROTAS,
 * confere que o arquivo passa pelo gate central (requireAuthWithActing) ou chama exigirPlano*
 * (direto ou por um wrapper conhecido, cujo código também é conferido aqui). Também confere que
 * o 403 chega ao front como JSON: a rota com requireAuthWithActing está sob withErrorHandler e não
 * engole o erro num try/catch próprio, e só a Análise de Ativos desliga o gate (gatePlano:false).
 * Complementa acessoRotas.cobertura.test.ts (F0: toda rota classificada).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classificarRota, planoExigidoPelaRota } from '../acessoRotas';

const RAIZ_SRC = path.resolve(__dirname, '../../..');
const RAIZ_API = path.join(RAIZ_SRC, 'app/api');

function arquivos(dir: string, filtro: (nome: string) => boolean): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === '__tests__' || nome === 'node_modules') continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p, filtro));
    else if (filtro(nome)) out.push(p);
  }
  return out;
}

/** src/app/api/foo/[id]/route.ts → /api/foo/[id] (grupos de rota "(x)" somem). */
function pathnameDaRota(arquivo: string): string {
  const rel = path.relative(RAIZ_API, path.dirname(arquivo)).split(path.sep);
  return ['/api', ...rel.filter((s) => s && !/^\(.*\)$/.test(s))].join('/');
}

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function metodosExportados(fonte: string): string[] {
  return METODOS.filter((m) =>
    new RegExp(
      `export\\s+(const|async\\s+function|function)\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b[^}]*\\}`,
    ).test(fonte),
  );
}

const GATE = /\brequireAuthWithActing\s*\(/;
const EXIGIR_PLANO = /\bexigirPlano(Requisicao|DaRota)?\s*\(/;

/**
 * Wrappers que levam ao gate: nome usado na rota → arquivo que precisa conter requireAuthWithActing
 * ou exigirPlano (conferido no primeiro teste).
 */
const WRAPPERS: Record<string, string> = {
  exigirAcessoAnalise: 'services/analiseAtivos/acesso/acessoAnalise.ts',
  exigirRecursoAnalise: 'services/analiseAtivos/acesso/acessoAnalise.ts',
  exigirRecursosAnalise: 'services/analiseAtivos/acesso/acessoAnalise.ts',
  exigirClasseAnalise: 'services/analiseAtivos/acesso/acessoAnalise.ts',
  requireProprioUsuarioPluggy: 'app/api/pluggy/_lib/auth.ts',
  requireProprioUsuarioPluggyAuth: 'app/api/pluggy/_lib/auth.ts',
  criarHandlerObjetivo: 'services/portfolio/objetivoHandler.ts',
};

/**
 * Rotas Pro/Adv que de propósito não cortam por plano (com o motivo). Toda entrada nova precisa
 * de OK: é dado do recurso que o plano não cobre ficando aberto.
 */
const EXCECOES: Record<string, string> = {
  // Só diz ao menu se a Análise está ligada para o usuário (flag/beta); nenhum dado de mercado.
  '/api/analise-ativos/config': 'estado da flag para o menu (requireSession)',
  // Busca no catálogo global de ativos (dado de mercado, nada do usuário; sessão pelo middleware).
  // O que a carteira faz com o ativo escolhido passa pelo gate das rotas /api/carteira.
  '/api/assets': 'catálogo de ativos sem dado do usuário',
};

const usaWrapper = (fonte: string) =>
  Object.keys(WRAPPERS).some((w) => new RegExp(`\\b${w}\\s*\\(`).test(fonte));

/** Blocos `try { ... }` do arquivo (casando chaves). */
function blocosTry(fonte: string): string[] {
  const out: string[] = [];
  const re = /\btry\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    let i = m.index + m[0].length;
    let nivel = 1;
    while (nivel > 0 && i < fonte.length) {
      if (fonte[i] === '{') nivel++;
      else if (fonte[i] === '}') nivel--;
      i++;
    }
    out.push(fonte.slice(m.index + m[0].length, i - 1));
  }
  return out;
}

const rotas = arquivos(RAIZ_API, (n) => n === 'route.ts' || n === 'route.tsx').map((arquivo) => {
  const fonte = readFileSync(arquivo, 'utf8');
  const pathname = pathnameDaRota(arquivo);
  const exigidos = metodosExportados(fonte)
    .map((m) => ({ metodo: m, need: planoExigidoPelaRota(pathname, m) }))
    .filter((x) => x.need !== null);
  return { arquivo, pathname, fonte, exigidos };
});

describe('corte por plano em toda rota Pro/Advanced', () => {
  it('os wrappers conhecidos levam ao gate (requireAuthWithActing ou exigirPlano)', () => {
    for (const [nome, rel] of Object.entries(WRAPPERS)) {
      const fonte = readFileSync(path.join(RAIZ_SRC, rel), 'utf8');
      expect(fonte, `${nome} em ${rel}`).toMatch(new RegExp(`function\\s+${nome}\\b`));
      expect(GATE.test(fonte) || EXIGIR_PLANO.test(fonte), rel).toBe(true);
    }
  });

  it('acha as rotas e as que exigem plano', () => {
    expect(rotas.length).toBeGreaterThan(200);
    expect(rotas.filter((r) => r.exigidos.length > 0).length).toBeGreaterThan(80);
  });

  it('toda rota com método Pro/Adv passa por requireAuthWithActing, exigirPlano ou wrapper', () => {
    const escapam = rotas
      .filter((r) => r.exigidos.length > 0 && !EXCECOES[r.pathname])
      .filter((r) => !GATE.test(r.fonte) && !EXIGIR_PLANO.test(r.fonte) && !usaWrapper(r.fonte))
      .map((r) => `${r.pathname} [${r.exigidos.map((x) => `${x.metodo}:${x.need}`).join(', ')}]`);
    expect(escapam).toEqual([]);
  });

  it('nenhuma rota Pro/Adv autentica por fora do gate (requireSession/requireAuth/verifyJWT)', () => {
    // Pegaria um handler do arquivo com requireAuthWithActing e outro só com a sessão.
    const porFora = /\b(requireSession|requireAuth|verifyJWT|requireRole)\s*\(/;
    const fora = rotas
      .filter((r) => r.exigidos.length > 0 && !EXCECOES[r.pathname])
      .filter((r) => porFora.test(r.fonte))
      .map((r) => r.pathname);
    expect(fora).toEqual([]);
  });

  it('as exceções existem e são mesmo Pro/Adv (sem entrada morta)', () => {
    for (const p of Object.keys(EXCECOES)) {
      const r = rotas.find((x) => x.pathname === p);
      expect(r, p).toBeDefined();
      expect(r!.exigidos.length, p).toBeGreaterThan(0);
    }
  });

  it('as rotas do Pluggy-carteira chamam exigirPlano explicitamente', () => {
    const pluggyCarteira = rotas.filter((r) => r.pathname.startsWith('/api/pluggy/carteira'));
    expect(pluggyCarteira.length).toBeGreaterThan(0);
    for (const r of pluggyCarteira) expect(EXIGIR_PLANO.test(r.fonte), r.pathname).toBe(true);
  });

  it('o 403 do gate vira JSON: requireAuthWithActing sob withErrorHandler, fora de try/catch', () => {
    const comGate = rotas.filter((r) => r.exigidos.length > 0 && GATE.test(r.fonte));
    const semHandler = comGate.filter((r) => !/\bwithErrorHandler\s*\(/.test(r.fonte));
    expect(semHandler.map((r) => r.pathname)).toEqual([]);
    const engolem = comGate.filter((r) => blocosTry(r.fonte).some((b) => GATE.test(b)));
    expect(engolem.map((r) => r.pathname)).toEqual([]);
  });

  it('só a Análise de Ativos desliga o gate central (gatePlano: false)', () => {
    const quem = arquivos(RAIZ_SRC, (n) => /\.tsx?$/.test(n))
      .filter((a) => !a.includes(`${path.sep}__tests__${path.sep}`))
      .filter((a) => /gatePlano\s*:\s*false/.test(readFileSync(a, 'utf8')))
      .map((a) => path.relative(RAIZ_SRC, a));
    expect(quem).toEqual(['services/analiseAtivos/acesso/acessoAnalise.ts']);
  });

  it('nenhuma rota Pro/Adv fica sem classificação (sanidade com a F0)', () => {
    expect(rotas.filter((r) => classificarRota(r.pathname) === null)).toEqual([]);
  });
});
