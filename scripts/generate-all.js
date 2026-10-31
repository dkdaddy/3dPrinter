/**
 * Master Part Generator CLI
 * Discovers and builds all parts in src/parts/
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const partsDir = path.resolve(__dirname, '../src/parts');

async function main() {
  console.log(`\n======================================================`);
  console.log(`         3D PRINTER PARTS - BUILD ALL PARTS           `);
  console.log(`======================================================\n`);

  if (!fs.existsSync(partsDir)) {
    console.error(`Parts directory not found: ${partsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(partsDir, { withFileTypes: true });
  const partFolders = entries.filter(e => e.isDirectory()).map(e => e.name);

  if (partFolders.length === 0) {
    console.log(`No parts found in ${partsDir}`);
    return;
  }

  const results = [];

  for (const partName of partFolders) {
    const partEntry = path.join(partsDir, partName, 'index.js');
    if (fs.existsSync(partEntry)) {
      console.log(`Building part: ${partName}...`);
      try {
        const module = await import(`file://${partEntry.replace(/\\/g, '/')}`);
        // Look for default export or generate function
        const genFn = module.default || module[`generate${capitalize(partName)}`] || Object.values(module).find(v => typeof v === 'function' && v.name.startsWith('generate'));

        if (typeof genFn === 'function') {
          const res = genFn();
          results.push({ name: partName, status: 'SUCCESS', file: res?.stats?.fileName || 'stl' });
        } else {
          console.warn(`[WARN] No generator function found in ${partEntry}`);
        }
      } catch (err) {
        console.error(`[ERROR] Failed to build ${partName}:`, err);
        results.push({ name: partName, status: 'FAILED', error: err.message });
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`                   BUILD SUMMARY                      `);
  console.log(`======================================================`);
  for (const r of results) {
    console.log(`  - [${r.status}] ${r.name} -> ${r.file || r.error}`);
  }
  console.log(`======================================================\n`);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
