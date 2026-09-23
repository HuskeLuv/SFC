/** Contratos da API da Comunidade (23/09/2026), compartilhados por rotas e hooks. */

export type SeloComunidade = 'equipe' | 'consultor';

export interface AutorComunidade {
  id: string;
  nome: string;
  avatarUrl: string | null;
  selos: SeloComunidade[];
}

export interface PostComunidade {
  id: string;
  categoria: string;
  conteudo: string;
  createdAt: string;
  editadoEm: string | null;
  fixado: boolean;
  /** Só aparece true para moderadores (os demais nem recebem o post). */
  oculto: boolean;
  ocultoMotivo: string | null;
  autor: AutorComunidade;
  curtidas: number;
  comentarios: number;
  curtiu: boolean;
  /** O post é de quem está vendo (pode editar/excluir). */
  meu: boolean;
}

export interface ComentarioComunidade {
  id: string;
  postId: string;
  conteudo: string;
  createdAt: string;
  editadoEm: string | null;
  oculto: boolean;
  ocultoMotivo: string | null;
  autor: AutorComunidade;
  meu: boolean;
}

export interface FeedComunidadeResponse {
  fixados: PostComunidade[];
  posts: PostComunidade[];
  nextCursor: string | null;
}

export interface PostDetalheResponse {
  post: PostComunidade;
  comentarios: ComentarioComunidade[];
}

export interface PerfilComunidade {
  bio: string | null;
  cargo: 'membro' | 'equipe';
  termoVersao: string;
  termoAceitoEm: string;
  suspensoAte: string | null;
  suspensoMotivo: string | null;
}

export interface MeComunidadeResponse {
  /** Dentro da trava de acesso (accessLevel). */
  acesso: boolean;
  /** Termo aceito na versão vigente. */
  membro: boolean;
  termoVersao: string;
  usuario: { id: string; nome: string; avatarUrl: string | null; selos: SeloComunidade[] };
  perfil: PerfilComunidade | null;
  suspenso: boolean;
  moderador: boolean;
  admin: boolean;
}

export interface DenunciaComunidade {
  id: string;
  motivo: string;
  detalhe: string | null;
  createdAt: string;
  denunciante: { id: string; nome: string };
  alvo:
    | { tipo: 'post'; post: PostComunidade }
    | { tipo: 'comentario'; comentario: ComentarioComunidade };
  /** Outras denúncias abertas sobre o mesmo conteúdo. */
  totalNoAlvo: number;
}

export interface MembroEquipe {
  userId: string;
  nome: string;
  email: string;
  cargo: 'membro' | 'equipe';
}
