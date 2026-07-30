#!/usr/bin/env python3
"""
ARC-01 Veri Hazırlama Betiği
Başakşehir ilçesinin 10 konut mahallesi için:
- OSM Overpass API'den sınır poligonu, yeşil alan oranı ve bina yoğunluğu ölçümü yapar.
- Yerleşim zarfı (REQ-F-24) kullanarak payda olarak mahalle alanı yerine zarf alanını kullanır.
- TÜİK nüfus verisiyle birleştirir (veri/nufus.json, sadece okunur, değiştirilmez).
- AI servisine (ARC-05) tek seferlik çağrı yapmayı dener ve sonucu ai_onbellek alanına yazar.
- veri/veri.json çıktısını atomik olarak üretir.
- Overpass ham yanıtlarını `veri/.onbellek/` altında önbelleğe alır.

BU BETİK SKOR HESAPLAMAZ. Tehlike, maruziyet, risk formülleri ARC-04'tedir.
"""

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Union

import requests
from shapely.geometry import Point, Polygon, MultiPolygon, shape, box
from shapely.ops import transform, unary_union
from shapely import STRtree
import pyproj
from osm2geojson import json2geojson

# ---------------------------------------------------------------------------
# Modül seviyesinde sabitler
# ---------------------------------------------------------------------------

# İlçe bulma sorgusu – her çalıştırmada tekrar çalıştırılır, sonuç sabit gömülmez
ILCE_ADMIN_LEVEL = "6"
ILCE_ADI = "Başakşehir"

# OSM'de ilçe alanı relation ID -> Overpass alan ID'si dönüşümü:
# area(3600000000 + <relation_id>)
AREA_BASE = 3600000000

# Mahalle relation'ları içinde admin_level=8 kullanılır (admin_level=10 Başakşehir'de sıfır sonuç döner)
MAHALLE_ADMIN_LEVEL = "8"

# REQ-F-01: kapsam dışı bırakılacak mahalle adı (OSM tags.name)
DISLANAN_MAHALLE_ADLARI = {"İkitelli OSB Mahallesi"}

# Overpass yansı sunucuları (REQ-F-15, REQ-NF-04)
MIRROR_SUNUCULAR = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# HTTP istekleri için User-Agent – varsayılan requests UA'si 406 döndürür
HEADERS = {"User-Agent": "basaksehir-heat-island-veri-topla/1.0"}

# Doğal=tree düğümleri için sabit taç yarıçapı (REQ-F-02)
# Ortalama kentsel ağaç taç yarıçapı yaklaşık 3 m (~28 m²/ağaç).
AGAC_TAC_YARICAPI_M = 3.0

# REQ-F-02: yesil alan poligon etiketleri (way + relation, ikisi de sorgulanir).
# natural=tree ayri ele alinir: nokta geometrisi, asagida node sorgusu var.
YESIL_POLIGON_ETIKETLERI = [
    ("leisure", "park"),
    ("leisure", "garden"),
    ("leisure", "nature_reserve"),
    ("boundary", "national_park"),
    ("landuse", "forest"),
    ("landuse", "grass"),
    ("landuse", "meadow"),
    ("landuse", "cemetery"),
    ("natural", "wood"),
    ("natural", "scrub"),
    ("natural", "grassland"),
    ("natural", "heath"),
]

# Yesil kumeye eslesme kontrolu icin tum etiketler (tree dahil, tree node olarak
# ayrica ele alinir ama siniflandirma fonksiyonunda tutarlilik icin burada da yer alir).
YESIL_ETIKET_SETI = set(YESIL_POLIGON_ETIKETLERI) | {("natural", "tree")}


def yesil_etiket_mi(tags: dict) -> bool:
    """Verilen OSM tags sozlugunun REQ-F-02 yesil alan kumesine girip girmedigini dondurur."""
    return any(tags.get(anahtar) == deger for anahtar, deger in YESIL_ETIKET_SETI)


# REQ-F-02 notu: bilincli olarak DISARIDA birakilan etiketler (gereksinim-analizi.md,
# "REQ-F-02 etiket kumesi notu" bolumu):
#   leisure=pitch (289 adet)         -> spor sahalarinin cogu sentetik/sert zemin
#   leisure=playground (226 adet)    -> zemin genelde kaucuk veya kum
#   leisure=swimming_pool (220 adet) -> su yuzeyi bitki ortusu degil
#   landuse=farmland (49 adet)       -> gecirimli ama yazin ciplak, mudahale (agaclandirma)
#                                        hedefi degil
# Bu dortlu unutulmus DEGIL, bilincli modelleme karariyla disarida birakilmistir.

# Projeksiyon: WGS84'ten UTM 35N'ye (EPSG:32635) – İstanbul bölgesi için uygun
CRS_GIRD = "EPSG:4326"
CRS_CIKI = "EPSG:32635"

# AI servisi varsayılan URL'si (ortam değişkeninden okunabilir, kodu gömülmez)
VARSAYILAN_AI_SERVIS_URL = "http://localhost:8000"
AI_TIMEOUT_SANIYE = 20  # ARC-01 tek seferlik offline betik; REQ-NF-01'in ARC-06
                         # (canli arayuz) icin gecerli 2 sn butcesiyle karistirilmamali,
                         # burada kullanici beklemiyor, soguk baslangicta Flask+sklearn
                         # 2-4 sn surebiliyor

# Denemeler arası artan bekleme (tekrarlanan Overpass çağrıları için)
DENEME_FAKTORU = 8

# ---------------------------------------------------------------------------
# Yardımcı fonksiyonlar
# ---------------------------------------------------------------------------

TURKCE_KUCULT_TABLO = str.maketrans({
    "İ": "i", "I": "i", "ı": "i",
    "Ş": "s", "ş": "s",
    "Ğ": "g", "ğ": "g",
    "Ü": "u", "ü": "u",
    "Ö": "o", "ö": "o",
    "Ç": "c", "ç": "c",
})


def ad_normallestir(ad: str) -> str:
    """
    Mahalle adını eşleştirme için normalleştirir:
    - ' Mahallesi' / ' Mah.' son eklerini temizler
    - Türkçe harf katlaması yapar
    - Küçük harfe çevirir
    - Fazla boşlukları sıkıştırır
    """
    temiz = ad.strip()
    for ek in [" Mahallesi", " Mah."]:
        if temiz.endswith(ek):
            temiz = temiz[: -len(ek)]
            break
    temiz = temiz.translate(TURKCE_KUCULT_TABLO)
    temiz = temiz.lower()
    # Fazla boşlukları tek boşluğa indir
    temiz = " ".join(temiz.split())
    return temiz


def projeksiyon_transformatörü() -> pyproj.Transformer:
    """WGS84 -> UTM 35N dönüşümü yapan transformer nesnesi."""
    return pyproj.Transformer.from_crs(CRS_GIRD, CRS_CIKI, always_xy=True)


def projeksiyon_transformatoru_ters() -> pyproj.Transformer:
    """UTM 35N -> WGS84 dönüşümü yapan ters transformer nesnesi."""
    return pyproj.Transformer.from_crs(CRS_CIKI, CRS_GIRD, always_xy=True)


def geometri_alani_m2(geom_4326, transformer: pyproj.Transformer) -> float:
    """
    Verilen shapely geometrisini (EPSG:4326) EPSG:32635'e çevirir ve
    metre kare cinsinden alanını döndürür.
    """
    if geom_4326 is None or geom_4326.is_empty:
        return 0.0
    projekte = transform(transformer.transform, geom_4326)
    return projekte.area


def overpass_sorgula(sorgu: str, deneme_sayisi: int = 5, onbellek_yok: bool = False) -> dict:
    """
    Overpass API'ye sorgu gönderir, aynalı sunucular arasında geçiş yapar,
    artan beklemeyle yeniden dener. Ham JSON yanıtlarını veri/.onbellek/ altında
    önbelleğe alır, böylece tekrar çalıştırmalarda ağ çağrısı yapılmaz.
    Tüm denemeler başarısız olursa anlaşılır bir hata mesajıyla RuntimeError
    fırlatır (REQ-F-15).
    """
    onbellek_dizini = os.path.join("veri", ".onbellek")
    sorgu_hash = hashlib.sha256(sorgu.encode("utf-8")).hexdigest()
    onbellek_dosya = os.path.join(onbellek_dizini, f"{sorgu_hash}.json")

    # Önbellek kontrolü
    if not onbellek_yok:
        if os.path.exists(onbellek_dosya):
            try:
                with open(onbellek_dosya, "r", encoding="utf-8") as f:
                    onbellek_veri = json.load(f)
                cekilme_zamani_str = onbellek_veri["cekilme_zamani"]
                cekilme_zamani = datetime.fromisoformat(cekilme_zamani_str)
                simdi = datetime.now(timezone.utc)
                fark = simdi - cekilme_zamani
                if fark.days > 0:
                    yas_aciklamasi = f"{fark.days} gun"
                elif fark.seconds >= 3600:
                    yas_aciklamasi = f"{fark.seconds // 3600} saat"
                else:
                    dakika = max(1, fark.seconds // 60)
                    yas_aciklamasi = f"{dakika} dakika"
                print(
                    f"    Onbellekten okunuyor (cekilme: {cekilme_zamani_str}, {yas_aciklamasi} once)",
                    file=sys.stderr,
                )
                return onbellek_veri["yanit"]
            except Exception as e:
                print(f"    Onbellek dosyasi okunamadi ({e}), yeniden aga gidiliyor.", file=sys.stderr)

    # Ağ denemeleri
    son_hatalar = []
    for deneme in range(deneme_sayisi):
        for sunucu in MIRROR_SUNUCULAR:
            try:
                resp = requests.post(
                    sunucu,
                    data=sorgu.encode("utf-8"),
                    headers=HEADERS,
                    timeout=280,  # sorgu icindeki en yuksek [timeout:N] degerinden buyuk olmali
                )
                if resp.status_code == 200:
                    try:
                        yanit_veri = resp.json()
                    except Exception as e:
                        hata_msj = f"Sunucu {sunucu}: JSON ayrıştırma hatası ({e})"
                        son_hatalar.append(hata_msj)
                        print(f"    Deneme {deneme + 1}/{deneme_sayisi}: {hata_msj}",
                              file=sys.stderr)
                        continue

                    # Başarılı yanıtı önbelleğe yaz (onbellek_yok olsa da yaz)
                    try:
                        os.makedirs(onbellek_dizini, exist_ok=True)
                        onbellek_icerik = {
                            "cekilme_zamani": datetime.now(timezone.utc).isoformat(),
                            "yanit": yanit_veri,
                        }
                        with open(onbellek_dosya, "w", encoding="utf-8") as f:
                            json.dump(onbellek_icerik, f, ensure_ascii=False, indent=2)
                    except Exception as e:
                        print(f"UYARI: Onbellek dosyasina yazilamadi: {e}", file=sys.stderr)

                    return yanit_veri
                else:
                    # HTTP != 200 (504, 429 vs.) yeniden denenecek
                    hata_msj = f"Sunucu {sunucu}: HTTP {resp.status_code}"
                    son_hatalar.append(hata_msj)
                    print(f"    Deneme {deneme + 1}/{deneme_sayisi}: {hata_msj}",
                          file=sys.stderr)
            except requests.RequestException as e:
                hata_msj = f"Sunucu {sunucu}: {e}"
                son_hatalar.append(hata_msj)
                print(f"    Deneme {deneme + 1}/{deneme_sayisi}: {hata_msj}",
                      file=sys.stderr)

        # Beklenecek süre: her denemede artar, son deneme sonrası bekleme yok
        if deneme < deneme_sayisi - 1:
            bekle = DENEME_FAKTORU * (deneme + 1)
            time.sleep(bekle)

    # Tüm denemeler tükendi
    raise RuntimeError(
        "Overpass API'ye erişilemedi. Tüm denemeler başarısız oldu.\n"
        f"Sorgu (ilk 200 karakter): {sorgu[:200]}\n"
        f"Son hatalar:\n  " + "\n  ".join(son_hatalar[-5:])
    )


def osm_to_geometri(data: dict) -> object:
    """
    Overpass 'out geom' JSON yanıtını osm2geojson ile GeoJSON'a çevirir,
    ilk özelliğin geometrisini shapely nesnesine dönüştürür.
    Çoklu özellik olmadığı durumda FeatureCollection olarak işlenir.
    """
    gj = json2geojson(data)
    if gj["type"] == "FeatureCollection":
        if len(gj["features"]) == 0:
            raise ValueError("Boş FeatureCollection döndü")
        return shape(gj["features"][0]["geometry"])
    else:
        return shape(gj["geometry"])


def ayarlari_yukle() -> Tuple[float, int, int, float, float]:
    """
    web/src/ayarlar.json dosyasindan yerlesim zarfi tampon yaricapini (R metre),
    kumeleme_kume_sayisi, projeksiyon_ufku_yil, maruziyet_alt_siniri ve izgara
    hucre boyutunu (izgara_hucre_metre) okur.
    Dosya veya anahtar mevcut degilse acik bir hata basar, cagiran main()'in
    return 1 ile durmasi beklenir.
    """
    ayar_yolu = os.path.join("web", "src", "ayarlar.json")
    try:
        with open(ayar_yolu, "r", encoding="utf-8") as f:
            ayarlar = json.load(f)
    except Exception as e:
        raise RuntimeError(f"ayarlar.json dosyasi okunamadi: {e}")

    r_metre = ayarlar.get("yerlesim_zarfi_r_metre")
    if r_metre is None:
        raise RuntimeError("ayarlar.json icinde 'yerlesim_zarfi_r_metre' anahtari bulunamadi")
    if not isinstance(r_metre, (int, float)) or r_metre <= 0:
        raise RuntimeError("yerlesim_zarfi_r_metre pozitif bir sayi olmalidir")

    kume_sayisi = ayarlar.get("kumeleme_kume_sayisi")
    if kume_sayisi is None:
        raise RuntimeError("ayarlar.json icinde 'kumeleme_kume_sayisi' anahtari bulunamadi")
    if not isinstance(kume_sayisi, int) or kume_sayisi < 2:
        raise RuntimeError("kumeleme_kume_sayisi en az 2 olan bir tam sayi olmalidir")

    ufuk_yil = ayarlar.get("projeksiyon_ufku_yil")
    if ufuk_yil is None:
        raise RuntimeError("ayarlar.json icinde 'projeksiyon_ufku_yil' anahtari bulunamadi")
    if not isinstance(ufuk_yil, int) or ufuk_yil < 1:
        raise RuntimeError("projeksiyon_ufku_yil pozitif bir tam sayi olmalidir")

    alt_sinir = ayarlar.get("maruziyet_alt_siniri")
    if alt_sinir is None:
        raise RuntimeError("ayarlar.json icinde 'maruziyet_alt_siniri' anahtari bulunamadi")
    if not isinstance(alt_sinir, (int, float)) or alt_sinir < 0 or alt_sinir > 1:
        raise RuntimeError("maruziyet_alt_siniri 0 ile 1 arasinda bir sayi olmalidir")

    izgara_metre = ayarlar.get("izgara_hucre_metre")
    if izgara_metre is None:
        raise RuntimeError("ayarlar.json icinde 'izgara_hucre_metre' anahtari bulunamadi")
    if not isinstance(izgara_metre, (int, float)) or izgara_metre <= 0:
        raise RuntimeError("izgara_hucre_metre pozitif bir sayi olmalidir")

    return float(r_metre), kume_sayisi, ufuk_yil, float(alt_sinir), float(izgara_metre)


def yerlesim_zarfi_hesapla(bina_geometrileri: list, sinir_geom_m2, r_metre: float):
    """
    Bina poligonlarini (EPSG:32635) r_metre buffer ile tamponlar, birlesimini alir,
    mahalle siniriyla keser. Zarf geometrisini dondurur.
    bina_geometrileri bossa bos bir Polygon dondurur.
    """
    if not bina_geometrileri:
        return Polygon()
    tum_binalar = unary_union(bina_geometrileri)
    tamponlanmis = tum_binalar.buffer(r_metre)
    zarf = tamponlanmis.intersection(sinir_geom_m2)
    return zarf


def bina_yesil_oranlari_hesapla(
    geojson_fc: dict,
    mahalle_alani_m2: float,
    transformer: pyproj.Transformer,
    sinir_geom_m2,  # EPSG:32635'te mahalle siniri poligonu
    r_metre: float,
) -> tuple:
    """
    Overpass'tan dönen bina/yesil alan FeatureCollection'ini isler.

    Artik payda mahalle alani degil, yerlesim zarfidir (REQ-F-24).
    Zarf, bina poligonlarinin bufffer, birlesim ve sinirla kesilmesiyle
    olusturulur. Yesil alan orani ve bina yogunlugu zarf alanina oranlanir.

    Dönüş:
      (bina_orani, yesil_orani, zarf_alani_m2,
       bina_birlesimi_sinir_ici, yesil_birlesimi, zarf_geom,
       bina_geometrileri_ham, yesil_geometrileri_ham)
    Sifir zarf alani durumunda ValueError firlatir.
    """
    if mahalle_alani_m2 <= 0:
        return 0.0, 0.0, 0.0, Polygon(), MultiPolygon(), Polygon(), [], []

    bina_geometrileri_ham = []  # ham projekte bina poligonlari (kırpılmamış)
    yesil_geometrileri_ham = []  # ham projekte yesil poligonlar (kırpılmamış)

    for feature in geojson_fc.get("features", []):
        try:
            tags = feature.get("properties", {}).get("tags", {}) or {}
            geom = feature.get("geometry")
            if geom is None or geom.get("coordinates") is None:
                continue

            shapely_geom = shape(geom)
            if shapely_geom is None or shapely_geom.is_empty:
                continue

            # Dogal=tree node: tamponla, kırpma henüz yapılmaz
            if geom["type"] == "Point" and tags.get("natural") == "tree":
                projekte = transform(transformer.transform, shapely_geom)
                tampon = projekte.buffer(AGAC_TAC_YARICAPI_M)
                yesil_geometrileri_ham.append(tampon)
                continue

            # Polygon veya MultiPolygon olmayan geometriler sessizce atlanir
            if not isinstance(shapely_geom, (Polygon, MultiPolygon)):
                continue

            projekte = transform(transformer.transform, shapely_geom)

            # Gruplandirma – simdi sadece biriktir, kırpma sonra
            if tags.get("building") is not None:
                bina_geometrileri_ham.append(projekte)
            elif yesil_etiket_mi(tags):
                yesil_geometrileri_ham.append(projekte)
            # Digerleri gormezden gelinir

        except Exception as e:
            print(f"    UYARI: bir feature islenemedi, atlaniyor: {e}", file=sys.stderr)
            continue

    # Bina birlesimi ve sinir icindeki alan (çakışmaları önlemek için union)
    if bina_geometrileri_ham:
        bina_birlesimi = unary_union(bina_geometrileri_ham)
        bina_birlesimi_sinir_ici = bina_birlesimi.intersection(sinir_geom_m2)
    else:
        bina_birlesimi_sinir_ici = Polygon()

    # Yerleşim zarfı
    zarf_geom = yerlesim_zarfi_hesapla(bina_geometrileri_ham, sinir_geom_m2, r_metre)
    zarf_alani_m2 = zarf_geom.area

    if zarf_alani_m2 <= 0:
        raise ValueError("zarf alani sifir, bina bulunamadi veya gecersiz zarf")

    # Bina yogunlugu (zarf icindeki bina alani / zarf alani)
    bina_orani_ham = bina_birlesimi_sinir_ici.intersection(zarf_geom).area / zarf_alani_m2

    # Yesil alan orani
    if yesil_geometrileri_ham:
        yesil_birlesimi = unary_union(yesil_geometrileri_ham)
        yesil_icerigi = yesil_birlesimi.intersection(zarf_geom)
        yesil_orani_ham = yesil_icerigi.area / zarf_alani_m2
    else:
        yesil_birlesimi = MultiPolygon()
        yesil_orani_ham = 0.0

    # Ham değerleri stderr'a yaz
    print(
        f"    [ham, kirpma oncesi] yesil={yesil_orani_ham:.6f} bina={bina_orani_ham:.6f}",
        file=sys.stderr,
    )
    if bina_orani_ham > 1.0 + 1e-6 or yesil_orani_ham > 1.0 + 1e-6:
        print(
            "    UYARI: kirpma devreye girdi, oran 1.0'i asti, altta hesap hatasi olabilir",
            file=sys.stderr,
        )

    bina_orani = min(1.0, bina_orani_ham)
    yesil_orani = min(1.0, yesil_orani_ham)
    return (
        bina_orani,
        yesil_orani,
        zarf_alani_m2,
        bina_birlesimi_sinir_ici,
        yesil_birlesimi,
        zarf_geom,
        bina_geometrileri_ham,
        yesil_geometrileri_ham,
    )


def izgara_uret_ve_olc(
    zarf_geom,
    bina_geometrileri_ham: list,
    yesil_geometrileri_ham: list,
    transformer_ters: pyproj.Transformer,
    hucre_metre: float = 100.0,
) -> List[dict]:
    """
    Yerlesim zarfini kaplayan duzgun bir izgara (grid) uretir ve her hucre icin
    yesil alan orani ile bina yogunlugunu ham olcum olarak hesaplar.

    Dikkat: Bu fonksiyon TEHLIKE/RISK SKORU HESAPLAMAZ, sadece ham oran uretir.
    Formul web/src/skor.ts'dedir.
    """
    # Zarf bos veya gecersiz ise bos liste don
    if zarf_geom.is_empty or zarf_geom.area <= 0:
        return []

    # Bounding box uzerinden duzgun izgara olustur
    minx, miny, maxx, maxy = zarf_geom.bounds
    hucreler = []

    # STRtree indekslerini dongu disinda bir kez kur (performans)
    bina_tree = STRtree(bina_geometrileri_ham) if bina_geometrileri_ham else None
    yesil_tree = STRtree(yesil_geometrileri_ham) if yesil_geometrileri_ham else None

    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            # Hucre aday kutusu
            hucre_kutusu = box(x, y, x + hucre_metre, y + hucre_metre)
            kesisim = hucre_kutusu.intersection(zarf_geom)

            if kesisim.is_empty:
                y += hucre_metre
                continue

            # Kenar dilimi gurultu esigi: nominal alanin %10'undan az alanli hucreleri atla
            if kesisim.area < 0.10 * (hucre_metre ** 2):
                y += hucre_metre
                continue

            kesisim_alani = kesisim.area
            if kesisim_alani <= 0.0:
                y += hucre_metre
                continue

            # Bina yogunlugu hesapla
            bina_alani = 0.0
            if bina_tree is not None:
                # STRtree ile aday bul
                indeksler = bina_tree.query(kesisim)
                if len(indeksler) > 0:
                    aday_geoms = [bina_geometrileri_ham[i] for i in indeksler]
                    # Cakismalari onlemek icin union sonra intersection
                    bina_union = unary_union(aday_geoms)
                    bina_kes = bina_union.intersection(kesisim)
                    bina_alani = bina_kes.area

            bina_orani = bina_alani / kesisim_alani

            # Yesil alan orani hesapla
            yesil_alani = 0.0
            if yesil_tree is not None:
                indeksler = yesil_tree.query(kesisim)
                if len(indeksler) > 0:
                    aday_geoms = [yesil_geometrileri_ham[i] for i in indeksler]
                    yesil_union = unary_union(aday_geoms)
                    yesil_kes = yesil_union.intersection(kesisim)
                    yesil_alani = yesil_kes.area

            yesil_orani = yesil_alani / kesisim_alani

            # 1 ile sinirla
            bina_orani = min(1.0, bina_orani)
            yesil_orani = min(1.0, yesil_orani)

            # Geometriyi EPSG:4326'ya geri projekte et
            kesisim_4326 = transform(transformer_ters.transform, kesisim)

            hucre_verisi = {
                "sinir": kesisim_4326.__geo_interface__,
                "yesil_alan_orani": float(yesil_orani),
                "bina_yogunlugu": float(bina_orani),
            }
            hucreler.append(hucre_verisi)

            y += hucre_metre
        x += hucre_metre

    return hucreler


def olcekle_maruziyet(yogunluklar: List[float], alt_sinir: float) -> List[float]:
    """
    Nufus yogunluklarini min-max olcekleme ile [alt_sinir, 1] araligina ceker.
    web/src/skor.ts'teki olcekleMaruziyet fonksiyonunun birebir Python karsiligidir.
    REQ-F-08 olcekleme kuralina uyar: en dusuk yogunluk alt_sinir'i, en yuksek yogunluk 1'i alir.
    Tum degerler ayniysa (max == min) her mahalle icin 1 dondurur.
    """
    if not yogunluklar:
        raise ValueError("olcekle_maruziyet: bos dizi ile cagrilamaz")
    min_val = min(yogunluklar)
    max_val = max(yogunluklar)
    if max_val == min_val:
        return [1.0] * len(yogunluklar)
    aralik = max_val - min_val
    return [alt_sinir + (1 - alt_sinir) * ((x - min_val) / aralik) for x in yogunluklar]


# ---------------------------------------------------------------------------
# Ana iş akışı
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="ARC-01 Veri Hazırlama Betiği")
    parser.add_argument(
        "--onbellek-yok",
        action="store_true",
        help="Overpass onbellegini yoksay, ham veriyi yeniden cek",
    )
    args = parser.parse_args()
    onbellek_yok = args.onbellek_yok

    # Yapılandırmayı yükle (yerleşim zarfı yarıçapı)
    try:
        r_metre, kume_sayisi, ufuk_yil, maruziyet_alt_siniri, izgara_hucre_metre = ayarlari_yukle()
        print(
            f"Yerlesim zarfi tampon yaricapi: {r_metre} m (kaynak: web/src/ayarlar.json)",
            file=sys.stderr,
        )
        print(
            f"Izgara hucre boyutu: {izgara_hucre_metre} m",
            file=sys.stderr,
        )
    except Exception as e:
        print(f"HATA: {e}", file=sys.stderr)
        return 1

    print("ARC-01 Veri Hazırlama Betiği başlatılıyor...")

    # 1. Nüfus verisini yükle (sadece okuma)
    nufus_yolu = os.path.join("veri", "nufus.json")
    try:
        with open(nufus_yolu, "r", encoding="utf-8") as f:
            nufus_verisi = json.load(f)
        nufus_mahalleler = nufus_verisi["mahalleler"]
    except Exception as e:
        print(f"HATA: nufus.json yüklenemedi: {e}", file=sys.stderr)
        return 1

    # Nüfus anahtarlarını normalleştirilmiş halde tut (eşleştirme için)
    nufus_norm_anahtarlar = {ad_normallestir(k): k for k in nufus_mahalleler.keys()}

    # 2. Coğrafi dönüşüm nesneleri
    transformer = projeksiyon_transformatörü()
    transformer_ters = projeksiyon_transformatoru_ters()

    # 3. İlçe relation ID'sini bul
    print("İlçe relation ID'si sorgulanıyor...")
    ilce_sorgu = (
        '[out:json][timeout:60];\n'
        f'rel["boundary"="administrative"]["admin_level"="{ILCE_ADMIN_LEVEL}"]'
        f'["name"="{ILCE_ADI}"];\n'
        'out tags;'
    )
    try:
        ilce_cevap = overpass_sorgula(ilce_sorgu, onbellek_yok=onbellek_yok)
    except RuntimeError as e:
        print(f"HATA: İlçe sorgusu başarısız: {e}", file=sys.stderr)
        return 1

    ilce_elemanlar = ilce_cevap.get("elements", [])
    if len(ilce_elemanlar) != 1:
        print(f"HATA: Beklenen tek ilçe relation'ı bulunamadı, {len(ilce_elemanlar)} sonuç döndü.",
              file=sys.stderr)
        return 1
    ilce_rel = ilce_elemanlar[0]
    ilce_relation_id = ilce_rel["id"]
    print(f"  İlçe relation ID: {ilce_relation_id} (admin_level={ILCE_ADMIN_LEVEL})")

    # 4. Mahalle relation'larını bul
    print("Mahalle relation'ları bulunuyor...")
    mahalle_sorgu = (
        f'[out:json][timeout:120];\n'
        f'area({AREA_BASE + ilce_relation_id})->.ilce;\n'
        f'rel(area.ilce)["boundary"="administrative"]["admin_level"="{MAHALLE_ADMIN_LEVEL}"];\n'
        'out tags;'
    )
    try:
        mahalle_cevap = overpass_sorgula(mahalle_sorgu, onbellek_yok=onbellek_yok)
    except RuntimeError as e:
        print(f"HATA: Mahalle sorgusu başarısız: {e}", file=sys.stderr)
        return 1

    mahalle_rel_listesi = mahalle_cevap.get("elements", [])
    print(f"  Ham sonuç: {len(mahalle_rel_listesi)} mahalle")

    # Disleme ve kontrol
    mahalleler_gecerli = []
    for rel in mahalle_rel_listesi:
        ad = rel.get("tags", {}).get("name", "")
        if ad in DISLANAN_MAHALLE_ADLARI:
            print(f"  Kapsam dışı: {ad} (REQ-F-01)")
            continue
        mahalleler_gecerli.append(rel)

    if len(mahalleler_gecerli) != 10:
        print(f"HATA: Kapsam dışı elemeden sonra {len(mahalleler_gecerli)} mahalle kaldı, "
              f"tam 10 olmalıydı. OSM verisi değişmiş olabilir. Betik durduruluyor.",
              file=sys.stderr)
        return 1

    print(f"  Geçerli mahalle sayısı: {len(mahalleler_gecerli)}")

    # 5. Her mahalleyi işle
    sonuclar: List[dict] = []
    izgara_sonuclari: Dict[str, dict] = {}


    for sira, rel in enumerate(mahalleler_gecerli, start=1):
        mahalle_id = rel["id"]
        osm_ad = rel["tags"].get("name", "")
        print(f"\n[{sira}/10] {osm_ad} işleniyor (relation ID: {mahalle_id})")

        # -- 5a. Sınır poligonu çek ve alanı hesapla
        sinir_sorgu = (
            f'[out:json][timeout:180];\n'
            f'relation({mahalle_id});\n'
            'out geom;'
        )
        try:
            sinir_veri = overpass_sorgula(sinir_sorgu, onbellek_yok=onbellek_yok)
        except RuntimeError as e:
            print(f"HATA: '{osm_ad}' sınır sorgusu başarısız: {e}", file=sys.stderr)
            return 1

        try:
            sinir_geom = osm_to_geometri(sinir_veri)
        except Exception as e:
            print(f"HATA: '{osm_ad}' sınır geometrisi işlenemedi: {e}", file=sys.stderr)
            return 1

        # Koordinat sistemini GeoJSON olarak sakla (Polygon/MultiPolygon)
        sinir_gj = sinir_geom.__geo_interface__  # type: ignore

        # Alan (km2)
        alan_m2 = geometri_alani_m2(sinir_geom, transformer)
        alan_km2 = alan_m2 / 1e6
        print(f"  Alan: {alan_km2:.2f} km²")

        # -- 5b. Bina ve yeşil alan sorgusu
        yesil_sorgu_satirlari = []
        for anahtar, deger in YESIL_POLIGON_ETIKETLERI:
            yesil_sorgu_satirlari.append(f'  way["{anahtar}"="{deger}"](area.m);')
            yesil_sorgu_satirlari.append(f'  relation["{anahtar}"="{deger}"](area.m);')
        yesil_sorgu_blok = "\n".join(yesil_sorgu_satirlari)

        bina_yesil_sorgu = (
            f'[out:json][timeout:240];\n'
            f'area({AREA_BASE + mahalle_id})->.m;\n'
            '(\n'
            '  way["building"](area.m);\n'
            '  relation["building"]["type"="multipolygon"](area.m);\n'
            f'{yesil_sorgu_blok}\n'
            '  node["natural"="tree"](area.m);\n'
            ');\n'
            'out geom;'
        )
        try:
            bina_yesil_veri = overpass_sorgula(bina_yesil_sorgu, onbellek_yok=onbellek_yok)
        except RuntimeError as e:
            print(f"HATA: '{osm_ad}' bina/yeşil alan sorgusu başarısız: {e}", file=sys.stderr)
            return 1

        try:
            gjson_fc = json2geojson(bina_yesil_veri)
        except Exception as e:
            print(f"HATA: '{osm_ad}' bina/yeşil verisi GeoJSON'a çevrilemedi: {e}", file=sys.stderr)
            return 1

        sinir_geom_projekte = transform(transformer.transform, sinir_geom)

        # Sınır geçerlilik kontrolü (REQ-F-15, F-17)
        if not sinir_geom_projekte.is_valid:
            print(
                f"  UYARI: '{osm_ad}' sinir geometrisi gecersiz, buffer(0) ile onarim deneniyor.",
                file=sys.stderr,
            )
            sinir_geom_projekte = sinir_geom_projekte.buffer(0)
        if sinir_geom_projekte.is_empty or not sinir_geom_projekte.is_valid:
            print(
                f"HATA: '{osm_ad}' sinir geometrisi onarilamadi (gecersiz veya bos). "
                f"Betik durduruluyor.",
                file=sys.stderr,
            )
            return 1

        try:
            (
                bina_orani,
                yesil_orani,
                zarf_alani_m2,
                bina_birlesimi_sinir_ici,
                yesil_birlesimi,
                zarf_geom,
                bina_geometrileri_ham,
                yesil_geometrileri_ham,
            ) = bina_yesil_oranlari_hesapla(
                gjson_fc, alan_m2, transformer, sinir_geom_projekte, r_metre
            )
        except ValueError as e:
            print(f"HATA: '{osm_ad}' için yerlesim zarfi hesaplanamadi: {e}", file=sys.stderr)
            return 1

        print(f"  Yeşil alan oranı: {yesil_orani:.3f}, Bina yoğunluğu: {bina_orani:.3f}")
        zarf_alan_km2 = zarf_alani_m2 / 1e6
        print(f"  Yerlesim zarfi alani: {zarf_alan_km2:.4f} km2")

        # -- 5c. Ad eşleştirme
        norm_osm = ad_normallestir(osm_ad)
        if norm_osm not in nufus_norm_anahtarlar:
            print(f"HATA: '{osm_ad}' (norm: '{norm_osm}') nufus.json'da eşleşmedi.",
                  file=sys.stderr)
            print(f"  Mevcut nüfus anahtarları: {list(nufus_mahalleler.keys())}",
                  file=sys.stderr)
            return 1

        nufus_anahtar = nufus_norm_anahtarlar[norm_osm]
        # --- Izgara katmani (mahalle ici 100m x 100m grid) ---
        try:
            grid_hucreleri = izgara_uret_ve_olc(
                zarf_geom,
                bina_geometrileri_ham,
                yesil_geometrileri_ham,
                transformer_ters,
                hucre_metre=izgara_hucre_metre,
            )
            izgara_sonuclari[nufus_anahtar] = {
                "hucre_metre": izgara_hucre_metre,
                "hucreler": grid_hucreleri,
            }
            print(
                f"  Izgara: {len(grid_hucreleri)} hucre olusturuldu.",
                file=sys.stderr,
            )
        except Exception as e:
            print(
                f"HATA: '{osm_ad}' icin izgara olusturulamadi: {e}",
                file=sys.stderr,
            )
            return 1
        # ---------------------------------------------------------
        nufus_kaydi = nufus_mahalleler[nufus_anahtar]
        nufus = nufus_kaydi["guncel"]
        nufus_serisi = nufus_kaydi["seri"]

        # -- 5d. Ölçülen değerler ve çıktı inşası
        mahalle_nesnesi = {
            "ad": nufus_anahtar,
            "alan_km2": alan_km2,
            "zarf_alan_km2": zarf_alan_km2,
            "nufus": nufus,
            "nufus_serisi": nufus_serisi,
            "yesil_alan_orani": yesil_orani,
            "bina_yogunlugu": bina_orani,
            "sinir": sinir_gj,
            "ai_onbellek": {},
        }
        sonuclar.append(mahalle_nesnesi)

    # 6. AI Servisi çağrısı (dene, başarısızsa ai_onbellek boş kalır)
    ai_url = os.environ.get("AI_SERVIS_URL", VARSAYILAN_AI_SERVIS_URL)

    try:
        # Sağlık kontrolü
        print("\nAI Servisi çağrılıyor...")
        saglik_resp = requests.get(f"{ai_url}/saglik", timeout=AI_TIMEOUT_SANIYE)
        if saglik_resp.status_code != 200:
            raise ConnectionError(f"/saglik HTTP {saglik_resp.status_code}")
        saglik_veri = saglik_resp.json()
        servis_surumu = saglik_veri.get("servis_surumu", "bilinmiyor")
        print(f"  Servis sağlıklı, sürüm: {servis_surumu}")

        # Ham maruziyet yogunlugu hesapla (REQ-F-24: zarf alani kullan)
        yogunluklar_ham = []
        for m in sonuclar:
            if m["zarf_alan_km2"] > 0:
                yog = m["nufus"] / m["zarf_alan_km2"]
            else:
                yog = 0.0
            yogunluklar_ham.append(yog)

        # Maruziyet olcekleme (skor.ts ile ayni, REQ-F-08)
        olceklenmis_maruziyet = olcekle_maruziyet(yogunluklar_ham, maruziyet_alt_siniri)

        # Tipoloji isteği
        tipoloji_girdi = []
        for idx, m in enumerate(sonuclar):
            tipoloji_girdi.append({
                "ad": m["ad"],
                "yesil_alan_orani": m["yesil_alan_orani"],
                "bina_yogunlugu": m["bina_yogunlugu"],
                "olceklenmis_maruziyet": olceklenmis_maruziyet[idx],
            })
        tipoloji_resp = requests.post(
            f"{ai_url}/tipoloji",
            json={"mahalleler": tipoloji_girdi, "kume_sayisi": kume_sayisi},
            timeout=AI_TIMEOUT_SANIYE,
        )
        tipoloji_resp.raise_for_status()
        tipoloji_sonuc = tipoloji_resp.json()
        tipoloji_sonuclar = tipoloji_sonuc.get("sonuclar", [])
        tipoloji_by_ad = {item["ad"]: item["tipoloji"] for item in tipoloji_sonuclar}

        # Projeksiyon isteği
        proj_girdi = [{"ad": m["ad"], "nufus_serisi": m["nufus_serisi"]} for m in sonuclar]
        proj_resp = requests.post(
            f"{ai_url}/projeksiyon",
            json={"mahalleler": proj_girdi, "ufuk_yil": ufuk_yil},
            timeout=AI_TIMEOUT_SANIYE,
        )
        proj_resp.raise_for_status()
        proj_sonuc = proj_resp.json()
        proj_sonuclar = proj_sonuc.get("sonuclar", [])
        proj_by_ad = {}
        for item in proj_sonuclar:
            proj_by_ad[item["ad"]] = {
                "hedef_yil": item["hedef_yil"],
                "tahmini_nufus": item["tahmini_nufus"],
            }

        uretim_zamani = datetime.now(timezone.utc).isoformat()

        for m in sonuclar:
            ad = m["ad"]
            ai = {}
            if ad in tipoloji_by_ad:
                ai["tipoloji"] = tipoloji_by_ad[ad]
            if ad in proj_by_ad:
                ai["projeksiyon_nufus"] = {
                    str(proj_by_ad[ad]["hedef_yil"]): proj_by_ad[ad]["tahmini_nufus"]
                }
            if ai:
                ai["_uretim_zamani"] = uretim_zamani
                ai["_servis_surumu"] = servis_surumu
                m["ai_onbellek"] = ai
        print(f"  AI çıktıları {len([m for m in sonuclar if m['ai_onbellek']])} mahalleye yazıldı.")

    except Exception as e:
        print(f"UYARI: AI Servisi'ne erişilemedi ({e}), "
              f"ai_onbellek alanı boş bırakıldı (REQ-F-23).",
              file=sys.stderr)

    # 7. Atomik yazma (veri.json)
    cikti_yolu = os.path.join("veri", "veri.json")
    gecici_yol = cikti_yolu + ".tmp"
    try:
        with open(gecici_yol, "w", encoding="utf-8") as f:
            json.dump(sonuclar, f, ensure_ascii=False, indent=2)
        os.replace(gecici_yol, cikti_yolu)
        print(f"\nveri.json başarıyla yazıldı ({len(sonuclar)} mahalle).")
    except Exception as e:
        print(f"HATA: veri.json yazılamadı: {e}", file=sys.stderr)
        return 1

    # 8. Izgara (grid) verilerini atomik yaz
    cikti_yolu_izgara = os.path.join("veri", "izgara.json")
    gecici_yol_izgara = cikti_yolu_izgara + ".tmp"
    try:
        with open(gecici_yol_izgara, "w", encoding="utf-8") as f:
            json.dump(izgara_sonuclari, f, ensure_ascii=False, indent=2)
        os.replace(gecici_yol_izgara, cikti_yolu_izgara)
        print(f"izgara.json başarıyla yazıldı ({len(izgara_sonuclari)} mahalle).")
    except Exception as e:
        print(f"HATA: izgara.json yazılamadı: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
