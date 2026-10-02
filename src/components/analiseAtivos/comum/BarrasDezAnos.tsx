/**
 * Mini-gráficos de 10 anos (fatia 0b):
 * - 'lucro': 10 barras de 7×26 com linha do zero. Lucro/rendimento para cima em patrimonio
 *   (tranquilidade no escuro); prejuízo para baixo em vermelho; ano sem dado = contorno tracejado
 *   rente ao zero; ano em conferência (suspeito) = barra tracejada de fundo claro. `title` por ano.
 *   Série com menos de 10 anos fechados é completada à esquerda com anos sem dado.
 * - 'seguidos': 10 traços de 3,5×12, cheios até n (n > 10 enche os 10), com "n anos" ao lado.
 * Sempre role="img" com aria-label (o do consumidor ou o resumo padrão).
 */
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { BarrasDezAnosProps, PontoSerieAnual } from '@/types/analiseAtivosApi';

export type { BarrasDezAnosProps };

const T = TEXTOS_TELA.comum.barras;
const N_BARRAS = 10;
const LARGURA = 7;
const VAO = 2;
const ALTURA = 26;

/** Valor de um ano no title: R$ compacto para valores absolutos, R$ com 2 casas por ação/cota. */
function valorAno(v: number): string {
  return formatarAnalise(v, Math.abs(v) >= 1000 ? 'moedaCompacta' : 'moeda');
}

/** Últimos 10 anos, completando à esquerda com anos sem dado. */
export function dezAnos(serie: PontoSerieAnual[]): PontoSerieAnual[] {
  const ordenada = [...serie].sort((a, b) => a.ano - b.ano).slice(-N_BARRAS);
  if (ordenada.length === 0) return [];
  const primeiro = ordenada[0].ano;
  const faltam = N_BARRAS - ordenada.length;
  const antes: PontoSerieAnual[] = Array.from({ length: faltam }, (_, i) => ({
    ano: primeiro - faltam + i,
    valor: null,
  }));
  return [...antes, ...ordenada];
}

export function tituloAno(p: PontoSerieAnual): string {
  if (p.valor === null) return formatarTexto(T.anoSemDado, { ano: p.ano });
  if (p.suspeito)
    return formatarTexto(T.anoEmConferencia, { ano: p.ano, valor: valorAno(p.valor) });
  if (p.valor < 0) {
    return formatarTexto(T.anoPrejuizo, { ano: p.ano, valor: valorAno(Math.abs(p.valor)) });
  }
  return formatarTexto(T.anoValor, { ano: p.ano, valor: valorAno(p.valor) });
}

/** Resumo padrão: 'Lucro em 8 de 9 anos com dado, prejuízo em 1, sem dado em 1'. */
export function resumoBarras(pontos: PontoSerieAnual[], tipo: 'lucro' | 'rendimento'): string {
  if (pontos.length === 0) return T.semSerie;
  const comDado = pontos.filter((p) => p.valor !== null);
  const positivos = comDado.filter((p) => (p.valor ?? 0) > 0).length;
  const prejuizo = comDado.filter((p) => (p.valor ?? 0) < 0).length;
  const semDado = pontos.length - comDado.length;
  const conferencia = comDado.filter((p) => p.suspeito).length;
  const partes = [
    formatarTexto(tipo === 'lucro' ? T.resumoLucro : T.resumoRendimento, {
      n: positivos,
      total: comDado.length,
    }),
  ];
  if (prejuizo) partes.push(formatarTexto(T.prejuizoEm, { n: prejuizo }));
  if (semDado) partes.push(formatarTexto(T.semDadoEm, { n: semDado }));
  if (conferencia) partes.push(formatarTexto(T.emConferenciaEm, { n: conferencia }));
  return partes.join(', ');
}

function BarrasLucro({
  serie,
  ariaLabel,
  className,
}: {
  serie: PontoSerieAnual[];
  ariaLabel?: string;
  className?: string;
}) {
  const pontos = dezAnos(serie);
  const reais = pontos.filter((p) => p.valor !== null).map((p) => p.valor as number);
  const maximo = Math.max(...reais.map(Math.abs), 0.0001);
  const temNegativo = reais.some((v) => v < 0);
  const zero = temNegativo ? ALTURA / 2 : ALTURA - 0.5;
  const alturaUtil = temNegativo ? ALTURA / 2 - 1 : ALTURA - 1.5;
  const largura = N_BARRAS * (LARGURA + VAO) - VAO;
  const rotulo = ariaLabel ?? resumoBarras(pontos, 'lucro');

  return (
    <span
      role="img"
      aria-label={rotulo}
      data-modo="lucro"
      className={`inline-flex items-center ${className ?? ''}`}
    >
      <svg
        width={largura}
        height={ALTURA}
        viewBox={`0 0 ${largura} ${ALTURA}`}
        aria-hidden="true"
        className="shrink-0 overflow-visible"
      >
        {pontos.map((p, i) => {
          const x = i * (LARGURA + VAO);
          const titulo = <title>{tituloAno(p)}</title>;
          if (p.valor === null) {
            return (
              <rect
                key={p.ano}
                data-barra="sem_dado"
                x={x + 0.5}
                y={zero - 5.5}
                width={LARGURA - 1}
                height={5}
                rx={1.5}
                fill="none"
                strokeWidth={1}
                strokeDasharray="2 2"
                className="stroke-gray-400 dark:stroke-gray-500"
              >
                {titulo}
              </rect>
            );
          }
          const h = Math.max(2, (Math.abs(p.valor) / maximo) * alturaUtil);
          const y = p.valor >= 0 ? zero - h : zero;
          if (p.suspeito) {
            return (
              <rect
                key={p.ano}
                data-barra="em_conferencia"
                x={x + 0.6}
                y={y + (p.valor >= 0 ? 0.6 : 0)}
                width={LARGURA - 1.2}
                height={Math.max(1.4, h - 0.6)}
                rx={1.5}
                strokeWidth={1.2}
                strokeDasharray="3 2"
                className="fill-gray-100 stroke-gray-500 dark:fill-white/5 dark:stroke-gray-400"
              >
                {titulo}
              </rect>
            );
          }
          return (
            <rect
              key={p.ano}
              data-barra={p.valor >= 0 ? 'positivo' : 'negativo'}
              x={x}
              y={y}
              width={LARGURA}
              height={h}
              rx={1.5}
              className={
                p.valor >= 0
                  ? 'fill-[#396CAA] dark:fill-[#6E9DC4]'
                  : 'fill-[#D92D20] dark:fill-[#F97066]'
              }
            >
              {titulo}
            </rect>
          );
        })}
        <line
          data-zero=""
          x1={-1}
          x2={largura + 1}
          y1={zero}
          y2={zero}
          strokeWidth={1}
          className="stroke-gray-400 dark:stroke-gray-500"
        />
      </svg>
    </span>
  );
}

function rotuloSeguidos(n: number | null): string {
  if (n === null) return TEXTOS_TELA.formato.semDado;
  if (n === 0) return T.nenhum;
  if (n === 1) return T.umAno;
  return formatarTexto(TEXTOS_TELA.quadro.anos, { n });
}

function ariaSeguidos(n: number | null): string {
  if (n === null) return T.seguidosSemDadoAria;
  if (n === 0) return T.seguidosNenhumAria;
  if (n === 1) return T.seguidosUmAria;
  return formatarTexto(T.seguidosAria, { n });
}

function TracosSeguidos({
  quantidade,
  maximo = N_BARRAS,
  ariaLabel,
  className,
}: {
  quantidade: number | null;
  maximo?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const total = Math.max(1, Math.round(maximo));
  const cheios = quantidade === null ? 0 : Math.max(0, Math.min(quantidade, total));
  const largura = total * 5 - 1.5;
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? ariaSeguidos(quantidade)}
      data-modo="seguidos"
      className={`inline-flex items-center gap-2 ${className ?? ''}`}
    >
      <svg
        width={largura}
        height={16}
        viewBox={`0 0 ${largura} 16`}
        aria-hidden="true"
        className="shrink-0"
      >
        {Array.from({ length: total }, (_, i) => (
          <rect
            key={i}
            data-traco={i < cheios ? 'cheio' : 'vazio'}
            x={i * 5}
            y={2}
            width={3.5}
            height={12}
            rx={1}
            className={
              i < cheios
                ? 'fill-[#396CAA] dark:fill-[#6E9DC4]'
                : 'fill-[#DCE6F2] dark:fill-[#6E9DC4]/25'
            }
          />
        ))}
      </svg>
      <span
        aria-hidden="true"
        className="min-w-[52px] text-[12.5px] whitespace-nowrap text-gray-700 tabular-nums dark:text-gray-300"
      >
        {rotuloSeguidos(quantidade)}
      </span>
    </span>
  );
}

export default function BarrasDezAnos(props: BarrasDezAnosProps) {
  if (props.modo === 'lucro') {
    return (
      <BarrasLucro serie={props.serie} ariaLabel={props.ariaLabel} className={props.className} />
    );
  }
  return (
    <TracosSeguidos
      quantidade={props.quantidade}
      maximo={props.maximo}
      ariaLabel={props.ariaLabel}
      className={props.className}
    />
  );
}
