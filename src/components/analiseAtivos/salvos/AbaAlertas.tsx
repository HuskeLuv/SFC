'use client';

/**
 * AbaAlertas (bloco 1) — STUB da fatia 0 com a assinatura FINAL; a fatia D preenche.
 *
 * O que a fatia D entrega aqui: a aba Salvos › Alertas (lida das Notification de type
 * ANALISE_SALVOS_ALERTA_TYPE via useAlertas(classe)), 90 dias agrupados por dia ("Hoje · 16/10",
 * "Ontem · 15/10"), abas Ações · FIIs com contagem (onTrocarClasse), "Marcar todos como lidos"
 * (useMarcarAlertasLidos), vazio (com "Ligar alertas de <primeiraLista>" ou "Criar lista"), vazio
 * da classe, erro com "Tentar de novo" e o painel "Como os avisos chegam" (TEXTOS_ALERTAS.
 * comoChegam: sino sempre, push conforme o Perfil, "por volta das 8h", resumo acima de 5). Cada
 * aviso abre o href da metadata. Consultor: vazio. Só é montada com recursos.alertas (fatia C).
 */
import type { AbaAlertasProps } from '@/types/analiseAtivosSalvos';

export type { AbaAlertasProps };

export default function AbaAlertas(_props: AbaAlertasProps) {
  return null;
}
