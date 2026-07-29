#!/usr/bin/env python3
"""
ARC-01 Veri Hazırlama Betiği
Başakşehir ilçesinin 10 konut mahallesi için:
- OSM Overpass API'den sınır poligonu, yeşil alan oranı ve bina yoğunluğu ölçümü yapar.
- TÜİK nüfus verisiyle birleştirir (veri/nufus.json, sadece okunur, değiştirilmez).
- AI servisine (ARC-05) tek seferlik çağrı yapmayı dener ve sonucu ai_onbellek alanına yazar.
- veri/veri.json çıktısını atomik olarak üretir.

BU BETİK SKOR HESAPLAMAZ. Tehlike, maruziyet, risk formülleri ARC-04'tedir.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Union

import requests
from shapely.geometry import Point, Polygon, MultiPolygon, shape
from shapely.ops import transform, unary_union
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
AI_TIMEOUT_SANIYE = 2  # ARC-06'daki 2 saniyelik zaman aşımıyla tutarlı

# Projeksiyon ufuk yılı (ARC-10 henüz yok, fonksiyon varsayılanı)
PROJEKSIYON_UFUK_YIL = 5

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


def geometri_alani_m2(geom_4326, transformer: pyproj.Transformer) -> float:
    """
    Verilen shapely geometrisini (EPSG:4326) EPSG:32635'e çevirir ve
    metre kare cinsinden alanını döndürür.
    """
    if geom_4326 is None or geom_4326.is_empty:
        return 0.0
    projekte = transform(transformer.transform, geom_4326)
    return projekte.area


def overpass_sorgula(sorgu: str, deneme_sayisi: int = 5) -> dict:
    """
    Overpass API'ye sorgu gönderir, aynalı sunucular arasında geçiş yapar,
    artan beklemeyle yeniden dener. Tüm denemeler başarısız olursa
    anlaşılır bir hata mesajıyla RuntimeError fırlatır (REQ-F-15).
    """
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
                    return resp.json()
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


def bina_yesil_oranlari_hesapla(
    geojson_fc: dict,
    mahalle_alani_m2: float,
    transformer: pyproj.Transformer,
    sinir_geom_m2,  # EPSG:32635'te mahalle siniri poligonu (shapely geometri)
) -> Tuple[float, float]:
    """
    Overpass'tan dönen bina/yesil alan FeatureCollection'ini isler.

    Her geometri (bina ve yesil, agac tamponu dahil) projekte edildikten sonra
    mahalle sinirina (`sinir_geom_m2`) kirpilir. Bunun sebebi: Overpass'in
    `(area.m)` filtresi, sinirin bir kismi iceride olan nesnelerin TAM
    geometrisini döndürür; kirpma yapilmazsa sinir disindaki kisim hatali
    bicimde alan hesabina katilir.

    Bina alanlari kirpildiktan sonra toplanir. Yesil alanlar (poligonlar ve
    agac tac tamponlari) cakisabildigi icin once kirpilir, sonra unary_union
    ile birlestirilip birlesimin alani kullanilir.
    """
    if mahalle_alani_m2 <= 0:
        return 0.0, 0.0

    bina_alani_toplam = 0.0
    yesil_geometriler = []  # projekte edilmis (EPSG:32635) poligonlar, union icin

    for feature in geojson_fc.get("features", []):
        try:
            tags = feature.get("properties", {}).get("tags", {}) or {}
            geom = feature.get("geometry")
            if geom is None or geom.get("coordinates") is None:
                continue

            shapely_geom = shape(geom)
            if shapely_geom is None or shapely_geom.is_empty:
                continue

            # Dogal=tree node: nokta geometrisi, alan yok, tampon uygula
            if geom["type"] == "Point" and tags.get("natural") == "tree":
                projekte = transform(transformer.transform, shapely_geom)
                tampon = projekte.buffer(AGAC_TAC_YARICAPI_M)
                kirpilmis = tampon.intersection(sinir_geom_m2)
                if kirpilmis.is_empty:
                    continue
                yesil_geometriler.append(kirpilmis)
                continue

            # Polygon veya MultiPolygon olmayan geometriler sessizce atlanir
            if not isinstance(shapely_geom, (Polygon, MultiPolygon)):
                continue

            projekte = transform(transformer.transform, shapely_geom)
            kirpilmis = projekte.intersection(sinir_geom_m2)
            if kirpilmis.is_empty:
                continue

            # Gruplandirma
            if tags.get("building") is not None:
                bina_alani_toplam += kirpilmis.area
            elif yesil_etiket_mi(tags):
                yesil_geometriler.append(kirpilmis)
            # Digerleri gormezden gelinir

        except Exception as e:
            print(f"    UYARI: bir feature islenemedi, atlaniyor: {e}", file=sys.stderr)
            continue

    if yesil_geometriler:
        # Cakisan yesil poligonlarin (park + icindeki cimenlik, agac + park govdesi gibi)
        # alani iki kez sayilmasin diye birlesim aliniyor, ham toplam degil.
        yesil_birlesimi = unary_union(yesil_geometriler)
        yesil_alani_toplam = yesil_birlesimi.area
    else:
        yesil_alani_toplam = 0.0

    bina_orani = min(1.0, bina_alani_toplam / mahalle_alani_m2)
    yesil_orani = min(1.0, yesil_alani_toplam / mahalle_alani_m2)
    return bina_orani, yesil_orani


# ---------------------------------------------------------------------------
# Ana iş akışı
# ---------------------------------------------------------------------------

def main():
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

    # 2. Coğrafi dönüşüm nesnesi
    transformer = projeksiyon_transformatörü()

    # 3. İlçe relation ID'sini bul
    print("İlçe relation ID'si sorgulanıyor...")
    ilce_sorgu = (
        '[out:json][timeout:60];\n'
        f'rel["boundary"="administrative"]["admin_level"="{ILCE_ADMIN_LEVEL}"]'
        f'["name"="{ILCE_ADI}"];\n'
        'out tags;'
    )
    try:
        ilce_cevap = overpass_sorgula(ilce_sorgu)
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
        mahalle_cevap = overpass_sorgula(mahalle_sorgu)
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
            sinir_veri = overpass_sorgula(sinir_sorgu)
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
        # REQ-F-02: genisletilmis yesil etiket kumesi icin dinamik union sorgu
        # type=multipolygon filtresi kaldırıldı: boundary=national_park gibi relation'lar
        # type=boundary taşıyabiliyor, osm2geojson etiket beyaz listesi üzerinden bu
        # relation'ları yine de poligona çeviriyor.
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
        # Not: Samlar Tabiat Parki gibi birden fazla etiket tasiyan objeler
        # Overpass union icinde type+id ile kumelendigi icin yalnizca bir kez
        # gorunur. Python tarafinda ekstra dedup gerekmiyor.
        try:
            bina_yesil_veri = overpass_sorgula(bina_yesil_sorgu)
        except RuntimeError as e:
            print(f"HATA: '{osm_ad}' bina/yeşil alan sorgusu başarısız: {e}", file=sys.stderr)
            return 1

        try:
            gjson_fc = json2geojson(bina_yesil_veri)
        except Exception as e:
            print(f"HATA: '{osm_ad}' bina/yeşil verisi GeoJSON'a çevrilemedi: {e}", file=sys.stderr)
            return 1

        sinir_geom_projekte = transform(transformer.transform, sinir_geom)
        bina_orani, yesil_orani = bina_yesil_oranlari_hesapla(
            gjson_fc, alan_m2, transformer, sinir_geom_projekte
        )
        print(f"  Yeşil alan oranı: {yesil_orani:.3f}, Bina yoğunluğu: {bina_orani:.3f}")

        # -- 5c. Ad eşleştirme
        norm_osm = ad_normallestir(osm_ad)
        if norm_osm not in nufus_norm_anahtarlar:
            print(f"HATA: '{osm_ad}' (norm: '{norm_osm}') nufus.json'da eşleşmedi.",
                  file=sys.stderr)
            print(f"  Mevcut nüfus anahtarları: {list(nufus_mahalleler.keys())}",
                  file=sys.stderr)
            return 1

        nufus_anahtar = nufus_norm_anahtarlar[norm_osm]
        nufus_kaydi = nufus_mahalleler[nufus_anahtar]
        nufus = nufus_kaydi["guncel"]
        nufus_serisi = nufus_kaydi["seri"]  # olduğu gibi taşınır

        # -- 5d. Ölçülen değerler ve çıktı inşası
        mahalle_nesnesi = {
            "ad": nufus_anahtar,
            "alan_km2": alan_km2,
            "nufus": nufus,
            "nufus_serisi": nufus_serisi,
            "yesil_alan_orani": yesil_orani,
            "bina_yogunlugu": bina_orani,
            "sinir": sinir_gj,
            "ai_onbellek": {}  # başlangıçta boş, AI çağrısı yapılabilirse doldurulacak
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

        # Tipoloji isteği
        tipoloji_girdi = []
        for m in sonuclar:
            # Nüfus yoğunluğu ham (kişi/km²)
            nufus_yog_ham = m["nufus"] / m["alan_km2"] if m["alan_km2"] > 0 else 0
            tipoloji_girdi.append({
                "ad": m["ad"],
                "yesil_alan_orani": m["yesil_alan_orani"],
                "bina_yogunlugu": m["bina_yogunlugu"],
                # NOT: ARC-05/ARC-06 kablolaması tamamlandığında bu özellik,
                # ARC-04'ün olcekleMaruziyet çıktısıyla değiştirilecek
                "nufus_yogunlugu_ham": nufus_yog_ham,
            })
        tipoloji_resp = requests.post(
            f"{ai_url}/tipoloji",
            json={"mahalleler": tipoloji_girdi},
            timeout=AI_TIMEOUT_SANIYE,
        )
        tipoloji_resp.raise_for_status()
        tipoloji_sonuc = tipoloji_resp.json()
        # Beklenen şema: {"tipolojiler": {"ad": {"tipoloji": "..."}, ...}}
        tipler = tipoloji_sonuc.get("tipolojiler", {})

        # Projeksiyon isteği
        proj_girdi = [{"ad": m["ad"], "nufus_serisi": m["nufus_serisi"]} for m in sonuclar]
        proj_resp = requests.post(
            f"{ai_url}/projeksiyon",
            json={"mahalleler": proj_girdi, "ufuk_yil": PROJEKSIYON_UFUK_YIL},
            timeout=AI_TIMEOUT_SANIYE,
        )
        proj_resp.raise_for_status()
        proj_sonuc = proj_resp.json()
        projeksiyonlar = proj_sonuc.get("projeksiyonlar", {})

        # Zaman damgası
        uretim_zamani = datetime.now(timezone.utc).isoformat()

        # Sonuçları ai_onbellek'e yaz
        for m in sonuclar:
            ad = m["ad"]
            ai = {}
            if ad in tipler:
                ai["tipoloji"] = tipler[ad]["tipoloji"]
            if ad in projeksiyonlar:
                ai["projeksiyon_nufus"] = projeksiyonlar[ad]["nufus"]
            if ai:
                ai["_uretim_zamani"] = uretim_zamani
                ai["_servis_surumu"] = servis_surumu
                m["ai_onbellek"] = ai
            # else boş kalır (mahalle için AI sonucu yoksa)
        print(f"  AI çıktıları {len([m for m in sonuclar if m['ai_onbellek']])} mahalleye yazıldı.")

    except Exception as e:
        print(f"UYARI: AI Servisi'ne erişilemedi ({e}), "
              f"ai_onbellek alanı boş bırakıldı (REQ-F-23).",
              file=sys.stderr)
        # Tüm ai_onbellek boş kalır (zaten boş başlatıldı)

    # 7. Atomik yazma
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

    return 0


if __name__ == "__main__":
    sys.exit(main())
