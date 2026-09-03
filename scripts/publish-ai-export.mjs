#!/usr/bin/env node
/**
 * Publica un CSV exportado de la UI de GSC (informe de IA generativa) en el
 * repositorio privado de datos, usando `gh api` (gh CLI ya autenticado).
 *
 * Uso:
 *   node scripts/publish-ai-export.mjs <fichero.csv> --as search-dates|search-pages|discover-dates|discover-pages [--repo iDankest/keytrends-gsc-ai-exports]
 *
 * Tras publicar, imprime la línea KEYTRENDS_AI_EXPORT_URL=... lista para
 * pegar en el panel de credenciales de Cognitiv.
 */
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEFAULT_REPO = 'iDankest/keytrends-gsc-ai-exports';

// --as <alias> → nombre canónico publicado en exports/
const CANONICAL = {
  'search-dates': 'search-ai-dates.csv',
  'search-pages': 'search-ai-pages.csv',
  'discover-dates': 'discover-ai-dates.csv',
  'discover-pages': 'discover-ai-pages.csv',
};

function usage() {
  console.error(
    `Uso: node scripts/publish-ai-export.mjs <fichero.csv> --as ${Object.keys(CANONICAL).join('|')} [--repo ${DEFAULT_REPO}]`
  );
}

function gh(args, input = null) {
  const res = spawnSync('gh', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || '').trim();
    console.error(`gh ${args.join(' ')} falló (exit ${res.status}): ${detail}`);
    process.exit(1);
  }
  return res.stdout;
}

// --- Args ---
const argv = process.argv.slice(2);
const file = argv[0];
let as = null;
let repo = DEFAULT_REPO;

for (let i = 1; i < argv.length; i++) {
  if (argv[i] === '--as') {
    as = argv[++i] ?? null;
  } else if (argv[i] === '--repo') {
    repo = argv[++i] ?? DEFAULT_REPO;
  }
}

if (!file || !as) {
  usage();
  process.exit(1);
}

const canonical = CANONICAL[as];
if (!canonical) {
  console.error(`--as debe ser uno de: ${Object.keys(CANONICAL).join(', ')}. Recibido: '${as}'`);
  usage();
  process.exit(1);
}

// --- Validación del fichero ---
let stat;
try {
  stat = statSync(file);
} catch {
  console.error(`El fichero no existe: ${file}`);
  process.exit(1);
}
if (!stat.isFile() || stat.size === 0) {
  console.error(`El fichero está vacío o no es un fichero regular: ${file}`);
  process.exit(1);
}

const contentB64 = readFileSync(file).toString('base64');
const today = new Date().toISOString().slice(0, 10);
const apiPath = `/repos/${repo}/contents/exports/${canonical}`;
const payload = JSON.stringify({
  message: `export ${as} ${today}`,
  content: contentB64,
});

// --- Publicación ---
gh(['api', '-X', 'PUT', apiPath, '--input', '-'], payload);
console.log(`Publicado: ${repo} → exports/${canonical} (${stat.size} bytes)`);

// --- Listado y línea de env para Cognitiv ---
const listing = gh(['api', `/repos/${repo}/contents/exports`, '--jq', '.[].name']);
const csvs = listing
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.toLowerCase().endsWith('.csv'))
  .sort();

const urls = csvs.map(
  (name) => `https://raw.githubusercontent.com/${repo}/main/exports/${name}`
);

if (urls.length === 0) {
  console.error('Aviso: el directorio exports/ quedó vacío tras publicar.');
  process.exit(1);
}

console.log('\nPega esta línea en las credenciales de la tool en Cognitiv:\n');
console.log(`KEYTRENDS_AI_EXPORT_URL=${urls.join(',')}`);
