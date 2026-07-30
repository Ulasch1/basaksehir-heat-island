import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  StatikKaynak,
  ServisKaynak,
  Mahalle,
} from '../veriKaynagi';
import ayarlar from '../ayarlar.json';

// Kendi icinde tutarli, yapay Mahalle fiksturu (uc mahalle)
const fixture: Mahalle[] = [
  {
    ad: 'Samlar',
    alan_km2: 9.352,
    zarf_alan_km2: 1.128,
    nufus: 1245,
    nufus_serisi: { '2013': 1496, '2014': 1455, '2025': 1245 },
    yesil_alan_orani: 0.17,
    bina_yogunlugu: 0.027,
    sinir: { type: 'MultiPolygon', coordinates: [] },
    ai_onbellek: {
      tipoloji: 1,
      projeksiyon_nufus: { '2030': 1188 },
      _uretim_zamani: '2026-07-30T07:52:07.228Z',
      _servis_surumu: '1.0.0',
    },
  },
  {
    ad: 'Altinsehir',
    alan_km2: 5.0,
    zarf_alan_km2: 0.8,
    nufus: 800,
    nufus_serisi: { '2013': 900, '2014': 880, '2025': 800 },
    yesil_alan_orani: 0.25,
    bina_yogunlugu: 0.05,
    sinir: { type: 'Polygon', coordinates: [] },
    ai_onbellek: {
      tipoloji: 0,
      projeksiyon_nufus: { '2030': 750 },
      _uretim_zamani: '2026-07-30T07:52:07.228Z',
      _servis_surumu: '1.0.0',
    },
  },
  {
    ad: 'Kucukcekmece',
    alan_km2: 7.0,
    zarf_alan_km2: 1.5,
    nufus: 1500,
    nufus_serisi: { '2013': 1600, '2014': 1550, '2025': 1500 },
    yesil_alan_orani: 0.12,
    bina_yogunlugu: 0.08,
    sinir: { type: 'MultiPolygon', coordinates: [] },
    ai_onbellek: {
      tipoloji: 2,
      projeksiyon_nufus: { '2030': 1400 },
      _uretim_zamani: '2026-07-30T07:52:07.228Z',
      _servis_surumu: '1.0.0',
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StatikKaynak', () => {
  const statik = new StatikKaynak();

  it('mahalleleriGetir - fetch basarili olursa diziyi dondurur', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    });
    vi.stubGlobal('fetch', mockFetch);

    const sonuc = await statik.mahalleleriGetir();
    expect(sonuc).toEqual(fixture);
    expect(mockFetch).toHaveBeenCalledWith('/veri.json');
  });

  it('mahalleleriGetir - fetch basarisiz oldugunda hata firlatir', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(statik.mahalleleriGetir()).rejects.toThrow(
      'Veri dosyasi yuklenemedi'
    );
  });

  it('tipolojiGetir - statik onbellegi okur', async () => {
    const sonuc = await statik.tipolojiGetir(fixture);
    expect(sonuc.guncel).toBe(false);
    expect(sonuc.servisSurumu).toBe(fixture[0].ai_onbellek._servis_surumu);
    expect(sonuc.uretimZamani).toBe(fixture[0].ai_onbellek._uretim_zamani);
    expect(sonuc.sonuclar).toHaveLength(3);
    expect(sonuc.sonuclar).toEqual([
      { ad: 'Samlar', tipoloji: 1 },
      { ad: 'Altinsehir', tipoloji: 0 },
      { ad: 'Kucukcekmece', tipoloji: 2 },
    ]);
  });

  it('tipolojiGetir - bos dizi ile', async () => {
    const sonuc = await statik.tipolojiGetir([]);
    expect(sonuc.guncel).toBe(false);
    expect(sonuc.servisSurumu).toBe('');
    expect(sonuc.uretimZamani).toBe('');
    expect(sonuc.sonuclar).toEqual([]);
  });

  it('projeksiyonGetir - statik onbellegi okur, ufuk parametresi yok sayilir', async () => {
    const sonuc = await statik.projeksiyonGetir(fixture, 5);
    expect(sonuc.guncel).toBe(false);
    expect(sonuc.servisSurumu).toBe(fixture[0].ai_onbellek._servis_surumu);
    expect(sonuc.uretimZamani).toBe(fixture[0].ai_onbellek._uretim_zamani);
    expect(sonuc.sonuclar).toHaveLength(3);
    expect(sonuc.sonuclar[0]).toEqual({
      ad: 'Samlar',
      tahminiNufus: 1188,
      hedefYil: 2030,
    });
    expect(sonuc.sonuclar[1]).toEqual({
      ad: 'Altinsehir',
      tahminiNufus: 750,
      hedefYil: 2030,
    });
    expect(sonuc.sonuclar[2]).toEqual({
      ad: 'Kucukcekmece',
      tahminiNufus: 1400,
      hedefYil: 2030,
    });
  });

  it('projeksiyonGetir - bos dizi ile', async () => {
    const sonuc = await statik.projeksiyonGetir([], 5);
    expect(sonuc.guncel).toBe(false);
    expect(sonuc.servisSurumu).toBe('');
    expect(sonuc.uretimZamani).toBe('');
    expect(sonuc.sonuclar).toEqual([]);
  });
});

describe('ServisKaynak', () => {
  const statik = new StatikKaynak();

  it('mahalleleriGetir yedek statik kaynaga yonlendirir', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    });
    vi.stubGlobal('fetch', mockFetch);

    const servis = new ServisKaynak();
    const sonuc = await servis.mahalleleriGetir();
    expect(sonuc).toEqual(fixture);
    expect(mockFetch).toHaveBeenCalledWith('/veri.json');
  });

  it('tipolojiGetir - basarili servis yanitindan guncel sonuc dondurur', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        servis_surumu: '1.2.3',
        kume_sayisi: 3,
        sonuclar: [
          { ad: 'Samlar', tipoloji: 1 },
          { ad: 'Altinsehir', tipoloji: 0 },
          { ad: 'Kucukcekmece', tipoloji: 2 },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const servis = new ServisKaynak('http://localhost:8000', 2000);
    const sonuc = await servis.tipolojiGetir(fixture);
    expect(sonuc.guncel).toBe(true);
    expect(sonuc.servisSurumu).toBe('1.2.3');
    expect(sonuc.uretimZamani).toEqual(expect.any(String));
    expect(sonuc.sonuclar).toEqual([
      { ad: 'Samlar', tipoloji: 1 },
      { ad: 'Altinsehir', tipoloji: 0 },
      { ad: 'Kucukcekmece', tipoloji: 2 },
    ]);

    // Istek govdesini kontrol et
    const cagri = mockFetch.mock.calls[0];
    expect(cagri[0]).toBe('http://localhost:8000/tipoloji');
    const govde = JSON.parse(cagri[1].body);
    expect(govde.kume_sayisi).toBe(ayarlar.kumeleme_kume_sayisi);
    expect(govde.mahalleler).toHaveLength(fixture.length);

    // Her mahalle icin olceklenmis maruziyetin dogru aralikta oldugunu kontrol et
    govde.mahalleler.forEach((m: any, i: number) => {
      const rawYogunluk = fixture[i].nufus / fixture[i].zarf_alan_km2;
      const scaled = m.olceklenmis_maruziyet;
      expect(typeof scaled).toBe('number');
      expect(scaled).toBeGreaterThanOrEqual(ayarlar.maruziyet_alt_siniri);
      expect(scaled).toBeLessThanOrEqual(1);
      // Ham yogunluktan farkli olmali (fikstur farkli degerler icerdigi icin)
      expect(scaled).not.toBe(rawYogunluk);
    });
  });

  it('tipolojiGetir - fetch reddedilince yedek statik sonuca duser', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', mockFetch);

    const servis = new ServisKaynak();
    const sonuc = await servis.tipolojiGetir(fixture);
    const statikSonuc = await statik.tipolojiGetir(fixture);
    expect(sonuc.guncel).toBe(false);
    expect(sonuc).toEqual(statikSonuc);
  });

  it('tipolojiGetir - yanit ok degilse yedek statik sonuca duser', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });
    vi.stubGlobal('fetch', mockFetch);

    const servis = new ServisKaynak();
    const sonuc = await servis.tipolojiGetir(fixture);
    const statikSonuc = await statik.tipolojiGetir(fixture);
    expect(sonuc).toEqual(statikSonuc);
  });

  it('tipolojiGetir - zaman asimi sonrasi yedek statik sonuca duser', async () => {
    // fetch, sinyal abort edilene kadar cozulmeyen bir promise dondurur
    const abortFetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      });
    });
    vi.stubGlobal('fetch', abortFetch);

    const servis = new ServisKaynak('http://localhost:8000', 20);
    const sonucPromise = servis.tipolojiGetir(fixture);
    const statikSonuc = await statik.tipolojiGetir(fixture);
    const sonuc = await sonucPromise;
    expect(sonuc).toEqual(statikSonuc);
  });

  it('projeksiyonGetir - basarili servis yanitindan guncel sonuc dondurur', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        servis_surumu: '2.0.0',
        ufuk_yil: 5,
        sonuclar: [
          { ad: 'Samlar', tahmini_nufus: 1200, hedef_yil: 2035 },
          { ad: 'Altinsehir', tahmini_nufus: 780, hedef_yil: 2035 },
          { ad: 'Kucukcekmece', tahmini_nufus: 1450, hedef_yil: 2035 },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const servis = new ServisKaynak();
    const sonuc = await servis.projeksiyonGetir(fixture, 5);
    expect(sonuc.guncel).toBe(true);
    expect(sonuc.servisSurumu).toBe('2.0.0');
    expect(sonuc.uretimZamani).toEqual(expect.any(String));
    expect(sonuc.sonuclar).toEqual([
      { ad: 'Samlar', tahminiNufus: 1200, hedefYil: 2035 },
      { ad: 'Altinsehir', tahminiNufus: 780, hedefYil: 2035 },
      { ad: 'Kucukcekmece', tahminiNufus: 1450, hedefYil: 2035 },
    ]);

    const cagri = mockFetch.mock.calls[0];
    expect(cagri[0]).toBe('http://localhost:8000/projeksiyon');
    const govde = JSON.parse(cagri[1].body);
    expect(govde.ufuk_yil).toBe(5);
    expect(govde.mahalleler).toHaveLength(fixture.length);
    expect(govde.mahalleler[0].nufus_serisi).toEqual(fixture[0].nufus_serisi);
  });

  it('projeksiyonGetir - fetch reddedilince yedek statik sonuca duser', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('servis hatasi'));
    vi.stubGlobal('fetch', mockFetch);

    const servis = new ServisKaynak();
    const sonuc = await servis.projeksiyonGetir(fixture, 5);
    const statikSonuc = await statik.projeksiyonGetir(fixture, 5);
    expect(sonuc).toEqual(statikSonuc);
  });

  it('projeksiyonGetir - yanit ok degilse yedek statik sonuca duser', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', mockFetch);

    const servis = new ServisKaynak();
    const sonuc = await servis.projeksiyonGetir(fixture, 5);
    const statikSonuc = await statik.projeksiyonGetir(fixture, 5);
    expect(sonuc).toEqual(statikSonuc);
  });
});
