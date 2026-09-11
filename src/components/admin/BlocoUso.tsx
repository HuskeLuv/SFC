'use client';

import type { AdminOverview } from '@/services/admin/overview';
import { BarrasDiarias, Bloco, Grade, Stat, Tabela, fmtInt } from './shared';

const SECAO: Record<string, string> = {
  carteira: 'Carteira',
  'fluxo-caixa': 'Fluxo de Caixa',
  planejamento: 'Planejamento',
  dividas: 'Dívidas',
  'saude-financeira': 'Saúde Financeira',
  perfil: 'Perfil',
  calendario: 'Agenda',
};

export default function BlocoUso({ dados }: { dados: AdminOverview['uso'] }) {
  const total30 = dados.porSecao.reduce((a, s) => a + s.alteracoes30d, 0);
  const total7 = dados.porSecao.reduce((a, s) => a + s.alteracoes7d, 0);
  const maisUsada = dados.porSecao[0];

  return (
    <Bloco
      titulo="Uso por funcionalidade"
      descricao="Edições registradas no Histórico de alterações. Mede o que os usuários mexem, não o que só consultam."
    >
      <Grade colunas={4}>
        <Stat
          rotulo="Edições em 30 dias"
          valor={fmtInt(total30)}
          detalhe={`${fmtInt(total7)} nos últimos 7 dias`}
          tom="destaque"
        />
        <Stat rotulo="Usuários que editaram (30d)" valor={fmtInt(dados.usuariosComEdicao30d)} />
        <Stat
          rotulo="Mais usada (30d)"
          valor={
            maisUsada && maisUsada.alteracoes30d > 0
              ? (SECAO[maisUsada.secao] ?? maisUsada.secao)
              : '—'
          }
          detalhe={maisUsada ? `${fmtInt(maisUsada.alteracoes30d)} edições` : undefined}
        />
        <Stat
          rotulo="Via consultor / desfeitas (30d)"
          valor={`${fmtInt(dados.viaConsultor30d)} / ${fmtInt(dados.desfeitas30d)}`}
        />
      </Grade>
      <BarrasDiarias titulo="Edições por dia (30 dias)" serie={dados.porDia} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Por seção</p>
          <Tabela
            chave={(s) => s.secao}
            linhas={dados.porSecao}
            colunas={[
              { chave: 'secao', titulo: 'Seção', render: (s) => SECAO[s.secao] ?? s.secao },
              {
                chave: 'a7',
                titulo: '7 dias',
                alinhar: 'right',
                render: (s) => fmtInt(s.alteracoes7d),
              },
              {
                chave: 'a30',
                titulo: '30 dias',
                alinhar: 'right',
                render: (s) => fmtInt(s.alteracoes30d),
              },
              {
                chave: 'u30',
                titulo: 'Usuários (30d)',
                alinhar: 'right',
                render: (s) => fmtInt(s.usuarios30d),
              },
            ]}
          />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
            Ações mais frequentes (30 dias)
          </p>
          <Tabela
            chave={(a) => `${a.secao}:${a.acao}`}
            linhas={dados.topAcoes}
            colunas={[
              {
                chave: 'acao',
                titulo: 'Ação',
                render: (a) => <code className="text-xs">{a.acao}</code>,
              },
              { chave: 'secao', titulo: 'Seção', render: (a) => SECAO[a.secao] ?? a.secao },
              { chave: 'total', titulo: 'Total', alinhar: 'right', render: (a) => fmtInt(a.total) },
            ]}
          />
        </div>
      </div>
    </Bloco>
  );
}
