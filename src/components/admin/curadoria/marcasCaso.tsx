/**
 * Peças visuais da fila de curadoria (bloco C, fatia C): status com forma, origem, efeito na tela e
 * prazo — sempre ícone + texto, nunca só cor. Cores: paleta My Finance + cinzas + vermelho
 * #D92D20/#F97066 (vencido). Textos: TEXTOS_TELA.curadoria; os poucos textos só da tela do admin
 * ficam em TEXTOS_FILA (varridos pelo mesmo teste de linguagem).
 */
import { useEffect, type ReactNode } from 'react';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { IDADE_ALERTA_REGRA_DIAS_UTEIS } from '@/services/analiseAtivos/curadoria/contrato';
import { ehRegraRevisao } from '@/services/analiseAtivos/regras/comum/conferencia';
import type { CasoListaItem, StatusCaso } from '@/types/analiseAtivosCuradoria';

export const T_CUR = TEXTOS_TELA.curadoria;

/** Textos só da tela do admin (não aparecem ao usuário). */
export const TEXTOS_FILA = {
  abrirPagina: 'abrir a página do ativo',
  abrirCaso: 'Abrir o caso {valor}',
  regraParouComRelato:
    'Como há relatos, o caso não fecha sozinho: confira o valor na tela e decida.',
  regraParouSemValor:
    'O dado não voltou com um valor conferível: o caso continua aberto para a equipe decidir.',
  revisaoAviso:
    'Revisão: nada muda na tela nem no Índice MF. A regra só pede um olhar; variações grandes costumam ser reais.',
  semRelatos: 'Caso aberto pela regra automática, sem relato de usuário.',
  vaziaAjuda:
    'Relatos dos usuários e casos abertos pelas regras automáticas aparecem aqui. Os relatos têm prazo de resposta de 5 dias úteis; os casos só de regra, não.',
  vaziaFiltroAjuda: 'Troque o filtro acima ou volte para a lista principal.',
  erroAjuda: 'Os casos continuam salvos. Os filtros ficam como estavam.',
  selecione: 'Escolha um caso na lista para ver o detalhe.',
  contagem: '{n} casos · vencidos primeiro, depois o prazo mais próximo; só de regra por idade',
  contagemFechados: '{n} casos · os fechados mais recentes primeiro',
  responsavel: 'responsável: {valor}',
  abertoEm: 'aberto em {data}',
  fechadoEm: 'fechado em {data}',
  soAoFechar: '(vai só ao fechar)',
  carregarMais: 'Carregar mais',
  casoNaoEncontrado: 'Caso não encontrado.',
  acessoRestrito: 'Esta área é restrita a administradores.',
  fecharCaso: 'Fechar o caso',
  fechadoAvisados: 'Caso fechado. {n} usuários avisados.',
  fechadoUmAvisado: 'Caso fechado. 1 usuário avisado.',
  fechadoSemAviso: 'Caso fechado.',
  casoFinal: 'Caso fechado: a decisão é final. Um relato novo abre outro caso.',
  liberarSoConfirmado: 'Só com "Dado confirmado".',
  semEfeitoTela: 'sem efeito na tela',
  relato: 'relato',
  relatos: 'relatos',
  soRegra: 'só regra',
  ordemPrazo: 'Prazo',
  todos: 'Todos',
  acao: 'Ações',
  fii: 'FIIs',
  regraCodigo: 'Regra',
  chave: 'Chave',
  desde: 'Desde',
  sim: 'sim',
  nao: 'não',
} as const;

export const fmtDataCurta = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export const fmtDataHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
    : '—';

export function rotuloCampo(campo: string): string {
  return (TEXTOS_TELA.relatos.campos as Record<string, string>)[campo] ?? campo;
}

export function rotuloGrupo(grupo: string): string | null {
  return (TEXTOS_TELA.conferencia.grupos as Record<string, string>)[grupo] ?? null;
}

const CLASSE_ICONE = 'h-4 w-4 shrink-0';

function Svg({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={CLASSE_ICONE}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      fill="none"
    >
      {children}
    </svg>
  );
}

export function IconeAlerta() {
  return (
    <Svg>
      <path
        d="M8 1.8l6.6 11.7H1.4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6.2v3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r=".9" fill="currentColor" />
    </Svg>
  );
}

export function IconeInfo() {
  return (
    <Svg>
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r=".9" fill="currentColor" />
    </Svg>
  );
}

function IconeStatus({ status }: { status: StatusCaso }) {
  switch (status) {
    case 'em_analise':
      return (
        <Svg>
          <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 4.6V8l2.3 1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'corrigido':
      return (
        <Svg>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M4.8 8.2l2.1 2.1 4.3-4.5"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'rejeitado':
      return (
        <Svg>
          <circle
            cx="8"
            cy="8"
            r="6.3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2.4 2"
          />
        </Svg>
      );
    default:
      return (
        <Svg>
          <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
        </Svg>
      );
  }
}

const COR_STATUS: Record<StatusCaso, string> = {
  aberto: 'text-gray-700 dark:text-gray-200',
  em_analise: 'text-[#396CAA] dark:text-[#6E9DC4]',
  corrigido: 'text-[#314666] dark:text-[#6E9DC4]',
  rejeitado: 'text-gray-600 dark:text-gray-300',
};

export function MarcaStatus({ status }: { status: StatusCaso }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-medium ${COR_STATUS[status]}`}
      data-status={status}
    >
      <IconeStatus status={status} />
      {T_CUR.status[status]}
    </span>
  );
}

export function MarcaOrigem({ origem }: { origem: CasoListaItem['origem'] }) {
  const usuario = origem !== 'regra';
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
      {usuario ? (
        <Svg>
          <circle cx="8" cy="5.4" r="2.6" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M2.8 14c.6-2.8 2.7-4.2 5.2-4.2s4.6 1.4 5.2 4.2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </Svg>
      ) : (
        <Svg>
          <rect
            x="2.2"
            y="2.2"
            width="11.6"
            height="11.6"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M5 6h6M5 8.5h6M5 11h3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </Svg>
      )}
      {T_CUR.origens[origem]}
    </span>
  );
}

/** Caso aberto por regra de revisão (rev:): sem efeito na tela nem no Índice. */
export function ehCasoRevisao(caso: Pick<CasoListaItem, 'regraCodigo'>): boolean {
  return !!caso.regraCodigo && ehRegraRevisao(caso.regraCodigo);
}

export function MarcaEfeito({
  caso,
}: {
  caso: Pick<CasoListaItem, 'emConferencia' | 'regraCodigo'>;
}) {
  if (ehCasoRevisao(caso)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">
        <Svg>
          <path
            d="M4 1.8h5.5L12.5 5v9.2H4z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M6 8h4.5M6 10.5h4.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </Svg>
        {T_CUR.efeitos.revisao}
      </span>
    );
  }
  if (caso.emConferencia) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-500 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:border-gray-400 dark:text-gray-200">
        <Svg>
          <circle cx="7" cy="7" r="4.3" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10.2 10.2l3.4 3.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </Svg>
        {T_CUR.efeitos.emConferencia}
      </span>
    );
  }
  return (
    <span className="text-xs text-gray-500 dark:text-gray-400">{TEXTOS_FILA.semEfeitoTela}</span>
  );
}

/** Prazo em dias úteis: vencido = vermelho + ícone + palavra; só de regra = "sem prazo · há N". */
export function MarcaPrazo({ caso }: { caso: CasoListaItem }) {
  const fechado = caso.status === 'corrigido' || caso.status === 'rejeitado';
  if (fechado) {
    return <span className="text-sm text-gray-500 dark:text-gray-400">—</span>;
  }
  const r = caso.diasUteisRestantes;
  if (r === null) {
    const velho = caso.idadeDiasUteis > IDADE_ALERTA_REGRA_DIAS_UTEIS;
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
        {velho && <IconeAlerta />}
        {formatarTexto(T_CUR.prazo.semPrazo, { n: caso.idadeDiasUteis })}
      </span>
    );
  }
  if (r < 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md bg-[#D92D20]/[0.08] px-2 py-0.5 text-sm font-semibold text-[#D92D20] dark:bg-[#F97066]/[0.12] dark:text-[#F97066]"
        data-prazo="vencido"
      >
        <IconeAlerta />
        {T_CUR.prazo.vencido} · {fmtDataCurta(caso.slaAte).slice(0, 5)}
      </span>
    );
  }
  const texto =
    r === 0
      ? T_CUR.prazo.venceHoje
      : r === 1
        ? T_CUR.prazo.venceEmUm
        : formatarTexto(T_CUR.prazo.venceEm, { n: r });
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm ${
        r <= 2 ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'
      }`}
    >
      <Svg>
        <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.6V8l2.3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
      {texto}
    </span>
  );
}

export function textoRelatos(n: number): string {
  if (n === 0) return TEXTOS_FILA.soRegra;
  return `${n} ${n === 1 ? TEXTOS_FILA.relato : TEXTOS_FILA.relatos}`;
}

export const CLASSE_LINK = 'text-[#396CAA] underline-offset-2 hover:underline dark:text-[#6E9DC4]';
export const CLASSE_BOTAO_PRIMARIO =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-[#396CAA] px-4 text-sm font-semibold text-white hover:bg-[#314666] disabled:cursor-not-allowed disabled:opacity-60 max-lg:min-h-12';
export const CLASSE_BOTAO_SECUNDARIO =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-transparent dark:text-gray-100 dark:hover:bg-white/[0.04] max-lg:min-h-12';

/** Aviso "salvo" (role=status), some em 5 s; botão Fechar de 44px. */
export function AvisoSalvo({
  mensagem,
  onFechar,
}: {
  mensagem: string | null;
  onFechar: () => void;
}) {
  useEffect(() => {
    if (!mensagem) return;
    const t = setTimeout(onFechar, 5000);
    return () => clearTimeout(t);
  }, [mensagem, onFechar]);
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6"
    >
      {mensagem && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-[#2D2D2D] py-1 pr-1 pl-4 text-sm text-white shadow-lg dark:bg-[#EAEAEA] dark:text-[#2D2D2D]">
          <span>{mensagem}</span>
          <button
            type="button"
            onClick={onFechar}
            className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-[#6E9DC4] dark:text-[#314666]"
          >
            {TEXTOS_TELA.relatos.form.fechar}
          </button>
        </div>
      )}
    </div>
  );
}
