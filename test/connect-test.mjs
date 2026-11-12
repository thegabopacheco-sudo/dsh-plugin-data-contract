// Test end-to-end de data-contract.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(path.join(home, 'data-contract'), { recursive: true });
writeFileSync(path.join(home, 'data-contract', 'config.json'), JSON.stringify({ allowedPaths: [tmpDir] }), 'utf8');
const dataFile = path.join(tmpDir, 'data.json');
const schemaFile = path.join(tmpDir, 'schema.json');
const data = [{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Luis' }];
const schema = { type: 'array', items: { type: 'object', required: ['id', 'nombre'], properties: { id: { type: 'integer', minimum: 1 }, nombre: { type: 'string', minLength: 1 } } } };
writeFileSync(dataFile, JSON.stringify(data), 'utf8');
writeFileSync(schemaFile, JSON.stringify(schema), 'utf8');

function makeClient() {
  const entry = process.env.DATACONTRACT_SERVER ? path.resolve(process.env.DATACONTRACT_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'datacontract-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
console.log('--- status ---'); console.log(textOf(await client.callTool({ name: 'status', arguments: {} })));
const valid = textOf(await client.callTool({ name: 'validate', arguments: { path: dataFile, schemaPath: schemaFile } }));
console.log('--- valid ---'); console.log(valid);
console.log('válido:', valid.includes('Válido'));
const invalidData = [{ id: 'x', nombre: 'Ana' }, { nombre: '' }];
const invalid = textOf(await client.callTool({ name: 'validate', arguments: { input: JSON.stringify(invalidData), schema: JSON.stringify(schema) } }));
console.log('--- invalid ---'); console.log(invalid);
console.log('error de tipo:', invalid.includes('$[0].id'));
console.log('falta requerido:', invalid.includes('falta campo requerido "id"'));
console.log('minLength:', invalid.includes('longitud < 1'));
const inferred = JSON.parse(textOf(await client.callTool({ name: 'infer', arguments: { path: dataFile } })));
console.log('--- infer ---'); console.log(JSON.stringify(inferred, null, 2));
console.log('infiere array object:', inferred.type === 'array' && inferred.items.type === 'object');
console.log('required id y nombre:', inferred.items.required.includes('id') && inferred.items.required.includes('nombre'));
console.log('tipo integer y string:', inferred.items.properties.id.type === 'integer' && inferred.items.properties.nombre.type === 'string');
const badJson = await client.callTool({ name: 'validate', arguments: { input: '{ roto', schema: JSON.stringify(schema) } });
console.log('json inválido isError:', badJson.isError === true);
const outside = await client.callTool({ name: 'validate', arguments: { path: 'C:\\Windows\\x.json', schemaPath: schemaFile } });
console.log('ruta fuera isError:', outside.isError === true);
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
