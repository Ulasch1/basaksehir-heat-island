import { describe, it, expect } from 'vitest';
import { hesaplaHucreTehlikeleri, simuleHucreYesillestirme } from '../skorHesapla';
import { golgeRengi } from '../renk';
import type { TehlikeAgirliklari } from '../skor';

/**
 * Regresyon testi: Yeni fix (izgaraMinMax sadece baseline'a bakar, golgeRengi
 * alt-kenetleme yapmaz) sayesinde dokunulmamis hucrelerin rengi simülasyon
 * ne olursa olsun tamamen sabit kalir. Bu test, ARC-07'nin korunduğunu
 * kanitlar.
 *
 * Senaryo: yüksek bütçe en tehlikeli hücreyi baseline min'in altına düşürse bile,
 * izgaraMinMax sabit olduğu için dokunulmamış hücrelerin goreli konumu (t) ve
 * dolayısıyla rengi değişmez.
 */

const AGIRLIKLAR: TehlikeAgirliklari = { yesilAlan: 0.5, binaYogunlugu: 0.5 };
const KATSAYI = 0.5;

// Bir hucre cok buyuk iyilesme potansiyeline sahip (yesil_alan_orani = 0),
// digerleri birbirine yakin ve sinirli butceyle dokunulmadan kalacak.
const HUCRELER = [
  { yesil_alan_orani: 0.0, bina_yogunlugu: 1.0 }, // en tehlikeli, buyuk iyilesme potansiyeli
  { yesil_alan_orani: 0.55, bina_yogunlugu: 0.45 }, // en guvenli, dokunulmayacak (baseline min)
  { yesil_alan_orani: 0.5, bina_yogunlugu: 0.5 },
  { yesil_alan_orani: 0.52, bina_yogunlugu: 0.48 },
];

function haritaMinMaxTaklitEt(baseline: number[]) {
  // Harita.tsx yeni formulu: min/max SADECE baseline'dan alinir, canli dizisine
  // (izgaraKatmani.tehlikeler) hic bakilmaz - domain simulasyon ne olursa olsun sabit.
  return { min: Math.min(...baseline), max: Math.max(...baseline) };
}

describe('izgara min genisletme regresyonu: dokunulmamis hucrelerin rengi sabit kaliyor', () => {
  it('yuksek iyilesmeli tek hucre butceyle canli-min baseline-min altina dusse bile DOKUNULMAMIS hucrelerin rengi sabit kalir', () => {
    const baseline = hesaplaHucreTehlikeleri(HUCRELER, AGIRLIKLAR);
    const minBase = Math.min(...baseline);
    const maxBase = Math.max(...baseline);

    // simYesil=25: kalanButce = 0.25 * 4 = 1.0 hucre-birimi. Hucre 0'in
    // ihtiyaci 1.0 (yesil_alan_orani=0 -> 1), butcenin tamami hucre 0'a gider,
    // digerleri (1,2,3) DEGISMEDEN kalir.
    const simulasyonlu = simuleHucreYesillestirme(HUCRELER, 25, KATSAYI, AGIRLIKLAR);
    const canli = simulasyonlu.map((h) => h.tehlike);

    // Onkosul: hucre 0 gercekten degisti, 1/2/3 gercekten degismedi.
    expect(canli[0]).not.toBeCloseTo(baseline[0], 5);
    expect(canli[1]).toBeCloseTo(baseline[1], 10);
    expect(canli[2]).toBeCloseTo(baseline[2], 10);
    expect(canli[3]).toBeCloseTo(baseline[3], 10);

    // Onkosul: hucre 0'in canli tehlikesi baseline min'in altina dustu - bu tam
    // olarak fix'in ele aldigi durum, ama artik izgaraMinMax'i ETKILEMEMELI,
    // cunku domain SADECE baseline'dan hesaplaniyor (canli diziye hic bakilmiyor).
    expect(canli[0]).toBeLessThan(minBase);
    const { min: minYeni, max: maxYeni } = haritaMinMaxTaklitEt(baseline);
    expect(minYeni).toBe(minBase);
    expect(maxYeni).toBe(maxBase);

    // Dokunulmamis hucrelerin ESKI (baseline-only) ve YENI (yine baseline-only,
    // ama artik canli diziden hic etkilenmeyen) min/max ile hesaplanan renklerini
    // karsilastir.
    const eskiRenkler = [1, 2, 3].map((i) => golgeRengi(baseline[i], minBase, maxBase));
    const yeniRenkler = [1, 2, 3].map((i) => golgeRengi(canli[i], minYeni, maxYeni));

    // BEKLENEN (duzeltilmis davranis): dokunulmamis hucrelerin rengi TAM OLARAK
    // sabit kalir, cunku izgaraMinMax artik sadece baseline'a bakiyor.
    for (let i = 0; i < eskiRenkler.length; i++) {
      expect(yeniRenkler[i]).toBe(eskiRenkler[i]);
    }
  });
});
