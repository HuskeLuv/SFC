import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { exigirAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import { exigirOrcamentoV2Ativado } from '@/services/cashflow/orcamentoV2/rotaExclusao';
import {
  ErroEscritaOrcamento,
  respostaDaSubcategoria,
  salvarOrcado,
  type EntradaOrcado,
} from '@/services/cashflow/orcamentoV2/escritaOrcado';
import {
  anoSchema,
  fonteSchema,
  lerCorpo,
  mesSchema,
  pctSchema,
  respostaErroEscrita,
  valorSchema,
} from '@/services/cashflow/orcamentoV2/esquemasEscrita';
import { validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * PUT /api/cashflow/orcamento/v2/subcategorias/[itemId]/orcado — grava o orçado da subcategoria
 * num mês (desenho técnico §6.3). Corpo `{ano, mes(1-12), valor}` | `{ano, mes, pct}` |
 * `{ano, mes, valor: null}` (limpa); `fonte` opcional só para o recálculo da resposta.
 *
 * 200 `{subcategoria, categoria, resumo}` recalculados pela montagem pura do GET; 422 com `valor`
 * e `pct` juntos; 400 corpo inválido ou `pct` fora da categoria de poupança/na Geral (R-17); 404
 * item oculto, fora das categorias ou de outro usuário. Flag/beta → 404; não ativado → 409.
 * Item-template é personalizado antes (o orçado mora no id do usuário). Histórico
 * `orcamento.item.editar` com Desfazer; CSRF pelo middleware; sempre o targetUserId.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const baseSchema = z.object({ ano: anoSchema, mes: mesSchema, fonte: fonteSchema.optional() });
const valorBodySchema = baseSchema.extend({ valor: valorSchema.nullable() });
const pctBodySchema = baseSchema.extend({ pct: pctSchema });

export const PUT = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) => {
    const auth = await exigirAcessoOrcamentoV2(request);
    const { payload, targetUserId, actingClient } = auth;
    const { itemId } = await params;
    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/cashflow/orcamento/v2/subcategorias/[itemId]/orcado',
      'PUT',
    );
    await exigirOrcamentoV2Ativado(targetUserId);

    const corpo = await lerCorpo(request);
    if (!corpo) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
    const temValor = 'valor' in corpo;
    const temPct = 'pct' in corpo;
    if (temValor && temPct) {
      return NextResponse.json(
        { error: 'Informe valor ou pct, não os dois', codigo: 'valor_e_pct' },
        { status: 422 },
      );
    }
    if (!temValor && !temPct) {
      return NextResponse.json({ error: 'Informe valor ou pct' }, { status: 400 });
    }

    let entrada: EntradaOrcado;
    let fonte: z.infer<typeof fonteSchema> | undefined;
    if (temPct) {
      const parsed = pctBodySchema.safeParse(corpo);
      if (!parsed.success) return validationError(parsed);
      entrada = {
        ano: parsed.data.ano,
        mes0: parsed.data.mes - 1,
        modo: 'pct',
        pct: parsed.data.pct,
      };
      fonte = parsed.data.fonte;
    } else {
      const parsed = valorBodySchema.safeParse(corpo);
      if (!parsed.success) return validationError(parsed);
      entrada = {
        ano: parsed.data.ano,
        mes0: parsed.data.mes - 1,
        modo: 'valor',
        valor: parsed.data.valor,
      };
      fonte = parsed.data.fonte;
    }

    let resultado;
    try {
      resultado = await salvarOrcado(targetUserId, itemId, entrada, {
        contexto: { request, auth },
      });
    } catch (error) {
      if (error instanceof ErroEscritaOrcamento) return respostaErroEscrita(error);
      throw error;
    }

    const resposta = await respostaDaSubcategoria(targetUserId, resultado.itemId, {
      ano: entrada.ano,
      mes0: entrada.mes0,
      fonte,
    });
    if (!resposta) {
      return NextResponse.json({ error: 'Subcategoria não encontrada' }, { status: 404 });
    }
    return NextResponse.json(resposta, { headers: { 'Cache-Control': 'no-store' } });
  },
);
