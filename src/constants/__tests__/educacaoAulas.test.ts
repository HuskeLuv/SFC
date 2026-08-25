import { describe, expect, it } from 'vitest';
import { AULAS_TRILHA_ESR, buildVturbEmbed } from '../educacaoAulas';
import { MODULOS_TRILHA_ESR } from '../educacaoModulos';

// Snippet copiado literalmente do painel VTurb (Wellington, 25/08/2026) — o
// builder precisa reproduzi-lo byte a byte pra não divergir do que o player espera.
const SNIPPET_PAINEL =
  '<vturb-smartplayer id="vid-6945590a8fd5231b631c2d31" style="display: block; margin: 0 auto; width: 100%; "><div class="vturb-player-placeholder" style="position: relative; width: 100%; padding: 56.25% 0 0; z-index: 0; background-color: black;"></div></vturb-smartplayer> <script type="text/javascript"> var s=document.createElement("script"); s.src="https://scripts.converteai.net/090f0000-d6a9-4d38-adea-d7b9c5325905/players/6945590a8fd5231b631c2d31/v4/player.js", s.async=!0,document.head.appendChild(s); </script>';

describe('educacaoAulas', () => {
  it('buildVturbEmbed reproduz o snippet do painel VTurb', () => {
    expect(buildVturbEmbed('6945590a8fd5231b631c2d31')).toBe(SNIPPET_PAINEL);
  });

  it('todo módulo com aulas existe na trilha e os IDs são únicos e válidos', () => {
    const ids: string[] = [];
    for (const [mIdx, aulas] of Object.entries(AULAS_TRILHA_ESR)) {
      expect(MODULOS_TRILHA_ESR[Number(mIdx)]).toBeDefined();
      for (const aula of aulas) {
        expect(aula.title.trim().length).toBeGreaterThan(0);
        expect(aula.vturbId).toMatch(/^[0-9a-f]{24}$/);
        ids.push(aula.vturbId);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
