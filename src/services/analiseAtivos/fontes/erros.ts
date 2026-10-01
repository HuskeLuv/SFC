/**
 * Erros das fontes externas (CVM/B3). `ErroLayoutFonte` = o arquivo mudou de layout (já aconteceu em
 * 2021 e em ago/2025): o job falha ALTO com alerta de nível erro em vez de gravar vazio.
 */

export type CodigoErroFonte =
  | 'url_invalida'
  | 'https_obrigatorio'
  | 'host_nao_permitido'
  | 'redirect_excessivo'
  | 'redirect_sem_location'
  | 'http_erro'
  | 'rede'
  | 'timeout'
  | 'tamanho_excedido'
  | 'zip_truncado'
  | 'zip_invalido'
  | 'zip64_nao_suportado'
  | 'zip_metodo_nao_suportado'
  | 'zip_criptografado'
  | 'zip_corrompido'
  | 'linha_muito_longa'
  | 'layout_mudou';

export class ErroFonte extends Error {
  constructor(
    public readonly codigo: CodigoErroFonte,
    message?: string,
    /** status HTTP quando codigo = 'http_erro' (ex.: 404 do COTAHIST do dia ainda não publicado) */
    public readonly httpStatus?: number,
  ) {
    super(message ?? codigo);
    this.name = 'ErroFonte';
  }
}

export class ErroLayoutFonte extends ErroFonte {
  constructor(
    public readonly arquivo: string,
    public readonly faltando: string[],
  ) {
    super('layout_mudou', `Layout de ${arquivo} mudou: faltando ${faltando.join(', ')}`);
    this.name = 'ErroLayoutFonte';
  }
}
