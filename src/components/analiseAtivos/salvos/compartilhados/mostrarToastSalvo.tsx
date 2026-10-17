'use client';

/**
 * Aviso (toast) do Salvar/Remover e das ações de listas, comparações e filtros (bloco 1, fatia 0).
 * Monta a frase com os literais do Pedro (textosSalvos.toast) e usa o aviso global da Carteira
 * (mostrarToastMover): 8 s, Desfazer (também Ctrl/Cmd+Z), MobileSaveToast no celular; erro com
 * "Tentar de novo". Uma mensagem por vez; o host monta sozinho no 1º aviso.
 *
 * - salvo:   "WEGE3 salvo em Salvos" (+ " · você recebe aviso de resultado e data-com" só com
 *            comAviso = recursos.alertas) + Desfazer
 * - removido: "WEGE3 removido de Salvos" + Desfazer (o Desfazer da tabela é o POST do item)
 * - listaCriada: "Lista X criada." / "Lista X criada com TAEE11."
 * - erro / info: mensagem pronta (de textosSalvos)
 */
import { mostrarToastMover } from '@/components/carteira/mover/moverToast';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ToastSalvo } from '@/types/analiseAtivosSalvos';

export type { ToastSalvo };

const T = TEXTOS_SALVOS.toast;

/** A frase do aviso (exportada para os testes e para leitores de tela fora do toast). */
export function textoToastSalvo(dados: ToastSalvo): string {
  switch (dados.tipo) {
    case 'salvo':
      return (
        formatarTexto(T.salvoEm, { ticker: dados.ticker, lista: dados.lista }) +
        (dados.comAviso ? T.comAviso : '')
      );
    case 'removido':
      return formatarTexto(T.removidoDe, { ticker: dados.ticker, lista: dados.lista });
    case 'listaCriada':
      return dados.ticker
        ? formatarTexto(T.listaCriadaCom, { lista: dados.lista, ticker: dados.ticker })
        : formatarTexto(T.listaCriada, { lista: dados.lista });
    case 'erro':
    case 'info':
      return dados.mensagem;
  }
}

/** Mostra o aviso; devolve o id (fecharToastMover(id) fecha só ele). */
export function mostrarToastSalvo(dados: ToastSalvo): number {
  const mensagem = textoToastSalvo(dados);
  if (dados.tipo === 'erro') {
    return mostrarToastMover({ tipo: 'erro', mensagem, tentarDeNovo: dados.tentarDeNovo });
  }
  if (dados.tipo === 'salvo' || dados.tipo === 'removido') {
    return mostrarToastMover({ tipo: 'ok', mensagem, desfazer: dados.desfazer });
  }
  return mostrarToastMover({ tipo: dados.tipo === 'info' ? 'info' : 'ok', mensagem });
}
