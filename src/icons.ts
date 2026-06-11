import { BOX } from './ui.js';
import type { IconRule } from './types.js';

// ─── Script Icons ───────────────────────────────────────────────────────────
export const ICONS: IconRule[] = [
  { re: /\bdev\b|dev:|start|serve|watch|hot/i, icon: '▸' },
  { re: /test|jest|mocha|vitest|playwright|cypress|e2e|spec/i, icon: '●' },
  { re: /build|compile|bundle|tsup|esbuild|rollup|webpack|vite|tsc|transpile/i, icon: '■' },
  { re: /infra|docker|compose|localstack|deploy|provision|k8s|helm/i, icon: '◆' },
  { re: /lint|format|prettier|eslint|stylelint|biome/i, icon: '✦' },
  { re: /sonar|scan|audit|security|snyk|trivy/i, icon: '◈' },
  { re: /db|dynamo|redis|minio|mongo|postgres|mysql|prisma|migrate|seed|sqlite/i, icon: '❖' },
  { re: /clean|reset|rm|remove|clear|purge|nuke/i, icon: '✕' },
  { re: /story|doc|md|readme|typedoc|jsdoc/i, icon: '◉' },
  { re: /ci|cd|github|gitlab|jenkins|pipeline/i, icon: '↻' },
  { re: /release|publish|ship/i, icon: '▲' },
  { re: /install|postinstall|preinstall/i, icon: '▼' },
  { re: /generate|gen|scaffold|create|init/i, icon: '✚' },
  { re: /analyze|size|perf|benchmark|profile/i, icon: '○' },
  { re: /typecheck|type-check|types/i, icon: '□' },
];

export function getIcon(name: string): string {
  const match = ICONS.find(({ re }) => re.test(name));
  return match ? match.icon : BOX.bullet;
}
