'use client';

import type { AdminOverview } from '@/services/admin/overview';
import {
  Badge,
  BarrasDiarias,
  Bloco,
  Grade,
  Stat,
  Tabela,
  fmtBrl,
  fmtData,
  fmtInt,
  fmtPct,
} from './shared';

const INTENCAO: Record<string, string> = {
  gasto_categoria: 'Gasto por categoria',
  receitas: 'Receitas',
  sobra_mes: 'Sobra do mês',
  maior_despesa: 'Maior despesa',
  orcamento: 'Orçamento',
  carteira: 'Carteira',
  rentabilidade: 'Rentabilidade',
  proventos: 'Proventos',
  dividas: 'Dívidas',
  saude_financeira: 'Saúde financeira',
  objetivos: 'Objetivos',
  lancamento: 'Lançamento na planilha',
  conceito: 'Conceito',
  navegacao: 'Navegação',
  recomendacao_investimento: 'Recomendação (bloqueada)',
  nao_suportado: 'Não suportado',
  outro: 'Outro',
};

export default function BlocoAssistente({ dados }: { dados: AdminOverview['assistente'] }) {
  const { mes, total } = dados;
  const cacheRuim = mes.mensagens >= 10 && mes.cacheHitPct < 50;
  const mesLabel = new Date(mes.inicio).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Bloco
      titulo="Assistente de IA"
      descricao={`Custo e uso em ${mesLabel}. Limite de ${fmtInt(dados.limiteMensal)} mensagens por usuário/mês.`}
      acao={
        <div className="flex flex-col items-end gap-1">
          <Badge tom={dados.habilitado ? 'ok' : 'erro'}>
            {dados.habilitado ? 'Ligado' : 'Desligado'}
          </Badge>
          <span className="text-xs text-gray-500 dark:text-gray-400">{dados.modelo}</span>
        </div>
      }
    >
      <Grade colunas={5}>
        <Stat
          rotulo="Custo no mês"
          valor={fmtBrl(mes.custoBrl)}
          detalhe={`${fmtBrl(total.custoBrl)} desde ${fmtData(total.desde)}`}
          tom="destaque"
        />
        <Stat
          rotulo="Mensagens no mês"
          valor={fmtInt(mes.mensagens)}
          detalhe={`${fmtInt(mes.usuarios)} usuários · ${fmtInt(total.mensagens)} no total`}
        />
        <Stat
          rotulo="Custo por mensagem"
          valor={fmtBrl(mes.custoPorMsgBrl, 3)}
          detalhe={`latência média ${fmtInt(mes.latenciaMediaMs)} ms`}
        />
        <Stat
          rotulo="Acerto de cache"
          valor={fmtPct(mes.cacheHitPct)}
          detalhe={`${fmtInt(mes.cacheWriteTokens)} tokens gravados · ${fmtInt(mes.cachedInputTokens)} lidos`}
          tom={cacheRuim ? 'alerta' : 'neutro'}
        />
        <Stat
          rotulo="Propostas → confirmadas"
          valor={`${fmtInt(mes.propostas)} → ${fmtInt(mes.confirmadas)}`}
          detalhe={`${fmtInt(mes.erros)} erros`}
          tom={mes.erros > 0 ? 'alerta' : 'neutro'}
        />
      </Grade>
      <BarrasDiarias
        titulo="Custo por dia (30 dias)"
        serie={dados.porDia}
        medida="custoBrl"
        formatar={(n) => fmtBrl(n)}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
            Por usuário (mês atual)
          </p>
          <Tabela
            chave={(u) => u.userId}
            linhas={dados.porUsuario}
            vazio="Nenhuma mensagem neste mês."
            colunas={[
              {
                chave: 'usuario',
                titulo: 'Usuário',
                render: (u) => (
                  <span>
                    {u.name || u.email}
                    {u.name && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {u.email}
                      </span>
                    )}
                  </span>
                ),
              },
              {
                chave: 'msgs',
                titulo: 'Msgs',
                alinhar: 'right',
                render: (u) => fmtInt(u.mensagens),
              },
              {
                chave: 'custo',
                titulo: 'Custo',
                alinhar: 'right',
                render: (u) => fmtBrl(u.custoBrl),
              },
              {
                chave: 'prop',
                titulo: 'Prop. / conf.',
                alinhar: 'right',
                render: (u) => `${u.propostas} / ${u.confirmadas}`,
              },
              {
                chave: 'cota',
                titulo: 'Cota',
                alinhar: 'right',
                render: (u) => (
                  <Badge tom={u.pctCota >= 80 ? 'erro' : u.pctCota >= 50 ? 'alerta' : 'neutro'}>
                    {fmtPct(u.pctCota)}
                  </Badge>
                ),
              },
            ]}
          />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
            Por intenção (mês atual)
          </p>
          <Tabela
            chave={(i) => i.intencao}
            linhas={dados.porIntencao}
            vazio="Nenhuma mensagem neste mês."
            colunas={[
              {
                chave: 'int',
                titulo: 'Intenção',
                render: (i) => INTENCAO[i.intencao] ?? i.intencao,
              },
              {
                chave: 'msgs',
                titulo: 'Msgs',
                alinhar: 'right',
                render: (i) => fmtInt(i.mensagens),
              },
              {
                chave: 'conf',
                titulo: 'Confirmadas',
                alinhar: 'right',
                render: (i) => fmtInt(i.confirmadas),
              },
              {
                chave: 'custo',
                titulo: 'Custo',
                alinhar: 'right',
                render: (i) => fmtBrl(i.custoBrl),
              },
            ]}
          />
        </div>
      </div>
    </Bloco>
  );
}
