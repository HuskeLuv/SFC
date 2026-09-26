# Decisões do Wellington (23/09/2026) — valem sobre qualquer pergunta em aberto da especificação

1. Sessão: 30 dias com renovação deslizante (no máx. 1×/dia) e TETO de 90 dias desde o login. Sem "Manter conectado": cookie de sessão (sem maxAge) + JWT de 12h, sem renovação. Admin e consultor: 1 dia, sem renovar. Personificação mantém os 30 min atuais.
2. "Sair de todos os dispositivos": ENTRA JÁ nesta fase — API (incrementa sessionVersion) + botão no Perfil (src/components/user-profile) com confirmação.
3. - Lançar na fase 0: "Novo investimento" (/carteira?acao=novo abre o AddAssetWizard) e "Resgatar" (/carteira?acao=resgate abre o RedeemAssetWizard) FUNCIONANDO; "Despesa ou receita" visível, desabilitado (aria-disabled) com selo "Em breve". Parâmetro ?acao é limpo da URL ao abrir.
4. Ícone do app: marca azul #0079F2 sobre fundo BRANCO.
5. #0079F2 só em elementos não textuais (ícone ativo, pílula, FAB, foco); textos/links/botões com texto em patrimônio #396CAA (claro) e tranquilidade #6E9DC4 (escuro).
6. NÃO mexer em brand-500 (#465fff) nesta fase — vira PR separado depois. Desktop inalterado.
7. Negativos: vermelho semântico #D92D20 (claro) / #F97066 (escuro), como no "Quanto falta".
8. Rótulo da aba: "Planejar" (em vez de "Planejamento") — só na barra de abas mobile; aria-label pode manter "Planejamento".
9. Painel Mais AGRUPADO: Finanças / Organização / Aprender e conversar + seção Conta (Perfil, Modo escuro, Instalar app, Sair de todos os dispositivos fica no Perfil, Sair).
10. Título duplicado (cabeçalho mobile + h1 da página) ACEITO até as fases 1–3.
11. Convite de instalação: só na Carteira, a partir da 2ª visita, "Agora não" esconde 30 dias, iOS tem "Não mostrar de novo"; localStorage falhou = não mostra; "Instalar app" fixo no Mais.
12. Avatar do cabeçalho abre o painel Mais rolado na seção Conta.
