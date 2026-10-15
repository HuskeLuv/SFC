export const meta = {
  name: 'analise-v25-regras-pedro-desenho',
  description: 'Desenho: realinhar regras dos Filtros de Fundamentos à spec v2.4 do Pedro + camada de fontes pronta p/ provedor pago',
  phases: [{ title: 'Arquitetura' }, { title: 'Revisão' }, { title: 'Final' }],
}

const CONTEXTO = `
Projeto: /home/huske/dev/front (Next.js 15, Prisma, Postgres). Área "Análise de Ativos" v2.4 (Filtros de Fundamentos) já em PROD (PRs #298, #300). Só admin vê.
Spec do cliente (Pedro): docs/analise-ativos/spec-v2-pedro-out2026/especificacao-v2.txt (seções 3.2, 4.1, 4.4, 5, 6) + prototipo-pedro-v2.html.
Decisões anteriores (que AGORA são parcialmente revertidas): docs/analise-ativos/v2-filtros/decisoes.md, spec-desenho.json, e docs/analise-ativos/spec-v2-pedro-out2026/decisoes.md.
Código: src/services/analiseAtivos/ (params/criteriaParamsV1.ts, criteriaParamsSchema.ts, regras/criterios/*, job criterios, textosCriterios.ts, textosLiterais.ts), componentes em src/components/analiseAtivos (ou similar — localize), Prisma em prisma/schema.prisma (AssetFundamentalsPeriod já tem source/sourceUrl/fetchedAt; FiiMonthly, FiiQuarterly, FiiTipoOverride, AssetPerShareYearly, AnaliseQuadroLinha, criteria_params/criteria_eval).

NOVA DIRETRIZ DO DONO (Wellington, 15/10/2026): "deixar as questões de regras o mais próximo possível do que o Pedro sugeriu nos arquivos que mandou. Ignorar que agora usamos dados adquiridos de forma gratuita e deixar já preparado para receber dados de uma fonte paga que ele contrate."
Decisões já tomadas:
- Financeiras (bancos/seguradoras/holdings): COMO A SPEC → "n de 6" para todos. EBITDA, Dív/EBITDA, FCL, margem sem dado → "não atende · sem dado nas demonstrações". A lista naoSeAplica fica no criteria_params, VAZIA por padrão (pode ser religada sem código). Isso reverte D4 e o fix de holdings (margemNaoComparavel) de hoje — remover ou deixar inerte atrás do params.
- Fora do escopo (continua como está, D5): Ranking/votos/teses públicas, Stocks/REITs, Salvos/Criar lista/Salvar, Comunidade. Comparador/Cenários seguem atrás de flag até jurídico. D6 (drop do score) é etapa separada.
Mudanças a desenhar (pergunta → alvo pela spec):
 2. Alvo por ativo: spec = modal "Planejar na carteira · ‹ticker›", campo "Peso-alvo na carteira (%)" em branco (placeholder "ex.: 5"), classe no Planejamento ("Ações · 18,6% da carteira (alvo da classe: 20%)"), posição atual, resumo ao vivo (valor equivalente, quantidade equivalente, "Posição atual vs. alvo: −2,2 p.p. (R$ 3.633 · 69 ações)"), "Salvar no Planejamento" grava em planning_asset_targets (user_id+asset_id, target_pct, created/updated), chip "Planejado", "Remover do plano". Card "Na sua carteira" com "posição atual 3,8% · alvo planejado por você: 5% · desvio −1,2 p.p. (R$ 1.982)" — base = carteira TOTAL. Hoje usamos Portfolio/Watchlist.objetivo (% da aba). Desenhar a nova tabela, migração aditiva, como convive com o Objetivo da Carteira (não quebrar a Carteira), consultor agindo por cliente, caso de teste 33 da spec §4.5 com a base original.
 4. FII vacância/inadimplência/LTV: chip ATIVO (hoje desabilitado), séries vacancy_physical (fundamentals FII), default_pct e ltv_avg (fii_property_quality, com review_status; nada pending aparece). Sem fonte hoje → "não atende · sem dado nas demonstrações". Chip de FII mostra rótulo de tijolo e, em cinza, o de papel.
 5. Alavancagem: rótulo "Alavancagem ≤ 20% do PL", série leverage_pct (hoje Obrigações/PL calculado da CVM — pode continuar como implementação da série enquanto não há provedor).
 6. Tipos de FII: spec só tijolo/papel/hibrido; híbrido com imóveis ≥ 50% do PL → critérios de tijolo, senão papel. Hoje FoF aparece como "FoF" na coluna Tipo e há 'indefinido'/'sem tipo'. Alinhar ao máximo.
 7. "Lucro descontado"/"Margem descontada" (Essencial e critério Lucro crescente: "net_income (descontado quando disponível)"): série net_income_adjusted; se a fonte não entregar, usar lucro líquido e sinalizar NO TOOLTIP (regra literal da spec §3.2). Rótulos como na spec.
 8. Janela 10 em FII: remover a nota extra.
 9. Rendimento/cota: série income_per_share (fundamentals FII); proventos pagos só como fallback/implementação atual da série.
 13. Registrar operação: spec = modal (operação, quantidade, preço pré-preenchido com a cotação, data, corretora) com resumo ao vivo (total, nova posição, novo preço médio), chama o endpoint da Carteira. Hoje pedimos seção obrigatória na 1ª compra e venda só com posição. Ficar o mais perto possível; a Carteira exige seção → escolher automaticamente uma seção padrão sem perguntar (desenhar qual).
 - Chip Dív. líq./EBITDA: rótulo da spec "Dív. líq./EBITDA < 3×" (verificação continua ≤ 3,0).
 - Confirmar que limites, janelas, regra 'up' (J+1 valores), 'months' (12×J), caixa líquido = dentro, já batem com a spec (perguntas 1,10,11,12 — sem mudança).
 PREPARAR PARA PROVEDOR PAGO (spec §5 e §6): camada de fontes por mercado com interface única (ex.: FonteFundamentos com implementação CVM atual), prioridade configurável provedor pago > CVM, proveniência por linha (source, source_url, fetched_at, reviewed_by), point-in-time, campos novos para séries hoje vazias (net_income_adjusted, vacancy_physical, vacancy_financial, leverage_pct, default_pct, ltv_avg, ffo, income_per_share, nav_per_share, months_with_income), tabela fii_property_quality (spec §5) com review_status/extracted_by/source_pdf_url/source_page; regras de sanidade da spec §6 (variação > 40% → revisão; campo obrigatório ausente → incomplete). O app nunca chama terceiros na renderização. Objetivo: contratar provedor = escrever um conector + config, SEM migration nova. NÃO implementar conector pago real; no máximo um conector de exemplo/fake usado nos testes.
Restrições: migrations só aditivas (prod tem dados; escrita em prod exige OK por ação); paleta My Finance (brandColors.ts); commits atômicos; textos regulatórios (palavras proibidas: preço justo, barato, caro, desconto, oportunidade, faltam, compre...). A spec diz que o banco não pode ter nota proprietária.
`

const DESENHO_SCHEMA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    mudancas_por_item: { type: 'array', items: { type: 'object', properties: {
      item: { type: 'string' }, hoje: { type: 'string' }, alvo_spec: { type: 'string' }, como: { type: 'string' }, arquivos: { type: 'array', items: { type: 'string' } } }, required: ['item','hoje','alvo_spec','como','arquivos'] } },
    camada_fontes: { type: 'string', description: 'interface, tabelas/colunas novas, prioridade, proveniência, sanidade, como um conector pago entra' },
    migrations: { type: 'array', items: { type: 'string' } },
    fatias: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, titulo: { type: 'string' }, escopo: { type: 'string' }, arquivos: { type: 'array', items: { type: 'string' } }, depende_de: { type: 'array', items: { type: 'string' } }, testes: { type: 'string' } }, required: ['id','titulo','escopo','arquivos','depende_de','testes'] } },
    ativacao_prod: { type: 'string', description: 'passos em prod após merge (migration, nova criteria_params v2, job, etc.)' },
    riscos: { type: 'array', items: { type: 'string' } },
    duvidas_para_wellington: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo','mudancas_por_item','camada_fontes','migrations','fatias','ativacao_prod','riscos','duvidas_para_wellington'],
}

phase('Arquitetura')
const desenho = await agent(`Você é o arquiteto. Leia a spec do Pedro (seções citadas), as decisões anteriores e o CÓDIGO REAL atual, e desenhe a mudança abaixo. Seja concreto: nomes de arquivos reais, modelos Prisma, chaves de criteria_params, funções. Divida a construção em 3 a 4 fatias que possam rodar em paralelo em worktrees SEM arquivos em comum (uma fatia 0 de contratos bloqueante é aceitável se necessária). Não escreva código de produção; só leia.\n${CONTEXTO}`, { label: 'arquiteto', phase: 'Arquitetura', schema: DESENHO_SCHEMA })

phase('Revisão')
const revisao = await agent(`Você é um revisor crítico e adversarial. Abaixo está um desenho. Confira contra a spec do Pedro (docs/analise-ativos/spec-v2-pedro-out2026/especificacao-v2.txt) e o código real: (a) algum item se afasta da spec sem necessidade? (b) a camada de fontes realmente permite plugar um provedor pago sem migration? (c) migrations são aditivas e seguras em prod? (d) as fatias têm arquivos em comum (conflito)? (e) algo quebra a Carteira, consultor, testes existentes (casos §4.5) ou o job diário? (f) faltou algo da lista de mudanças? Liste achados com severidade alta/média/baixa e correção proposta.\n${CONTEXTO}\n\nDESENHO:\n${JSON.stringify(desenho, null, 1)}`, { label: 'revisor', phase: 'Revisão', schema: { type: 'object', properties: { achados: { type: 'array', items: { type: 'object', properties: { severidade: { type: 'string' }, achado: { type: 'string' }, correcao: { type: 'string' } }, required: ['severidade','achado','correcao'] } } }, required: ['achados'] } })

phase('Final')
const final = await agent(`Você é o arquiteto. Incorpore os achados do revisor (todos os altos e médios; baixos se baratos) ao desenho e devolva o desenho final no mesmo formato. Em duvidas_para_wellington, só o que for decisão de produto genuína (máx. 4), cada uma com recomendação.\n${CONTEXTO}\n\nDESENHO:\n${JSON.stringify(desenho, null, 1)}\n\nACHADOS:\n${JSON.stringify(revisao, null, 1)}`, { label: 'arquiteto-final', phase: 'Final', schema: DESENHO_SCHEMA })

return { final, achados: revisao }
