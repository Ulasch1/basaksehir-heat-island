"""
ARC-01 icin bagimsiz birim testleri (QA tarafindan eklendi).

Bu testler agdan/Overpass'tan BAGIMSIZDIR; sadece veri_topla.py icindeki saf
fonksiyonlari (ad normallestirme, bina/yesil alan oran hesaplama, yerlesim zarfi)
sentetik girdilerle sinar. TC-08..TC-13 (gercek veri ile calistirma) bu dosyanin
kapsami disindadir.

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
    REQ-F-02 / REQ-F-03 / REQ-F-24: yesil_alan_orani ve bina_yogunlugu
    yerlesim zarfina oranlanir. Testlerde zarf alani = mahalle alani olmasi
    icin tampon yaricapi yuksek secilir (r_metre=500 m).
    """

    def setUp(self):
        self.transformer = pyproj.Transformer.from_crs(
            "EPSG:32635", "EPSG:32635", always_xy=True
        )
        self.mahalle_alani_m2 = 1_000_000.0  # 1 km2
        self.sinir_geom_m2 = Polygon([(0, 0), (1000, 0), (1000, 1000), (0, 1000)])
        # Yeterince büyük bir tampon yarıçapı, zarfın tüm sinirı kaplamasını sağlar
        self.r_metre = 500.0

    def _tam_sinir_bina_geometrisi(self):
        """Zarfın tüm mahalle sınırını kapsaması için bütün sınırı bina olarak ekler."""
        return {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]]],
        }

    # ------------------------------------------------------------------
    # Mevcut testler (guncellendi)
    # ------------------------------------------------------------------

    def test_bina_ve_yesil_oranlari_dogru_hesaplanir(self):
        bina_poly = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1000, 0], [1000, 500], [0, 500], [0, 0]]],
        }
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
        bina_orani, yesil_orani, zarf_alani_m2, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        self.assertAlmostEqual(zarf_alani_m2, self.mahalle_alani_m2, places=0)
        self.assertAlmostEqual(bina_orani, 0.5, places=6)
        self.assertAlmostEqual(yesil_orani, 0.1, places=6)

    def test_agac_noktasi_tampon_alani_yesile_eklenir(self):
        tree_point = {"type": "Point", "coordinates": [100, 100]}
        full_building = self._tam_sinir_bina_geometrisi()
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": full_building},
                {"type": "Feature", "properties": {"tags": {"natural": "tree"}}, "geometry": tree_point},
            ],
        }
        _, yesil_orani, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        beklenen_tampon_alani = math.pi * (veri_topla.AGAC_TAC_YARICAPI_M ** 2)
        beklenen_oran = beklenen_tampon_alani / self.mahalle_alani_m2
        self.assertAlmostEqual(yesil_orani, beklenen_oran, delta=beklenen_oran * 0.01)

    def test_oranlar_bir_ile_sinirlanir(self):
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
        bina_orani, yesil_orani, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        self.assertEqual(bina_orani, 1.0)
        self.assertEqual(yesil_orani, 0.0)

    def test_sifir_mahalle_alaninda_sifir_doner(self):
        fc = {"type": "FeatureCollection", "features": []}
        bina_orani, yesil_orani, zarf, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, 0.0, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        self.assertEqual((bina_orani, yesil_orani, zarf), (0.0, 0.0, 0.0))

    def test_taniyanmayan_etiketler_yoksayilir(self):
        """Yalnızca yol geometrisi bina olmadığı için zarf sıfır olur,
        bu yüzden bir bina ekleyip yolun yoksayıldığını doğruluyoruz."""
        yol = {
            "type": "LineString",
            "coordinates": [[0, 0], [100, 100]],
        }
        full_building = self._tam_sinir_bina_geometrisi()
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": full_building},
                {"type": "Feature", "properties": {"tags": {"highway": "residential"}}, "geometry": yol},
            ],
        }
        bina_orani, yesil_orani, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        self.assertAlmostEqual(bina_orani, 1.0, places=6)  # tüm alan bina
        self.assertEqual(yesil_orani, 0.0)

    def test_cakisan_yesil_poligonlar_birlesim_alani_kullanir(self):
        grass = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [500, 0], [500, 400], [0, 400], [0, 0]]],
        }
        park = {
            "type": "Polygon",
            "coordinates": [[[400, 300], [700, 300], [700, 500], [400, 500], [400, 300]]],
        }
        full_building = self._tam_sinir_bina_geometrisi()
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": full_building},
                {"type": "Feature", "properties": {"tags": {"landuse": "grass"}}, "geometry": grass},
                {"type": "Feature", "properties": {"tags": {"leisure": "park"}}, "geometry": park},
            ],
        }
        _, yesil_orani, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        grass_geom = Polygon([(0, 0), (500, 0), (500, 400), (0, 400)])
        park_geom = Polygon([(400, 300), (700, 300), (700, 500), (400, 500)])
        beklenen_birlesim = unary_union([grass_geom, park_geom]).area
        beklenen_oran = beklenen_birlesim / self.mahalle_alani_m2
        self.assertLess(yesil_orani, 300_000 / self.mahalle_alani_m2)
        self.assertAlmostEqual(yesil_orani, beklenen_oran, places=6)

    def test_tum_yeni_etiketler_yesil_sayilir(self):
        etiket_sayisi = len(veri_topla.YESIL_POLIGON_ETIKETLERI)
        kare_boyut = 100
        features = []
        for i, (anahtar, deger) in enumerate(veri_topla.YESIL_POLIGON_ETIKETLERI):
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
        genis_sinir = Polygon([(-50, -50), (1400, -50), (1400, 150), (-50, 150)])
        # Zarfın tüm genis sinirı kaplaması için sinirı bina olarak ekle
        genis_bina_poly = {
            "type": "Polygon",
            "coordinates": [[[-50, -50], [1400, -50], [1400, 150], [-50, 150], [-50, -50]]],
        }
        features.insert(0, {
            "type": "Feature",
            "properties": {"tags": {"building": "yes"}},
            "geometry": genis_bina_poly,
        })
        fc = {"type": "FeatureCollection", "features": features}
        _, yesil_orani, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, genis_sinir, self.r_metre
        )
        beklenen_toplam_alan = etiket_sayisi * (kare_boyut ** 2)
        beklenen_oran = beklenen_toplam_alan / genis_sinir.area
        self.assertAlmostEqual(yesil_orani, beklenen_oran, places=6)

    def test_dislanan_etiketler_yesil_sayilmaz(self):
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
        full_building = self._tam_sinir_bina_geometrisi()
        features.insert(0, {
            "type": "Feature",
            "properties": {"tags": {"building": "yes"}},
            "geometry": full_building,
        })
        fc = {"type": "FeatureCollection", "features": features}
        _, yesil_orani, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        self.assertEqual(yesil_orani, 0.0)

    def test_dislanan_etiketler_sorgu_metninde_gecmez(self):
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
        for anahtar, deger in veri_topla.YESIL_POLIGON_ETIKETLERI:
            uretilen_satir = f'  relation["{anahtar}"="{deger}"](area.m);'
            self.assertNotIn('"type"="multipolygon"', uretilen_satir)

        with open(_MODUL_YOLU, "r", encoding="utf-8") as f:
            kaynak = f.read()
        self.assertIn(
            'yesil_sorgu_satirlari.append(f\'  relation["{anahtar}"="{deger}"](area.m);\')',
            kaynak,
        )
        self.assertIn('relation["building"]["type"="multipolygon"](area.m);', kaynak)

    def test_agac_tamponu_park_ile_cakisirsa_ekstra_alan_eklemez(self):
        park = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]]],
        }
        agac = {"type": "Point", "coordinates": [500, 500]}
        full_building = self._tam_sinir_bina_geometrisi()
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": full_building},
                {"type": "Feature", "properties": {"tags": {"leisure": "park"}}, "geometry": park},
                {"type": "Feature", "properties": {"tags": {"natural": "tree"}}, "geometry": agac},
            ],
        }
        _, yesil_orani, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        beklenen_oran = 1_000_000 / self.mahalle_alani_m2
        self.assertAlmostEqual(yesil_orani, beklenen_oran, places=6)
        self.assertEqual(yesil_orani, 1.0)

    def test_yesil_poligon_kismen_sinir_disinda_kirpilir(self):
        park = {
            "type": "Polygon",
            "coordinates": [[[500, 0], [1500, 0], [1500, 1000], [500, 1000], [500, 0]]],
        }
        full_building = self._tam_sinir_bina_geometrisi()
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": full_building},
                {"type": "Feature", "properties": {"tags": {"landuse": "forest"}}, "geometry": park},
            ],
        }
        _, yesil_orani, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        beklenen_oran = 500_000 / self.mahalle_alani_m2
        self.assertAlmostEqual(yesil_orani, beklenen_oran, places=6)

    def test_bina_kismen_sinir_disinda_kirpilir(self):
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
        bina_orani, _, _, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
        )
        beklenen_oran = 500_000 / self.mahalle_alani_m2
        self.assertAlmostEqual(bina_orani, beklenen_oran, places=6)

    # ------------------------------------------------------------------
    # Yeni testler (TC-35: yerlesim zarfi)
    # ------------------------------------------------------------------

    def test_yerlesim_zarfi_bina_kumesi_ile_sinirli(self):
        """
        TC-35a: Buyuk bir sinir (2000x2000 m) ve kucuk bina kumesi (100x100,
        r_metre=50). Zarf alani mahalle alanindan belirgin sekilde kucuktur.
        """
        sinir = Polygon([(0, 0), (2000, 0), (2000, 2000), (0, 2000)])
        kucuk_bina = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]],
        }
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"tags": {"building": "yes"}}, "geometry": kucuk_bina},
            ],
        }
        bina_orani, yesil_orani, zarf_alani_m2, *_ = veri_topla.bina_yesil_oranlari_hesapla(
            fc, sinir.area, self.transformer, sinir, r_metre=50.0
        )
        self.assertGreater(zarf_alani_m2, 0)
        self.assertLess(zarf_alani_m2, sinir.area * 0.5)
        # Bina tek basina, bina orani 1.0 (zarf icinde her yer bina degilse? Bina alanı zarf
        # icinde 10000 m2, zarf alani > 10000, oran < 1.0 ama 1.0'a kirpilir. Oran 1.0 olabilir.
        # Kesin sayiya girmiyoruz, sadece makul aralikta.
        self.assertTrue(0.0 < bina_orani <= 1.0)

    def test_hic_bina_olmazsa_valueerror_firlatilir(self):
        """
        TC-35b: Boş bir FeatureCollection ile cagrildiginda ValueError firlatilmali.
        """
        fc = {"type": "FeatureCollection", "features": []}
        with self.assertRaises(ValueError):
            veri_topla.bina_yesil_oranlari_hesapla(
                fc, self.mahalle_alani_m2, self.transformer, self.sinir_geom_m2, self.r_metre
            )

    def test_sinir_gecerlilik_kontrolu_koddadir(self):
        """Regresyon: main() icinde sinir_geom_projekte.is_valid ve buffer(0) kullaniliyor."""
        with open(_MODUL_YOLU, "r", encoding="utf-8") as f:
            kaynak = f.read()
        self.assertIn("not sinir_geom_projekte.is_valid", kaynak)
        self.assertIn("buffer(0)", kaynak)


class OlcekleMaruziyetTestleri(unittest.TestCase):
    """
    olcekle_maruziyet() icin testler (QA tarafindan eklendi, bu fonksiyon
    bu oturumda /tipoloji istegine dogru girdi saglamak icin eklendi).
    web/src/skor.ts'teki olcekleMaruziyet'in Python karsiligi oldugu icin
    davranisi ayni sekilde sinanir.
    """

    def test_bos_dizi_valueerror_firlatir(self):
        with self.assertRaises(ValueError):
            veri_topla.olcekle_maruziyet([], 0.1)

    def test_tum_degerler_ayniysa_hepsi_bir_doner(self):
        sonuc = veri_topla.olcekle_maruziyet([5.0] * 10, 0.1)
        self.assertEqual(sonuc, [1.0] * 10)

    def test_tek_eleman_bir_doner(self):
        # max == min kosulu tek elemanli dizide de gecerlidir
        sonuc = veri_topla.olcekle_maruziyet([42.0], 0.1)
        self.assertEqual(sonuc, [1.0])

    def test_min_alt_siniri_max_biri_alir(self):
        sonuc = veri_topla.olcekle_maruziyet([10.0, 20.0, 30.0], 0.1)
        self.assertAlmostEqual(sonuc[0], 0.1)
        self.assertAlmostEqual(sonuc[-1], 1.0)

    def test_orta_deger_dogrusal_olceklenir(self):
        # min=10 -> 0.1, max=30 -> 1.0, orta 20 -> 0.55 (dogrusal enterpolasyon)
        sonuc = veri_topla.olcekle_maruziyet([10.0, 20.0, 30.0], 0.1)
        self.assertAlmostEqual(sonuc[1], 0.55)

    def test_alt_sinir_sifirsa_min_sifir_olur(self):
        sonuc = veri_topla.olcekle_maruziyet([100.0, 200.0], 0.0)
        self.assertAlmostEqual(sonuc[0], 0.0)
        self.assertAlmostEqual(sonuc[1], 1.0)


class AyarlariYukleTestleri(unittest.TestCase):
    """
    ayarlari_yukle() icin testler (QA tarafindan eklendi). Gercek
    web/src/ayarlar.json dosyasina karsi mutlu-yol dogrulamasi yapar;
    hata yollari icin builtins.open mock'lanir.
    """

    def test_gercek_ayarlar_dosyasi_ile_dogru_deger_doner(self):
        # Bu test repo kokunden calistirilmasini varsayar (python -m unittest veri.test_veri_topla)
        r_metre, kume_sayisi, ufuk_yil, alt_sinir, izgara_metre = veri_topla.ayarlari_yukle()
        self.assertIsInstance(r_metre, float)
        self.assertGreater(r_metre, 0)
        self.assertIsInstance(kume_sayisi, int)
        self.assertGreaterEqual(kume_sayisi, 2)
        self.assertIsInstance(ufuk_yil, int)
        self.assertGreaterEqual(ufuk_yil, 1)
        self.assertIsInstance(alt_sinir, float)
        self.assertGreaterEqual(alt_sinir, 0.0)
        self.assertLessEqual(alt_sinir, 1.0)
        self.assertIsInstance(izgara_metre, float)
        self.assertGreater(izgara_metre, 0)

    def _mock_ayarlar_ile_cagir(self, icerik: dict):
        import json as _json
        from unittest import mock
        veri = _json.dumps(icerik)
        with mock.patch("builtins.open", mock.mock_open(read_data=veri)):
            return veri_topla.ayarlari_yukle()

    def _temel_gecerli_ayarlar(self):
        return {
            "yerlesim_zarfi_r_metre": 100,
            "kumeleme_kume_sayisi": 3,
            "projeksiyon_ufku_yil": 5,
            "maruziyet_alt_siniri": 0.1,
            "izgara_hucre_metre": 100,
        }

    def test_eksik_kume_sayisi_hata_verir(self):
        ayarlar = self._temel_gecerli_ayarlar()
        del ayarlar["kumeleme_kume_sayisi"]
        with self.assertRaises(RuntimeError):
            self._mock_ayarlar_ile_cagir(ayarlar)

    def test_kume_sayisi_birden_kucukse_hata_verir(self):
        ayarlar = self._temel_gecerli_ayarlar()
        ayarlar["kumeleme_kume_sayisi"] = 1
        with self.assertRaises(RuntimeError):
            self._mock_ayarlar_ile_cagir(ayarlar)

    def test_eksik_ufuk_yil_hata_verir(self):
        ayarlar = self._temel_gecerli_ayarlar()
        del ayarlar["projeksiyon_ufku_yil"]
        with self.assertRaises(RuntimeError):
            self._mock_ayarlar_ile_cagir(ayarlar)

    def test_negatif_ufuk_yil_hata_verir(self):
        ayarlar = self._temel_gecerli_ayarlar()
        ayarlar["projeksiyon_ufku_yil"] = -1
        with self.assertRaises(RuntimeError):
            self._mock_ayarlar_ile_cagir(ayarlar)

    def test_alt_sinir_bir_den_buyukse_hata_verir(self):
        ayarlar = self._temel_gecerli_ayarlar()
        ayarlar["maruziyet_alt_siniri"] = 1.5
        with self.assertRaises(RuntimeError):
            self._mock_ayarlar_ile_cagir(ayarlar)

    def test_alt_sinir_negatifse_hata_verir(self):
        ayarlar = self._temel_gecerli_ayarlar()
        ayarlar["maruziyet_alt_siniri"] = -0.1
        with self.assertRaises(RuntimeError):
            self._mock_ayarlar_ile_cagir(ayarlar)

    def test_alt_sinir_bir_sinir_degerleri_gecerlidir(self):
        # ust sinir kontrolu bu oturumda eklendi: tam 0 ve tam 1 gecerli olmali
        ayarlar_0 = self._temel_gecerli_ayarlar()
        ayarlar_0["maruziyet_alt_siniri"] = 0.0
        _, _, _, alt_sinir_0, _ = self._mock_ayarlar_ile_cagir(ayarlar_0)
        self.assertEqual(alt_sinir_0, 0.0)

        ayarlar_1 = self._temel_gecerli_ayarlar()
        ayarlar_1["maruziyet_alt_siniri"] = 1.0
        _, _, _, alt_sinir_1, _ = self._mock_ayarlar_ile_cagir(ayarlar_1)
        self.assertEqual(alt_sinir_1, 1.0)


class IzgaraUretVeOlcTestleri(unittest.TestCase):
    """izgara_uret_ve_olc() fonksiyonu icin birim testleri."""

    def setUp(self):
        self.transformer_ters = pyproj.Transformer.from_crs(
            "EPSG:32635", "EPSG:4326", always_xy=True
        )

    def test_hucre_sayisi_dogru_hesaplanir(self):
        """300m x 200m zarf, 100m hucre: tam 3x2 = 6 hucre."""
        zarf = Polygon([(0, 0), (300, 0), (300, 200), (0, 200)])
        sonuc = veri_topla.izgara_uret_ve_olc(
            zarf, [], [], self.transformer_ters, hucre_metre=100.0
        )
        self.assertEqual(len(sonuc), 6)

    def test_kenar_hucreleri_kirpilir_ve_kucuk_dilimler_atlanir(self):
        """
        Zarf 100x100'luk ana hucre + 5x5'lik (25 m2) kucuk bir ek parca.
        5x5'lik parca 100 m hucrenin %0.25'ine denk gelir, %10 esiginin
        altinda oldugu icin o hucre atlanmali, sadece 1 hucre donmeli.
        """
        ana = Polygon([(0, 0), (100, 0), (100, 100), (0, 100)])
        ek = Polygon([(100, 0), (105, 0), (105, 5), (100, 5)])
        zarf = unary_union([ana, ek])
        sonuc = veri_topla.izgara_uret_ve_olc(
            zarf, [], [], self.transformer_ters, hucre_metre=100.0
        )
        self.assertEqual(len(sonuc), 1)

    def test_bina_ve_yesil_orani_elle_hesaplananla_esler(self):
        """Tek hucrede bina %50, yesil %20 kapliyor."""
        zarf = Polygon([(0, 0), (100, 0), (100, 100), (0, 100)])
        bina = [Polygon([(0, 0), (50, 0), (50, 100), (0, 100)])]  # 5000 m2
        yesil = [Polygon([(50, 0), (70, 0), (70, 100), (50, 100)])]  # 2000 m2
        sonuc = veri_topla.izgara_uret_ve_olc(
            zarf, bina, yesil, self.transformer_ters, hucre_metre=100.0
        )
        self.assertEqual(len(sonuc), 1)
        hucre = sonuc[0]
        self.assertAlmostEqual(hucre["bina_yogunlugu"], 0.5, places=6)
        self.assertAlmostEqual(hucre["yesil_alan_orani"], 0.2, places=6)

    def test_bos_zarf_bos_liste_doner(self):
        """Bos (empty) zarf gecirilirse hucre uretilmeden bos liste donmeli."""
        bos_zarf = Polygon()
        sonuc = veri_topla.izgara_uret_ve_olc(
            bos_zarf, [], [], self.transformer_ters, hucre_metre=100.0
        )
        self.assertEqual(sonuc, [])

    def test_ciktinin_koordinatlari_epsg4326_makul_aralikta(self):
        """
        Basaksehir civari (UTM 35N: 290000, 4560000) 500x500 m zarf icin
        tum hucre koordinatlari lon 28-29, lat 40-42 araliginda olmalidir.
        """
        # EPSG:32635'te yaklasik bir nokta (Istanbul/Basaksehir)
        merkez_x, merkez_y = 641100, 4550107
        yarim = 250
        zarf = Polygon([
            (merkez_x - yarim, merkez_y - yarim),
            (merkez_x + yarim, merkez_y - yarim),
            (merkez_x + yarim, merkez_y + yarim),
            (merkez_x - yarim, merkez_y + yarim),
        ])
        sonuc = veri_topla.izgara_uret_ve_olc(
            zarf, [], [], self.transformer_ters, hucre_metre=100.0
        )
        self.assertGreater(len(sonuc), 0)
        for hucre in sonuc:
            sinir = hucre["sinir"]
            # GeoJSON geometrisindeki tum koordinatlari gez
            coords = sinir.get("coordinates", [])
            if sinir["type"] == "Polygon":
                coords = coords[0]  # dis halka
            elif sinir["type"] == "MultiPolygon":
                # tum poligonlar icin koordinatlari duzlestir
                flat = []
                for ring in coords:
                    flat.extend(ring[0])
                coords = flat
            for lon, lat in coords:
                self.assertGreater(lon, 28.0)
                self.assertLess(lon, 29.0)
                self.assertGreater(lat, 40.0)
                self.assertLess(lat, 42.0)


if __name__ == "__main__":
    unittest.main()
