'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCsrf } from '@/hooks/useCsrf';
import { logger } from '@/lib/logger';
import { useResponsiveConfirm } from '@/components/ui/sheet/useResponsiveConfirm';
import {
  assinarPush,
  cancelarAssinatura,
  isIosSemPwa,
  hashDoEndpoint,
  isPushSupported,
  permissaoAtual,
  PUSH_SUBSCRIPTIONS_URL,
} from '@/lib/pwa/pushClient';
// Só o TYPE do contrato (o módulo importa serviços com Prisma — nunca importar valor aqui).
import type { CategoriaPush } from '@/lib/push/contract';

/**
 * Perfil › Notificações (PWA fase 5, fatia C).
 *
 * Estados do protótipo (`docs/pwa/fase5-prototipo.html`): P1 nunca pediu, P2 ativas (master por
 * aparelho + lista de aparelhos com remoção à distância — decisão 3 do Wellington), P3 permissão
 * negada (instrução por plataforma) e C3 iOS/iPadOS sem o app instalado (passo a passo).
 * Preferências de categoria valem POR USUÁRIO; a assinatura de push é POR APARELHO.
 *
 * REGRA: `Notification.requestPermission()` só acontece dentro de `assinarPush`, chamado
 * exclusivamente pelo clique em "Ativar neste aparelho" / "Já liberei" — nunca na carga.
 */

const PREFERENCIAS_URL = '/api/push/preferencias';
const TESTE_URL = '/api/push/test';
const COOLDOWN_TESTE_MS = 30_000;

interface PreferenciasPush {
  habilitado: boolean;
  vapidPublicKey: string | null;
  categorias: Record<CategoriaPush, boolean>;
  comunidadeVisivel: boolean;
}

interface Aparelho {
  id: string;
  rotulo: string;
  criadoEm: string;
  /** SHA-256 base64 do endpoint — o servidor nunca manda o endpoint cru (URL-capacidade). */
  endpointHash: string;
}

type Estado = 'carregando' | 'instalar' | 'indisponivel' | 'negado' | 'ativas' | 'nunca';

const CATEGORIAS: { chave: CategoriaPush; titulo: string; descricao: string; beta?: boolean }[] = [
  {
    chave: 'orcamento',
    titulo: 'Orçamento',
    descricao: 'Uma categoria do fluxo passa do limite do mês',
  },
  { chave: 'agenda', titulo: 'Agenda', descricao: 'Lembretes de contas e eventos que você marcou' },
  {
    chave: 'comunidade',
    titulo: 'Comunidade',
    descricao: 'Curtidas e comentários nos seus posts',
    beta: true,
  },
  // Crítica 7: SÓ convites/atividade da conta — exportação de dados não cria Notification hoje.
  {
    chave: 'conta',
    titulo: 'Conta e consultor',
    descricao: 'Convites para um consultor acompanhar sua conta',
  },
];

/** Endpoint da assinatura de push DESTE navegador (null = sem assinatura local). */
async function endpointLocal(): Promise<string | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Interruptor 51×31 com bolinha de 27px (ligado = #0079F2, não textual — permitido). */
function Interruptor({ ligado, esmaecido }: { ligado: boolean; esmaecido?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full transition-colors motion-reduce:transition-none ${
        ligado ? 'bg-[#0079F2]' : 'bg-gray-300 dark:bg-[#3A3F4A]'
      } ${esmaecido ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow motion-safe:transition-transform ${
          ligado ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </span>
  );
}

function IconeSino({ className = '' }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Passos({ passos }: { passos: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {passos.map((passo, i) => (
        <li
          key={i}
          className="flex min-h-11 items-center gap-3 text-sm leading-snug text-gray-700 dark:text-gray-200"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mf-outside/10 text-[13px] font-semibold text-mf-patrimonio dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade">
            {i + 1}
          </span>
          <span>{passo}</span>
        </li>
      ))}
    </ol>
  );
}

/** Passo a passo de instalação no iOS (copy do InstallAppCard, específico de avisos). */
function PassosInstalarIos() {
  return (
    <Passos
      passos={[
        <React.Fragment key="1">
          Toque em <b className="font-semibold">Compartilhar</b> na barra do Safari
        </React.Fragment>,
        <React.Fragment key="2">
          Escolha <b className="font-semibold">Adicionar à Tela de Início</b> e confirme
        </React.Fragment>,
        <React.Fragment key="3">
          Abra pelo ícone <b className="font-semibold">My Finance</b> e ative os avisos aqui
        </React.Fragment>,
      ]}
    />
  );
}

export default function NotificacoesPreferencias() {
  const { csrfFetch } = useCsrf();
  const { confirm, confirmSheet } = useResponsiveConfirm();

  const [carregando, setCarregando] = useState(true);
  const [prefs, setPrefs] = useState<PreferenciasPush | null>(null);
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  /** Hash do endpoint local, para casar com a lista do servidor (que só traz hashes). */
  const [endpointHash, setEndpointHash] = useState<string | null>(null);
  const [permissao, setPermissao] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [suportado, setSuportado] = useState(false);
  const [iosSemPwa, setIosSemPwa] = useState(false);
  /** `assinarPush` devolveu 'erro': mostra a orientação de instalação (fallback da crítica 8). */
  const [modoInstrucao, setModoInstrucao] = useState(false);
  const [plataforma, setPlataforma] = useState<'ios' | 'android'>('ios');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoNegado, setAvisoNegado] = useState(false);
  const [cooldownTeste, setCooldownTeste] = useState(false);
  const timerTesteRef = useRef<number | null>(null);

  const carregarAparelhos = useCallback(async () => {
    try {
      const res = await fetch(PUSH_SUBSCRIPTIONS_URL, { credentials: 'include' });
      if (!res.ok) return;
      const d = (await res.json()) as { subscriptions?: Aparelho[] };
      setAparelhos(Array.isArray(d.subscriptions) ? d.subscriptions : []);
    } catch {
      // lista é acessório: sem ela o resto da seção continua de pé
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    setSuportado(isPushSupported());
    setIosSemPwa(isIosSemPwa());
    setPermissao(permissaoAtual());
    void endpointLocal().then((e) => {
      if (ativo) setEndpoint(e);
    });
    fetch(PREFERENCIAS_URL, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PreferenciasPush | null) => {
        if (ativo && d) setPrefs(d);
      })
      .catch(() => {})
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    void carregarAparelhos();
    return () => {
      ativo = false;
    };
  }, [carregarAparelhos]);

  useEffect(
    () => () => {
      if (timerTesteRef.current !== null) window.clearTimeout(timerTesteRef.current);
    },
    [],
  );

  useEffect(() => {
    let ativo = true;
    if (!endpoint) {
      setEndpointHash(null);
      return;
    }
    void hashDoEndpoint(endpoint).then((h) => {
      if (ativo) setEndpointHash(h);
    });
    return () => {
      ativo = false;
    };
  }, [endpoint]);

  const assinado = permissao === 'granted' && endpoint !== null;
  const estado: Estado = carregando
    ? 'carregando'
    : iosSemPwa || modoInstrucao
      ? 'instalar'
      : !suportado || !prefs || !prefs.habilitado
        ? 'indisponivel'
        : permissao === 'denied'
          ? 'negado'
          : assinado
            ? 'ativas'
            : 'nunca';

  /** Gesto do usuário → assinarPush (o requestPermission vive lá dentro). */
  const ativar = useCallback(async () => {
    if (ocupado) return;
    setErro(null);
    setAvisoNegado(false);
    const chave = prefs?.habilitado ? prefs.vapidPublicKey : null;
    if (!chave) {
      setErro('Os avisos não estão disponíveis agora. Tente de novo mais tarde.');
      return;
    }
    setOcupado(true);
    try {
      const resultado = await assinarPush(chave, csrfFetch);
      if (resultado === 'ok') {
        setPermissao('granted');
        setEndpoint(await endpointLocal());
        void carregarAparelhos();
      } else if (resultado === 'negado') {
        setPermissao('denied');
      } else {
        // Detecção furada (iPad como Mac, navegador sem push): mesma orientação de instalar.
        setModoInstrucao(true);
      }
    } finally {
      setOcupado(false);
    }
  }, [carregarAparelhos, csrfFetch, ocupado, prefs]);

  /** P3: relê a permissão; se a pessoa liberou, assina na hora — nunca reexibe o diálogo negado. */
  const verificarDeNovo = useCallback(async () => {
    const atual = permissaoAtual();
    setPermissao(atual);
    if (atual === 'granted' || atual === 'default') {
      await ativar();
    } else {
      setAvisoNegado(true);
    }
  }, [ativar]);

  const desligar = useCallback(async () => {
    if (ocupado) return;
    const ok = await confirm({
      desktopMessage:
        'Desligar os avisos neste aparelho? Você continua vendo tudo no sino, dentro do app.',
      title: 'Desligar os avisos neste aparelho?',
      message: 'Você continua vendo tudo no sino, dentro do app. Os outros aparelhos não mudam.',
      confirmLabel: 'Desligar',
    });
    if (!ok) return;
    setOcupado(true);
    setErro(null);
    try {
      const hashAntigo = endpointHash;
      await cancelarAssinatura(csrfFetch);
      setEndpoint(null);
      if (hashAntigo) setAparelhos((prev) => prev.filter((a) => a.endpointHash !== hashAntigo));
    } finally {
      setOcupado(false);
    }
  }, [confirm, csrfFetch, endpointHash, ocupado]);

  const removerAparelho = useCallback(
    async (aparelho: Aparelho) => {
      const ok = await confirm({
        desktopMessage: `Remover os avisos de "${aparelho.rotulo}"? Aquele aparelho para de receber avisos.`,
        title: 'Remover este aparelho?',
        message: `"${aparelho.rotulo}" para de receber avisos até alguém ativar de novo por lá.`,
        confirmLabel: 'Remover',
        danger: true,
      });
      if (!ok) return;
      setErro(null);
      try {
        const res = await csrfFetch(`${PUSH_SUBSCRIPTIONS_URL}/${aparelho.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Não consegui remover o aparelho.');
        setAparelhos((prev) => prev.filter((a) => a.id !== aparelho.id));
      } catch (error: unknown) {
        setErro(error instanceof Error ? error.message : 'Não consegui remover o aparelho.');
        logger.error('Erro ao remover aparelho de push:', error);
      }
    },
    [confirm, csrfFetch],
  );

  const alternarCategoria = useCallback(
    (chave: CategoriaPush) => {
      if (estado !== 'ativas' || !prefs) return;
      const anterior = prefs.categorias[chave];
      // Otimista: o interruptor responde na hora; rollback se o PATCH falhar.
      setPrefs({ ...prefs, categorias: { ...prefs.categorias, [chave]: !anterior } });
      setErro(null);
      csrfFetch(PREFERENCIAS_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [chave]: !anterior }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Não consegui salvar a preferência.');
        })
        .catch((error: unknown) => {
          setPrefs((atual) =>
            atual ? { ...atual, categorias: { ...atual.categorias, [chave]: anterior } } : atual,
          );
          setErro(error instanceof Error ? error.message : 'Não consegui salvar a preferência.');
          logger.error('Erro ao salvar categoria de push:', error);
        });
    },
    [csrfFetch, estado, prefs],
  );

  const enviarTeste = useCallback(async () => {
    if (cooldownTeste || ocupado) return;
    setErro(null);
    if (!endpoint) {
      setErro('Não encontrei a assinatura deste aparelho.');
      return;
    }
    try {
      // A rota exige o endpoint da assinatura DESTE aparelho no body
      // (contrato da fatia A — o teste só sai para o aparelho chamador).
      const res = await csrfFetch(TESTE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      if (!res.ok) throw new Error('Não consegui enviar a notificação de teste.');
      setCooldownTeste(true);
      timerTesteRef.current = window.setTimeout(() => setCooldownTeste(false), COOLDOWN_TESTE_MS);
    } catch (error: unknown) {
      setErro(
        error instanceof Error ? error.message : 'Não consegui enviar a notificação de teste.',
      );
    }
  }, [cooldownTeste, csrfFetch, endpoint, ocupado]);

  const aparelhoLocal =
    (endpointHash && aparelhos.find((a) => a.endpointHash === endpointHash)) || null;
  const categoriasVisiveis = CATEGORIAS.filter(
    (c) => c.chave !== 'comunidade' || prefs?.comunidadeVisivel,
  );
  const categoriasAtivas = estado === 'ativas';

  const btnPrimario =
    'flex min-h-12 w-full items-center justify-center rounded-xl bg-mf-patrimonio px-4 text-sm font-semibold text-white active:bg-mf-seguranca disabled:opacity-60';
  const btnNeutro =
    'flex min-h-12 w-full items-center justify-center rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200';

  return (
    // Abaixo de lg este cartão aparece dentro do sheet "Notificações" do Perfil: sem moldura e sem
    // o título (o sheet já tem) — mesmo molde do AgendaPreferencias.
    <div
      data-notif=""
      data-notif-estado={estado}
      className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0 dark:max-lg:bg-transparent"
    >
      <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90 max-lg:hidden">
        Notificações
      </h3>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Os avisos do sino também podem chegar no aparelho — celular ou computador — mesmo com o app
        fechado.
      </p>

      {erro ? (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-600 dark:bg-error-500/10"
        >
          {erro}
        </p>
      ) : null}

      {estado === 'carregando' ? (
        <div className="animate-pulse space-y-3" aria-hidden="true">
          <div className="h-20 rounded-2xl bg-gray-100 dark:bg-white/5" />
          <div className="h-40 rounded-2xl bg-gray-100 dark:bg-white/5" />
        </div>
      ) : null}

      {estado === 'instalar' ? (
        <section
          data-notif-master="instalar"
          className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D97706]/10 px-2.5 py-1 text-xs font-semibold text-[#B45309] dark:bg-[#FBBF24]/10 dark:text-[#FBBF24]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#D97706] dark:bg-[#FBBF24]"
                aria-hidden="true"
              />
              Falta instalar
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              No iPhone e iPad, avisos só chegam com o app na Tela de Início (iOS 16.4+).
            </span>
          </div>
          <PassosInstalarIos />
        </section>
      ) : null}

      {estado === 'indisponivel' ? (
        <section
          data-notif-master="indisponivel"
          className="rounded-2xl border border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400"
        >
          Os avisos no aparelho não estão disponíveis neste navegador no momento. Tudo continua
          chegando no sino, dentro do app.
        </section>
      ) : null}

      {estado === 'negado' ? (
        <section
          data-notif-master="negado"
          className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D92D20]/10 px-2.5 py-1 text-xs font-semibold text-[#D92D20] dark:bg-[#F97066]/10 dark:text-[#F97066]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#D92D20] dark:bg-[#F97066]"
                aria-hidden="true"
              />
              Sem permissão
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              O navegador está bloqueando os avisos deste site.
            </span>
          </div>
          <div
            role="group"
            aria-label="Onde reverter"
            className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/5"
          >
            {(
              [
                ['ios', 'iPhone (app instalado)'],
                ['android', 'Android · Chrome'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={plataforma === valor}
                onClick={() => setPlataforma(valor)}
                className={`min-h-11 rounded-lg px-2 text-[13px] font-medium ${
                  plataforma === valor
                    ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-white/90'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {plataforma === 'android' ? (
            <Passos
              passos={[
                <React.Fragment key="1">
                  Toque no <b className="font-semibold">cadeado</b> ao lado do endereço
                  appmyfinance.com.br
                </React.Fragment>,
                <React.Fragment key="2">
                  Abra <b className="font-semibold">Permissões</b> e ligue{' '}
                  <b className="font-semibold">Notificações</b>
                </React.Fragment>,
                <React.Fragment key="3">Volte aqui e toque em “Já liberei”</React.Fragment>,
              ]}
            />
          ) : (
            <Passos
              passos={[
                <React.Fragment key="1">
                  Abra <b className="font-semibold">Ajustes</b> do iPhone e procure{' '}
                  <b className="font-semibold">Notificações</b>
                </React.Fragment>,
                <React.Fragment key="2">
                  Escolha <b className="font-semibold">My Finance</b> e ligue{' '}
                  <b className="font-semibold">Permitir Notificações</b>
                </React.Fragment>,
                <React.Fragment key="3">Volte aqui e toque em “Já liberei”</React.Fragment>,
              ]}
            />
          )}
          {avisoNegado ? (
            <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
              O navegador ainda está sem permissão. Confira os passos acima e tente de novo.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void verificarDeNovo()}
            disabled={ocupado}
            className={btnNeutro}
          >
            Já liberei — verificar de novo
          </button>
        </section>
      ) : null}

      {estado === 'nunca' ? (
        <section
          data-notif-master="nunca"
          className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mf-outside/10 text-mf-patrimonio dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade">
              <IconeSino />
            </span>
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
              Os avisos que hoje chegam no sino podem chegar <b>neste aparelho</b>, mesmo com o app
              fechado. Sem valores em R$ na tela bloqueada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void ativar()}
            disabled={ocupado}
            className={btnPrimario}
          >
            {ocupado ? 'Ativando…' : 'Ativar neste aparelho'}
          </button>
        </section>
      ) : null}

      {estado === 'ativas' ? (
        <section
          data-notif-master="ativas"
          className="rounded-2xl border border-gray-200 px-1 py-1 dark:border-gray-800"
        >
          <button
            type="button"
            role="switch"
            aria-checked="true"
            onClick={() => void desligar()}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left active:bg-gray-50 dark:active:bg-white/5"
          >
            <span className="text-gray-500 dark:text-gray-400">
              <IconeSino />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
                Avisos neste aparelho
              </b>
              <small className="text-xs text-gray-500 dark:text-gray-400">
                {aparelhoLocal
                  ? `${aparelhoLocal.rotulo} · desde ${dataCurta(aparelhoLocal.criadoEm)}`
                  : 'Ativados neste aparelho'}
              </small>
            </span>
            <Interruptor ligado />
          </button>
        </section>
      ) : null}

      {estado === 'ativas' && aparelhos.length > 0 ? (
        <>
          <h4 className="mt-5 mb-2 px-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Seus aparelhos
          </h4>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {aparelhos.map((aparelho) => {
              const esteAparelho = endpointHash !== null && aparelho.endpointHash === endpointHash;
              return (
                <li
                  key={aparelho.id}
                  data-notif-aparelho={esteAparelho ? 'local' : 'remoto'}
                  className="flex min-h-14 items-center gap-3 px-3 py-1.5"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <b className="truncate text-[15px] font-medium text-gray-800 dark:text-white/90">
                        {aparelho.rotulo}
                      </b>
                      {esteAparelho ? (
                        <span className="shrink-0 rounded-full bg-mf-outside/10 px-2 py-0.5 text-[11px] font-semibold text-mf-patrimonio dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade">
                          Este aparelho
                        </span>
                      ) : null}
                    </span>
                    <small className="text-xs text-gray-500 dark:text-gray-400">
                      desde {dataCurta(aparelho.criadoEm)}
                    </small>
                  </span>
                  {!esteAparelho ? (
                    <button
                      type="button"
                      onClick={() => void removerAparelho(aparelho)}
                      aria-label={`Remover os avisos de ${aparelho.rotulo}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 active:bg-gray-100 dark:text-gray-500 dark:active:bg-white/5"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {estado !== 'carregando' ? (
        <>
          <h4 className="mt-5 mb-2 px-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            O que chega
          </h4>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {categoriasVisiveis.map((categoria) => {
              const ligada = categoriasAtivas && (prefs?.categorias[categoria.chave] ?? true);
              return (
                <li key={categoria.chave}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={ligada}
                    data-notif-cat={categoria.chave}
                    {...(categoriasAtivas
                      ? { onClick: () => alternarCategoria(categoria.chave) }
                      : { 'aria-disabled': true as const })}
                    className={`flex min-h-14 w-full items-center gap-3 px-3 py-1.5 text-left ${
                      categoriasAtivas
                        ? 'active:bg-gray-50 dark:active:bg-white/5'
                        : 'cursor-default'
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2">
                        <b
                          className={`text-[15px] font-medium ${
                            categoriasAtivas
                              ? 'text-gray-800 dark:text-white/90'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {categoria.titulo}
                        </b>
                        {categoria.beta ? (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-400">
                            Beta
                          </span>
                        ) : null}
                      </span>
                      <small
                        className={`text-xs ${
                          categoriasAtivas
                            ? 'text-gray-500 dark:text-gray-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        {categoria.descricao}
                      </small>
                    </span>
                    <Interruptor ligado={ligada} esmaecido={!categoriasAtivas} />
                  </button>
                </li>
              );
            })}
          </ul>
          {!categoriasAtivas ? (
            <p className="mt-2 px-1 text-xs text-gray-500 dark:text-gray-400">
              Ative os avisos neste aparelho para escolher as categorias.
            </p>
          ) : null}

          {categoriasAtivas ? (
            <button
              type="button"
              data-notif-teste=""
              onClick={() => void enviarTeste()}
              disabled={cooldownTeste}
              className={`mt-4 ${btnNeutro}`}
            >
              {cooldownTeste
                ? 'Enviada — aguarde 30 s para reenviar'
                : 'Enviar notificação de teste'}
            </button>
          ) : null}

          <p className="mt-4 px-1 text-xs text-gray-500 dark:text-gray-400">
            As categorias valem para todos os seus aparelhos. Os avisos nunca mostram valores em R$
            — só o que aconteceu e onde ver.
            {prefs?.comunidadeVisivel
              ? ' A Comunidade só avisa enquanto a área estiver disponível.'
              : ''}
          </p>
        </>
      ) : null}
      {confirmSheet}
    </div>
  );
}
