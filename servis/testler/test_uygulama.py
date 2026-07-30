"""
ARC-05 AI servisi bagimsiz birim testleri.

Bu testler sadece `uygulama.py` yi yukler; `web/` veya `veri/` modullerine
hic bir sekilde bagimli degildir. Flask test client ile tum uc noktalar ve
hata yollari kapsanir.
"""
import importlib.util
import os
import unittest

import numpy as np

_MODUL_YOLU = os.path.join(os.path.dirname(__file__), "..", "uygulama.py")
_spec = importlib.util.spec_from_file_location("uygulama_test_hedef", _MODUL_YOLU)
uygulama = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(uygulama)


class TestUygulama(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = uygulama.create_app()
        cls.client = cls.app.test_client()

    # ----------------------------------------------------------------
    # TC-29: /saglik uc noktasi
    # ----------------------------------------------------------------
    def test_tc29_saglik_bilgisi_donulur(self):
        """
        TC-29: /saglik cagir, 200 don, servis_surumu ve model_surumu
        string ve bos degil, son_egitim_zamani mevcut ve bos degil.
        Servis, `web/` klasorunden hic import yapmadan bu test ile
        ayaga kalkabildigini kanitlar.
        """
        yanit = self.client.get("/saglik")
        self.assertEqual(yanit.status_code, 200)
        veri = yanit.get_json()
        self.assertIsInstance(veri["servis_surumu"], str)
        self.assertTrue(len(veri["servis_surumu"]) > 0)
        self.assertIsInstance(veri["model_surumu"], str)
        self.assertTrue(len(veri["model_surumu"]) > 0)
        self.assertIsInstance(veri["son_egitim_zamani"], str)
        self.assertTrue(len(veri["son_egitim_zamani"]) > 0)

    # ----------------------------------------------------------------
    # TC-25: /tipoloji 10 mahalle, 3 kume
    # ----------------------------------------------------------------
    def test_tc25_tipoloji_10_mahalle_3_kume(self):
        """
        TC-25: 10 mahallelik sentetik veri, kume_sayisi=3.
        Dogrula: 200, sonuclar uzunlugu 10, her tipoloji 0..2 arasi,
        kume_merkezleri 3 oge, siluet_skoru float olarak mevcut.
        """
        np.random.seed(0)
        mahalleler = []
        for i in range(10):
            mahalleler.append({
                "ad": f"Mahalle{i+1}",
                "yesil_alan_orani": round(float(np.clip(np.random.normal(0.3, 0.2), 0, 1)), 6),
                "bina_yogunlugu": round(float(np.clip(np.random.normal(0.3, 0.2), 0, 1)), 6),
                "olceklenmis_maruziyet": round(float(np.clip(np.random.normal(0.45, 0.15), 0.1, 1)), 6),
            })
        govde = {"mahalleler": mahalleler, "kume_sayisi": 3}
        yanit = self.client.post("/tipoloji", json=govde)
        self.assertEqual(yanit.status_code, 200)
        veri = yanit.get_json()
        self.assertEqual(len(veri["sonuclar"]), 10)
        for sonuc in veri["sonuclar"]:
            tip = sonuc["tipoloji"]
            self.assertIsInstance(tip, int)
            self.assertGreaterEqual(tip, 0)
            self.assertLessEqual(tip, 2)
        self.assertEqual(len(veri["kume_merkezleri"]), 3)
        self.assertIsInstance(veri["siluet_skoru"], float)

    # ----------------------------------------------------------------
    # TC-34: yakin maruziyet, belirgin yesil/bina ayrimi, 2 kume
    # ----------------------------------------------------------------
    def test_tc34_tipoloji_yakin_maruziyet_ayrim_testi(self):
        """
        TC-34: 6 mahalle; maruziyet degerleri cok yakin (~0.5),
        yesil_alan_orani ve bina_yogunlugu iki ayri grup olusturur.
        kume_sayisi=2 ile kumeleme yap; etiketler grup A/B yi ayirmali.
        Ayrica maruziyet siralamasiyla etiketler ortusmemeli.
        """
        # Grup A: yuksek yesil, dusuk bina
        a1 = {"ad": "A1", "yesil_alan_orani": 0.7, "bina_yogunlugu": 0.1, "olceklenmis_maruziyet": 0.50}
        a2 = {"ad": "A2", "yesil_alan_orani": 0.72, "bina_yogunlugu": 0.08, "olceklenmis_maruziyet": 0.52}
        a3 = {"ad": "A3", "yesil_alan_orani": 0.68, "bina_yogunlugu": 0.12, "olceklenmis_maruziyet": 0.48}
        # Grup B: dusuk yesil, yuksek bina
        b1 = {"ad": "B1", "yesil_alan_orani": 0.1, "bina_yogunlugu": 0.7, "olceklenmis_maruziyet": 0.49}
        b2 = {"ad": "B2", "yesil_alan_orani": 0.12, "bina_yogunlugu": 0.68, "olceklenmis_maruziyet": 0.51}
        b3 = {"ad": "B3", "yesil_alan_orani": 0.08, "bina_yogunlugu": 0.72, "olceklenmis_maruziyet": 0.47}

        mahalleler = [a1, a2, a3, b1, b2, b3]
        govde = {"mahalleler": mahalleler, "kume_sayisi": 2}
        yanit = self.client.post("/tipoloji", json=govde)
        self.assertEqual(yanit.status_code, 200)
        veri = yanit.get_json()

        # Etiketleri topla
        sonuclar = veri["sonuclar"]
        etiket_a = set()
        etiket_b = set()
        for s in sonuclar:
            if s["ad"].startswith("A"):
                etiket_a.add(s["tipoloji"])
            else:
                etiket_b.add(s["tipoloji"])
        # Grup ici tutarlilik: her grup icinde tek etiket olmali
        self.assertEqual(len(etiket_a), 1, f"Grup A icinde birden fazla etiket: {etiket_a}")
        self.assertEqual(len(etiket_b), 1, f"Grup B icinde birden fazla etiket: {etiket_b}")
        # Gruplar farkli etiket almali
        self.assertNotEqual(etiket_a, etiket_b)

        # Maruziyet ortalamalarinin yakin oldugunu ve ayrimin maruziyete gore olmadigini dogrula
        maruziyet_a = np.mean([m["olceklenmis_maruziyet"] for m in mahalleler if m["ad"].startswith("A")])
        maruziyet_b = np.mean([m["olceklenmis_maruziyet"] for m in mahalleler if m["ad"].startswith("B")])
        self.assertLess(abs(maruziyet_a - maruziyet_b), 0.05,
                        "Maruziyet ortalamalari arasinda anlamli fark olmamali")
        # Eger sadece maruziyete gore siralansaydi etiketler bu kadar net ayrismazdi;
        # bu, ek StandardScaler uygulanmadiginin bir gostergesidir.

    # ----------------------------------------------------------------
    # TC-26: /projeksiyon net trendler, iki farkli ufuk kontrolu
    # ----------------------------------------------------------------
    def test_tc26_projeksiyon_dogrusal_trend_ve_ufuk(self):
        """
        TC-26: 3 mahalle; her biri en az 10 yillik (2016-2025) net trend
        (artan, azalan, sabit). ufuk_yil=5 ile cagir; tahmin yonu ve
        alan varligini dogrula. Ayni veriyle ufuk_yil=10 cagirip
        tahminlerin farkli oldugunu kontrol et.
        """
        # Sabit trend (yaklasik 1200)
        sabit_seri = {str(y): 1200 + int(np.round(np.random.normal(0, 2))) for y in range(2016, 2026)}
        # Artan trend: 1000 -> 1500
        artan_seri = {str(y): round(1000 + (y - 2016) * 50) for y in range(2016, 2026)}
        # Azalan trend: 2000 -> 1500
        azalan_seri = {str(y): round(2000 - (y - 2016) * 50) for y in range(2016, 2026)}

        mahalleler = [
            {"ad": "Sabit", "nufus_serisi": {str(y): v for y, v in sabit_seri.items()}},
            {"ad": "Artan", "nufus_serisi": {str(y): v for y, v in artan_seri.items()}},
            {"ad": "Azalan", "nufus_serisi": {str(y): v for y, v in azalan_seri.items()}},
        ]
        # ufuk_yil=5
        yanit5 = self.client.post("/projeksiyon", json={"mahalleler": mahalleler, "ufuk_yil": 5})
        self.assertEqual(yanit5.status_code, 200)
        veri5 = yanit5.get_json()
        self.assertEqual(len(veri5["sonuclar"]), 3)
        for s in veri5["sonuclar"]:
            self.assertIn("tahmini_nufus", s)
            self.assertIsInstance(s["tahmini_nufus"], int)
            self.assertEqual(s["yontem"], "dogrusal_trend_son_10_yil")
            self.assertIn("-", s["kullanilan_veri_araligi"])
            if s["ad"] == "Artan":
                # Artan trend: tahmini son yildan buyuk olmali
                son_pop = artan_seri["2025"]
                self.assertGreater(s["tahmini_nufus"], son_pop)
            elif s["ad"] == "Azalan":
                son_pop = azalan_seri["2025"]
                self.assertLess(s["tahmini_nufus"], son_pop)
        # ufuk_yil=10
        yanit10 = self.client.post("/projeksiyon", json={"mahalleler": mahalleler, "ufuk_yil": 10})
        self.assertEqual(yanit10.status_code, 200)
        veri10 = yanit10.get_json()
        for s5, s10 in zip(veri5["sonuclar"], veri10["sonuclar"]):
            if s5["ad"] in ("Artan", "Azalan"):
                self.assertNotEqual(s5["tahmini_nufus"], s10["tahmini_nufus"],
                                    f"{s5['ad']} icin farkli ufuklarda ayni tahmin donmemeli")
            elif s5["ad"] == "Sabit":
                # Sabit trendde ufuk yili tahmini neredeyse degistirmez,
                # iki tahminin birbirine yakin olmasi beklenir.
                self.assertAlmostEqual(s5["tahmini_nufus"], s10["tahmini_nufus"], delta=20,
                                       msg=f"Sabit icin farkli ufuklarda tahminlerin yakin olmasi beklenir")

    # ----------------------------------------------------------------
    # TC-30: aciklanabilirlik alanlari
    # ----------------------------------------------------------------
    def test_tc30_aciklanabilirlik_alanlari_mevcut(self):
        """
        TC-30: /tipoloji yanitinda belirleyici_ozellik, /projeksiyon
        yanitinda yontem ve kullanilan_veri_araligi alanlari var.
        """
        # Tipoloji icin TC-25 verisini kullanabiliriz
        np.random.seed(0)
        mahalleler = [
            {"ad": f"M{i}", "yesil_alan_orani": round(float(np.clip(np.random.normal(0.3, 0.2), 0, 1)), 6),
             "bina_yogunlugu": round(float(np.clip(np.random.normal(0.3, 0.2), 0, 1)), 6),
             "olceklenmis_maruziyet": round(float(np.clip(np.random.normal(0.45, 0.15), 0.1, 1)), 6)}
            for i in range(6)
        ]
        tip_yanit = self.client.post("/tipoloji", json={"mahalleler": mahalleler, "kume_sayisi": 2})
        self.assertEqual(tip_yanit.status_code, 200)
        tip_veri = tip_yanit.get_json()
        for merkez in tip_veri["kume_merkezleri"]:
            self.assertIn("belirleyici_ozellik", merkez)
            # belirleyici none veya string olabilir, ama varligini kontrol et
            self.assertIsNotNone(merkez)  # key var
        # Projeksiyon icin TC-26 verisini kullan
        artan = {str(y): 1000 + (y-2016)*50 for y in range(2016, 2026)}
        proj_yanit = self.client.post("/projeksiyon", json={
            "mahalleler": [{"ad": "Test", "nufus_serisi": artan}],
            "ufuk_yil": 5
        })
        self.assertEqual(proj_yanit.status_code, 200)
        proj_veri = proj_yanit.get_json()
        for s in proj_veri["sonuclar"]:
            self.assertEqual(s["yontem"], "dogrusal_trend_son_10_yil")
            self.assertIn("-", s["kullanilan_veri_araligi"])

    # ----------------------------------------------------------------
    # Hata yollari (NF-07 / F-21 / F-22 kabul kriterleri)
    # ----------------------------------------------------------------
    def test_tipoloji_kume_sayisi_yoksa_400(self):
        yanit = self.client.post("/tipoloji", json={"mahalleler": [{"ad": "X", "yesil_alan_orani": 0.1,
                                                                     "bina_yogunlugu": 0.2,
                                                                     "olceklenmis_maruziyet": 0.3}]})
        self.assertEqual(yanit.status_code, 400)
        self.assertIn("hata", yanit.get_json())

    def test_tipoloji_kume_sayisi_1_ise_400(self):
        yanit = self.client.post("/tipoloji", json={"mahalleler": [{"ad": "X", "yesil_alan_orani": 0.1,
                                                                     "bina_yogunlugu": 0.2,
                                                                     "olceklenmis_maruziyet": 0.3}],
                                                    "kume_sayisi": 1})
        self.assertEqual(yanit.status_code, 400)
        self.assertIn("hata", yanit.get_json())

    def test_tipoloji_kume_sayisi_cok_buyuk_400(self):
        mahalleler = [{"ad": f"M{i}", "yesil_alan_orani": 0.1, "bina_yogunlugu": 0.2,
                       "olceklenmis_maruziyet": 0.3} for i in range(3)]
        # kume_sayisi 3 (>= len-1 yani 2 den buyuk) 400 olmali
        yanit = self.client.post("/tipoloji", json={"mahalleler": mahalleler, "kume_sayisi": 3})
        self.assertEqual(yanit.status_code, 400)

    def test_projeksiyon_eksik_veri_400(self):
        # 5 yildan az veri
        az_seri = {"2019": 1000, "2020": 1010, "2021": 1020, "2022": 1030}
        yanit = self.client.post("/projeksiyon", json={
            "mahalleler": [{"ad": "AzVeri", "nufus_serisi": az_seri}],
            "ufuk_yil": 5
        })
        self.assertEqual(yanit.status_code, 400)
        msg = yanit.get_json()["hata"]
        self.assertIn("AzVeri", msg)

    def test_projeksiyon_ufuk_yil_yoksa_400(self):
        seri = {str(y): 1000 for y in range(2016, 2026)}
        yanit = self.client.post("/projeksiyon", json={
            "mahalleler": [{"ad": "T", "nufus_serisi": seri}]
        })
        self.assertEqual(yanit.status_code, 400)
        self.assertIn("hata", yanit.get_json())

    # ----------------------------------------------------------------
    # QA tarafindan bulunan regresyon testleri: kontrolsuz 500 hatalari
    # ----------------------------------------------------------------
    def test_projeksiyon_nan_nufus_degeri_400_donmeli(self):
        """
        NaN, isinstance(v, (int, float)) kontrolunu gecer (Python'da
        float('nan') gecerli bir float'tir) ama int(round(nan)) ValueError
        firlatir. Bu, denetlenen bir 400 yerine kontrolsuz bir 500'e yol
        acmamalidir.
        """
        seri = {"2016": 100, "2017": 110, "2018": 120, "2019": 130, "2020": float("nan")}
        yanit = self.client.post("/projeksiyon", json={
            "mahalleler": [{"ad": "NanTest", "nufus_serisi": seri}],
            "ufuk_yil": 5,
        })
        self.assertNotEqual(yanit.status_code, 500,
                            "NaN nufus degeri kontrolsuz 500'e yol aciyor")
        self.assertEqual(yanit.status_code, 400)

    def test_projeksiyon_infinity_nufus_degeri_400_donmeli(self):
        seri = {"2016": 100, "2017": 110, "2018": 120, "2019": 130, "2020": float("inf")}
        yanit = self.client.post("/projeksiyon", json={
            "mahalleler": [{"ad": "InfTest", "nufus_serisi": seri}],
            "ufuk_yil": 5,
        })
        self.assertNotEqual(yanit.status_code, 500,
                            "Infinity nufus degeri kontrolsuz 500'e yol aciyor")
        self.assertEqual(yanit.status_code, 400)

    def test_tipoloji_nan_ozellik_degeri_400_donmeli(self):
        """
        /tipoloji tarafinda ayni sinif hata: NaN bir sayidir
        (isinstance kontrolunu gecer) ama KMeans.fit icinde sklearn
        'Input X contains NaN' ile kontrolsuz 500 firlatir.
        """
        mahalleler = [
            {"ad": "M0", "yesil_alan_orani": float("nan"), "bina_yogunlugu": 0.1, "olceklenmis_maruziyet": 0.3},
            {"ad": "M1", "yesil_alan_orani": 0.2, "bina_yogunlugu": 0.2, "olceklenmis_maruziyet": 0.4},
            {"ad": "M2", "yesil_alan_orani": 0.3, "bina_yogunlugu": 0.3, "olceklenmis_maruziyet": 0.5},
            {"ad": "M3", "yesil_alan_orani": 0.4, "bina_yogunlugu": 0.4, "olceklenmis_maruziyet": 0.6},
        ]
        yanit = self.client.post("/tipoloji", json={"mahalleler": mahalleler, "kume_sayisi": 2})
        self.assertNotEqual(yanit.status_code, 500,
                            "NaN ozellik degeri kontrolsuz 500'e yol aciyor")
        self.assertEqual(yanit.status_code, 400)

    def test_tipoloji_yinelenen_noktalar_ile_kume_sayisi_saglanamiyorsa_500_olmamali(self):
        """
        Butun mahalleler ayni (veya birbirine cok yakin) ozellik degerlerine
        sahipse KMeans, istenen kume_sayisi kadar farkli kume uretemez.
        silhouette_score bu durumda 'Number of labels is 1. Valid values
        are 2 to n_samples - 1' ValueError'i ile kontrolsuz 500 firlatir.
        Servis bunu ya denetlenen bir hataya cevirmeli ya da makul bir
        sekilde ele almalidir; kontrolsuz 500 olmamalidir.
        """
        mahalleler = [
            {"ad": f"M{i}", "yesil_alan_orani": 0.5, "bina_yogunlugu": 0.5, "olceklenmis_maruziyet": 0.5}
            for i in range(4)
        ]
        yanit = self.client.post("/tipoloji", json={"mahalleler": mahalleler, "kume_sayisi": 2})
        self.assertNotEqual(yanit.status_code, 500,
                            "Yinelenen/ozdes noktalar kontrolsuz 500'e yol aciyor")


if __name__ == "__main__":
    unittest.main()
