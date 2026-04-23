const fs = require('fs');

const file = 'c:/Users/Andersn/CYG-SYSTEM/artifacts/inventario-ventas/src/pages/facturas.tsx';
const content = fs.readFileSync(file, 'utf8');

const startIndex = content.indexOf('// FORM VIEW');
const endIndex = content.indexOf('{/* ── Delete AlertDialog ── */}');

if (startIndex === -1 || endIndex === -1) {
  console.error("Markers not found", startIndex, endIndex);
  process.exit(1);
}

// Rewind start index to the beginning of the block
const actualStart = content.lastIndexOf('// ──', startIndex);

const replacement = fs.readFileSync('c:/Users/Andersn/CYG-SYSTEM/form-view-chunk.txt', 'utf8');

const newContent = content.substring(0, actualStart) + replacement + '\n      ' + content.substring(endIndex);

fs.writeFileSync(file, newContent, 'utf8');
console.log("Replacement successful");
