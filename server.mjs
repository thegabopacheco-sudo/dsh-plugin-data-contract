#!/usr/bin/env node
// dsh-plugin-data-contract — valida e infiere contratos JSON (schema-lite).
// Tools: status, validate, infer.

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'data-contract', 'config.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'data-contract');
const MAX_CHARS = 20 * 1024 * 1024;
const log = (m) => process.stderr.write(`[datacontract] ${m}\n`);

function loadConfig() { try { if (existsSync(CONFIG_FILE)) return { allowedPaths: [], ...(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}) }; } catch { /* defaults */ } return { allowedPaths: [] }; }
function allowedRoots() { const configured = loadConfig().allowedPaths; return (Array.isArray(configured) && configured.length ? configured : [process.env.USERPROFILE || process.env.HOME || os.homedir()]).map((item) => path.resolve(item)); }
function isAllowed(target) { const resolved = path.resolve(target); return allowedRoots().some((root) => resolved === root || resolved.startsWith(root + path.sep)); }
function parseJson(text, label) {
  if (text.length > MAX_CHARS) throw new Error(`${label} demasiado grande`);
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); } catch (error) { throw new Error(`${label} inválido: ${error.message}`); }
}
function loadJsonArg(args, kind) {
  const pathKey = kind === 'schema' ? 'schemaPath' : 'path';
  const inputKey = kind === 'schema' ? 'schema' : 'input';
  if (args[pathKey]) {
    const resolved = path.resolve(args[pathKey]);
    if (!existsSync(resolved)) throw new Error(`archivo no existe: ${resolved}`);
    if (!isAllowed(resolved)) throw new Error(`ruta no permitida (revisa allowedPaths): ${resolved}`);
    return parseJson(readFileSync(resolved, 'utf8'), kind === 'schema' ? 'schema' : 'JSON');
  }
  if (typeof args[inputKey] === 'string') return parseJson(args[inputKey], kind === 'schema' ? 'schema' : 'JSON');
  throw new Error(kind === 'schema' ? 'pasa schema (texto) o schemaPath (archivo)' : 'pasa input (texto JSON) o path (archivo)');
}
function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}
function validateValue(value, schema, pointer, errors) {
  if (!schema || typeof schema !== 'object') return;
  const actual = typeOf(value);
  if (schema.type) {
    const typeOk = schema.type === actual || (schema.type === 'number' && actual === 'integer') || (schema.type === 'integer' && actual === 'integer');
    if (!typeOk) { errors.push({ path: pointer || '$', message: `se esperaba ${schema.type}, llegó ${actual}` }); return; }
  }
  if (schema.enum && !schema.enum.some((item) => item === value)) errors.push({ path: pointer || '$', message: `valor fuera del enum: ${JSON.stringify(value)}` });
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push({ path: pointer || '$', message: `< mínimo ${schema.minimum}` });
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push({ path: pointer || '$', message: `> máximo ${schema.maximum}` });
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push({ path: pointer || '$', message: `longitud < ${schema.minLength}` });
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push({ path: pointer || '$', message: `longitud > ${schema.maxLength}` });
    if (schema.pattern) { try { if (!new RegExp(schema.pattern).test(value)) errors.push({ path: pointer || '$', message: `no cumple pattern ${schema.pattern}` }); } catch { /* pattern inválido */ } }
  }
  if (actual === 'object') {
    for (const key of schema.required || []) if (!(key in value)) errors.push({ path: pointer || '$', message: `falta campo requerido "${key}"` });
    for (const [key, childSchema] of Object.entries(schema.properties || {})) if (key in value) validateValue(value[key], childSchema, pointer ? `${pointer}.${key}` : key, errors);
  }
  if (actual === 'array' && schema.items) value.forEach((item, index) => validateValue(item, schema.items, `${pointer || '$'}[${index}]`, errors));
}
function inferSchema(value, depth = 0) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    const itemSchemas = value.slice(0, 50).map((item) => inferSchema(item, depth + 1));
    const types = [...new Set(itemSchemas.map((schema) => schema.type))];
    if (value.length === 0) return { type: 'array', items: {} };
    if (types.length === 1 && types[0] === 'object') {
      const keys = new Set(value.flatMap((item) => Object.keys(item)));
      const properties = {};
      const required = [];
      for (const key of keys) {
        const present = value.filter((item) => key in item).length;
        if (present === value.length) required.push(key);
        properties[key] = inferSchema(value.find((item) => key in item)?.[key], depth + 1);
      }
      return { type: 'array', items: { type: 'object', required, properties } };
    }
    return { type: 'array', items: types.length === 1 ? { type: types[0] } : {} };
  }
  if (typeOf(value) === 'object') {
    const properties = {};
    for (const [key, item] of Object.entries(value)) properties[key] = inferSchema(item, depth + 1);
    return { type: 'object', required: Object.keys(value), properties };
  }
  return { type: typeOf(value) };
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }

function buildInstructions() {
  return [
    'Data Contract: valida e infiere contratos JSON (schema-lite).',
    '',
    'Herramientas: status, validate, infer.',
    '',
    'Soporta: type, required, properties, items, enum, minimum/maximum, minLength/maxLength, pattern.',
    'Reglas:',
    '- Solo lectura; respeta allowedPaths.',
    '- validate reporta errores por ruta ($, $.campo, $[0].campo).',
    '- infer produce un esquema desde datos reales; no inventes campos.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-data-contract', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool(
    'status',
    { title: 'Estado', description: 'Rutas permitidas y modo.', inputSchema: z.object({}) },
    async () => textResult([`Rutas permitidas: ${allowedRoots().join(', ')}`, 'Modo: solo lectura'].join('\n')),
  );
  server.registerTool(
    'validate',
    { title: 'Validar datos', description: 'Valida JSON contra un esquema schema-lite.', inputSchema: z.object({ input: z.string().optional(), path: z.string().optional(), schema: z.string().optional(), schemaPath: z.string().optional() }) },
    async (args) => {
      const data = loadJsonArg(args, 'data');
      const schema = loadJsonArg(args, 'schema');
      const errors = [];
      validateValue(data, schema, '$', errors);
      if (errors.length === 0) return textResult('✅ Válido: los datos cumplen el contrato.');
      return textResult([`❌ ${errors.length} error(es):`, ...errors.slice(0, 100).map((error) => `- ${error.path}: ${error.message}`)].join('\n'));
    },
  );
  server.registerTool(
    'infer',
    { title: 'Inferir esquema', description: 'Infiere un esquema desde los datos.', inputSchema: z.object({ input: z.string().optional(), path: z.string().optional() }) },
    async (args) => textResult(JSON.stringify(inferSchema(loadJsonArg(args, 'data')), null, 2)),
  );
  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log('data-contract listo');
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
