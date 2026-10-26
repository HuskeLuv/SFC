'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { validarNomeSubcategoria } from '@/lib/orcamento/regras';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { CategoriaV2, OrcamentoV2Response } from '@/types/orcamentoV2';
import type { MarcarFixaEntrada, SalvarOrcadoEntrada } from '@/hooks/useOrcamentoV2';
import LinhaCategoria from './LinhaCategoria';
import LinhaSubcategoria from './LinhaSubcategoria';
import LinhaTotal from './LinhaTotal';
import type { MenuSubcategoriaProps } from './MenuSubcategoria';

/** Debounce da preferência de recolhidas (spec §4.7, R-11). */
export const DEBOUNCE_PREFS_MS = 500;

export interface OrcamentoV2TabelaProps {
  data: OrcamentoV2Response;
  onSalvarOrcado: (entrada: SalvarOrcadoEntrada) => Promise<unknown>;
  onMarcarFixa: (entrada: MarcarFixaEntrada) => void;
  onSalvarRecolhidas: (ids: string[]) => void;
  /** Cria a sub pela rota da Planilha; lança com a mensagem do servidor. */
  onCriarSub: (categoriaId: string, nome: string) => Promise<void>;
  /**
   * Erro de uma subcategoria nova cuja linha já fechou (o usuário foi adicionar em outra categoria
   * antes da resposta): vai para o aviso da seção em vez de sumir.
   */
  onErroCriarSub: (texto: string) => void;
  onRenomearSub: (categoriaId: string, itemId: string, nome: string) => Promise<void>;
  onBuscarImpacto: MenuSubcategoriaProps['onBuscarImpacto'];
  onExcluirSub: MenuSubcategoriaProps['onExcluir'];
}

const BTN_SM =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/5';

const TH = `${TABLE_STYLES.th} sticky top-0 z-10`;

const MOTIVO_NOME = {
  longo: 'Use no máximo 60 caracteres.',
  duplicado: 'Já existe uma subcategoria com esse nome nesta categoria.',
} as const;

/**
 * Tabela categoria › subcategoria do Orçamento v2 no desktop (spec §4.4/§4.5): `TABLE_STYLES`,
 * contêiner ÚNICO de rolagem (x e y, mínimo 860 px) com o cabeçalho grudado no topo, linhas de
 * categoria recolhíveis (preferência global salva com debounce), subcategorias editáveis, a linha
 * "+ Adicionar subcategoria em X" fechando cada grupo aberto e a linha Total.
 *
 * Chips de filtro e busca são da E2; aqui ficam só "Recolher todas" / "Expandir todas".
 */
export default function OrcamentoV2Tabela({
  data,
  onSalvarOrcado,
  onMarcarFixa,
  onSalvarRecolhidas,
  onCriarSub,
  onErroCriarSub,
  onRenomearSub,
  onBuscarImpacto,
  onExcluirSub,
}: OrcamentoV2TabelaProps) {
  // ── Recolher / expandir (otimista na tela; o PUT sai depois do debounce) ─────────────────
  const [recolhidasLocal, setRecolhidasLocal] = useState<string[] | null>(null);
  const recolhidas = new Set(recolhidasLocal ?? data.prefs.categoriasRecolhidas);
  const pendenteRef = useRef<string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvarRef = useRef(onSalvarRecolhidas);
  salvarRef.current = onSalvarRecolhidas;

  const descarregar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (pendenteRef.current) salvarRef.current(pendenteRef.current);
    pendenteRef.current = null;
  }, []);
  // Saiu da tela com um salvamento pendente: grava na hora.
  useEffect(() => descarregar, [descarregar]);

  const definirRecolhidas = (ids: string[]) => {
    setRecolhidasLocal(ids);
    pendenteRef.current = ids;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(descarregar, DEBOUNCE_PREFS_MS);
  };
  const alternar = (id: string) =>
    definirRecolhidas(
      recolhidas.has(id) ? [...recolhidas].filter((x) => x !== id) : [...recolhidas, id],
    );

  // ── Adicionar subcategoria ────────────────────────────────────────────────────────────────
  const [adicionandoEm, setAdicionandoEm] = useState<string | null>(null);

  const { referencia, visao } = data;
  const tituloRitmo =
    visao === 'ano'
      ? 'ritmo do ano'
      : referencia.fase === 'corrente'
        ? `ritmo do mês: dia ${referencia.dia} de ${referencia.diasNoMes}`
        : 'mês inteiro';
  const rotuloReal = referencia.rotuloRealizado === 'previsto' ? 'Previsto (R$)' : 'Realizado (R$)';

  const linhasCategoria = (c: CategoriaV2) => {
    const aberta = !recolhidas.has(c.id);
    const nomes = c.subcategorias.map((s) => s.nome);
    return (
      <Fragment key={c.id}>
        <LinhaCategoria
          categoria={c}
          aberta={aberta}
          onAlternar={() => alternar(c.id)}
          ritmo={referencia.ritmo}
          tituloRitmo={tituloRitmo}
        />
        {aberta &&
          c.subcategorias.map((s, i) => (
            <LinhaSubcategoria
              key={s.id}
              sub={s}
              categoriaNome={c.nome}
              poupanca={c.poupanca}
              irmaos={nomes.filter((_n, j) => j !== i)}
              receita={data.receitaPrevista.valor}
              ritmo={referencia.ritmo}
              tituloRitmo={tituloRitmo}
              ultima={i === c.subcategorias.length - 1 && adicionandoEm !== c.id}
              onSalvarOrcado={onSalvarOrcado}
              onAlternarFixa={() => onMarcarFixa({ itemId: s.id, fixa: !s.fixa })}
              onRenomear={(nome) => onRenomearSub(c.id, s.id, nome)}
              onBuscarImpacto={onBuscarImpacto}
              onExcluir={onExcluirSub}
            />
          ))}
        {aberta && adicionandoEm === c.id && (
          <NovaSubcategoria
            categoria={c}
            irmaos={nomes}
            // Fecha só a própria linha: se o usuário já abriu outra, ela fica como está.
            onCancelar={() => setAdicionandoEm((cur) => (cur === c.id ? null : cur))}
            onCriar={async (nome) => {
              await onCriarSub(c.id, nome);
              setAdicionandoEm((cur) => (cur === c.id ? null : cur));
            }}
            onErroFora={onErroCriarSub}
          />
        )}
        {aberta && (
          <tr data-mf-linha="adicionar" className={TABLE_STYLES.row}>
            <td colSpan={7} className={`${TABLE_STYLES.td} py-2 pl-12`}>
              <button
                type="button"
                onClick={() => setAdicionandoEm(c.id)}
                className="text-xs font-medium text-mf-patrimonio hover:text-mf-seguranca hover:underline dark:text-mf-tranquilidade dark:hover:text-white"
              >
                + Adicionar subcategoria em {c.nome}
              </button>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={BTN_SM}
          onClick={() => definirRecolhidas(data.categorias.map((c) => c.id))}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M6 14l6-6 6 6" />
          </svg>
          Recolher todas
        </button>
        <button type="button" className={BTN_SM} onClick={() => definirRecolhidas([])}>
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M6 10l6 6 6-6" />
          </svg>
          Expandir todas
        </button>
      </div>

      {/* Contêiner único de rolagem (x e y): o cabeçalho gruda no topo dele. */}
      <div
        data-mf-orcamento-v2-rolagem=""
        className={`${TABLE_STYLES.wrapper} max-h-[calc(100vh-240px)] min-h-[320px] overflow-y-auto`}
      >
        <table className={`${TABLE_STYLES.table} min-w-[860px]`}>
          <thead>
            <tr className={TABLE_STYLES.headRow}>
              <th className={`${TH} text-left`} style={TABLE_HEADER_STYLE}>
                Categoria / subcategoria
              </th>
              <th className={`${TH} text-right`} style={TABLE_HEADER_STYLE}>
                % da receita
              </th>
              <th className={`${TH} text-right`} style={TABLE_HEADER_STYLE}>
                Orçado (R$)
              </th>
              <th className={`${TH} text-right`} style={TABLE_HEADER_STYLE}>
                {rotuloReal}
              </th>
              <th className={`${TH} text-right`} style={TABLE_HEADER_STYLE}>
                Diferença (R$)
              </th>
              <th className={`${TH} text-left`} style={TABLE_HEADER_STYLE}>
                Consumido
              </th>
              <th className={`${TH} w-10`} style={TABLE_HEADER_STYLE}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.categorias.map(linhasCategoria)}
            <LinhaTotal
              resumo={data.resumo}
              visao={visao}
              ritmo={referencia.ritmo}
              tituloRitmo={tituloRitmo}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Linha de nome da subcategoria nova (spec §4.5, T21/T22): Enter salva (POST da Planilha), Esc ou
 * nome vazio cancela e a linha some sem salvar nada. Se a linha fechar com um erro na tela (nome
 * recusado no blur) ou o servidor recusar depois que ela fechou, o erro vai para `onErroFora`.
 */
function NovaSubcategoria({
  categoria,
  irmaos,
  onCancelar,
  onCriar,
  onErroFora,
}: {
  categoria: CategoriaV2;
  irmaos: string[];
  onCancelar: () => void;
  onCriar: (nome: string) => Promise<void>;
  onErroFora: (texto: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [erro, setErroEstado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const encerradoRef = useRef(false);
  const montadoRef = useRef(false);
  const erroRef = useRef<{ nome: string; texto: string } | null>(null);
  const onErroForaRef = useRef(onErroFora);
  onErroForaRef.current = onErroFora;

  const setErro = (texto: string | null, nomeTentado = nome.trim()) => {
    erroRef.current = texto ? { nome: nomeTentado, texto } : null;
    setErroEstado(texto);
  };
  const avisarFora = (e: { nome: string; texto: string }) =>
    onErroForaRef.current(
      `A subcategoria "${e.nome}" não foi adicionada em ${categoria.nome}: ${e.texto}`,
    );

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      // Fechou com o erro na tela (ex.: nome recusado no blur ao abrir outra categoria).
      if (erroRef.current && !encerradoRef.current) avisarFora(erroRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmar = async () => {
    if (salvando || encerradoRef.current) return;
    const v = validarNomeSubcategoria(nome, irmaos);
    if (!v.ok) {
      if (v.motivo === 'vazio') {
        encerradoRef.current = true;
        onCancelar();
        return;
      }
      setErro(MOTIVO_NOME[v.motivo]);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await onCriar(v.nome);
      encerradoRef.current = true;
    } catch (e: unknown) {
      const texto = e instanceof Error ? e.message : 'Não foi possível adicionar a subcategoria.';
      if (!montadoRef.current) {
        avisarFora({ nome: v.nome, texto });
        return;
      }
      setErro(texto, v.nome);
      setSalvando(false);
    }
  };

  return (
    <tr data-mf-linha="nova-sub" className={TABLE_STYLES.row}>
      <td colSpan={7} className={`${TABLE_STYLES.td} pl-12`}>
        <input
          autoFocus
          value={nome}
          maxLength={80}
          disabled={salvando}
          placeholder="Nome da subcategoria"
          aria-label={`Nome da nova subcategoria em ${categoria.nome}`}
          aria-invalid={erro ? true : undefined}
          onChange={(e) => {
            setNome(e.target.value);
            if (erro) setErro(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void confirmar();
            if (e.key === 'Escape') {
              encerradoRef.current = true;
              onCancelar();
            }
          }}
          onBlur={() => {
            // Sair sem nome cancela; com nome, salva (como o Enter).
            if (!encerradoRef.current && !salvando) void confirmar();
          }}
          className="w-64 rounded-md border border-[#0079F2] bg-white px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0079F2]/20 disabled:opacity-60 dark:bg-gray-900 dark:text-gray-100"
        />
        {salvando && (
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Salvando…</span>
        )}
        {erro && (
          <span role="alert" className={`ml-2 text-xs ${SELO_TEXTO.estourou}`}>
            {erro}
          </span>
        )}
      </td>
    </tr>
  );
}
