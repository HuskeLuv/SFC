'use client';

import React, { useMemo, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Button from '@/components/ui/button/Button';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { useTheme } from '@/context/ThemeContext';
import { useAdminCs } from '@/hooks/useAdminCs';
import {
  AREAS_CS,
  ROTULO_ACAO_ATIVACAO,
  ROTULO_AREA_CS,
  type ClienteCs,
  type FaixaAtividade,
  type PainelCs as PainelCsDados,
} from '@/services/admin/csTipos';
import { Bloco, Grade, Stat, fmtData, fmtInt, fmtPct } from '../shared';
import { baixarCsv, gerarCsv, type ValorCsv } from './csv';

type Aba = 'clientes' | 'ativacao' | 'engajamento' | 'csat';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'ativacao', label: 'Ativação' },
  { id: 'engajamento', label: 'Engajamento' },
  { id: 'csat', label: 'CSAT' },
];

const ROTULO_FAIXA: Record<FaixaAtividade, string> = {
  ativo: 'Ativo (até 7 dias)',
  inativo7: 'Inativo há 7–30 dias',
  inativo30: 'Inativo há +30 dias',
  nunca: 'Sem acesso registrado',
};

const plano = (n: number) => (n > 0 ? `Nível ${n}` : 'Gratuito');
const simNao = (b: boolean) => (b ? 'Sim' : 'Não');

/** Pílula de faixa só com cores da paleta My Finance (fundo = cor com 12% de opacidade). */
function FaixaBadge({ faixa, dias }: { faixa: FaixaAtividade; dias: number | null }) {
  const { theme } = useTheme();
  const escuro = theme === 'dark';
  const cor: Record<FaixaAtividade, string> = {
    ativo: escuro ? MYFINANCE_BRAND.tranquilidade : MYFINANCE_BRAND.outside,
    inativo7: escuro ? MYFINANCE_BRAND.tranquilidade : MYFINANCE_BRAND.patrimonio,
    inativo30: escuro ? MYFINANCE_BRAND.escolha : MYFINANCE_BRAND.seguranca,
    nunca: escuro ? MYFINANCE_BRAND.transparencia : MYFINANCE_BRAND.potencia,
  };
  const c = cor[faixa];
  const texto =
    faixa === 'nunca'
      ? 'Nunca'
      : faixa === 'ativo'
        ? dias === 0
          ? 'Hoje'
          : `${dias}d`
        : `${dias}d sem acesso`;
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs whitespace-nowrap ${
        faixa === 'inativo30' ? 'font-semibold' : 'font-medium'
      }`}
      style={{ color: c, backgroundColor: `${c}1F` }}
      title={ROTULO_FAIXA[faixa]}
    >
      {texto}
    </span>
  );
}

interface ColunaCs {
  chave: string;
  titulo: string;
  alinhar?: 'left' | 'right' | 'center';
  /** Valor para ordenar (null vai para o fim). */
  ordem: (c: ClienteCs) => string | number | null;
  render: (c: ClienteCs) => React.ReactNode;
  csv: (c: ClienteCs) => ValorCsv;
}

const colData = (
  chave: string,
  titulo: string,
  get: (c: ClienteCs) => string | null,
): ColunaCs => ({
  chave,
  titulo,
  alinhar: 'right',
  ordem: (c) => {
    const v = get(c);
    return v ? new Date(v).getTime() : null;
  },
  render: (c) => fmtData(get(c)),
  csv: (c) => (get(c) ? fmtData(get(c)) : ''),
});

const COL_NOME: ColunaCs = {
  chave: 'nome',
  titulo: 'Nome',
  ordem: (c) => c.nome.toLocaleLowerCase('pt-BR'),
  render: (c) => <span className="font-medium">{c.nome || '—'}</span>,
  csv: (c) => c.nome,
};
const COL_EMAIL: ColunaCs = {
  chave: 'email',
  titulo: 'E-mail',
  ordem: (c) => c.email.toLowerCase(),
  render: (c) => c.email,
  csv: (c) => c.email,
};
const COL_CADASTRO = colData('cadastro', 'Cadastro', (c) => c.cadastroEm);
const COL_ULTIMO_ACESSO = colData('ultimoAcesso', 'Último acesso', (c) => c.ultimoAcesso);

const COLUNAS_CLIENTES: ColunaCs[] = [
  COL_NOME,
  COL_EMAIL,
  COL_CADASTRO,
  COL_ULTIMO_ACESSO,
  {
    chave: 'plano',
    titulo: 'Plano',
    alinhar: 'center',
    ordem: (c) => c.nivelAcesso,
    render: (c) => plano(c.nivelAcesso),
    csv: (c) => plano(c.nivelAcesso),
  },
  {
    chave: 'of',
    titulo: 'Open Finance',
    alinhar: 'center',
    ordem: (c) => (c.openFinanceConectado ? 1 : 0),
    render: (c) => simNao(c.openFinanceConectado),
    csv: (c) => c.openFinanceConectado,
  },
  {
    chave: 'ativos',
    titulo: 'Ativos na carteira',
    alinhar: 'right',
    ordem: (c) => c.ativosCarteira,
    render: (c) => fmtInt(c.ativosCarteira),
    csv: (c) => c.ativosCarteira,
  },
  {
    chave: 'fluxo',
    titulo: 'Usa Fluxo',
    alinhar: 'center',
    ordem: (c) => (c.usaFluxo ? 1 : 0),
    render: (c) => simNao(c.usaFluxo),
    csv: (c) => c.usaFluxo,
  },
  {
    chave: 'orcamento',
    titulo: 'Usa Orçamento',
    alinhar: 'center',
    ordem: (c) => (c.usaOrcamento ? 1 : 0),
    render: (c) => simNao(c.usaOrcamento),
    csv: (c) => c.usaOrcamento,
  },
  {
    chave: 'assistente',
    titulo: 'Assistente (mês)',
    alinhar: 'right',
    ordem: (c) => c.mensagensAssistenteMes,
    render: (c) => fmtInt(c.mensagensAssistenteMes),
    csv: (c) => c.mensagensAssistenteMes,
  },
];

const COLUNAS_ATIVACAO: ColunaCs[] = [
  COL_NOME,
  COL_EMAIL,
  COL_CADASTRO,
  colData('ativacaoEm', 'Data da ativação', (c) => c.ativacao.em),
  {
    chave: 'acao',
    titulo: 'Ação de ativação',
    ordem: (c) => (c.ativacao.acao ? ROTULO_ACAO_ATIVACAO[c.ativacao.acao] : null),
    render: (c) => (c.ativacao.acao ? ROTULO_ACAO_ATIVACAO[c.ativacao.acao] : 'Não ativado'),
    csv: (c) => (c.ativacao.acao ? ROTULO_ACAO_ATIVACAO[c.ativacao.acao] : 'Não ativado'),
  },
  {
    chave: 'dias',
    titulo: 'Dias até ativar',
    alinhar: 'right',
    ordem: (c) => c.ativacao.diasAteAtivar,
    render: (c) => (c.ativacao.diasAteAtivar == null ? '—' : fmtInt(c.ativacao.diasAteAtivar)),
    csv: (c) => c.ativacao.diasAteAtivar,
  },
];

const COLUNAS_ENGAJAMENTO: ColunaCs[] = [
  COL_NOME,
  COL_EMAIL,
  COL_ULTIMO_ACESSO,
  {
    chave: 'diasSem',
    titulo: 'Situação',
    alinhar: 'center',
    ordem: (c) => c.diasSemAcesso ?? Number.MAX_SAFE_INTEGER,
    render: (c) => <FaixaBadge faixa={c.faixa} dias={c.diasSemAcesso} />,
    csv: (c) => ROTULO_FAIXA[c.faixa],
  },
  colData('ultimaAtividade', 'Última funcionalidade', (c) => c.ultimaAtividade),
  ...AREAS_CS.map((a) => colData(`area-${a}`, ROTULO_AREA_CS[a], (c) => c.ultimoUsoPorArea[a])),
];

function compara(a: string | number | null, b: string | number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // vazios sempre no fim
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
  return String(a).localeCompare(String(b), 'pt-BR') * dir;
}

function TabelaCs({
  colunas,
  linhas,
  ordemInicial,
  nomeArquivo,
  vazio,
}: {
  colunas: ColunaCs[];
  linhas: ClienteCs[];
  ordemInicial: { chave: string; dir: 1 | -1 };
  nomeArquivo: string;
  vazio: string;
}) {
  const [ordem, setOrdem] = useState(ordemInicial);
  const ordenadas = useMemo(() => {
    const col = colunas.find((c) => c.chave === ordem.chave) ?? colunas[0];
    return [...linhas].sort((a, b) => compara(col.ordem(a), col.ordem(b), ordem.dir));
  }, [colunas, linhas, ordem]);

  const alinhar = (a?: ColunaCs['alinhar']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  const exportar = () => {
    const csv = gerarCsv(
      colunas.map((c) => c.titulo),
      ordenadas.map((l) => colunas.map((c) => c.csv(l))),
    );
    const hoje = new Date().toISOString().slice(0, 10);
    baixarCsv(`${nomeArquivo}-${hoje}.csv`, csv);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {fmtInt(ordenadas.length)} {ordenadas.length === 1 ? 'cliente' : 'clientes'} · clique no
          título da coluna para ordenar
        </p>
        <Button size="sm" variant="outline" onClick={exportar} disabled={ordenadas.length === 0}>
          Exportar CSV
        </Button>
      </div>
      <div className={`max-w-full ${TABLE_STYLES.wrapper}`}>
        <table className={`${TABLE_STYLES.table} min-w-[760px]`}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              {colunas.map((c) => {
                const ativa = ordem.chave === c.chave;
                return (
                  <th
                    key={c.chave}
                    className={`${TABLE_STYLES.th} ${alinhar(c.alinhar)}`}
                    aria-sort={ativa ? (ordem.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase hover:underline"
                      onClick={() =>
                        setOrdem((o) =>
                          o.chave === c.chave
                            ? { chave: c.chave, dir: o.dir === 1 ? -1 : 1 }
                            : { chave: c.chave, dir: c.alinhar === 'right' ? -1 : 1 },
                        )
                      }
                    >
                      {c.titulo}
                      <span aria-hidden className={ativa ? '' : 'opacity-40'}>
                        {ativa ? (ordem.dir === 1 ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 && (
              <tr className={TABLE_STYLES.placeholderRow}>
                <td
                  colSpan={colunas.length}
                  className={`${TABLE_STYLES.td} text-center text-gray-500 dark:text-gray-400`}
                >
                  {vazio}
                </td>
              </tr>
            )}
            {ordenadas.map((l) => (
              <tr key={l.id} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                {colunas.map((c) => (
                  <td
                    key={c.chave}
                    className={`${TABLE_STYLES.td} whitespace-nowrap tabular-nums ${alinhar(c.alinhar)}`}
                  >
                    {c.render(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
        ativo
          ? 'border-[#396CAA] bg-[#EDF2F8] text-[#314666] dark:border-[#6E9DC4] dark:bg-white/10 dark:text-white'
          : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]'
      }`}
    >
      {children}
    </button>
  );
}

function AbaClientes({ clientes }: { clientes: ClienteCs[] }) {
  return (
    <Bloco
      titulo="Clientes"
      descricao="Último acesso = o mais recente entre login e uso de alguma funcionalidade. Plano: ainda não há assinatura; mostra o nível de acesso da conta. Assistente: mensagens respondidas no mês corrente."
    >
      <TabelaCs
        colunas={COLUNAS_CLIENTES}
        linhas={clientes}
        ordemInicial={{ chave: 'cadastro', dir: -1 }}
        nomeArquivo="cs-clientes"
        vazio="Nenhum cliente encontrado."
      />
    </Bloco>
  );
}

function AbaAtivacao({ dados, clientes }: { dados: PainelCsDados; clientes: ClienteCs[] }) {
  const [soNaoAtivados, setSoNaoAtivados] = useState(false);
  const linhas = soNaoAtivados ? clientes.filter((c) => !c.ativacao.em) : clientes;
  const a = dados.ativacao;
  return (
    <Bloco
      titulo="KPI de ativação"
      descricao="Ação de ativação = a PRIMEIRA que acontecer entre: cadastrar o primeiro ativo na Carteira, fazer o primeiro lançamento no Fluxo de Caixa ou conectar o primeiro banco (Open Finance). Linhas preenchidas automaticamente pelo sistema (parcelas de dívidas e aportes de sonhos) não contam."
    >
      <Grade colunas={4}>
        <Stat
          rotulo="Clientes ativados"
          valor={fmtPct(a.pctAtivados)}
          detalhe={`${fmtInt(a.ativados)} de ${fmtInt(a.total)}`}
          tom="destaque"
        />
        <Stat
          rotulo="Dias até ativar (mediana)"
          valor={a.medianaDias == null ? '—' : fmtInt(a.medianaDias)}
          detalhe={a.mediaDias == null ? undefined : `média ${fmtInt(a.mediaDias)} dias`}
        />
        <Stat rotulo="Ativados nos últimos 7 dias" valor={fmtInt(a.ativados7d)} />
        <Stat
          rotulo="Como ativaram"
          valor={fmtInt(a.ativados)}
          detalhe={`Carteira ${a.porAcao.carteira} · Fluxo ${a.porAcao.fluxo} · Banco ${a.porAcao.conexao}`}
        />
      </Grade>
      <div className="flex flex-wrap gap-2">
        <Chip ativo={!soNaoAtivados} onClick={() => setSoNaoAtivados(false)}>
          Todos
        </Chip>
        <Chip ativo={soNaoAtivados} onClick={() => setSoNaoAtivados(true)}>
          Só não ativados ({fmtInt(a.total - a.ativados)})
        </Chip>
      </div>
      <TabelaCs
        colunas={COLUNAS_ATIVACAO}
        linhas={linhas}
        ordemInicial={{ chave: 'cadastro', dir: -1 }}
        nomeArquivo="cs-ativacao"
        vazio="Nenhum cliente nesta seleção."
      />
    </Bloco>
  );
}

function AbaEngajamento({ dados, clientes }: { dados: PainelCsDados; clientes: ClienteCs[] }) {
  const [faixa, setFaixa] = useState<FaixaAtividade | 'todos'>('todos');
  const linhas = faixa === 'todos' ? clientes : clientes.filter((c) => c.faixa === faixa);
  const e = dados.engajamento;
  const contagem: Record<FaixaAtividade, number> = {
    ativo: e.ativos7d,
    inativo7: e.inativos7a30,
    inativo30: e.inativos30,
    nunca: e.nuncaAcessaram,
  };
  return (
    <Bloco
      titulo="KPI de engajamento"
      descricao="Último acesso e a data do último uso de cada funcionalidade importante (ações do próprio cliente; o que o consultor fez por ele não conta). Conexões = banco conectado ou atualizado à mão."
    >
      <Grade colunas={4}>
        <Stat rotulo="Ativos (até 7 dias)" valor={fmtInt(e.ativos7d)} tom="destaque" />
        <Stat rotulo="Inativos há 7–30 dias" valor={fmtInt(e.inativos7a30)} />
        <Stat rotulo="Inativos há +30 dias" valor={fmtInt(e.inativos30)} />
        <Stat rotulo="Sem acesso registrado" valor={fmtInt(e.nuncaAcessaram)} />
      </Grade>
      <div>
        <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
          Clientes que usaram cada área
        </p>
        <Grade colunas={3}>
          {e.porArea.map((p) => (
            <Stat
              key={p.area}
              rotulo={ROTULO_AREA_CS[p.area]}
              valor={`${fmtInt(p.usuarios30d)} em 30 dias`}
              detalhe={`${fmtInt(p.usuarios7d)} nos últimos 7 dias`}
            />
          ))}
        </Grade>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip ativo={faixa === 'todos'} onClick={() => setFaixa('todos')}>
          Todos
        </Chip>
        {(Object.keys(ROTULO_FAIXA) as FaixaAtividade[]).map((f) => (
          <Chip key={f} ativo={faixa === f} onClick={() => setFaixa(f)}>
            {ROTULO_FAIXA[f]} ({fmtInt(contagem[f])})
          </Chip>
        ))}
      </div>
      <TabelaCs
        colunas={COLUNAS_ENGAJAMENTO}
        linhas={linhas}
        ordemInicial={{ chave: 'diasSem', dir: -1 }}
        nomeArquivo="cs-engajamento"
        vazio="Nenhum cliente nesta faixa."
      />
    </Bloco>
  );
}

function AbaCsat() {
  return (
    <Bloco
      titulo="KPI de CSAT"
      descricao="Data do atendimento, nota recebida e quantidade de avaliações respondidas."
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">
        A pesquisa de satisfação dentro do app está em construção. Assim que ela entrar no ar, as
        respostas aparecem aqui: data, nota e quantidade de avaliações respondidas.
      </p>
    </Bloco>
  );
}

/**
 * Painel de CS (ticket 86e3vmyrc) — dentro do /admin, só leitura, só admin.
 * Clientes, ativação, engajamento e (em breve) CSAT. Sem valores financeiros.
 */
export default function PainelCs() {
  const { data, loading, isFetching, error, forbidden, refetch } = useAdminCs();
  const [aba, setAba] = useState<Aba>('clientes');
  const [busca, setBusca] = useState('');

  const filtrados = useMemo(() => {
    if (!data) return [];
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    if (!q) return data.clientes;
    return data.clientes.filter(
      (c) => c.nome.toLocaleLowerCase('pt-BR').includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [data, busca]);

  if (loading) return <LoadingSpinner size="lg" text="Consolidando clientes..." />;

  if (forbidden) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
        Esta área é restrita a administradores.
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
        {error ?? 'Não foi possível carregar o painel de CS.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Visão somente leitura. Dados consolidados em{' '}
          {new Date(data.geradoEm).toLocaleString('pt-BR')}
          {isFetching ? ' · atualizando…' : ''}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          Atualizar
        </Button>
      </div>

      <Grade colunas={4}>
        <Stat rotulo="Clientes" valor={fmtInt(data.ativacao.total)} />
        <Stat rotulo="Ativados" valor={fmtPct(data.ativacao.pctAtivados)} tom="destaque" />
        <Stat rotulo="Ativos em 7 dias" valor={fmtInt(data.engajamento.ativos7d)} />
        <Stat rotulo="Inativos há +30 dias" valor={fmtInt(data.engajamento.inativos30)} />
      </Grade>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <ResponsiveTabNav
          tabs={ABAS}
          activeId={aba}
          onChange={(id) => setAba(id as Aba)}
          ariaLabel="Seções do painel de CS"
          variant="underline"
        />
        {aba !== 'csat' && (
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar cliente por nome ou e-mail"
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#396CAA] focus:outline-none sm:w-72 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        )}
      </div>

      {aba === 'clientes' && <AbaClientes clientes={filtrados} />}
      {aba === 'ativacao' && <AbaAtivacao dados={data} clientes={filtrados} />}
      {aba === 'engajamento' && <AbaEngajamento dados={data} clientes={filtrados} />}
      {aba === 'csat' && <AbaCsat />}
    </div>
  );
}
