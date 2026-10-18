'use client';

/**
 * Página do Comparador — v2.4, fatia D (Comparador ISONÔMICO, spec §3.3 + protótipo final).
 * Estado em ?t=&janela= (useEstadoComparadorUrl); aba Ações | FIIs pela classe do 1º ticker (a API
 * decide; sem tickers, ?c=); até MAX_ATIVOS_COMPARADOR slots.
 *
 * Ordem (D1 = protótipo do Pedro, cores My Finance): barra com a instrução literal (sem ranking),
 * Tijolo | Papel em FIIs, janela 3 | 5 | 10 e "Copiar link"; aviso do misto; slots com sugestões;
 * a tabela com o bloco "Critérios de fundamentos · N anos" PRIMEIRO, os grupos de indicadores e
 * "Na minha carteira"; os mini-gráficos base 100; e a "Leitura dos dados" (só contagens + o
 * literal). No celular, slots empilhados e a tabela em cartões.
 *
 * Nada aqui marca um ativo: sem ★, sem fundo/filete por valor, sem placar, sem Índice MF. O
 * Comparador não grava nada (rec. 7): "Copiar link" leva os tickers e a janela.
 * Estados: vazio, 1 ativo, carregando (esqueleto sem pulsar com reduced-motion) e erro com
 * "Tentar de novo". O título/pílulas da área e o aviso legal ficam na casca.
 *
 * Bloco 1 (fatia B): com recursos.salvos, "Comparações salvas (n) ▾" (só com n > 0) e "Salvar
 * comparação" (navy) na barra, e o MESMO Salvar comparação no slot da Leitura dos dados; com
 * recursos.pdfComparador, "Exportar PDF" (secundário). Salvar comparação grava só tickers, janela
 * e tipo do FII (os números são recalculados ao abrir). Sem os recursos, a tela é a de antes.
 */
import { useCallback, useMemo, useState } from 'react';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import { CARD_ANALISE } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import PilulasJanela from '@/components/analiseAtivos/comum/PilulasJanela';
import AlertaMisto, {
  AvisoComparador,
  LinhaInformativa,
} from '@/components/analiseAtivos/comparador/AlertaMisto';
import BotaoCopiarLink from '@/components/analiseAtivos/comparador/BotaoCopiarLink';
import BotaoSalvarComparacao, {
  LinhaComparacaoSalva,
} from '@/components/analiseAtivos/comparador/BotaoSalvarComparacao';
import MenuComparacoesSalvas from '@/components/analiseAtivos/comparador/MenuComparacoesSalvas';
import { BotaoExportarPdf } from '@/components/analiseAtivos/comparador/ModalExportarPdf';
import CartoesComparador from '@/components/analiseAtivos/comparador/CartoesComparador';
import LeituraDosDados from '@/components/analiseAtivos/comparador/LeituraDosDados';
import MiniGraficosComparador from '@/components/analiseAtivos/comparador/MiniGraficosComparador';
import SeletorTipoFii from '@/components/analiseAtivos/comparador/SeletorTipoFii';
import SlotAdicionar, { FOCO } from '@/components/analiseAtivos/comparador/SlotAdicionar';
import SlotsComparador from '@/components/analiseAtivos/comparador/SlotsComparador';
import TabelaComparador from '@/components/analiseAtivos/comparador/TabelaComparador';
import {
  adicionarTicker,
  removerTicker,
  useEstadoComparadorUrl,
} from '@/components/analiseAtivos/comparador/useEstadoComparadorUrl';
import { useNaCarteira } from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import {
  useAnaliseAtivosConfig,
  useIndiceBusca,
  useOverlayCarteira,
} from '@/hooks/useAnaliseAtivos';
import { useComparador } from '@/hooks/useAnaliseAtivosBlocoD';
import { MAX_ATIVOS_COMPARADOR } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosCriterios';
import {
  INSTRUCAO_COMPARADOR_ACOES,
  INSTRUCAO_COMPARADOR_FIIS,
  INSTRUCAO_COMPARADOR_REITS,
  INSTRUCAO_COMPARADOR_STOCKS,
  type TextoLiteral,
} from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { TEXTOS_EUA_TELAS } from '@/services/analiseAtivos/textosEuaTelas';
import { ErroAnalise } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ComparadorProps, ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import {
  CLASSES_BR,
  CLASSES_QUADRO,
  ehClasseEua,
  type ClasseQuadro,
} from '@/types/analiseAtivosApi';
import type { ItemBusca } from '@/types/analiseAtivosApi';

const TC = TEXTOS_COMPARADOR;
const MAX = String(MAX_ATIVOS_COMPARADOR);
/** A outra classe do MESMO mercado (o Comparador só compara a mesma classe). */
const OUTRA: Record<ClasseQuadro, ClasseQuadro> = {
  acao: 'fii',
  fii: 'acao',
  stock: 'reit',
  reit: 'stock',
};

/** Texto do aviso de um ticker ignorado do link. */
export function textoIgnorado(
  ig: ComparadorResposta['ignorados'][number],
  classe: ClasseQuadro,
): string {
  if (ig.motivo === 'outra_classe') {
    const outra = OUTRA[classe];
    return formatarTexto(TC.ignorados.outra_classe, {
      ticker: ig.ticker,
      classe: TC.ignorados.classes[outra],
      aba: TC.abas[outra],
    });
  }
  if (ig.motivo === 'formato') return formatarTexto(TC.ignorados.formato, { valor: ig.ticker });
  if (ig.motivo === 'excesso')
    return formatarTexto(TC.ignorados.excesso, { ticker: ig.ticker, max: MAX });
  return formatarTexto(TC.ignorados.inexistente, { ticker: ig.ticker });
}

/** Até 3 sugestões: pares dos ativos (na ordem dos slots), fora dos que já estão. */
export function sugestoesDosPares(
  dados: Pick<ComparadorResposta, 'ativos'> | undefined,
  slots: readonly string[],
): string[] {
  const out: string[] = [];
  for (const a of dados?.ativos ?? []) {
    for (const p of a.pares) {
      if (!slots.includes(p) && !out.includes(p)) out.push(p);
      if (out.length === 3) return out;
    }
  }
  return out;
}

/**
 * Tijolo | Papel: os slots que ficam ao escolher `tipo` (os de tipo ainda desconhecido — sem
 * resposta — ficam). Sem nenhum do tipo, a lista sai vazia (a tela volta ao estado vazio de FIIs).
 */
export function slotsDoTipo(
  slots: readonly string[],
  ativos: ReadonlyMap<string, Pick<ComparadorResposta['ativos'][number], 'tipoComparacao'>>,
  tipo: 'tijolo' | 'papel',
): string[] {
  return slots.filter((t) => {
    const a = ativos.get(t);
    return !a || a.tipoComparacao === tipo;
  });
}

/** Instrução literal da barra (data-texto-legal: o nó tem exatamente o texto registrado). */
const INSTRUCOES: Record<ClasseQuadro, TextoLiteral> = {
  acao: INSTRUCAO_COMPARADOR_ACOES,
  fii: INSTRUCAO_COMPARADOR_FIIS,
  stock: INSTRUCAO_COMPARADOR_STOCKS,
  reit: INSTRUCAO_COMPARADOR_REITS,
};

/**
 * Stocks e REITs (fatia C): a API recusa (400) a mistura de stock com REIT (ou EUA com Brasil). Os
 * tickers do link são separados pela classe do índice de busca, com saída para comparar só os
 * REITs ou só os stocks. Sem ganhador e sem cor.
 */
export function separarPorClasse(
  tickers: readonly string[],
  itens: readonly Pick<ItemBusca, 't' | 'c'>[],
): Partial<Record<ClasseQuadro, string[]>> {
  const classe = new Map(itens.map((i) => [i.t, i.c]));
  const out: Partial<Record<ClasseQuadro, string[]>> = {};
  for (const t of tickers) {
    const c = classe.get(t);
    if (c) (out[c] ??= []).push(t);
  }
  return out;
}

function MistoBloqueado({
  tickers,
  itens,
  onComparar,
}: {
  tickers: readonly string[];
  itens: readonly Pick<ItemBusca, 't' | 'c'>[];
  onComparar: (tickers: string[], classe: ClasseQuadro) => void;
}) {
  const grupos = separarPorClasse(tickers, itens);
  const saidas: Array<[ClasseQuadro, string]> = [
    ['reit', TEXTOS_EUA.comparador.abrirReits],
    ['stock', TEXTOS_EUA.comparador.abrirStocks],
  ];
  return (
    <div role="alert" data-comparador-misto-eua="" className="flex flex-col items-start gap-3">
      <p className="m-0 max-w-[640px] text-sm text-gray-800 dark:text-white/90">
        {TEXTOS_EUA.comparador.mistoBloqueado}
      </p>
      <div className="flex flex-wrap gap-2">
        {saidas.map(([c, rotulo]) =>
          grupos[c]?.length ? (
            <button
              key={c}
              type="button"
              data-saida-misto={c}
              onClick={() => onComparar(grupos[c] as string[], c)}
              className={`inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 ${FOCO}`}
            >
              {rotulo} ({(grupos[c] as string[]).join(', ')})
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Instrucao({ classe }: { classe: ClasseQuadro }) {
  const lit = INSTRUCOES[classe];
  return (
    <p
      data-texto-legal={lit.id}
      className="m-0 min-w-0 text-[13px] leading-snug text-gray-600 dark:text-gray-400"
    >
      {lit.texto}
    </p>
  );
}

function Esqueleto({ celular }: { celular: boolean }) {
  return (
    <div role="status" aria-label={TC.estados.carregando} className="flex flex-col gap-3">
      <div className={`grid gap-3 ${celular ? 'grid-cols-1' : 'grid-cols-2 xl:grid-cols-4'}`}>
        {Array.from({ length: celular ? 2 : 4 }, (_, i) => (
          <span
            key={i}
            className={`block rounded-[14px] bg-gray-100 motion-safe:animate-pulse dark:bg-white/[0.04] ${
              celular ? 'h-[60px]' : 'h-[118px]'
            }`}
          />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className="block h-9 rounded-lg bg-gray-100 motion-safe:animate-pulse dark:bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

export default function Comparador({ className = '' }: ComparadorProps) {
  const url = useEstadoComparadorUrl();
  const celular = useIsBelowLg();
  const q = useComparador(url.tickers, { enabled: url.tickers.length > 0, janela: url.janela });
  const dados = url.tickers.length > 0 ? q.data : undefined;

  const ignorados = useMemo(() => new Set(dados?.ignorados.map((i) => i.ticker)), [dados]);
  const slots = useMemo(
    () => url.tickers.filter((t) => !ignorados.has(t)).slice(0, MAX_ATIVOS_COMPARADOR),
    [url.tickers, ignorados],
  );
  const classe: ClasseQuadro =
    (url.tickers.length > 0 ? dados?.classe : null) ?? url.classe ?? 'acao';
  const ativosPor = useMemo(
    () => new Map((dados?.ativos ?? []).map((a) => [a.ticker, a])),
    [dados],
  );
  const na = useNaCarteira(classe, slots.length > 0);
  const vazio = url.tickers.length === 0;
  // Stocks e REITs: 400 da mistura de classes (a API manda o texto do bloqueio)
  const mistoEua =
    q.isError &&
    q.error instanceof ErroAnalise &&
    q.error.status === 400 &&
    q.error.message === TEXTOS_EUA.comparador.mistoBloqueado;
  const overlay = useOverlayCarteira({ enabled: vazio });
  const indice = useIndiceBusca({ enabled: vazio || mistoEua });
  // Bloco 1: Salvar comparação / Comparações salvas (salvos) e Exportar PDF (pdfComparador)
  const config = useAnaliseAtivosConfig();
  const salvosLigado = config.data?.recursos?.salvos === true;
  const euaLigado = config.data?.recursos?.eua === true;
  const pdfLigado = config.data?.recursos?.pdfComparador === true;
  const [menuSalvas, setMenuSalvas] = useState(false);
  const abrirSalvas = useCallback(() => setMenuSalvas(true), []);

  const adicionar = useCallback(
    (t: string) => url.setTickers(adicionarTicker(slots, t)),
    [url, slots],
  );
  const remover = useCallback(
    (t: string) => url.setTickers(removerTicker(slots, t), classe),
    [url, slots, classe],
  );
  const trocarTipo = useCallback(
    (tipo: 'tijolo' | 'papel') => {
      const ficam = slotsDoTipo(slots, ativosPor, tipo);
      if (ficam.length === slots.length) return;
      if (ficam.length === 0) url.trocarClasse('fii');
      else url.setTickers(ficam, 'fii');
    },
    [url, slots, ativosPor],
  );

  // Stocks e REITs só com a chave EUA (rótulos das abas do Quadro)
  const abas = (euaLigado ? CLASSES_QUADRO : CLASSES_BR).map((c) => ({
    id: c,
    label: ehClasseEua(c) ? TEXTOS_TELA.quadro.abas[c] : TC.abas[c],
  }));
  const nav = (
    <ResponsiveTabNav
      tabs={abas}
      activeId={classe}
      onChange={(id) => {
        if (id !== classe) url.trocarClasse(id as ClasseQuadro);
      }}
      ariaLabel={TC.abas.rotulo}
      variant="segmented-sub"
      // todo controle com 44px (o segmentado do celular tem 38px por padrão); com as 4 abas
      // (EUA), grade 2×2 abaixo de 640 px
      className={
        euaLigado && celular
          ? 'grid shrink-0 grid-cols-2 sm:flex [&>button]:min-h-11'
          : 'shrink-0 [&>button]:min-h-11'
      }
    />
  );
  const cheio = slots.length >= MAX_ATIVOS_COMPARADOR;
  const sugestoes = sugestoesDosPares(dados, slots);
  const card = `${CARD_ANALISE} flex flex-col gap-4`;

  // ---- vazio ----
  if (vazio) {
    const nomes = new Map((indice.data?.itens ?? []).map((i) => [i.t, i]));
    const daCarteira = Object.keys(overlay.data?.posicoes ?? {})
      .filter((t) => nomes.get(t)?.c === classe)
      .slice(0, 4);
    return (
      <div className={`flex min-w-0 flex-col gap-4 ${className}`} data-comparador="vazio">
        <section className={card} aria-labelledby="comparador-vazio">
          {nav}
          <Instrucao classe={classe} />
          <div className="flex flex-col items-start gap-3 py-2">
            <h2
              id="comparador-vazio"
              className="text-base font-semibold text-gray-800 dark:text-white/90"
            >
              {TC.vazio.titulo}
            </h2>
            <p className="max-w-[640px] text-sm text-gray-700 dark:text-gray-300">
              {ehClasseEua(classe)
                ? TEXTOS_EUA_TELAS.comparador.vazio[classe]
                : classe === 'fii'
                  ? TC.vazio.textoFii
                  : TC.vazio.textoAcao}
            </p>
            <SlotAdicionar
              classe={classe}
              slots={[]}
              sugestoes={[]}
              onAdicionar={adicionar}
              variante={celular ? 'celular' : 'botao'}
              celular={celular}
            />
            {daCarteira.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                <span>{TC.vazio.daCarteira}</span>
                {daCarteira.map((t) => (
                  <button
                    key={t}
                    type="button"
                    data-sugestao={t}
                    onClick={() => adicionar(t)}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-[13px] text-gray-700 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 ${FOCO}`}
                  >
                    <b className="font-semibold text-gray-800 dark:text-white/90">{t}</b>
                    <span data-nome-ativo="">{nomes.get(t)?.n ?? ''}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-gray-500 dark:text-gray-400">{TC.vazio.outrasEntradas}</p>
          </div>
        </section>
      </div>
    );
  }

  // ---- carregando / erro geral ----
  if (!dados) {
    return (
      <div className={`flex min-w-0 flex-col gap-4 ${className}`} data-comparador="estado">
        <section className={card} aria-busy={q.isError ? undefined : true}>
          {nav}
          {mistoEua ? (
            <MistoBloqueado
              tickers={url.tickers}
              itens={indice.data?.itens ?? []}
              onComparar={(t, c) => url.setTickers(t, c)}
            />
          ) : q.isError ? (
            <div role="alert" className="flex flex-col items-start gap-3">
              <p className="text-sm text-gray-800 dark:text-white/90">{TC.estados.erro}</p>
              <button
                type="button"
                onClick={() => q.refetch()}
                className={`inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 ${FOCO}`}
              >
                {TC.estados.tentarNovamente}
              </button>
            </div>
          ) : (
            <Esqueleto celular={celular} />
          )}
        </section>
      </div>
    );
  }

  // ---- com dados ----
  const avisos =
    dados.ignorados.length > 0 ? (
      <div className="flex flex-col gap-2">
        {dados.ignorados.map((ig) => (
          <AvisoComparador key={`${ig.motivo}-${ig.ticker}`} role="status">
            {textoIgnorado(ig, classe)}
          </AvisoComparador>
        ))}
      </div>
    ) : null;
  const erroAtualizar = q.isError ? (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 text-sm text-gray-800 dark:text-white/90"
    >
      {TC.estados.erro}
      <button
        type="button"
        onClick={() => q.refetch()}
        className={`inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium dark:border-gray-700 dark:bg-white/[0.03] ${FOCO}`}
      >
        {TC.estados.tentarNovamente}
      </button>
    </div>
  ) : null;
  const umAtivo = slots.length === 1 ? <LinhaInformativa>{TC.umAtivo}</LinhaInformativa> : null;
  const limite = cheio ? (
    <LinhaInformativa>{formatarTexto(TC.slots.limite, { max: MAX })}</LinhaInformativa>
  ) : null;
  const atualizando = q.isPlaceholderData || q.isFetching ? 'opacity-70' : '';
  const tipoAtual = dados.ativos[0]?.tipoComparacao === 'papel' ? 'papel' : 'tijolo';
  const seletorTipo =
    classe === 'fii' ? (
      <SeletorTipoFii valor={tipoAtual} indefinido={dados.misto} onTrocar={trocarTipo} />
    ) : null;
  const janela = (
    <PilulasJanela valor={url.janela} onTrocar={url.setJanela} rotuloGrupo={TC.janela.rotulo} />
  );
  // ---- Bloco 1 ----
  const tipoFii = classe === 'fii' ? tipoAtual : null;
  const salvarComparacao = (onde: 'barra' | 'leitura', larguraToda = false) =>
    salvosLigado ? (
      <BotaoSalvarComparacao
        classe={classe}
        tickers={slots}
        janela={url.janela}
        tipoFii={tipoFii}
        onAbrirSalvas={abrirSalvas}
        larguraToda={larguraToda}
        onde={onde}
      />
    ) : null;
  const menuComparacoes = (larguraToda = false) =>
    salvosLigado ? (
      <MenuComparacoesSalvas
        aberto={menuSalvas}
        onAlternar={setMenuSalvas}
        celular={celular}
        larguraToda={larguraToda}
      />
    ) : null;
  const exportarPdf = (larguraToda = false) =>
    pdfLigado ? (
      <BotaoExportarPdf
        classe={classe}
        tickers={slots}
        janela={url.janela}
        tipoFii={tipoFii}
        leitura={dados.leitura}
        larguraToda={larguraToda}
      />
    ) : null;
  const linhaSalva = salvosLigado ? (
    <LinhaComparacaoSalva tickers={slots} janela={url.janela} tipoFii={tipoFii} />
  ) : null;

  const copiarLeitura = (larguraToda: boolean) => (
    <BotaoCopiarLink
      slots={slots}
      janela={url.janela}
      rotulo={TC.acoes.copiarLinkComparacao}
      larguraToda={larguraToda}
    />
  );
  const leitura = (larguraToda: boolean) => (
    <LeituraDosDados
      leitura={dados.leitura}
      acao={
        salvosLigado ? (
          <div
            className={`flex flex-wrap items-start gap-2 ${larguraToda ? 'w-full flex-col [&>*]:w-full' : ''}`}
          >
            {copiarLeitura(larguraToda)}
            {salvarComparacao('leitura', larguraToda)}
          </div>
        ) : (
          copiarLeitura(larguraToda)
        )
      }
    />
  );

  if (celular) {
    return (
      <div
        className={`flex min-w-0 flex-col gap-3 ${className}`}
        data-comparador={dados.classe}
        aria-busy={q.isFetching || undefined}
      >
        {na.fonte}
        {nav}
        {avisos}
        {erroAtualizar}
        <Instrucao classe={classe} />
        {linhaSalva}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {seletorTipo}
          {janela}
        </div>
        {salvosLigado || pdfLigado ? (
          <div
            className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2"
            data-acoes-salvos-comparador=""
          >
            {menuComparacoes(true)}
            {exportarPdf(true)}
            {salvosLigado ? (
              <div className="min-[480px]:col-span-2">{salvarComparacao('barra', true)}</div>
            ) : null}
          </div>
        ) : null}
        {dados.misto ? <AlertaMisto /> : null}
        <SlotsComparador slots={slots} ativos={ativosPor} onRemover={remover} celular />
        {cheio ? (
          limite
        ) : (
          <SlotAdicionar
            classe={classe}
            slots={slots}
            sugestoes={sugestoes}
            onAdicionar={adicionar}
            variante="celular"
            celular
          />
        )}
        {umAtivo}
        <div className={`flex flex-col gap-3 ${atualizando}`}>
          <CartoesComparador dados={dados} classe={classe} naCarteira={na.info} />
          {dados.graficos ? <MiniGraficosComparador graficos={dados.graficos} /> : null}
        </div>
        {leitura(true)}
      </div>
    );
  }

  return (
    <div
      className={`flex min-w-0 flex-col gap-4 ${className}`}
      data-comparador={dados.classe}
      aria-busy={q.isFetching || undefined}
    >
      {na.fonte}
      <section className={card} aria-label={TC.titulo}>
        {nav}
        {avisos}
        {erroAtualizar}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-barra-comparador="">
          <div className="min-w-0 flex-1 basis-[320px]">
            <Instrucao classe={classe} />
            {linhaSalva}
          </div>
          {seletorTipo}
          {janela}
          {menuComparacoes()}
          <BotaoCopiarLink slots={slots} janela={url.janela} />
          {exportarPdf()}
          {salvarComparacao('barra')}
        </div>
        {dados.misto ? <AlertaMisto /> : null}
        <SlotsComparador
          slots={slots}
          ativos={ativosPor}
          onRemover={remover}
          celular={false}
          adicionar={
            cheio ? undefined : (
              <SlotAdicionar
                classe={classe}
                slots={slots}
                sugestoes={sugestoes}
                onAdicionar={adicionar}
                variante="slot"
                celular={false}
              />
            )
          }
        />
        {limite}
        {umAtivo}
        <div className={atualizando}>
          <TabelaComparador dados={dados} classe={classe} naCarteira={na.info} />
        </div>
      </section>
      {dados.graficos ? (
        <div className={atualizando}>
          <MiniGraficosComparador graficos={dados.graficos} />
        </div>
      ) : null}
      {leitura(false)}
    </div>
  );
}
