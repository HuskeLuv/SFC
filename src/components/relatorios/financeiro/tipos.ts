/**
 * Props comuns das seções do Relatório financeiro.
 */
import type {
  BlocoCarteira,
  BlocoCarteiraAvancada,
  BlocoIr,
  BlocoPlanejamento,
  BlocoSaude,
  MesesRelatorio,
  RelatorioFinanceiro,
  SonhoRelatorio,
} from '@/types/relatorioFinanceiro';

/** Seção (casca): recebe o relatório inteiro e decide real x fictício por `temAcesso`. */
export interface PropsSecao {
  relatorio: RelatorioFinanceiro;
}

/** Corpo fictício: só o período (estrutura); nunca recebe dado real. */
export interface PropsFicticio {
  meses: MesesRelatorio;
}

export interface PropsCarteiraReal {
  relatorio: RelatorioFinanceiro;
  carteira: BlocoCarteira;
}
export interface PropsCarteiraAvancadaReal {
  relatorio: RelatorioFinanceiro;
  carteiraAvancada: BlocoCarteiraAvancada;
}
export interface PropsPlanejamentoReal {
  relatorio: RelatorioFinanceiro;
  planejamento: BlocoPlanejamento;
}
export interface PropsSonhosReal {
  relatorio: RelatorioFinanceiro;
  sonhos: SonhoRelatorio[];
}
export interface PropsSaudeReal {
  relatorio: RelatorioFinanceiro;
  saude: BlocoSaude;
}
export interface PropsIrConteudo {
  relatorio: RelatorioFinanceiro;
  ir: BlocoIr;
}
