/**
 * Apuração dos dados FICTÍCIOS do IR mensal (cadeado do Basic/Pro e fixture de exemplo), com as
 * mesmas regras que a nota da tabela cita: isenção de R$ 20 mil em vendas de ações, 15% em ações,
 * 20% em FIIs, prejuízo de meses anteriores compensado na mesma categoria e DARF abaixo de R$ 10
 * somado ao mês seguinte. Só para manter a demonstração coerente; o real vem do servidor.
 */

export interface EntradaIrFicticia {
  /** Vendas de ações no mês. */
  va: number;
  /** Lucro (negativo = prejuízo) de ações. */
  la: number;
  /** Lucro (negativo = prejuízo) de FIIs. */
  lf: number;
}

export interface MesIrFicticio extends EntradaIrFicticia {
  isento: boolean;
  compAcoes: number;
  irAcoes: number;
  compFii: number;
  irFii: number;
  irMes: number;
  acumuladoAnterior: number;
  darf: { status: 'pagar' | 'acumula' | 'sem'; valor: number };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Corre os meses em ordem (do mais antigo ao mais novo) carregando prejuízo e acumulado. */
export function apurarIrFicticio(entradas: EntradaIrFicticia[]): MesIrFicticio[] {
  let prejAcoes = 0;
  let prejFii = 0;
  let acumulado = 0;
  return entradas.map(({ va, la, lf }) => {
    const isento = va <= 20000;
    let compAcoes = 0;
    let irAcoes = 0;
    if (la < 0) prejAcoes += -la;
    else if (!isento && la > 0) {
      compAcoes = Math.min(prejAcoes, la);
      prejAcoes -= compAcoes;
      irAcoes = r2((la - compAcoes) * 0.15);
    }
    let compFii = 0;
    let irFii = 0;
    if (lf < 0) prejFii += -lf;
    else if (lf > 0) {
      compFii = Math.min(prejFii, lf);
      prejFii -= compFii;
      irFii = r2((lf - compFii) * 0.2);
    }
    const irMes = r2(irAcoes + irFii);
    const acumuladoAnterior = acumulado;
    const t = r2(irMes + acumulado);
    let darf: MesIrFicticio['darf'];
    if (t >= 10) {
      darf = { status: 'pagar', valor: t };
      acumulado = 0;
    } else if (t > 0) {
      darf = { status: 'acumula', valor: t };
      acumulado = t;
    } else darf = { status: 'sem', valor: 0 };
    return {
      va,
      la,
      lf,
      isento,
      compAcoes,
      irAcoes,
      compFii,
      irFii,
      irMes,
      acumuladoAnterior,
      darf,
    };
  });
}
