import ayarlar from './ayarlar.json';
import { olcekleMaruziyet } from './skor';

/**
 * ARC-06: Veri Erisim Modulu
 *
 * Tum dosya ve ag erisimini (fetch) merkezilestirir.
 * StatikKaynak: yalnizca yerel /veri.json ve onbellek.
 * ServisKaynak: canli AI servisini dener, hata alirsa StatikKaynak'a duser.
 *
 * Tum tanimlayicilar ASCII Turkce kelimeler kullanir.
 */

// ========== Veri Tipleri ==========

export interface MahalleSinir {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

export interface AiOnbellek {
  tipoloji: number;
  projeksiyon_nufus: Record<string, number>;
  _uretim_zamani: string;
  _servis_surumu: string;
}

export interface Mahalle {
  ad: string;
  alan_km2: number;
  zarf_alan_km2: number;
  nufus: number;
  nufus_serisi: Record<string, number>;
  yesil_alan_orani: number;
  bina_yogunlugu: number;
  sinir: MahalleSinir;
  ai_onbellek: AiOnbellek;
}

export interface TipolojiSonucItem {
  ad: string;
  tipoloji: number;
}

export interface TipolojiSonucu {
  guncel: boolean;
  sonuclar: TipolojiSonucItem[];
  uretimZamani: string;
  servisSurumu: string;
}

export interface ProjeksiyonSonucItem {
  ad: string;
  tahminiNufus: number;
  hedefYil: number;
}

export interface ProjeksiyonSonucu {
  guncel: boolean;
  sonuclar: ProjeksiyonSonucItem[];
  uretimZamani: string;
  servisSurumu: string;
}

export interface VeriKaynagi {
  mahalleleriGetir(): Promise<Mahalle[]>;
  tipolojiGetir(mahalleler: Mahalle[]): Promise<TipolojiSonucu>;
  projeksiyonGetir(mahalleler: Mahalle[], ufuk: number): Promise<ProjeksiyonSonucu>;
}

// ========== Statik Kaynak ==========

export class StatikKaynak implements VeriKaynagi {
  async mahalleleriGetir(): Promise<Mahalle[]> {
    const cevap = await fetch('/veri.json');
    if (!cevap.ok) {
      throw new Error(`Veri dosyasi yuklenemedi: ${cevap.status} ${cevap.statusText}`);
    }
    return cevap.json() as Promise<Mahalle[]>;
  }

  async tipolojiGetir(mahalleler: Mahalle[]): Promise<TipolojiSonucu> {
    const sonuclar: TipolojiSonucItem[] = mahalleler.map(m => ({
      ad: m.ad,
      tipoloji: m.ai_onbellek.tipoloji,
    }));
    const uretimZamani = mahalleler.length > 0 ? mahalleler[0].ai_onbellek._uretim_zamani : '';
    const servisSurumu = mahalleler.length > 0 ? mahalleler[0].ai_onbellek._servis_surumu : '';
    return {
      guncel: false,
      sonuclar,
      uretimZamani,
      servisSurumu,
    };
  }

  async projeksiyonGetir(mahalleler: Mahalle[], ufuk: number): Promise<ProjeksiyonSonucu> {
    // ufuk parametresi statik onbellegi etkilemez; yalnizca arayuz uyumlulugu icin kabul edilir
    const sonuclar: ProjeksiyonSonucItem[] = mahalleler.map(m => {
      const giris = Object.entries(m.ai_onbellek.projeksiyon_nufus)[0];
      const [yilStr, tahminiNufus] = giris;
      return {
        ad: m.ad,
        tahminiNufus,
        hedefYil: parseInt(yilStr, 10),
      };
    });
    const uretimZamani = mahalleler.length > 0 ? mahalleler[0].ai_onbellek._uretim_zamani : '';
    const servisSurumu = mahalleler.length > 0 ? mahalleler[0].ai_onbellek._servis_surumu : '';
    return {
      guncel: false,
      sonuclar,
      uretimZamani,
      servisSurumu,
    };
  }
}

// ========== Servis Kaynak ==========

export class ServisKaynak implements VeriKaynagi {
  private yedek: StatikKaynak;

  constructor(
    private tabanUrl: string = 'http://localhost:8000',
    private zamanAsimiMs: number = 2000
  ) {
    this.yedek = new StatikKaynak();
  }

  async mahalleleriGetir(): Promise<Mahalle[]> {
    return this.yedek.mahalleleriGetir();
  }

  async tipolojiGetir(mahalleler: Mahalle[]): Promise<TipolojiSonucu> {
    try {
      // Nufus yogunlugunu yerlesim zarf alani (zarf_alan_km2) uzerinden hesapla
      const yogunluklar = mahalleler.map(m => m.nufus / m.zarf_alan_km2);
      const olceklenmis = olcekleMaruziyet(yogunluklar, ayarlar.maruziyet_alt_siniri);

      const govdeMahalleler = mahalleler.map((m, i) => ({
        ad: m.ad,
        yesil_alan_orani: m.yesil_alan_orani,
        bina_yogunlugu: m.bina_yogunlugu,
        olceklenmis_maruziyet: olceklenmis[i],
      }));

      const govde = {
        mahalleler: govdeMahalleler,
        kume_sayisi: ayarlar.kumeleme_kume_sayisi,
      };

      const veri = await this.istekYap('/tipoloji', govde);
      const sonuclar = (veri.sonuclar as Array<{ ad: string; tipoloji: number }>).map(s => ({
        ad: s.ad,
        tipoloji: s.tipoloji,
      }));

      return {
        guncel: true,
        sonuclar,
        uretimZamani: new Date().toISOString(),
        servisSurumu: veri.servis_surumu as string,
      };
    } catch {
      // Canli servis erisilemezse statik onbellege duser
      return this.yedek.tipolojiGetir(mahalleler);
    }
  }

  async projeksiyonGetir(mahalleler: Mahalle[], ufuk: number): Promise<ProjeksiyonSonucu> {
    try {
      const govde = {
        mahalleler: mahalleler.map(m => ({ ad: m.ad, nufus_serisi: m.nufus_serisi })),
        ufuk_yil: ufuk,
      };

      const veri = await this.istekYap('/projeksiyon', govde);
      const sonuclar = (
        veri.sonuclar as Array<{ ad: string; tahmini_nufus: number; hedef_yil: number }>
      ).map(s => ({
        ad: s.ad,
        tahminiNufus: s.tahmini_nufus,
        hedefYil: s.hedef_yil,
      }));

      return {
        guncel: true,
        sonuclar,
        uretimZamani: new Date().toISOString(),
        servisSurumu: veri.servis_surumu as string,
      };
    } catch {
      return this.yedek.projeksiyonGetir(mahalleler, ufuk);
    }
  }

  /**
   * JSON POST istegi atar, zaman asimi uygular ve temel hata kontrollerini yapar.
   * Basari durumunda ayrismis JSON yanitini dondurur; aksi halde hata firlatir.
   */
  private async istekYap(endpoint: string, body: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const zamanAsimi = setTimeout(() => controller.abort(), this.zamanAsimiMs);

    try {
      const cevap = await fetch(`${this.tabanUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(zamanAsimi);

      if (!cevap.ok) {
        throw new Error(`Servis hatasi: ${cevap.status} ${cevap.statusText}`);
      }

      const veri: unknown = await cevap.json();
      if (veri && typeof veri === 'object' && 'hata' in veri) {
        throw new Error(`Servis hatasi: ${(veri as Record<string, unknown>).hata}`);
      }

      return veri as Record<string, unknown>;
    } catch (e) {
      clearTimeout(zamanAsimi);
      throw e;
    }
  }
}

// ========== Fabrika ==========

export function varsayilanVeriKaynagi(): VeriKaynagi {
  return new ServisKaynak();
}
