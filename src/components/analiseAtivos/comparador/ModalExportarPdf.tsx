'use client';

/**
 * Exportar PDF do Comparador (bloco 1, fatia B; só com recursos.pdfComparador). O PDF é gerado NO
 * SERVIDOR (GET /api/analise-ativos/comparacao-pdf, fatia A) e não tem opções: o modal só mostra o
 * que vai e o que fica de fora, a prévia da página 1, o nome do arquivo e "Baixar PDF".
 *
 * Estados do botão: Baixar PDF → "Gerando PDF…" (aria-busy) → fecha com o aviso "PDF pronto: …".
 * - iPhone/iPad: se o menu de compartilhar recusa depois da espera (NotAllowedError), o modal
 *   mostra "O PDF está pronto." e o botão vira "Compartilhar PDF" (foco nele): o 2º toque abre o
 *   menu com ativação nova (baixarPdfComparacao devolve {estado:'compartilhar'}).
 * - 429 (10 por hora): o aviso do limite e o botão desabilitado.
 * - Outro erro: a frase de erro e "Tentar de novo".
 * Nunca leva posição, nome ou e-mail; o consultor também exporta (sem dado pessoal).
 */
import { useEffect, useRef, useState } from 'react';
import ModalAnalise, {
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  DICA_RODAPE,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import { ErroAnalise } from '@/hooks/useAnaliseAtivos';
import { baixarPdfComparacao } from '@/hooks/useAnaliseAtivosSalvos';
import { textoContagens } from '@/services/analiseAtivos/regras/comparador/resumo';
import { LIMITES_SALVOS, nomeArquivoPdf } from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { LEITURA_DOS_DADOS, RODAPE_LEGAL_V2 } from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ClasseQuadro, TipoFiiExibido } from '@/types/analiseAtivosApi';
import type { Janela, LeituraDosDados } from '@/types/analiseAtivosCriterios';

const T = TEXTOS_SALVOS.pdf;
const D = T.documento;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

type EstadoPdf =
  | { tipo: 'pronto' }
  | { tipo: 'gerando' }
  | { tipo: 'compartilhar'; nome: string; compartilhar: () => Promise<void> }
  | { tipo: 'erro' }
  | { tipo: 'limite' };

function hojeLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function IconePdf() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H6v18h12V7z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </svg>
  );
}

export interface ModalExportarPdfProps {
  aberto: boolean;
  onFechar: () => void;
  classe: ClasseQuadro;
  /** na ordem dos slots */
  tickers: readonly string[];
  janela: Janela;
  tipoFii: TipoFiiExibido | null;
  /** contagens da Leitura dos dados (prévia) */
  leitura?: LeituraDosDados;
}

/** Prévia da página 1 (A4 em miniatura). Sem posição, nome ou e-mail. */
function PreviaPdf({
  classe,
  tickers,
  janela,
  leitura,
}: Pick<ModalExportarPdfProps, 'classe' | 'tickers' | 'janela' | 'leitura'>) {
  return (
    <div
      role="img"
      aria-label={T.previaAria}
      data-previa-pdf=""
      className="mx-auto flex aspect-[210/297] w-full max-w-[260px] flex-col gap-1.5 overflow-hidden rounded-md border border-gray-200 bg-white p-3 text-[7.5px] leading-snug text-gray-700 shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-gray-200 pb-1">
        <span className="flex items-center gap-1 text-[9px] font-bold text-[#314666]">
          <i className="inline-block h-2 w-2 rounded-sm bg-[#396CAA]" />
          {D.marca}
        </span>
        <span className="text-gray-500">{D.origem}</span>
      </div>
      <p className="text-[9.5px] font-semibold text-gray-900">
        {classe === 'fii' ? D.tituloFii : D.tituloAcao}
      </p>
      <p className="text-gray-500">
        {tickers.join(TEXTOS_SALVOS.comparacoes.lista.separadorTickers)} ·{' '}
        {formatarTexto(D.janela, { n: janela })}
      </p>
      <div className="grid gap-0.5 rounded border border-gray-100 p-1.5">
        <span className="font-semibold text-gray-800">
          {formatarTexto(D.grupoCriterios, { n: janela })}
        </span>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="block h-1.5 rounded bg-gray-100" />
        ))}
      </div>
      <p className="text-gray-500">{D.seriesNoApp}</p>
      <div className="rounded bg-[#EDF2F8] p-1.5">
        <b className="block text-gray-800">{D.leituraTitulo}</b>
        {leitura ? <span className="block">{textoContagens(leitura)}</span> : null}
        <span data-texto-legal={LEITURA_DOS_DADOS.id} className="block text-gray-600">
          {LEITURA_DOS_DADOS.texto}
        </span>
      </div>
      <div className="mt-auto border-t border-gray-200 pt-1 text-[6.5px] text-gray-500">
        <b className="block text-gray-700">{D.avisoLegalTitulo}</b>
        <span data-texto-legal={RODAPE_LEGAL_V2.id}>{RODAPE_LEGAL_V2.texto}</span>
      </div>
    </div>
  );
}

export default function ModalExportarPdf({
  aberto,
  onFechar,
  classe,
  tickers,
  janela,
  tipoFii,
  leitura,
}: ModalExportarPdfProps) {
  const [estado, setEstado] = useState<EstadoPdf>({ tipo: 'pronto' });
  const compartilharRef = useRef<HTMLButtonElement>(null);
  const nome = nomeArquivoPdf(classe, tickers, hojeLocalIso());

  useEffect(() => {
    if (aberto) setEstado({ tipo: 'pronto' });
  }, [aberto]);

  useEffect(() => {
    if (estado.tipo === 'compartilhar') compartilharRef.current?.focus();
  }, [estado.tipo]);

  const terminar = (nomeArquivo: string) => {
    onFechar();
    mostrarToastSalvo({
      tipo: 'info',
      mensagem: formatarTexto(T.toastPronto, { nome: nomeArquivo }),
    });
  };

  const baixar = async () => {
    if (estado.tipo === 'gerando' || estado.tipo === 'limite') return;
    setEstado({ tipo: 'gerando' });
    try {
      const r = await baixarPdfComparacao({
        classe,
        tickers: [...tickers],
        janela,
        tipoFii: classe === 'fii' ? tipoFii : null,
      });
      if (r.estado === 'compartilhar') {
        setEstado({ tipo: 'compartilhar', nome: r.nome, compartilhar: r.compartilhar });
      } else {
        terminar(r.nome);
      }
    } catch (err: unknown) {
      setEstado({ tipo: err instanceof ErroAnalise && err.status === 429 ? 'limite' : 'erro' });
    }
  };

  const compartilhar = async () => {
    if (estado.tipo !== 'compartilhar') return;
    try {
      await estado.compartilhar();
      terminar(estado.nome);
    } catch {
      setEstado({ tipo: 'erro' });
    }
  };

  const gerando = estado.tipo === 'gerando';
  const rodape = (
    <>
      <span className={DICA_RODAPE} data-nome-arquivo-pdf="">
        {formatarTexto(T.nomeArquivo, { nome })}
      </span>
      <button type="button" onClick={onFechar} className={BOTAO_MODAL_SECUNDARIO}>
        {T.cancelar}
      </button>
      {estado.tipo === 'compartilhar' ? (
        <button
          ref={compartilharRef}
          type="button"
          onClick={() => void compartilhar()}
          className={BOTAO_MODAL_PRIMARIO}
          data-compartilhar-pdf=""
        >
          <IconePdf />
          {T.compartilhar}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void baixar()}
          disabled={gerando || estado.tipo === 'limite'}
          aria-busy={gerando || undefined}
          className={BOTAO_MODAL_PRIMARIO}
          data-baixar-pdf=""
        >
          <IconePdf />
          {gerando ? T.gerando : estado.tipo === 'erro' ? T.tentar : T.baixar}
        </button>
      )}
    </>
  );

  return (
    <ModalAnalise
      aberto={aberto}
      onFechar={onFechar}
      titulo={T.titulo}
      rodape={rodape}
      largura="larga"
    >
      <div data-modal-exportar-pdf="" className="flex flex-col gap-3">
        <p className={SUBTITULO_MODAL}>
          {formatarTexto(T.subtitulo, {
            classe: TEXTOS_SALVOS.comparacoes.lista.classe[classe],
            tickers: tickers.join(TEXTOS_SALVOS.comparacoes.lista.separadorTickers),
            n: janela,
          })}
        </p>
        <div className="grid gap-4 sm:grid-cols-[1fr_minmax(0,220px)]">
          <div className="flex flex-col gap-2 text-[13px] text-gray-700 dark:text-gray-300">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {T.vaiTitulo}
            </h3>
            <ul className="list-disc pl-5">
              {T.vaiItens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {T.foraTitulo}
            </h3>
            <ul className="list-disc pl-5">
              {T.foraItens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
              {formatarTexto(T.limiteInfo, { max: LIMITES_SALVOS.pdfPorHora })}
            </p>
            {estado.tipo === 'compartilhar' ? (
              <p
                role="status"
                className="rounded-lg border-l-[3px] border-[#396CAA] bg-[#EDF2F8] px-3 py-2 dark:border-[#6E9DC4] dark:bg-white/5"
                data-pdf-pronto=""
              >
                <b className="block text-gray-800 dark:text-white/90">{T.prontoTitulo}</b>
                {T.prontoTexto}
              </p>
            ) : null}
            {estado.tipo === 'limite' ? (
              <p
                role="alert"
                className="rounded-lg border-l-[3px] border-[#396CAA] bg-[#EDF2F8] px-3 py-2 dark:border-[#6E9DC4] dark:bg-white/5"
                data-pdf-limite=""
              >
                {formatarTexto(T.limiteSemHora, { max: LIMITES_SALVOS.pdfPorHora })}
              </p>
            ) : null}
            {estado.tipo === 'erro' ? (
              <p role="alert" className="text-[#D92D20] dark:text-[#F97066]" data-pdf-erro="">
                {T.erro}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg bg-gray-100 p-3 dark:bg-white/5">
            <PreviaPdf classe={classe} tickers={tickers} janela={janela} leitura={leitura} />
          </div>
        </div>
      </div>
    </ModalAnalise>
  );
}

const BOTAO_SEC = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 dark:hover:bg-white/[0.06] ${FOCO}`;

/** "Exportar PDF" (secundário) + o modal. Quem monta decide se o recurso está ligado. */
export function BotaoExportarPdf({
  larguraToda = false,
  ...props
}: Omit<ModalExportarPdfProps, 'aberto' | 'onFechar'> & { larguraToda?: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        disabled={props.tickers.length === 0}
        className={`${BOTAO_SEC} ${larguraToda ? 'w-full' : ''}`}
        data-exportar-pdf=""
      >
        <IconePdf />
        {T.botao}
      </button>
      {aberto ? <ModalExportarPdf {...props} aberto onFechar={() => setAberto(false)} /> : null}
    </>
  );
}
