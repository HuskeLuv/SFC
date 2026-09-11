'use client';

import type { AdminOverview } from '@/services/admin/overview';
import { Badge, Bloco, Grade, Stat, Tabela, diasDesde, fmtDataHora, fmtInt } from './shared';

const COBERTURA: Record<string, { rotulo: string; tom: 'ok' | 'neutro' | 'alerta' | 'erro' }> = {
  OK: { rotulo: 'Com dados', tom: 'ok' },
  EMPTY: { rotulo: 'Sem provento/evento', tom: 'neutro' },
  FETCH_FAIL: { rotulo: 'Falha ao buscar', tom: 'erro' },
  GAP_QUEUED: { rotulo: 'Faltando (na fila)', tom: 'alerta' },
};

/** Série de mercado parada há mais de 4 dias corridos (feriado + fim de semana) merece atenção. */
const LIMITE_DIAS_SERIE = 4;

export default function BlocoSistema({ dados }: { dados: AdminOverview['sistema'] }) {
  const sync = dados.ultimoSyncPrecos;
  const diasSync = diasDesde(sync?.executadoEm);
  const seriesAtrasadas = dados.dados.filter((d) => {
    const dias = diasDesde(d.ultimaData);
    return dias === null || dias > LIMITE_DIAS_SERIE;
  }).length;

  return (
    <Bloco
      titulo="Sistema"
      descricao="Frescor das séries alimentadas pelos crons, cobertura de dados de mercado e tamanho do banco."
    >
      <Grade colunas={4}>
        <Stat
          rotulo="Build em produção"
          valor={dados.buildId.slice(0, 12)}
          detalhe={dados.ambiente}
        />
        <Stat
          rotulo="Último sync de preços"
          valor={sync ? fmtDataHora(sync.executadoEm) : '—'}
          detalhe={
            sync
              ? `${fmtInt(sync.totalUpdated)} atualizados · ${sync.errors} erros · ${sync.duracaoSeg}s`
              : 'nenhum registro'
          }
          tom={
            !sync || (diasSync !== null && diasSync > 1) || sync.errors > 0 ? 'alerta' : 'neutro'
          }
        />
        <Stat
          rotulo="Séries atrasadas"
          valor={fmtInt(seriesAtrasadas)}
          detalhe={`mais de ${LIMITE_DIAS_SERIE} dias sem dado novo`}
          tom={seriesAtrasadas > 0 ? 'alerta' : 'neutro'}
        />
        <Stat rotulo="Tamanho do banco" valor={dados.banco.tamanho ?? '—'} />
      </Grade>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
            Séries de dados
          </p>
          <Tabela
            chave={(d) => d.nome}
            linhas={dados.dados}
            colunas={[
              { chave: 'nome', titulo: 'Série', render: (d) => d.nome },
              {
                chave: 'ultima',
                titulo: 'Último dado',
                alinhar: 'right',
                render: (d) => {
                  const dias = diasDesde(d.ultimaData);
                  const atrasada = dias === null || dias > LIMITE_DIAS_SERIE;
                  return (
                    <span className={atrasada ? 'text-amber-700 dark:text-amber-300' : ''}>
                      {d.ultimaData ? new Date(d.ultimaData).toLocaleDateString('pt-BR') : '—'}
                      {dias !== null && (
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                          ({dias <= 0 ? 'hoje' : `${dias}d`})
                        </span>
                      )}
                    </span>
                  );
                },
              },
              {
                chave: 'reg',
                titulo: 'Registros',
                alinhar: 'right',
                render: (d) => fmtInt(d.registros),
              },
            ]}
          />
        </div>
        <div className="min-w-0 space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
              Cobertura de dados de mercado (por ativo)
            </p>
            <div className="flex flex-wrap gap-2">
              {dados.cobertura.length === 0 && (
                <span className="text-xs text-gray-500">Sem registros.</span>
              )}
              {dados.cobertura.map((c) => {
                const meta = COBERTURA[c.status] ?? { rotulo: c.status, tom: 'neutro' as const };
                return (
                  <Badge key={c.status} tom={meta.tom}>
                    {meta.rotulo}: {fmtInt(c.total)}
                  </Badge>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
              Maiores tabelas
            </p>
            <Tabela
              chave={(t) => t.nome}
              linhas={dados.banco.tabelas}
              colunas={[
                {
                  chave: 'nome',
                  titulo: 'Tabela',
                  render: (t) => <code className="text-xs">{t.nome}</code>,
                },
                {
                  chave: 'linhas',
                  titulo: 'Linhas (estimado)',
                  alinhar: 'right',
                  render: (t) => fmtInt(t.linhas),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </Bloco>
  );
}
