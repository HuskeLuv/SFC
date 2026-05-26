// Tipos para a aba Fundos (FIM/FIA/FIP/FIP-Infra/FIDC/Fiagro)
// Nome do arquivo é histórico — quando a aba era só FIM/FIA — mantido pra
// evitar diff em ~20 importadores.

import { BaseFundAtivo, BaseSecao, BaseFundSecaoTotals, BaseResumo } from './base';

export type TipoFimFia = 'fim' | 'fia' | 'fip' | 'fip-infra' | 'fidc' | 'fiagro';

export interface FimFiaAtivo extends BaseFundAtivo {
  cotizacaoResgate: string; // Ex: "D+0", "D+8", "D+30"
  liquidacaoResgate: string; // Ex: "D+1", "D+2", "D+10"
  categoriaNivel1: string; // Ex: "Ativos", "Alocação", "Estratégia", "Específicos", "Investimentos no Exterior"
  subcategoriaNivel2: string; // Ex: "Macro", "Dividendos", "Small Caps"
  objetivo: number; // Percentual desejado definido pelo usuário
  quantoFalta: number; // Calculado = objetivo% - percentual atual
  necessidadeAporte: number; // Calculado = diferença para atingir o objetivo
  tipo: TipoFimFia;
  isAutoUpdated?: boolean; // true quando precificado pela cota CVM (Asset.currentPrice)
}

export interface FimFiaSecao extends BaseSecao<FimFiaAtivo>, BaseFundSecaoTotals {
  tipo: TipoFimFia;
}

export interface FimFiaResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export interface FimFiaData {
  resumo: FimFiaResumo;
  secoes: FimFiaSecao[];
  totalGeral: {
    valorAplicado: number;
    aporte: number;
    resgate: number;
    valorAtualizado: number;
    percentualCarteira: number;
    risco: number;
    objetivo: number;
    quantoFalta: number;
    necessidadeAporte: number;
    rentabilidade: number;
  };
}
