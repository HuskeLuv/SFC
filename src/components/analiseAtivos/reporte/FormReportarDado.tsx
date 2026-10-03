'use client';

/**
 * Formulário "Reportar dado incorreto" (bloco C, fatia D; protótipo R2–R9, M2, M3).
 *
 * - Computador: modal de 560px (cabeçalho com ativo · bloco, corpo rolável, rodapé com Cancelar e
 *   "Enviar relato"). Celular (< lg): SheetReportarDado (tela cheia, rodapé fixo de 48px, "voltar"
 *   fecha).
 * - "Qual dado?" pré-escolhido (rótulo · valor · período), contexto SÓ LEITURA (ativo, bloco,
 *   valor, período, fonte, atualização), "O que está errado?" (10–1.000, contador), "Valor que você
 *   esperava" (opcional, até 40) e "Onde você viu?" (opcional, até 300).
 * - Estados: inválido (resumo role=alert + erro no campo), enviando, enviado (protocolo e prazo em
 *   data), rede ("Tentar de novo" mantendo o texto), limite (429), duplicado (409, leva ao relato) e
 *   indisponível (404). Consultor agindo: aviso de que o relato vai no nome dele.
 * - Texto do usuário só como TEXTO (value de campo); nada vira HTML. Textos de textosTela.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from '@/components/ui/modal';
import SheetReportarDado, {
  type FecharEntao,
} from '@/components/analiseAtivos/reporte/SheetReportarDado';
import {
  ErroEnvioRelato,
  useReportarDado,
  type ResultadoEnvioRelato,
} from '@/components/analiseAtivos/reporte/useReportarDado';
import { useAuth } from '@/hooks/useAuth';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import {
  CAMPO_OUTRO,
  LIMITES,
  ROTAS_CURADORIA,
  contemHtml,
  sanearTextoLivre,
  type CampoReporte,
} from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  BotaoReportarDadoProps,
  ContextoBlocoReporte,
  ReportePostBody,
} from '@/types/analiseAtivosCuradoria';

const T = TEXTOS_TELA.relatos;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const BOTAO_PRI = `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#314666] px-4 text-sm font-semibold text-white hover:bg-[#283a55] disabled:opacity-60 lg:min-h-11 dark:bg-[#396CAA] dark:hover:bg-[#335f96] ${FOCO}`;
const BOTAO_SEC = `inline-flex min-h-12 items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 lg:min-h-11 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO}`;
const CAMPO_BASE = `w-full rounded-[10px] border bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 disabled:opacity-60 lg:text-[15px] dark:bg-[#18181B] dark:text-white/90 dark:placeholder:text-gray-500 ${FOCO}`;
const BORDA_OK = 'border-gray-300 dark:border-[#3A404B]';
const BORDA_ERRO =
  'border-[#D92D20] ring-1 ring-[#D92D20] dark:border-[#F97066] dark:ring-[#F97066]';
const COR_ERRO = 'text-[#D92D20] dark:text-[#F97066]';

type Estado =
  | { fase: 'editando' }
  | { fase: 'enviando' }
  | { fase: 'rede' }
  | { fase: 'enviado'; protocolo: string; slaAte: string | null }
  | { fase: 'duplicado'; reporteId: string }
  | { fase: 'limite'; texto: string }
  | { fase: 'indisponivel' };

type CampoTexto = 'mensagem' | 'valorEsperado' | 'fonteEsperada';
type ErrosForm = Partial<Record<CampoTexto | 'campo', string>>;

export type FormReportarDadoProps = Omit<BotaoReportarDadoProps, 'variante' | 'className'> & {
  aberto: boolean;
  onFechar: () => void;
};

/** 'AAAA-MM-DD' → 'dd/mm/aaaa'. */
export function dataCivilBr(civil: string | null | undefined): string {
  if (!civil || !/^\d{4}-\d{2}-\d{2}$/.test(civil)) return '—';
  const [a, m, d] = civil.split('-');
  return `${d}/${m}/${a}`;
}

function dataHoraBr(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rotuloCampo(campo: CampoReporte): string {
  return (T.campos as Record<string, string>)[campo] ?? campo;
}

/** Opções do "Qual dado?" (dados do bloco + 'outro'). */
export function opcoesDado(contexto: ContextoBlocoReporte) {
  const opcoes = contexto.dados.map((d) => {
    const base = formatarTexto(T.form.opcaoDado, {
      campo: d.rotulo || rotuloCampo(d.campo),
      valor: d.valorExibido ?? '—',
    });
    return {
      campo: d.campo as CampoReporte,
      rotulo: d.periodo ? `${base} · ${d.periodo}` : base,
      valorExibido: d.valorExibido,
      periodo: d.periodo,
    };
  });
  opcoes.push({ campo: CAMPO_OUTRO, rotulo: T.campos.outro, valorExibido: null, periodo: null });
  return opcoes;
}

/** Validação no cliente (o servidor valida de novo). Mesmo saneamento do servidor. */
export function validarForm(v: Record<CampoTexto, string>): ErrosForm {
  const e: ErrosForm = {};
  const msg = sanearTextoLivre(v.mensagem);
  if (contemHtml(msg)) e.mensagem = T.erros.html;
  else if (msg.length < LIMITES.mensagemMin)
    e.mensagem = formatarTexto(T.erros.mensagemCurta, { n: LIMITES.mensagemMin });
  else if (msg.length > LIMITES.mensagemMax)
    e.mensagem = formatarTexto(T.erros.mensagemLonga, { max: LIMITES.mensagemMax });
  const opcionais: Array<[CampoTexto, number]> = [
    ['valorEsperado', LIMITES.valorEsperado],
    ['fonteEsperada', LIMITES.fonteEsperada],
  ];
  for (const [k, max] of opcionais) {
    const s = sanearTextoLivre(v[k]);
    if (contemHtml(s)) e[k] = T.erros.html;
    else if (s.length > max) e[k] = formatarTexto(T.erros.campoLongo, { max });
  }
  return e;
}

/** Erros do servidor (códigos por campo) → textos da tela. */
function errosDoServidor(detalhes: Record<string, string[]>): ErrosForm {
  const e: ErrosForm = {};
  const texto = (k: string, codigo: string): string => {
    if (codigo === 'html') return T.erros.html;
    if (k === 'mensagem' && codigo === 'min')
      return formatarTexto(T.erros.mensagemCurta, { n: LIMITES.mensagemMin });
    if (k === 'mensagem' && codigo === 'max')
      return formatarTexto(T.erros.mensagemLonga, { max: LIMITES.mensagemMax });
    const max = (LIMITES as Record<string, number>)[k];
    if (codigo === 'max' && max) return formatarTexto(T.erros.campoLongo, { max });
    return T.erros.resumo;
  };
  for (const [k, codigos] of Object.entries(detalhes)) {
    const codigo = codigos[0] ?? 'invalido';
    if (k === 'mensagem' || k === 'valorEsperado' || k === 'fonteEsperada') e[k] = texto(k, codigo);
    else if (k === 'campo') e.campo = T.erros.resumo;
  }
  return e;
}

function textoLimite(r: Extract<ResultadoEnvioRelato, { tipo: 'limite' }>, ticker: string) {
  switch (r.limite) {
    case 'dia':
      return formatarTexto(T.erros.limiteDia, { max: LIMITES.porDia, data: dataHoraBr(r.voltaEm) });
    case 'hora_ativo':
      return formatarTexto(T.erros.limiteHoraAtivo, { max: LIMITES.porHoraAtivo, ticker });
    case 'global':
      return T.erros.limiteGlobal;
    default:
      return T.erros.limiteIp;
  }
}

// ---------------------------------------------------------------------------
// Ícones
// ---------------------------------------------------------------------------

function IconeAlerta() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13.8" r="1" fill="currentColor" />
    </svg>
  );
}

function IconeInfo() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-[18px] w-[18px] shrink-0">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.3" r="1" fill="currentColor" />
    </svg>
  );
}

function IconeOk() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
      <path
        d="M5 12.5l4.2 4.2L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Girando() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

function CaixaErro({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-[10px] bg-[#D92D20]/[0.08] px-3 py-2 text-sm dark:bg-[#F97066]/10 ${COR_ERRO}`}
    >
      <IconeAlerta />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CaixaInfo({ children, papel }: { children: ReactNode; papel?: 'status' }) {
  return (
    <div
      role={papel}
      className="flex items-start gap-2 rounded-[10px] bg-gray-100 px-3 py-2.5 text-sm text-gray-700 dark:bg-white/[0.06] dark:text-gray-200"
    >
      <span className="text-[#396CAA] dark:text-[#6E9DC4]">
        <IconeInfo />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

export default function FormReportarDado({
  ticker,
  bloco,
  contexto,
  campo,
  aberto,
  onFechar,
}: FormReportarDadoProps) {
  const celular = useIsBelowLg();
  const router = useRouter();
  const { actingClient } = useAuth();
  const enviar = useReportarDado();
  const ids = {
    titulo: useId(),
    dado: useId(),
    msg: useId(),
    msgAjuda: useId(),
    msgErro: useId(),
    esperado: useId(),
    esperadoErro: useId(),
    onde: useId(),
    ondeAjuda: useId(),
    ondeErro: useId(),
  };
  const opcoes = useMemo(() => opcoesDado(contexto), [contexto]);
  const inicial: CampoReporte =
    campo && opcoes.some((o) => o.campo === campo) ? campo : (opcoes[0]?.campo ?? CAMPO_OUTRO);
  const [campoSel, setCampoSel] = useState<CampoReporte>(inicial);
  const [valores, setValores] = useState<Record<CampoTexto, string>>({
    mensagem: '',
    valorEsperado: '',
    fonteEsperada: '',
  });
  const [erros, setErros] = useState<ErrosForm>({});
  const [estado, setEstado] = useState<Estado>({ fase: 'editando' });
  const refs = {
    mensagem: useRef<HTMLTextAreaElement>(null),
    valorEsperado: useRef<HTMLInputElement>(null),
    fonteEsperada: useRef<HTMLInputElement>(null),
  };

  const dado = opcoes.find((o) => o.campo === campoSel) ?? opcoes[opcoes.length - 1];
  const rotuloBloco = contexto.rotuloBloco || T.blocos[bloco];
  const ocupado = estado.fase === 'enviando';
  const nMsg = sanearTextoLivre(valores.mensagem).length;

  const focarPrimeiroErro = (e: ErrosForm) => {
    const ordem: CampoTexto[] = ['mensagem', 'valorEsperado', 'fonteEsperada'];
    const k = ordem.find((c) => e[c]);
    if (k) refs[k].current?.focus();
  };

  const submeter = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (ocupado) return;
    const e = validarForm(valores);
    setErros(e);
    if (Object.keys(e).length > 0) {
      setEstado({ fase: 'editando' });
      focarPrimeiroErro(e);
      return;
    }
    const opcional = (s: string) => {
      const t = sanearTextoLivre(s);
      return t.length > 0 ? t : undefined;
    };
    const body: ReportePostBody = {
      ticker,
      bloco,
      campo: campoSel,
      valorExibido: dado.valorExibido ?? undefined,
      periodo: dado.periodo ?? undefined,
      fonteExibida: contexto.fonteExibida ?? undefined,
      frescorExibido: contexto.frescorExibido ?? undefined,
      versao: contexto.versao.slice(0, LIMITES.versao),
      mensagem: sanearTextoLivre(valores.mensagem),
      valorEsperado: opcional(valores.valorEsperado),
      fonteEsperada: opcional(valores.fonteEsperada),
    };
    setEstado({ fase: 'enviando' });
    try {
      const r = await enviar.mutateAsync(body);
      if (r.tipo === 'enviado') {
        setEstado({ fase: 'enviado', protocolo: r.resposta.protocolo, slaAte: r.resposta.slaAte });
      } else if (r.tipo === 'duplicado') {
        setEstado({ fase: 'duplicado', reporteId: r.reporteId });
      } else if (r.tipo === 'limite') {
        setEstado({ fase: 'limite', texto: textoLimite(r, ticker) });
      } else if (r.tipo === 'invalido') {
        const es = errosDoServidor(r.erros);
        setErros(Object.keys(es).length > 0 ? es : { campo: T.erros.resumo });
        setEstado({ fase: 'editando' });
        focarPrimeiroErro(es);
      } else {
        setEstado({ fase: 'indisponivel' });
      }
    } catch (err: unknown) {
      if (err instanceof ErroEnvioRelato || err instanceof Error) setEstado({ fase: 'rede' });
    }
  };

  const mudar = (k: CampoTexto, v: string) => {
    setValores((s) => ({ ...s, [k]: v }));
    if (erros[k]) setErros((e) => ({ ...e, [k]: undefined }));
  };

  const hrefMeus = ROTAS_CURADORIA.meusRelatos;
  const irPara = (href: string, fecharEntao?: FecharEntao) => {
    if (fecharEntao) fecharEntao(() => router.push(href));
    else {
      onFechar();
      router.push(href);
    }
  };

  const linkNav = (href: string, texto: string, fecharEntao?: FecharEntao, primario = false) =>
    fecharEntao ? (
      <button
        type="button"
        onClick={() => irPara(href, fecharEntao)}
        className={
          primario
            ? BOTAO_PRI
            : `inline-flex min-h-11 items-center text-sm font-semibold ${COR_LINK.classes} ${FOCO}`
        }
      >
        {texto}
      </button>
    ) : (
      <Link
        href={href}
        onClick={onFechar}
        className={
          primario
            ? BOTAO_PRI
            : `inline-flex min-h-11 items-center text-sm font-semibold ${COR_LINK.classes} ${FOCO}`
        }
      >
        {texto}
      </Link>
    );

  // ----- partes -----

  const contextoDl = (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">{T.form.contexto}</h3>
      <dl
        data-relato-contexto=""
        className="grid grid-cols-1 gap-x-3.5 gap-y-0.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-1 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        {(
          [
            [T.form.ativo, ticker],
            [T.form.bloco, rotuloBloco],
            [T.form.valor, dado.valorExibido ?? '—'],
            [T.form.periodo, dado.periodo ?? '—'],
            [T.form.fonte, contexto.fonteExibida ?? '—'],
            [T.form.atualizacao, contexto.frescorExibido ?? '—'],
          ] as const
        ).map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="mt-1.5 text-gray-500 first:mt-0 sm:mt-0 dark:text-gray-400">{rotulo}</dt>
            <dd className="min-w-0 break-words text-gray-900 tabular-nums dark:text-white/90">
              {valor}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const corpoEditando = (
    <>
      {actingClient ? <CaixaInfo>{T.form.consultor}</CaixaInfo> : null}
      {Object.values(erros).some(Boolean) ? <CaixaErro>{T.erros.resumo}</CaixaErro> : null}
      {estado.fase === 'rede' ? <CaixaErro>{T.erros.rede}</CaixaErro> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.dado} className="text-sm font-medium text-gray-800 dark:text-white/90">
          {T.form.qualDado}
        </label>
        <select
          id={ids.dado}
          value={campoSel}
          disabled={ocupado}
          // computador: o foco entra no 1º campo do modal; no celular não (o teclado abriria)
          autoFocus={!celular}
          onChange={(e) => setCampoSel(e.target.value as CampoReporte)}
          className={`${CAMPO_BASE} ${BORDA_OK} min-h-12 lg:min-h-11`}
        >
          {opcoes.map((o) => (
            <option key={o.campo} value={o.campo}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>

      {contextoDl}

      <div className="flex flex-col gap-1.5" data-invalido={erros.mensagem ? '1' : undefined}>
        <label htmlFor={ids.msg} className="text-sm font-medium text-gray-800 dark:text-white/90">
          {T.form.oQueEstaErrado}
        </label>
        <textarea
          id={ids.msg}
          ref={refs.mensagem}
          value={valores.mensagem}
          maxLength={LIMITES.mensagemMax + 200}
          rows={4}
          disabled={ocupado}
          aria-invalid={!!erros.mensagem}
          aria-describedby={`${ids.msgAjuda}${erros.mensagem ? ` ${ids.msgErro}` : ''}`}
          onChange={(e) => mudar('mensagem', e.target.value)}
          className={`${CAMPO_BASE} ${erros.mensagem ? BORDA_ERRO : BORDA_OK} min-h-[110px] resize-y py-2.5 leading-normal`}
        />
        {erros.mensagem ? (
          <p id={ids.msgErro} className={`flex items-start gap-1.5 text-[13px] ${COR_ERRO}`}>
            <IconeAlerta />
            {erros.mensagem}
          </p>
        ) : null}
        <p
          id={ids.msgAjuda}
          className="flex flex-wrap justify-between gap-2 text-[12.5px] text-gray-500 dark:text-gray-400"
        >
          <span>
            {formatarTexto(T.form.oQueEstaErradoAjuda, {
              n: LIMITES.mensagemMin,
              max: LIMITES.mensagemMax.toLocaleString('pt-BR'),
            })}
          </span>
          <span
            data-relato-contador=""
            className={`tabular-nums ${nMsg > LIMITES.mensagemMax ? COR_ERRO : ''}`}
          >
            {formatarTexto(T.form.contador, {
              n: nMsg.toLocaleString('pt-BR'),
              max: LIMITES.mensagemMax.toLocaleString('pt-BR'),
            })}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={ids.esperado}
          className="text-sm font-medium text-gray-800 dark:text-white/90"
        >
          {T.form.valorEsperado}{' '}
          <span className="text-[13px] font-normal text-gray-500 dark:text-gray-400">
            {T.form.opcional}
          </span>
        </label>
        <input
          id={ids.esperado}
          ref={refs.valorEsperado}
          value={valores.valorEsperado}
          maxLength={LIMITES.valorEsperado}
          disabled={ocupado}
          aria-invalid={!!erros.valorEsperado}
          aria-describedby={erros.valorEsperado ? ids.esperadoErro : undefined}
          onChange={(e) => mudar('valorEsperado', e.target.value)}
          className={`${CAMPO_BASE} ${erros.valorEsperado ? BORDA_ERRO : BORDA_OK} min-h-12 lg:min-h-11`}
        />
        {erros.valorEsperado ? (
          <p id={ids.esperadoErro} className={`flex items-start gap-1.5 text-[13px] ${COR_ERRO}`}>
            <IconeAlerta />
            {erros.valorEsperado}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.onde} className="text-sm font-medium text-gray-800 dark:text-white/90">
          {T.form.ondeViu}{' '}
          <span className="text-[13px] font-normal text-gray-500 dark:text-gray-400">
            {T.form.opcional}
          </span>
        </label>
        <input
          id={ids.onde}
          ref={refs.fonteEsperada}
          value={valores.fonteEsperada}
          maxLength={LIMITES.fonteEsperada}
          disabled={ocupado}
          aria-invalid={!!erros.fonteEsperada}
          aria-describedby={`${ids.ondeAjuda}${erros.fonteEsperada ? ` ${ids.ondeErro}` : ''}`}
          onChange={(e) => mudar('fonteEsperada', e.target.value)}
          className={`${CAMPO_BASE} ${erros.fonteEsperada ? BORDA_ERRO : BORDA_OK} min-h-12 lg:min-h-11`}
        />
        {erros.fonteEsperada ? (
          <p id={ids.ondeErro} className={`flex items-start gap-1.5 text-[13px] ${COR_ERRO}`}>
            <IconeAlerta />
            {erros.fonteEsperada}
          </p>
        ) : null}
        <p id={ids.ondeAjuda} className="text-[12.5px] text-gray-500 dark:text-gray-400">
          {T.form.ondeViuAjuda}
        </p>
      </div>

      <p className="text-[12.5px] text-gray-500 dark:text-gray-400">{T.form.privacidade}</p>
    </>
  );

  const corpo = (fecharEntao?: FecharEntao): ReactNode => {
    switch (estado.fase) {
      case 'enviado':
        return (
          <div
            role="status"
            aria-live="polite"
            data-relato-estado="enviado"
            className="flex flex-col items-start gap-2.5 py-1.5"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#396CAA]/10 text-[#396CAA] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]">
              <IconeOk />
            </span>
            <h3 className="text-[17px] font-semibold text-gray-900 dark:text-white/90">
              {T.sucesso.titulo}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong className="font-semibold tabular-nums" data-relato-protocolo="">
                {formatarTexto(T.sucesso.protocolo, { protocolo: estado.protocolo })}
              </strong>
              {'. '}
              {estado.slaAte
                ? formatarTexto(T.sucesso.prazo, { data: dataCivilBr(estado.slaAte) })
                : null}{' '}
              {T.sucesso.explicacao}
            </p>
            {linkNav(hrefMeus, T.sucesso.verMeus, fecharEntao)}
          </div>
        );
      case 'duplicado':
        return (
          <>
            <CaixaInfo papel="status">
              <strong className="font-semibold">{T.erros.duplicado}</strong>
            </CaixaInfo>
            {contextoDl}
          </>
        );
      case 'limite':
        return (
          <>
            <CaixaErro>{estado.texto}</CaixaErro>
            {contextoDl}
          </>
        );
      case 'indisponivel':
        return <CaixaErro>{T.erros.indisponivel}</CaixaErro>;
      default:
        return corpoEditando;
    }
  };

  const rotuloEnviar =
    estado.fase === 'enviando' ? (
      <>
        <Girando />
        {T.form.enviando}
      </>
    ) : estado.fase === 'rede' ? (
      T.erros.tentarDeNovo
    ) : (
      T.form.enviar
    );

  const rodape = (fecharEntao?: FecharEntao): ReactNode => {
    if (estado.fase === 'enviado' || estado.fase === 'limite' || estado.fase === 'indisponivel') {
      return (
        <button type="button" onClick={onFechar} className={celular ? BOTAO_SEC : BOTAO_PRI}>
          {T.form.fechar}
        </button>
      );
    }
    if (estado.fase === 'duplicado') {
      return (
        <>
          <button type="button" onClick={onFechar} className={BOTAO_SEC}>
            {T.form.fechar}
          </button>
          {linkNav(
            `${hrefMeus}?relato=${encodeURIComponent(estado.reporteId)}`,
            T.erros.verRelato,
            fecharEntao,
            true,
          )}
        </>
      );
    }
    return (
      <>
        <button type="button" onClick={onFechar} disabled={ocupado} className={BOTAO_SEC}>
          {T.form.cancelar}
        </button>
        <button
          type="button"
          onClick={() => void submeter()}
          disabled={ocupado}
          aria-busy={ocupado || undefined}
          data-relato-enviar=""
          className={BOTAO_PRI}
        >
          {rotuloEnviar}
        </button>
      </>
    );
  };

  if (celular) {
    return (
      <SheetReportarDado
        aberto={aberto}
        onFechar={onFechar}
        titulo={T.form.titulo}
        rodape={(f) => rodape(f)}
      >
        {(f) => (
          <form noValidate onSubmit={(e) => void submeter(e)} className="flex flex-col gap-4">
            <p className="-mt-1 text-[13px] text-gray-500 dark:text-gray-400">
              {ticker} · {rotuloBloco}
            </p>
            {corpo(f)}
          </form>
        )}
      </SheetReportarDado>
    );
  }

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      showCloseButton={false}
      ariaLabelledby={ids.titulo}
      className="m-4 flex max-h-[calc(100dvh-48px)] w-full max-w-[560px] flex-col"
    >
      <div className="flex max-h-[calc(100dvh-48px)] flex-col" data-relato-modal="">
        <div className="flex items-start justify-between gap-2.5 pt-[18px] pr-3 pb-1.5 pl-5">
          <div className="min-w-0">
            <h2 id={ids.titulo} className="text-lg font-semibold text-gray-900 dark:text-white/90">
              {T.form.titulo}
            </h2>
            <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
              {ticker} · {rotuloBloco}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label={T.form.fechar}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 ${FOCO}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <form
          noValidate
          onSubmit={(e) => void submeter(e)}
          className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-1.5 pb-4"
        >
          {corpo()}
        </form>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 pt-3 pb-[18px] dark:border-gray-800">
          {rodape()}
        </div>
      </div>
    </Modal>
  );
}
