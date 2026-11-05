import type { IRPlanoPrevidencia } from '@/hooks/useIR';
import { parseCurrencyInput } from '@/utils/parseCurrencyInput';
import {
  simularIrpfAnual,
  type EntradaIrpfAnual,
  type RegrasIrpfAnual,
  type ResultadoIrpfAnual,
} from '@/services/ir/irpfAnual';
import { formatBRL } from './irFormatters';

/**
 * Peças puras da simulação PGBL compartilhadas pela aba PGBL e pelo Resumo Anual (86e2xnyrg):
 * entrada a partir dos campos salvos, balanço estimado da DAA, texto de "Copiar lançamentos",
 * HTML do "Exportar resumo (PDF)" e o lembrete de aporte na Agenda.
 */

/** Campos digitados → entrada da simulação (aportes da carteira + os de fora dela). */
export function entradaDosCampos(
  campos: Record<string, string | undefined>,
  aportesCarteira: number,
): EntradaIrpfAnual {
  const num = (id: string) => parseCurrencyInput(campos[id] ?? '') ?? 0;
  return {
    rendaTributavel: num('rendaTributavel'),
    inss: num('inss'),
    aportesPgbl: aportesCarteira + num('aportesOutros'),
    dependentes: Math.floor(num('dependentes')),
    saude: num('saude'),
    educacao: num('educacao'),
    pensaoJudicial: num('pensaoJudicial'),
    livroCaixa: num('livroCaixa'),
    doacoesIncentivadas: num('doacoesIncentivadas'),
    irRetido: num('irRetido'),
  };
}

export interface BalancoDaa {
  /** IR do exterior (Stocks/REITs/ETFs EUA) apurado na própria declaração. */
  irInvestimentos: number;
  deducaoPgbl: number;
  doacoes: number;
  irRetido: number;
  irDevido: number;
  /** > 0 restituição, < 0 imposto a pagar. */
  saldo: number;
  modelo: 'completo' | 'simplificado';
}

/**
 * Balanço estimado da DAA: retido na fonte − IR devido no melhor modelo − IR do exterior (que,
 * desde a Lei 14.754/2023, entra na declaração anual). Renda variável BR, cripto e come-cotas
 * ficam de fora: são pagos por DARF ou retidos durante o ano.
 */
export function balancoDaa(
  r: ResultadoIrpfAnual,
  irRetido: number,
  irExterior: number,
): BalancoDaa {
  const irInvestimentos = Math.max(0, irExterior);
  const modelo = r.melhorModelo;
  const doacoes = modelo === 'completo' ? r.completo.doacoes : 0;
  const saldo = Math.round((r.saldoAjuste - irInvestimentos) * 100) / 100;
  return {
    irInvestimentos,
    deducaoPgbl: r.pgbl.economiaAtual,
    doacoes,
    irRetido,
    irDevido: r.irDevido,
    saldo,
    modelo,
  };
}

export interface DadosResumoPgbl {
  ano: number;
  entrada: EntradaIrpfAnual;
  r: ResultadoIrpfAnual;
  planosPgbl: IRPlanoPrevidencia[];
  /** Aportes informados à mão (planos fora da carteira). */
  aportesOutros: number;
}

const MODELO_LABEL = { completo: 'completo', simplificado: 'simplificado' } as const;

/** Texto de "Copiar lançamentos": o que digitar em cada ficha da declaração. */
export function textoLancamentos({ ano, entrada, r, planosPgbl, aportesOutros }: DadosResumoPgbl) {
  const linhas: string[] = [
    `Declaração de ${ano + 1} (ano-calendário ${ano}) — estimativa My Finance, não substitui os informes.`,
    '',
    `Modelo indicado: ${MODELO_LABEL[r.melhorModelo]}.`,
  ];
  const pagamentos: string[] = [];
  for (const p of planosPgbl) {
    if (p.aportesTotal <= 0) continue;
    pagamentos.push(
      `- Código 36 (Previdência complementar — PGBL): ${p.nome} — ${formatBRL(p.aportesTotal)}. ` +
        'Use o CNPJ da seguradora que está no Informe de Contribuições' +
        (p.cnpj ? ` (CNPJ do fundo: ${p.cnpj}).` : '.'),
    );
  }
  if (aportesOutros > 0) {
    pagamentos.push(
      `- Código 36 (Previdência complementar — PGBL), planos fora da carteira — ${formatBRL(aportesOutros)}.`,
    );
  }
  if (entrada.saude > 0) {
    pagamentos.push(
      `- Saúde: ${formatBRL(entrada.saude)} no total — um lançamento por prestador, com o CPF/CNPJ dele.`,
    );
  }
  if (entrada.educacao > 0) {
    pagamentos.push(
      `- Educação: ${formatBRL(entrada.educacao)} no total — um lançamento por escola, com o CNPJ.`,
    );
  }
  if (entrada.pensaoJudicial > 0) {
    pagamentos.push(`- Pensão alimentícia judicial: ${formatBRL(entrada.pensaoJudicial)}.`);
  }
  if (pagamentos.length) linhas.push('', 'Pagamentos Efetuados', ...pagamentos);

  const outras: string[] = [];
  if (entrada.inss > 0) {
    outras.push(
      `- Contribuição previdenciária oficial (INSS): ${formatBRL(entrada.inss)} — na ficha da fonte pagadora.`,
    );
  }
  if (entrada.irRetido > 0) {
    outras.push(
      `- IR retido na fonte: ${formatBRL(entrada.irRetido)} — na ficha da fonte pagadora.`,
    );
  }
  if (entrada.dependentes > 0) {
    outras.push(`- Dependentes: ${entrada.dependentes}.`);
  }
  if (entrada.doacoesIncentivadas > 0) {
    outras.push(`- Doações incentivadas: ${formatBRL(entrada.doacoesIncentivadas)}.`);
  }
  if (outras.length) linhas.push('', 'Outras fichas', ...outras);

  linhas.push(
    '',
    'Resultado estimado',
    `- IR devido: ${formatBRL(r.irDevido)}.`,
    entrada.irRetido > 0
      ? `- ${r.saldoAjuste >= 0 ? 'Restituição' : 'Imposto a pagar'}: ${formatBRL(Math.abs(r.saldoAjuste))}.`
      : '- Informe o IR retido na fonte para ver a restituição ou o imposto a pagar.',
    `- O PGBL reduz o imposto em ${formatBRL(r.pgbl.economiaAtual)}.`,
  );
  return linhas.join('\n');
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * Página do "Exportar resumo para a DAA (PDF)": documento à parte, aberto numa janela nova e
 * mandado para a impressão (o usuário escolhe "Salvar como PDF"). Cores da paleta My Finance.
 */
export function htmlResumoDaa(dados: DadosResumoPgbl, geradoEm: Date): string {
  const { ano, entrada, r, planosPgbl, aportesOutros } = dados;
  const brl = (v: number) => esc(formatBRL(v));
  const linha = (rotulo: string, completo: string, simplificado: string, forte = false) =>
    `<tr${forte ? ' class="forte"' : ''}><td>${esc(rotulo)}</td><td>${completo}</td><td>${simplificado}</td></tr>`;
  const menos = (v: number) => (v > 0 ? `− ${brl(v)}` : '—');
  const d = r.deducoesCompleto;
  const planos = planosPgbl
    .filter((p) => p.aportesTotal > 0)
    .map(
      (p) =>
        `<tr><td>${esc(p.nome)}${p.cnpj ? `<br><small>CNPJ do fundo ${esc(p.cnpj)}</small>` : ''}</td><td>${p.aportesQuantidade}</td><td>${brl(p.aportesTotal)}</td></tr>`,
    );
  if (aportesOutros > 0) {
    planos.push(
      `<tr><td>Planos fora da carteira</td><td>—</td><td>${brl(aportesOutros)}</td></tr>`,
    );
  }
  const saldo =
    entrada.irRetido > 0
      ? `<p class="saldo">${r.saldoAjuste >= 0 ? 'Restituição projetada' : 'Imposto a pagar projetado'}: <strong>${brl(Math.abs(r.saldoAjuste))}</strong> (retido na fonte ${brl(entrada.irRetido)})</p>`
      : '';
  const data = geradoEm.toLocaleDateString('pt-BR');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo PGBL — DAA ${ano + 1}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#2D2D2D;margin:32px;font-size:13px}
  h1{font-size:18px;color:#314666;margin:0}
  h2{font-size:14px;color:#314666;margin:24px 0 8px}
  .sub{color:#666;margin:4px 0 0}
  table{border-collapse:collapse;width:100%}
  th{background:#314666;color:#fff;text-align:left;font-weight:600}
  th,td{padding:6px 8px;border-bottom:1px solid #EAEAEA}
  td:not(:first-child),th:not(:first-child){text-align:right}
  tr.forte td{font-weight:700}
  small{color:#666}
  .saldo{font-size:14px;margin-top:12px}
  ul{padding-left:18px;margin:0}
  li{margin:4px 0}
  .rodape{margin-top:28px;color:#666;font-size:11px}
  @media print{body{margin:16mm}}
</style></head><body>
<h1>My Finance — Resumo do PGBL para a declaração de ${ano + 1}</h1>
<p class="sub">Ano-calendário ${ano} · gerado em ${esc(data)} · estimativa, não gera DAA</p>

<h2>Completa × simplificada</h2>
<table>
<tr><th></th><th>Completa</th><th>Simplificada</th></tr>
${linha('Renda tributável', brl(entrada.rendaTributavel), brl(entrada.rendaTributavel))}
${linha('PGBL', menos(d.pgbl), '—')}
${linha('INSS', menos(d.inss), '—')}
${linha('Dependentes, saúde e educação', menos(d.dependentes + d.saude + d.educacao), '—')}
${linha('Pensão judicial e livro-caixa', menos(d.pensaoJudicial + d.livroCaixa), '—')}
${linha('Desconto simplificado', '—', menos(r.descontoSimplificado))}
${linha('Base de cálculo', brl(r.completo.baseCalculo), brl(r.simplificado.baseCalculo))}
${linha('Doações incentivadas', menos(r.completo.doacoes), '—')}
${linha('IR devido estimado', brl(r.completo.irDevido), brl(r.simplificado.irDevido), true)}
</table>
<p class="saldo">Modelo indicado: <strong>${MODELO_LABEL[r.melhorModelo]}</strong>. O PGBL reduz o imposto em <strong>${brl(r.pgbl.economiaAtual)}</strong>.</p>
${saldo}

<h2>Aportes em PGBL no ano</h2>
${
  planos.length
    ? `<table><tr><th>Plano</th><th>Aportes</th><th>Total</th></tr>${planos.join('')}</table>
<p>Limite dedutível (12% da renda): ${brl(r.pgbl.limiteDedutivel)} · usado ${brl(r.pgbl.aporteDedutivel)}${r.pgbl.excedente > 0 ? ` · acima do limite ${brl(r.pgbl.excedente)}` : ''}</p>`
    : '<p>Nenhum aporte em PGBL no ano.</p>'
}

<h2>Onde lançar</h2>
<ul>
<li><strong>Pagamentos Efetuados → código 36</strong> (Previdência complementar — PGBL): um lançamento por entidade, com o CNPJ da seguradora e o total do ano.</li>
<li>O saldo do PGBL não vai em Bens e Direitos (só o VGBL vai).</li>
<li>Confira com o Informe de Contribuições que a seguradora envia até o último dia útil de fevereiro — ele é o documento oficial.</li>
</ul>
<p class="rodape">Valores pela tabela progressiva de ${ano}. Ferramenta de acompanhamento: não substitui o cálculo da Receita Federal.</p>
</body></html>`;
}

/** Data do lembrete de aporte: 15/12, ou amanhã se já passou (nunca depois de 31/12). */
export function dataLembreteAporte(ano: number, hoje: Date): string {
  const alvo = new Date(ano, 11, 15);
  let d = hoje < alvo ? alvo : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const fim = new Date(ano, 11, 31);
  if (d > fim) d = fim;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function lembreteAporte(ano: number, r: ResultadoIrpfAnual, hoje: Date) {
  const descricao =
    r.pgbl.espacoRestante > 0
      ? `Faltam ${formatBRL(r.pgbl.espacoRestante)} para usar o limite de 12% do PGBL. ` +
        `O aporte até 31/12 reduz o IR em cerca de ${formatBRL(r.pgbl.economiaAdicional)}.`
      : 'Conferir os aportes no PGBL antes de 31/12 (vale a data do pagamento).';
  return {
    titulo: `Aporte no PGBL até 31/12/${ano}`,
    descricao,
    data: dataLembreteAporte(ano, hoje),
    categoria: 'lembrete',
    lembrete: true,
  };
}

/** Simulação completa a partir dos campos salvos (Resumo Anual, sem a tela do PGBL). */
export function simularDosCampos(
  campos: Record<string, string | undefined>,
  aportesCarteira: number,
  regras: RegrasIrpfAnual,
) {
  const entrada = entradaDosCampos(campos, aportesCarteira);
  return { entrada, r: simularIrpfAnual(entrada, regras) };
}
