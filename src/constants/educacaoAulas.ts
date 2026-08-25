/**
 * Aulas da trilha "Educação Financeira do Zero" (Escolhi Ser Rico) com os
 * vídeos hospedados na VTurb. Fonte única pro script de sincronização
 * (`scripts/educacao/sync-aulas-trilha.ts`): a chave é o índice do módulo em
 * MODULOS_TRILHA_ESR e a posição na lista é o orderIndex da aula.
 *
 * Só o ID do vídeo é guardado aqui — o snippet de embed (exatamente o que o
 * painel VTurb gera em Meus Vídeos → Embed → JS) é montado por
 * `buildVturbEmbed`, então uma mudança de formato do player se corrige num
 * lugar só. IDs enviados pelo Wellington em 25/08/2026.
 */

/** Conta da VTurb (ConverteAI) do Escolhi Ser Rico — parte da URL do player.js. */
export const VTURB_ACCOUNT_ID = '090f0000-d6a9-4d38-adea-d7b9c5325905';

export interface AulaTrilhaSeed {
  title: string;
  /** ID do vídeo na VTurb (o sufixo de `vid-…` no snippet). */
  vturbId: string;
}

export const buildVturbEmbed = (vturbId: string): string =>
  `<vturb-smartplayer id="vid-${vturbId}" style="display: block; margin: 0 auto; width: 100%; "><div class="vturb-player-placeholder" style="position: relative; width: 100%; padding: 56.25% 0 0; z-index: 0; background-color: black;"></div></vturb-smartplayer> <script type="text/javascript"> var s=document.createElement("script"); s.src="https://scripts.converteai.net/${VTURB_ACCOUNT_ID}/players/${vturbId}/v4/player.js", s.async=!0,document.head.appendChild(s); </script>`;

/**
 * Aulas por índice de módulo. Módulo 2 ("Como Preencher a Planilha") veio só
 * com os embeds, sem título — entram como "Aula N" até o Pedro nomear
 * (renomear aqui e rodar o sync de novo; o vídeo/progresso é preservado).
 */
export const AULAS_TRILHA_ESR: Record<number, AulaTrilhaSeed[]> = {
  // Módulo 1 — Boas-vindas
  0: [
    { title: 'Boas-vindas', vturbId: '6945590a8fd5231b631c2d31' },
    { title: 'Liberdade é uma escolha', vturbId: '694560118fd5231b631c36ab' },
  ],
  // Módulo 2 — Como Preencher a Planilha
  1: [
    { title: 'Aula 1', vturbId: '6945624c2088af70b0d4bf42' },
    { title: 'Aula 2', vturbId: '6945641b25bdf7820c0265fd' },
    { title: 'Aula 3', vturbId: '694564f68fd5231b631c3e2e' },
    { title: 'Aula 4', vturbId: '694589e576990ab694f56d7c' },
    { title: 'Aula 5', vturbId: '69458aa90ad384f51084ea28' },
    { title: 'Aula 6', vturbId: '69458ae19a07b812705c69c5' },
    { title: 'Aula 7', vturbId: '69458afd76990ab694f56f06' },
    { title: 'Aula 8', vturbId: '6945a9ea39b76fcf0295f7ea' },
    { title: 'Aula 9', vturbId: '6945aa78c7e5a9f80e2eea42' },
    { title: 'Aula 10', vturbId: '6945aaf439b76fcf0295f94e' },
    { title: 'Aula 11', vturbId: '6945ab8a0ad384f510851441' },
    { title: 'Aula 12', vturbId: '6945ac4025bdf7820c02c44a' },
    { title: 'Aula 13', vturbId: '6945adee39b76fcf0295fd1b' },
  ],
};
