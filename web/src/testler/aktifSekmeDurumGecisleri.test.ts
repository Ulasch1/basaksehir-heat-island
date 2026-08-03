import { describe, it, expect } from 'vitest';

/**
 * Bu dosya App.tsx'teki `onAktifSekmeChange` ve `onSecim` fonksiyonlarindaki state-gecis
 * mantiginin bir REPLIKASYONUDUR. App.tsx component-seviyesinde test edilmez (bkz.
 * simHedefUygulama.test.ts), bu yuzden mantik saf fonksiyonlar olarak burada kopyalanip
 * test edilir.
 */

interface SimDurumu {
  aktifSekme: 'inceleme' | 'senaryo';
  simYesil: number;
  simNufusYuzde: number;
  simHedef: 'mahalle' | 'hucre';
  simButce: number;
  seciliHucreIndex: number | null;
}

// App.tsx onAktifSekmeChange replikasyonu
function aktifSekmeDegistir(durum: SimDurumu, yeniSekme: 'inceleme' | 'senaryo'): SimDurumu {
  if (durum.aktifSekme === 'senaryo' && yeniSekme === 'inceleme') {
    return { ...durum, aktifSekme: yeniSekme, simYesil: 0, simNufusYuzde: 0, simHedef: 'mahalle' };
  }
  return { ...durum, aktifSekme: yeniSekme };
}

// App.tsx onSecim replikasyonu (sadece sim-state sifirlama kismi, aktifSekme'ye DOKUNMAZ)
function mahalleSec(durum: SimDurumu): SimDurumu {
  return { ...durum, simYesil: 0, simNufusYuzde: 0, seciliHucreIndex: null, simHedef: 'mahalle' };
}

describe('aktifSekme durum gecisleri (REPLIKASYON)', () => {
  it('Senaryo -> Inceleme gecisinde sim state sifirlanir, simButce sifirlanmaz', () => {
    const durum: SimDurumu = { aktifSekme: 'senaryo', simYesil: 20, simNufusYuzde: 30, simHedef: 'hucre', simButce: 7, seciliHucreIndex: 3 };
    const sonuc = aktifSekmeDegistir(durum, 'inceleme');
    expect(sonuc.aktifSekme).toBe('inceleme');
    expect(sonuc.simYesil).toBe(0);
    expect(sonuc.simNufusYuzde).toBe(0);
    expect(sonuc.simHedef).toBe('mahalle');
    expect(sonuc.simButce).toBe(7); // butce sifirlanmaz
  });

  it('Inceleme -> Senaryo gecisinde hicbir sim state sifirlanmaz', () => {
    const durum: SimDurumu = { aktifSekme: 'inceleme', simYesil: 20, simNufusYuzde: 30, simHedef: 'hucre', simButce: 7, seciliHucreIndex: 3 };
    const sonuc = aktifSekmeDegistir(durum, 'senaryo');
    expect(sonuc.aktifSekme).toBe('senaryo');
    expect(sonuc.simYesil).toBe(20);
    expect(sonuc.simNufusYuzde).toBe(30);
    expect(sonuc.simHedef).toBe('hucre');
    expect(sonuc.seciliHucreIndex).toBe(3);
  });

  it('senaryo turetmesi (senaryoAktif) dogrudan aktifSekmeye bagli', () => {
    const inceleme: SimDurumu = { aktifSekme: 'inceleme', simYesil: 20, simNufusYuzde: 0, simHedef: 'mahalle', simButce: 3, seciliHucreIndex: null };
    const senaryo: SimDurumu = { ...inceleme, aktifSekme: 'senaryo' };
    const senaryoAktifTure = (d: SimDurumu) => d.aktifSekme === 'senaryo';
    expect(senaryoAktifTure(inceleme)).toBe(false);
    expect(senaryoAktifTure(senaryo)).toBe(true);
  });

  it('mahalle degisiminde sim state sifirlanir ama aktifSekme degismez (Senaryo sekmesindeyken)', () => {
    const durum: SimDurumu = { aktifSekme: 'senaryo', simYesil: 15, simNufusYuzde: 25, simHedef: 'hucre', simButce: 5, seciliHucreIndex: 2 };
    const sonuc = mahalleSec(durum);
    expect(sonuc.aktifSekme).toBe('senaryo'); // sekme korunur
    expect(sonuc.simYesil).toBe(0);
    expect(sonuc.simNufusYuzde).toBe(0);
    expect(sonuc.seciliHucreIndex).toBeNull();
    expect(sonuc.simHedef).toBe('mahalle');
  });

  it('mahalle degisiminde Inceleme sekmesindeyken de sekme degismez', () => {
    const durum: SimDurumu = { aktifSekme: 'inceleme', simYesil: 0, simNufusYuzde: 0, simHedef: 'mahalle', simButce: 5, seciliHucreIndex: null };
    const sonuc = mahalleSec(durum);
    expect(sonuc.aktifSekme).toBe('inceleme');
  });
});
