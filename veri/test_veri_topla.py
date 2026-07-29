"""
ARC-01 icin bagimsiz birim testleri (QA tarafindan eklendi).

Bu testler agdan/Overpass'tan BAGIMSIZDIR; sadece veri_topla.py icindeki saf
fonksiyonlari (ad normallestirme, bina/yesil alan oran hesaplama) sentetik
girdilerle sinar. TC-08..TC-13 (gercek veri ile calistirma) bu dosyanin
kapsami disindadir, onlar elle/QA calistirmasiyla dogrulanir.

Calistirmak icin (repo kokunden):
    python -m unittest veri.test_veri_topla -v
veya
    python veri/test_veri_topla.py
"""

import importlib.util
import math
import os
import unittest

import pyproj
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union

_MODUL_YOLU = os.path.join(os.path.dirname(__file__), "veri_topla.py")
_spec = importlib.util.spec_from_file_location("veri_topla_test_hedef", _MODUL_YOLU)
veri_topla = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(veri_topla)


class AdNormallestirTestleri(unittest.TestCase):
    """Mimari tasarim ARC-01 bolumundeki ad eslestirme kurallarini sinar."""

    def test_mahallesi_soneki_temizlenir(self):
        self.assertEqual(
            veri_topla.ad_normallestir("Şamlar Mahallesi"),
            veri_topla.ad_normallestir("Samlar"),
        )

    def test_mah_soneki_temizlenir(self):
        self.assertEqual(
            veri_topla.ad_normallestir("Ziya Gökalp Mah."),
            veri_topla.ad_normallestir("Ziya Gokalp"),
        )

    def test_turkce_harf_katlamasi_ve_bosluk(self):
        self.assertEqual(
            veri_topla.ad_normallestir("  Başakşehir   Mahallesi "),
            "basaksehir",
        )

    def test_basak_ve_basaksehir_karismaz(self):
        """
        Kritik kural (mimari-tasarim.md, ARC-01): "Başak" ile "Başakşehir"
        iki ayri mahalle, onek eslestirme kullanilirsa karisirlar.
        """
        norm_basak = veri_topla.ad_normallestir("Başak Mahallesi")
        norm_basaksehir = veri_topla.ad_normallestir("Başakşehir Mahallesi")
        self.assertNotEqual(norm_basak, norm_basaksehir)
        # Onek iliskisi var ama TAM esitlik kontrolu kullanildigindan
        # bunlarin birbirini eslestirmemesi gerekir.
        self.assertTrue(norm_basaksehir.startswith(norm_basak))

    def test_alt_name_kaynak_kodda_kullanilmiyor(self):
        """
        Mimari tasarim: 'alt_name alani eslestirmeye sokulmaz.'
        Kodun bu alani hic okumadigini dogrudan kaynaktan dogrula.
        """
        with open(_MODUL_YOLU, "r", encoding="utf-8") as f:
            kaynak = f.read()
        self.assertNotIn("alt_name", kaynak)


class BinaYesilOranHesaplaTestleri(unittest.TestCase):
    """
    REQ-F-02 / REQ-F-03: yesil_alan_orani ve bina_yogunlugu 0-1 araliginda,
    beklenen oranlari uretmeli. Transformer EPSG:32635 -> EPSG:32635 (birim
    donusum) kullanilarak geometriler dogrudan metre cinsinden verilir.
    """

    def setUp(self):
        self.transformer = pyproj.Transformer.from_crs(
            "EPSG:32635", "EPSG:32635", always_xy=True
        )
        self.mahalle_alani_m2 = 1_000_000.0  # 1 km2
        self.sinir_geom_m2 = Polygon([(0, 0), (1000, 0), (1000, 1000), (0, 1000)])  # 1 km x 1 km

    def test_bina_ve_yesil_oranlari_dogru_hesaplanir(self):
        # 0.5 km2'lik bina (mahallenin yarisi)
        bina_poly = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1000, 0], [1000, 500], [0, 500], [0, 0]]],
        }
        # 0.1 km2'lik park
        park_poly = {
            "type": "Polygon",
            "coordinates": [[[0, 600], [500, 600], [500, 800], [0, 800], [0, 600]]],
        }
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": bina_poly},
                {"type": "Feature", "properties": {"tags": {"leisure": "park"}}, "geometry": park_poly},
            ],
        }
        bina_orani, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        self.assertAlmostEqual(bina_orani, 0.5, places=6)
        self.assertAlmostEqual(yesil_orani, 0.1, places=6)

    def test_agac_noktasi_tampon_alani_yesile_eklenir(self):
        tree_point = {"type": "Point", "coordinates": [100, 100]}
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"natural": "tree"}}, "geometry": tree_point},
            ],
        }
        _, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        # shapely.buffer() cemberi cokgenle yaklasiklar (varsayilan quad_segs),
        # bu yuzden gercek pi*r^2 alanina yakin ama esit degildir. %1 tolerans yeterli.
        beklenen_tampon_alani = math.pi * (veri_topla.AGAC_TAC_YARICAPI_M ** 2)
        beklenen_oran = beklenen_tampon_alani / self.mahalle_alani_m2
        self.assertAlmostEqual(yesil_orani, beklenen_oran, delta=beklenen_oran * 0.01)

    def test_oranlar_bir_ile_sinirlanir(self):
        # Mahalle alanindan buyuk bir "bina" -> oran 1.0'da sinirlanmali
        dev_bina = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [2000, 0], [2000, 2000], [0, 2000], [0, 0]]],
        }
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": dev_bina},
            ],
        }
        bina_orani, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        self.assertEqual(bina_orani, 1.0)
        self.assertEqual(yesil_orani, 0.0)

    def test_sifir_mahalle_alaninda_sifir_doner(self):
        fc = {"type": "FeatureCollection", "features": []}
        bina_orani, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, 0.0, self.transformer, self.sinir_geom_m2
        )
        self.assertEqual((bina_orani, yesil_orani), (0.0, 0.0))

    def test_taniyanmayan_etiketler_yoksayilir(self):
        yol = {
            "type": "LineString",
            "coordinates": [[0, 0], [100, 100]],
        }
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"highway": "residential"}}, "geometry": yol},
            ],
        }
        bina_orani, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        self.assertEqual((bina_orani, yesil_orani), (0.0, 0.0))

    def test_cakisan_yesil_poligonlar_birlesim_alani_kullanir(self):
        """Cakisan iki yesil poligonun ham toplami degil, birlesim alanini kullanir."""
        # 0.2 km^2'lik grass
        grass = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [500, 0], [500, 400], [0, 400], [0, 0]]],
        }
        # 0.1 km^2'lik park, grass ile 200x200 m^2'lik bir alan cakisir
        park = {
            "type": "Polygon",
            "coordinates": [[[400, 300], [700, 300], [700, 500], [400, 500], [400, 300]]],
        }
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"landuse": "grass"}}, "geometry": grass},
                {"type": "Feature", "properties": {"tags": {"leisure": "park"}}, "geometry": park},
            ],
        }
        _, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        # Beklenen birlesim alani: grass 200000 m2, park 100000 m2, cakisim 40000 m2
        grass_geom = Polygon([(0, 0), (500, 0), (500, 400), (0, 400)])
        park_geom = Polygon([(400, 300), (700, 300), (700, 500), (400, 500)])
        beklenen_birlesim = unary_union([grass_geom, park_geom]).area
        beklenen_oran = beklenen_birlesim / self.mahalle_alani_m2
        # Ham toplam 0.3 km^2'den kucuk olmali
        self.assertLess(yesil_orani, 300_000 / self.mahalle_alani_m2)
        self.assertAlmostEqual(yesil_orani, beklenen_oran, places=6)

    def test_tum_yeni_etiketler_yesil_sayilir(self):
        """YESIL_POLIGON_ETIKETLERI'ndaki her etiket ayri bir poligonla taninir."""
        etiket_sayisi = len(veri_topla.YESIL_POLIGON_ETIKETLERI)
        # Her biri 100x100 m^2'lik yan yana kareler, aralarinda cakisim yok
        kare_boyut = 100
        features = []
        for i, (anahtar, deger) in enumerate(veri_topla.YESIL_POLIGON_ETIKETLERI):
            x_offset = i * (kare_boyut + 10)  # 10 m bosluk
            poly = {
                "type": "Polygon",
                "coordinates": [[
                    [x_offset, 0],
                    [x_offset + kare_boyut, 0],
                    [x_offset + kare_boyut, kare_boyut],
                    [x_offset, kare_boyut],
                    [x_offset, 0],
                ]],
            }
            features.append({
                "type": "Feature",
                "properties": {"tags": {anahtar: deger}},
                "geometry": poly,
            })
        fc = {"type": "FeatureCollection", "features": features}
        genis_sinir = Polygon([(-50, -50), (1400, -50), (1400, 150), (-50, 150)])
        _, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, genis_sinir
        )
        beklenen_toplam_alan = etiket_sayisi * (kare_boyut ** 2)
        self.assertAlmostEqual(yesil_orani, beklenen_toplam_alan / self.mahalle_alani_m2, places=6)

    def test_dislanan_etiketler_yesil_sayilmaz(self):
        """Bilincli olarak dislanan etiketler yesil orana katkida bulunmaz."""
        dislananlar = [
            ("leisure", "pitch"),
            ("leisure", "playground"),
            ("leisure", "swimming_pool"),
            ("landuse", "farmland"),
        ]
        features = []
        kare_boyut = 100
        for i, (anahtar, deger) in enumerate(dislananlar):
            x_offset = i * (kare_boyut + 10)
            poly = {
                "type": "Polygon",
                "coordinates": [[
                    [x_offset, 0],
                    [x_offset + kare_boyut, 0],
                    [x_offset + kare_boyut, kare_boyut],
                    [x_offset, kare_boyut],
                    [x_offset, 0],
                ]],
            }
            features.append({
                "type": "Feature",
                "properties": {"tags": {anahtar: deger}},
                "geometry": poly,
            })
        fc = {"type": "FeatureCollection", "features": features}
        _, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        self.assertEqual(yesil_orani, 0.0)

    def test_dislanan_etiketler_sorgu_metninde_gecmez(self):
        """Dislanan etiketlerin Overpass sorgu metninde bulunmamasi gerekir."""
        with open(_MODUL_YOLU, "r", encoding="utf-8") as f:
            kaynak = f.read()
        for kelime in [
            '"leisure"="pitch"',
            '"leisure"="playground"',
            '"leisure"="swimming_pool"',
            '"landuse"="farmland"',
        ]:
            with self.subTest(kelime=kelime):
                self.assertNotIn(kelime, kaynak)

    def test_yesil_relation_sorgusu_multipolygon_filtresi_tasimaz(self):
        """
        Regresyon testi: DeepSeek review bulgusu (High) - relation sorgularinda
        '["type"="multipolygon"]' filtresi olursa boundary=national_park gibi
        (type=boundary tasiyabilen) relation'lar disarida kalabilir. Fix, bu filtreyi
        yesil relation sorgu satirlarindan kaldirdi; bina relation sorgusu ise
        kasitli olarak multipolygon filtresini KORUR (bina relation'lari duzgun
        multipolygon degilse zaten anlamli degil). Sorgu satirlari f-string ile
        main() icinde calisma zamaninda uretildigi icin, gercek uretim mantigini
        (main()'in kullandigi format string'i) taklit ederek dogruluyoruz.
        """
        for anahtar, deger in veri_topla.YESIL_POLIGON_ETIKETLERI:
            uretilen_satir = f'  relation["{anahtar}"="{deger}"](area.m);'
            # Uretilen satirda multipolygon filtresi OLMAMALI
            self.assertNotIn('"type"="multipolygon"', uretilen_satir)

        # main() kaynagindaki sablonun (f-string ifadesinin kendisi) multipolygon
        # filtresi ICERMEDIGINI dogrudan kaynak metninden dogrula.
        with open(_MODUL_YOLU, "r", encoding="utf-8") as f:
            kaynak = f.read()
        self.assertIn(
            'yesil_sorgu_satirlari.append(f\'  relation["{anahtar}"="{deger}"](area.m);\')',
            kaynak,
        )
        # Bina relation sorgusu ise multipolygon filtresini korumali (kasitli, farkli davranis)
        self.assertIn('relation["building"]["type"="multipolygon"](area.m);', kaynak)

    def test_agac_tamponu_park_ile_cakisirsa_ekstra_alan_eklemez(self):
        """Tamamen park icindeki bir agac, yesil orani oldurmemeli."""
        # 1 km^2'lik buyuk park (mahalle alanin tamami)
        park = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]]],
        }
        # Agac noktasi parkin merkezinde, tamponu tamamen iceride
        agac = {"type": "Point", "coordinates": [500, 500]}
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"leisure": "park"}}, "geometry": park},
                {"type": "Feature", "properties": {"tags": {"natural": "tree"}}, "geometry": agac},
            ],
        }
        _, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        # Beklenen: park alani / mahalle alani = 1.0
        beklenen_oran = 1_000_000 / self.mahalle_alani_m2
        self.assertAlmostEqual(yesil_orani, beklenen_oran, places=6)
        # Ayrica ekstra tampon katkisi olmadigini gostermek icin 1.0'a esit
        self.assertEqual(yesil_orani, 1.0)


    def test_yesil_poligon_kismen_sinir_disinda_kirpilir(self):
        """Yesil poligonun sinir disinda kalan kismi alana katilmaz."""
        park = {
            "type": "Polygon",
            "coordinates": [[[500, 0], [1500, 0], [1500, 1000], [500, 1000], [500, 0]]],
        }
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"landuse": "forest"}}, "geometry": park},
            ],
        }
        _, yesil_orani = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        beklenen_oran = 500_000 / self.mahalle_alani_m2  # 500 x 1000 = 500 000 m²
        self.assertAlmostEqual(yesil_orani, beklenen_oran, places=6)

    def test_bina_kismen_sinir_disinda_kirpilir(self):
        """Bina poligonunun sinir disinda kalan kismi bina alanina katilmaz."""
        bina = {
            "type": "Polygon",
            "coordinates": [[[500, 0], [1500, 0], [1500, 1000], [500, 1000], [500, 0]]],
        }
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": bina},
            ],
        }
        bina_orani, _ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2
        )
        beklenen_oran = 500_000 / self.mahalle_alani_m2
        self.assertAlmostEqual(bina_orani, beklenen_oran, places=6)

if __name__ == "__main__":
    unittest.main()
