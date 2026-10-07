# Escolher o destino na importação Open Finance — decisões do desenho (06/10/2026)

Workflow de desenho wf_a9285890-655 (arquiteto, designer, revisor crítico, revisão final; 5 agentes, ~25 min). Spec completa: `spec-desenho.json` (5 fatias: 0 contratos, A serviço + refatoração pura do mover + sync, B rotas + histórico/undo, C componentes da revisão, D integração nas telas + e2e). Protótipo: `prototipo.html` (artifact https://claude.ai/artifact/DsGnfRAwyv1FZbMCmZ8Qmw). Revisão crítica: 3 altas, 6 médias, 5 baixas — incorporadas na versão final.

## Recomendações levadas ao Wellington

1. **Momento — híbrido "entra e confere".** A importação continua automática e o investimento entra no lugar sugerido (nada fica fora da Carteira, da Saúde Financeira, do Caixa para Investir nem do patrimônio). Logo depois de conectar dá para conferir e trocar; o que chegar nas sincronizações seguintes fica "para conferir" em Conexões bancárias. Sem status novo de importação; coluna aditiva `BankInvestment.destinoConfirmadoEm`. Arquiteto e designer concordam.
2. **Ordem das telas.** "Conexão realizada" continua sendo a primeira tela (texto da adequação jurídica). Ela ganha o botão "Escolher onde ficam (N)", que abre a revisão; voltar ou salvar retorna ao resumo.
3. **Granularidade.** Troca item a item + lote: no computador, seleção livre e "marcar todos" por faixa, oferecendo só os destinos aceitos por todos os marcados; no celular, "Trocar todos" na faixa. Regras lembradas por tipo para as próximas importações ficam fora.
4. **Sugestão.** Parte de onde a importação colocou e mostra de onde veio ("catálogo da CVM", "pelo nome", "seção padrão", "pelo indexador"). FII fora do catálogo que caiu na seção padrão ganha o selo "confira". Só destinos permitidos (regras do Mover, vindas do servidor); os bloqueados ficam recolhidos com o motivo. Previdência, "Já estava na Carteira" e "Cadastrar à mão" aparecem sem escolha.
5. **CDB/LCI/LCA com liquidez diária.** Continua sugerindo Renda Fixa, com a dica "pode servir de reserva".
6. **Histórico.** A escolha na importação não ganha selo "movido"; fica no Histórico como "Escolheu onde fica…" com Desfazer (volta à sugestão e à fila). O "Voltar ao original" do Mover continua levando à classificação do catálogo. Por isso a tela fala em "lugar que você escolheu", não "destino original".
7. **Salvar.** Valida todos os itens antes de gravar: se algum não pode, nada muda ("Nenhum investimento mudou de lugar"). Só se outra tela mexer no mesmo investimento durante o salvamento aparece resultado parcial, explicado por item, com "Tentar de novo".
8. **Itens já importados em produção.** Marcar todos como já conferidos (fila começa vazia), com a coluna nova "Na Carteira em" e link para a aba. Alternativa: colocar na fila os importados nos últimos 7 dias.
9. **Avisos fora de Conexões.** Sem contador no menu e sem selo "do banco" na Carteira nesta entrega (precisa de infraestrutura nova). Aviso só em Conexões bancárias e logo após conectar.
10. **Consultor.** Continua bloqueado nas telas de conexão (403); ajusta pelo Mover na Carteira.
11. **Liberação.** Atrás da chave `PLUGGY_DESTINOS_HABILITADO`, desligada; QA com o banco de teste do Pluggy (Reservas ligadas, como em prod); depois ligar. Desligar não perde escolhas feitas.
