# Fase 5 (web push + acabamento) — decisões do Wellington (29/09/2026)

Aprovadas em bloco ("pode seguir") sobre a spec final (`fase5-spec-desenho.json`) e o
protótipo (`fase5-prototipo.html`, publicado em https://claude.ai/artifact/TKEPbpBcq3Ejv8CPoKswxB).
**Estas decisões prevalecem sobre a spec e o protótipo.**

1. **Payload (LGPD):** título = `Notification.title` real (verificado sem R$) + corpo genérico
   ("Toque para ver os detalhes."). A `message` (que embute valores) nunca sai no push.
2. **Momentos do convite:** sheet pós-salvar lembrete na Agenda (C1) **entra**; cartão-convite no
   sino (C2) **fora** da v1; Perfil sempre disponível. Recolor Aceitar/Recusar do sino = PR
   separado, fora da fase.
3. **Lista de aparelhos** no Perfil (GET /api/push/subscriptions + DELETE por id) **entra** na v1.
4. **Push no desktop liga junto**; Perfil desktop ganha a seção Notificações (única mudança nova
   ≥ lg) + 2 correções de acabamento visíveis no desktop (links da Saúde na paleta, título
   repetido nos Relatórios) + string neutra do "Manter conectado". **Snapshots de desktop
   atualizados UMA vez, em commit dedicado, com diff visual apresentado ao Wellington antes do
   merge.**
5. **Consultor agindo pelo cliente:** push espelha o sino 1:1 (sem supressão especial).
6. **Cortes (viram follow-ups registrados):** setAppBadge; Desfazer do lançamento rápido com
   fórmula/comentário; "notificação de exportação concluída" (hoje o export não cria
   Notification — copy da categoria corrigida). Saem da lista por JÁ estarem na main: revogação
   do token iCal (#223) e chip do MobileTabRail (já 44px).
7. **Legal:** lançar sem esperar os advogados; pendência registrada: mencionar push/notificações
   no Aviso de Privacidade na próxima revisão deles.
8. **Limitações aceitas da v1:** logout não cancela a assinatura de push do aparelho (remédio =
   lista de aparelhos); deep link com sessão vencida cai no /signin e perde o destino (follow-up
   barato: /signin guardar destino no cliente).
9. **Produção:** chaves VAPID geradas e aplicadas no app.env do Lightsail COM o Wellington
   conferindo, ANTES do merge/deploy da fase.

## Desyncs protótipo × spec (a spec vence; acertar na construção)

- TTL da categoria **conta = 7 dias** (o card do protótipo diz 2d).
- A lista de aparelhos ENTRA (bullet do cenário P2 do protótipo ainda diz que ficou fora).

## Operacional

- Fase trabalha a partir da **main** (PWA já em produção). Branch de integração da fase:
  `feat/pwa-fase5`, PR único para a main ao final (merge do Wellington).
- Chaves VAPID de DEV geradas em 29/09 e adicionadas ao `.env` local (nunca commitadas).
