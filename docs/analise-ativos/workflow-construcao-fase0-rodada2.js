export const meta = {
  name: 'analise-ativos-fase0-rodada2',
  description: 'Análise de Ativos — Fase 0, rodada 2: corrige os 4 achados restantes da reverificação + CNPJ e controladora zerada → reverificação de operação e de código',
  phases: [
    { title: 'Correções', detail: 'corretor da rodada 2' },
    { title: 'Reverificação', detail: 'operação (memória) e código/dados' },
  ],
}

const REPO = '/home/huske/dev/front'
const BRANCH = 'feat/analise-ativos-fase0'
const OUT = `${REPO}/docs/analise-ativos/fase0`
const REGRAS = `
REGRAS: repo ${REPO}, branch ${BRANCH} (Fase 0 da Análise de Ativos já construída: 43 commits sobre f3e17e3e; spec ${OUT}/spec-fase0.json; decisões ${REPO}/docs/analise-ativos/decisoes-fase0.md; RUNBOOK ${OUT}/RUNBOOK.md; cobertura ${OUT}/cobertura-dev.md; pendências em ${OUT}/qa/). Siga o CLAUDE.md e o estilo do código. Banco .env = Neon DEV (escrita só nas tabelas novas da fase; nada de TRUNCATE/DELETE em massa — o classificador bloqueia; use reprocessamento idempotente/upsert). NUNCA produção/ssh. Commits atômicos em português ("fix(analise-ativos): ..."), terminando com linha em branco + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"; git add com caminhos explícitos; nada de push/PR/merge; não mexer em .claude/, .gitignore nem arquivos não rastreados fora de ${OUT}. Testes: npx vitest run <paths> (prisma real: DATABASE_URL="postgresql://u:p@localhost:5432/x" JWT_SECRET=dummy). Não invoque skills nem subagentes.
Restrição de operação: produção = Lightsail 1,9 GB RAM compartilhada com o app; cron chama rota HTTP via curl -m 300 (/usr/local/bin/myfinance-cron.sh, linhas em infra/modules/lightsail/provision.sh.tftpl). Pico por job < 300 MB no processo que roda o job.`

const FINDINGS = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    achados: { type: 'array', items: { type: 'object', properties: {
      gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] }, descricao: { type: 'string' },
      evidencia: { type: 'string' }, sugestao: { type: 'string' } },
      required: ['gravidade', 'descricao', 'evidencia', 'sugestao'] } },
  },
  required: ['resumo', 'achados'],
}

phase('Correções')
const fix = await agent(`Você é o CORRETOR da rodada 2 da Fase 0. ${REGRAS}
Resolva, cada um com teste que falharia antes e commit próprio:
1. [ALTA] verificarFii (fatia B/D — fator de cotas de FII): a guarda de "ida e volta" só olha grupamentos nos 6 meses ANTERIORES; o caso inverso (salto de cotas por erro no informe primeiro, correção como grupamento no mês seguinte) vira desdobramento 'confirmado'. Tornar a guarda simétrica (olhar também os meses seguintes disponíveis) e reprocessar os FIIs afetados no dev.
2. [ALTA] cron /api/cron/analise-ativos/scores passa bem de 300 MB dentro do next-server, e a memória não é devolvida ao app. Solução preferida: jobs pesados (scores e qualquer outro que passe de ~250 MB medido) rodam em PROCESSO SEPARADO — um runner CLI (ex.: scripts/analise-ativos/rodar-job.ts <job>, reaproveitando o mesmo wrapper de job/AnaliseJobRun) chamado pela linha de cron do template (via tsx em /opt/myfinance/current com o env do app, como o RUNBOOK já faz para backfill), mantendo a rota HTTP só para disparo manual/leve ou fazendo-a recusar execução quando RSS base já estiver alto. Documente no RUNBOOK e atualize as linhas do template. Meça o pico do runner (/usr/bin/time -v) e registre.
3. [MÉDIA] Regra 13 em calcularAtualAcao: quando todos os DFPs anteriores são 'nao_verificavel', a contagem mais recente é usada sem referência. Nesse caso, usar a contagem só se consistente com lucro/LPA publicado (±5%) e, se não houver como verificar, marcar incompleto('acoes_nao_verificavel') em vez de calcular múltiplos por ação.
4. [MÉDIA] Escala declarada errada (PDTC3: DFP 2024/2025 dizem UNIDADE mas os valores estão em milhares — receita 298.759, PL 121.931). Detectar pela coerência com o LPA publicado e/ou salto de ~1000× contra o ano vizinho; corrigir a escala com flag 'escala_corrigida' ou marcar incompleto se ambíguo. Varra o dev por outros casos e registre quantos.
5. CNPJ: padronizar em 14 dígitos SEM máscara em todas as tabelas novas (como a spec pede e como cvm_fund_quotas faz), normalizando na ingestão (A, B, D, E) e regravando o dev por reprocessamento idempotente. Se as chaves antigas mascaradas ficarem órfãs no dev e não puderem ser apagadas sem DELETE em massa, liste-as em ${OUT}/qa/orfas-cnpj.md com o comando SQL que um humano rodaria.
6. Controladora zerada (regra 12, 41 ações incompletas, ex. SBSP3 com 3.11.01 e 3.11.02 zeradas no consolidado): quando as duas atribuições vierem zeradas e o lucro consolidado ≠ 0, usar o lucro do escopo INDIVIDUAL do mesmo documento (no BR GAAP ele é o lucro atribuído à controladora), com flag 'lucro_individual'. Reprocesse e informe quantas saem de incompleto.
Ao final: npx tsc --noEmit -p .; npm run lint; vitest em src/services/analiseAtivos, src/app/api/cron/analise-ativos e scripts/analise-ativos; rm -rf .next && npm run build; atualize ${OUT}/cobertura-dev.md (seção "rodada 2" com os números novos: incompletos, escores). Retorne o que fez, os SHAs e as medições.`,
  { label: 'corretor-rodada2', phase: 'Correções' },
)

phase('Reverificação')
const [op, cod] = await parallel([
  () => agent(`Você é o QA DE OPERAÇÃO da rodada 2. ${REGRAS}
Relato do corretor: ${fix}
Você está num worktree: git checkout --detach ${BRANCH}; ln -s ${REPO}/node_modules node_modules; cp ${REPO}/.env .env; cp ${REPO}/next-env.d.ts . 2>/dev/null. Meça, com /usr/bin/time -v (pico de RSS) e tempo: (a) cada linha de cron do template nova/alterada, executada do jeito que o cron executará (rota HTTP via next start -p 3360 com VmRSS do next-server amostrado a cada 1 s, OU o runner CLI); (b) 2 execuções seguidas de cada uma (idempotência: COUNT das tabelas igual). Reprove pico > 300 MB no processo do job ou > 240 s. Confira que as linhas do template usam o mesmo mecanismo autenticado/ambiente das existentes e que o RUNBOOK descreve o novo runner. Pare o servidor (kill <pid> em comando separado).`,
    { label: 'qa-operacao-r2', phase: 'Reverificação', schema: FINDINGS, isolation: 'worktree' }),
  () => agent(`Você é o QA DE CÓDIGO E DADOS da rodada 2. ${REGRAS}
Relato do corretor: ${fix}
Para cada um dos 6 itens corrigidos: leia o diff, rode o teste novo, reproduza o cenário original no banco dev (só leitura: SBSP3 lucro 2025, PDTC3 receita/VPA 2024-2025, um FII com salto de cotas e correção posterior, um caso de ações todas 'nao_verificavel', CNPJ sem máscara em todas as tabelas novas + joins entre elas funcionando) e confirme que está resolvido sem regressão. Confira 5 números de controle da Fase A (WEGE3 2016 1.614,35 mi ações; PETR4 2024 payout ~275%; HGLG11 VP/cota ago/26 165,95; KNIP11 119 CRIs; WEGE3 Índice MF ~8,0). Reporte só o que continua quebrado ou quebrou.`,
    { label: 'qa-codigo-dados-r2', phase: 'Reverificação', schema: FINDINGS }),
])

return { correcao: fix, operacao: op, codigo: cod }
