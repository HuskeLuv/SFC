import { promises as fs } from 'fs';
import path from 'path';

let cachedBuildId: string | null = null;

/**
 * Id do build atual (.next/BUILD_ID, gerado pelo `next build`; muda a cada
 * deploy). Em dev o arquivo não existe → 'dev'. Cacheado por processo.
 */
export async function getBuildId(): Promise<string> {
  if (!cachedBuildId) {
    try {
      cachedBuildId = (
        await fs.readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8')
      ).trim();
    } catch {
      cachedBuildId = 'dev';
    }
  }
  return cachedBuildId;
}
