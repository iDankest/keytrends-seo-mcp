#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = join(__dirname, '../dist/index.js');

const expectedTools = [
  'keytrends_healthcheck',
  'keytrends_get_gsc_summary',
  'keytrends_get_search_performance',
  'keytrends_get_ai_visibility',
  'keytrends_get_ai_pages',
  'keytrends_get_indexation',
  'keytrends_get_sitemap_health',
];

const child = spawn(process.execPath, [distPath], {
  env: {
    ...process.env,
    KEYTRENDS_LOG_LEVEL: 'silent',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdoutData = '';
let stderrData = '';
let passed = false;

child.stdout.on('data', (chunk) => {
  stdoutData += chunk.toString();

  const lines = stdoutData.split('\n');
  stdoutData = lines.pop() ?? ''; // Keep incomplete line in buffer

  for (const line of lines) {
    if (!line.trim()) continue;

    let json;
    try {
      json = JSON.parse(line);
    } catch (err) {
      console.error('ERROR: Línea de stdout corrupta (no es JSON válido):', line);
      child.kill();
      process.exit(1);
    }

    if (json.jsonrpc !== '2.0') {
      console.error('ERROR: Mensaje de stdout no cumple jsonrpc: 2.0:', line);
      child.kill();
      process.exit(1);
    }

    if (json.id === 1 && json.result) {
      // Send notifications/initialized then tools/list
      const notif = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      const listReq = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });
      child.stdin.write(notif + '\n' + listReq + '\n');
    } else if (json.id === 2 && json.result) {
      const tools = json.result.tools || [];
      const toolNames = tools.map((t) => t.name);

      const missing = expectedTools.filter((name) => !toolNames.includes(name));
      if (missing.length > 0) {
        console.error('ERROR: Faltan herramientas en tools/list:', missing);
        child.kill();
        process.exit(1);
      }

      if (toolNames.length !== 7) {
        console.error('ERROR: Recibidas ' + toolNames.length + ' herramientas, esperadas 7:', toolNames);
        child.kill();
        process.exit(1);
      }

      passed = true;
      child.stdin.end();
      child.kill();
      console.log('SMOKE OK: 7 tools, stdout limpio');
      process.exit(0);
    }
  }
});

child.stderr.on('data', (chunk) => {
  stderrData += chunk.toString();
});

child.on('error', (err) => {
  console.error('ERROR al lanzar el subproceso:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  if (!passed) {
    console.error('ERROR: El proceso terminó antes de completar el handshake:', {
      code,
      stderr: stderrData,
    });
    process.exit(1);
  }
});

// Initialize handshake
const initMsg = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'smoke-stdio-client',
      version: '1.0.0',
    },
  },
});

child.stdin.write(initMsg + '\n');

// Timeout safety
setTimeout(() => {
  if (!passed) {
    console.error('ERROR: Timeout de 10s alcanzado en smoke-stdio', { stderr: stderrData });
    child.kill();
    process.exit(1);
  }
}, 10000);
