const fs = require('fs');
const path = require('path');

const hedefKlasor = path.resolve(__dirname, '..', 'public');
fs.mkdirSync(hedefKlasor, { recursive: true });

const veriKaynak = path.resolve(__dirname, '..', '..', 'veri', 'veri.json');
const veriHedef = path.join(hedefKlasor, 'veri.json');

if (!fs.existsSync(veriKaynak)) {
  console.error(`veri-kopyala: kaynak dosya bulunamadi: ${veriKaynak}`);
  process.exit(1);
}
fs.copyFileSync(veriKaynak, veriHedef);
console.log(`veri-kopyala: ${veriKaynak} -> ${veriHedef} kopyalandi.`);

const izgaraKaynak = path.resolve(__dirname, '..', '..', 'veri', 'izgara.json');
const izgaraHedef = path.join(hedefKlasor, 'izgara.json');

if (!fs.existsSync(izgaraKaynak)) {
  console.error(`veri-kopyala: kaynak dosya bulunamadi: ${izgaraKaynak}`);
  process.exit(1);
}
fs.copyFileSync(izgaraKaynak, izgaraHedef);
console.log(`veri-kopyala: ${izgaraKaynak} -> ${izgaraHedef} kopyalandi.`);
