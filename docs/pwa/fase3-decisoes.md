# Decisões do Wellington — fase 3 (demais módulos), 26/09/2026

Aceitou todas as recomendações ("pode seguir"). **Valem sobre a spec** (`fase3-spec-desenho.json`) e o protótipo (`fase3-prototipo.html`) onde divergirem.

1. **Agenda: corte da lista em 768px** (o da fase 0, `LARGURA_MOBILE`). Abaixo de 768: lista + cabeçalho próprio (mês ‹ ›, Hoje, Filtros). Entre 768 e 1023 o tablet mantém a GRADE de mês. (O arquiteto propunha 1024; rejeitado.) "Evento na agenda" fica FORA do + Lançar.
2. **Título das páginas:** NÃO criar h1 novo. O título que já existe (h1 ou h2 de página) fica visível e compacto (`max-lg:text-lg`); nada sr-only, nada duplicado. Onde vem do PageBreadCrumb, fica como está.
3. **Saúde:** Status no topo SÓ no celular, por ramo JS (`useIsBelowLg`), nunca `max-lg:order-*`. Desktop e PDF do computador na ordem da planilha. Blocos recolhíveis.
4. **Cores de status fora da paleta** (verde/amarelo em Saúde, Dívidas, Histórico, Sonhos, Educação): no celular = ponto + palavra (azul ok, âmbar atenção — exceção já aceita —, vermelho problema). Desktop igual; alinhar depois em PR separado.
5. **Simulador:** premissas em cartão 3×3 que abre sheet alto (resultado na primeira tela); campos numéricos com `MobileNumberField` (vírgula) no celular, mesmo número no `handleChange`; desktop continua `type="number"`.
6. **Cadastro/edição de Dívida e de Objetivo em sheet alto** no celular (inline no desktop, via prop cujo padrão é o de hoje). **`?divida=id` e `?caixa=1` com pushState SÓ no celular** (voltar do Android/gesto do iPhone); desktop não mexe na URL.
7. **Confirmações em sheet só no celular** (Desfazer do Histórico, Desconectar banco, Excluir dívida/evento/registro/objetivo, Remover pagamento, Excluir seguro); desktop mantém `window.confirm` com o mesmo texto.
8. **2FA:** QR + "Copiar chave" + código `one-time-code` + link **"Abrir no app autenticador"** (`otpauth://` que a API já devolve), só no celular.
9. **Open Finance:** consentimento no sheet alto SEM mudar nenhum caractere e SEM versão nova do texto (o registro guarda texto e hash, não layout). Se no aparelho real a volta do banco cair no Safari no app instalado, só essa jornada abre no navegador com aviso — decidido no QA em aparelho real, não nesta construção.
10. **Comunidade:** layout mobile entra, flag `COMUNIDADE_HABILITADA` DESLIGADA em produção e no CI (spec mobile pula com anotação); validar no dev. Moderação fora.
11. **Pendências da fase 2:** entra SÓ a barra do mês do Orçamento fixa ao rolar. "Recolher" no sheet do grupo, flash, trava e fórmula ficam para depois.
12. **e2e:** nenhum `desktop-*.spec` grava. Os que gravam (Desfazer do Histórico, evento da Agenda) ficam em `*.escrita.spec.ts`, projeto Playwright separado que roda por último, com `E2E_ALLOW_WRITES`. Conexões param na etapa 2 (sem registrar consentimento).
13. **PDF:** `window.print()` como hoje. Em `/relatorios` e `/saude-financeira` toda diferença de celular usa a variante `mscreen:` (tela e < 64rem; nunca vale na impressão); guarda de impressão A4 real (page.pdf) no CI. O botão Exportar abre os blocos recolhidos antes de imprimir.
14. **Produção** (depois desta fase): QA com o Pedro no build de produção em aparelho real (Android + iPhone), migração `user_session_version` testada em cópia de prod, merge da main no branch do PWA, plano de volta, então merge único. Push (fase 5) não bloqueia.
15. Desktop idêntico; guardas estruturais por módulo gravadas ANTES de refatorar, rodando no CI.
