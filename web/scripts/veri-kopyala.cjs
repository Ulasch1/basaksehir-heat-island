const fs = require('fs');
const path = require('path');

const kaynak = path.resolve(__dirname, '..', '..', 'veri', 'veri.json');
const hedefKlasor = path.resolve(__dirname, '..', 'public');
const hedef = path.join(hedefKlasor, 'veri.json');

if (!fs.existsSync(kaynak)) {
  console.error(`veri-kopyala: kaynak dosya bulunamadi: ${kaynak}`);
  process.exit(1);
}

fs.mkdirSync(hedefKlasor, { recursive: true });
fs.copyFileSync(kaynak, hedef);
console.log(`veri-kopyala: ${kaynak} -> ${hedef} kopyalandi.`);
