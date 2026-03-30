#!/usr/bin/env node
/**
 * Add SPDX license headers to all source files (.rs, .ts, .tsx)
 *
 * Usage: node scripts/add-license-headers.cjs [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const HEADER_RS = `// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

`;

const HEADER_TS = `// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

`;

const MARKER = 'SPDX-License-Identifier';

const DIRS = [
  { base: 'src-tauri/src', exts: ['.rs'] },
  { base: 'src',           exts: ['.ts', '.tsx'] },
  { base: 'agent/src',     exts: ['.rs'] },
  { base: 'cli/src',       exts: ['.rs'] },
];

function walk(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

let added = 0;
let skipped = 0;

for (const { base, exts } of DIRS) {
  const files = walk(base, exts);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    // Already has the header
    if (content.includes(MARKER)) {
      skipped++;
      continue;
    }

    const isRust = file.endsWith('.rs');
    const header = isRust ? HEADER_RS : HEADER_TS;

    let newContent;

    if (isRust) {
      // Preserve #! attributes and //! doc comments at the very top
      // They must stay before the license header? No — SPDX should be first.
      // Actually, #![cfg_attr(...)] must be very first in main.rs/lib.rs.
      // And //! doc comments are module-level docs that typically come first too.
      // Convention: put SPDX before everything, EXCEPT #![...] attributes.
      
      const lines = content.split('\n');
      let insertIdx = 0;
      
      // Skip #![...] inner attributes (they MUST be at the top of the file)
      while (insertIdx < lines.length && lines[insertIdx].trimStart().startsWith('#![')) {
        insertIdx++;
      }
      // Skip blank lines after attributes
      while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
        insertIdx++;
      }
      
      const before = lines.slice(0, insertIdx).join('\n');
      const after = lines.slice(insertIdx).join('\n');
      
      if (insertIdx === 0) {
        newContent = header + content;
      } else {
        newContent = before + '\n\n' + header + after;
      }
    } else {
      // TypeScript/TSX — just prepend
      // But preserve /// <reference> directives at the top
      const lines = content.split('\n');
      let insertIdx = 0;
      while (insertIdx < lines.length && lines[insertIdx].trimStart().startsWith('/// <reference')) {
        insertIdx++;
      }
      
      if (insertIdx === 0) {
        newContent = header + content;
      } else {
        const before = lines.slice(0, insertIdx).join('\n');
        const after = lines.slice(insertIdx).join('\n');
        newContent = before + '\n\n' + header + after;
      }
    }

    if (DRY_RUN) {
      console.log(`[DRY] ${file}`);
    } else {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log(`[ADD] ${file}`);
    }
    added++;
  }
}

console.log(`\nDone. Added: ${added}, Skipped (already has header): ${skipped}`);
if (DRY_RUN) console.log('(dry run — no files were modified)');
