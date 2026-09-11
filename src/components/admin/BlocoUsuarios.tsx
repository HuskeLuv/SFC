'use client';

import type { AdminOverview } from '@/services/admin/overview';
import { Badge, Bloco, Grade, Stat, Tabela, fmtData, fmtDataHora, fmtInt } from './shared';

const PAPEL: Record<string, string> = { user: 'Usuário', consultant: 'Consultor', admin: 'Admin' };

export default function BlocoUsuarios({ dados }: { dados: AdminOverview['usuarios'] }) {
  return (
    <Bloco
      titulo="Usuários"
      descricao="Contas cadastradas e atividade de login (eventos de login guardados por 90 dias)."
    >
      <Grade colunas={4}>
        <Stat
          rotulo="Total de contas"
          valor={fmtInt(dados.total)}
          detalhe={`${dados.porPapel.consultant} consultores · ${dados.porPapel.admin} admin`}
        />
        <Stat
          rotulo="Ativos em 7 dias"
          valor={fmtInt(dados.ativos7d)}
          detalhe={`${fmtInt(dados.ativos30d)} em 30 dias`}
          tom="destaque"
        />
        <Stat
          rotulo="Novos em 30 dias"
          valor={fmtInt(dados.novos30d)}
          detalhe={`${fmtInt(dados.novos7d)} nos últimos 7 dias`}
        />
        <Stat
          rotulo="Logins falhos (7 dias)"
          valor={fmtInt(dados.loginsFalhos7d)}
          detalhe={`${dados.com2fa} contas com 2FA · ${dados.vinculosConsultorAtivos} vínculos consultor ativos`}
          tom={dados.loginsFalhos7d >= 20 ? 'alerta' : 'neutro'}
        />
      </Grade>
      <div>
        <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
          Últimos cadastros
        </p>
        <Tabela
          chave={(u) => u.id}
          linhas={dados.recentes}
          colunas={[
            { chave: 'nome', titulo: 'Nome', render: (u) => u.name || '—' },
            { chave: 'email', titulo: 'E-mail', render: (u) => u.email },
            {
              chave: 'papel',
              titulo: 'Papel',
              alinhar: 'center',
              render: (u) => (
                <Badge tom={u.role === 'admin' ? 'alerta' : 'neutro'}>
                  {PAPEL[u.role] ?? u.role}
                </Badge>
              ),
            },
            {
              chave: '2fa',
              titulo: '2FA',
              alinhar: 'center',
              render: (u) => (u.totpEnabled ? 'Sim' : 'Não'),
            },
            {
              chave: 'criado',
              titulo: 'Cadastro',
              alinhar: 'right',
              render: (u) => fmtData(u.createdAt),
            },
            {
              chave: 'login',
              titulo: 'Último login',
              alinhar: 'right',
              render: (u) => fmtDataHora(u.ultimoLogin),
            },
          ]}
        />
      </div>
    </Bloco>
  );
}
