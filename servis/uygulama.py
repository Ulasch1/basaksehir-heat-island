"""
ARC-05 AI Servisi - Bagimsiz Flask HTTP servisi.

Bu servis stateless'tir; /tipoloji ve /projeksiyon her istekte kendi
modelini sifirdan hesaplar, kalici/egitilmis bir model saklanmaz.
Bu nedenle 'son_egitim_zamani', servis surecinin baslatildigi ani
temsil eder (en son bu kod surumunun/modelin kullanima alindigi an);
istek basina degisen bir deger degildir.
"""

from datetime import datetime, timezone
from flask import Flask, request, jsonify
import math
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from flask_cors import CORS

SERVIS_SURUMU = "1.0.0"
MODEL_SURUMU = "1.0.0"
_SERVIS_BASLATMA_ZAMANI = datetime.now(timezone.utc).isoformat()


def create_app():
    app = Flask(__name__)
    CORS(app)

    @app.route("/saglik", methods=["GET"])
    def saglik():
        return jsonify({
            "servis_surumu": SERVIS_SURUMU,
            "model_surumu": MODEL_SURUMU,
            "son_egitim_zamani": _SERVIS_BASLATMA_ZAMANI,
        })

    @app.route("/tipoloji", methods=["POST"])
    def tipoloji():
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"hata": "Gecerli JSON govde bekleniyor"}), 400

        # Validasyon: mahalleler listesi
        mahalleler = data.get("mahalleler")
        if not isinstance(mahalleler, list) or not mahalleler:
            return jsonify({"hata": "mahalleler bos olmayan bir liste olmalidir"}), 400

        # Her mahalle icin alan dogrulamasi
        for idx, m in enumerate(mahalleler):
            if not isinstance(m, dict):
                return jsonify({"hata": f"mahalleler[{idx}] bir sozluk olmalidir"}), 400
            # ad kontrol
            if "ad" not in m or not isinstance(m["ad"], str):
                return jsonify({"hata": f"mahalleler[{idx}] 'ad' alani (metin) eksik veya gecersiz"}), 400
            # sayisal alanlar
            for alan in ("yesil_alan_orani", "bina_yogunlugu", "olceklenmis_maruziyet"):
                if alan not in m or not isinstance(m[alan], (int, float)):
                    return jsonify({"hata": f"mahalleler[{idx}] '{alan}' alani sayisal olmali ve mevcut olmalidir"}), 400
                if not math.isfinite(m[alan]):
                    return jsonify({"hata": f"mahalleler[{idx}] '{alan}' alani sonlu (NaN/Infinity olmayan) bir sayi olmalidir"}), 400

        # kume_sayisi dogrulamasi
        kume_sayisi = data.get("kume_sayisi")
        if kume_sayisi is None:
            return jsonify({"hata": "kume_sayisi zorunludur"}), 400
        if not isinstance(kume_sayisi, int) or kume_sayisi < 2:
            return jsonify({"hata": "kume_sayisi en az 2 olan bir tam sayi olmalidir"}), 400
        if kume_sayisi > len(mahalleler) - 1:
            return jsonify({
                "hata": f"kume_sayisi ({kume_sayisi}), mahalle sayisindan ({len(mahalleler)}) en fazla 1 eksik olabilir"
            }), 400

        # Ozellik matrisini olustur (yesil_alan_orani, bina_yogunlugu, olceklenmis_maruziyet)
        X = []
        for m in mahalleler:
            X.append([m["yesil_alan_orani"], m["bina_yogunlugu"], m["olceklenmis_maruziyet"]])
        X = np.array(X)

        # TASARIM KARARI: Ek normallestirme uygulanmaz.
        # Gerekce: uc ozellik zaten karsilastirilabilir araliklarda (0-1, 0-1, 0.1-1).
        # Ek standardizasyon, dusuk varyansli maruziyet farklarini yapay olarak buyutup
        # yesil alan/bina yogunlugu gibi ayristirici guclu ozellikleri sulandirarak
        # TC-34 senaryosunun basarisiz olmasina yol acar.
        kmeans = KMeans(n_clusters=kume_sayisi, random_state=42, n_init=10)
        kmeans.fit(X)
        labels = kmeans.labels_.astype(int).tolist()

        benzersiz_kume_sayisi = len(set(labels))
        if benzersiz_kume_sayisi < 2:
            return jsonify({
                "hata": f"Girilen mahalleler birbirine cok yakin/ozdes; "
                        f"{kume_sayisi} farkli kume icin yeterli ayrisma yok "
                        f"(elde edilen benzersiz kume sayisi: {benzersiz_kume_sayisi})"
            }), 400

        sonuclar = [{"ad": m["ad"], "tipoloji": label} for m, label in zip(mahalleler, labels)]

        # Kume merkezleri ve belirleyici ozellik
        centers = kmeans.cluster_centers_
        means = np.mean(centers, axis=0)
        stds = np.std(centers, axis=0, ddof=0)

        ozellik_adlari = ["yesil_alan_orani", "bina_yogunlugu", "olceklenmis_maruziyet"]
        kume_merkezleri = []
        for i in range(kume_sayisi):
            center_vals = [float(centers[i][j]) for j in range(3)]
            belirleyici = None
            if np.all(stds <= 1e-9):
                belirleyici = None
            else:
                max_abs_z = -1
                for j in range(3):
                    if abs(stds[j]) > 1e-9:
                        z = (centers[i][j] - means[j]) / stds[j]
                    else:
                        z = 0.0
                    if abs(z) > max_abs_z:
                        max_abs_z = abs(z)
                        belirleyici = ozellik_adlari[j]
            kume_merkezleri.append({
                "tipoloji": i,
                "yesil_alan_orani": center_vals[0],
                "bina_yogunlugu": center_vals[1],
                "olceklenmis_maruziyet": center_vals[2],
                "belirleyici_ozellik": belirleyici,
            })

        try:
            sil = float(silhouette_score(X, kmeans.labels_))
        except ValueError:
            return jsonify({"hata": "Siluet skoru hesaplanamadi; kumeler yeterince ayristirici degil"}), 400

        return jsonify({
            "servis_surumu": SERVIS_SURUMU,
            "kume_sayisi": kume_sayisi,
            "olcekleme_uygulandi": False,
            "sonuclar": sonuclar,
            "kume_merkezleri": kume_merkezleri,
            "siluet_skoru": sil,
        })

    @app.route("/projeksiyon", methods=["POST"])
    def projeksiyon():
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"hata": "Gecerli JSON govde bekleniyor"}), 400

        mahalleler = data.get("mahalleler")
        if not isinstance(mahalleler, list) or not mahalleler:
            return jsonify({"hata": "mahalleler bos olmayan bir liste olmalidir"}), 400

        ufuk_yil = data.get("ufuk_yil")
        if ufuk_yil is None:
            return jsonify({"hata": "ufuk_yil zorunludur"}), 400
        if not isinstance(ufuk_yil, int) or ufuk_yil < 1:
            return jsonify({"hata": "ufuk_yil pozitif bir tam sayi olmalidir"}), 400

        # On kontrol: her mahallenin nufus_serisi en az 5 veri icermeli
        for m in mahalleler:
            if not isinstance(m, dict):
                return jsonify({"hata": "mahalleler listesindeki her oge bir sozluk olmalidir"}), 400
            if "ad" not in m or not isinstance(m["ad"], str):
                return jsonify({"hata": "her mahallede 'ad' (metin) bulunmalidir"}), 400
            seri = m.get("nufus_serisi")
            if not isinstance(seri, dict) or not seri:
                return jsonify({"hata": f"'{m['ad']}' icin gecerli bir nufus_serisi sozlugu gereklidir"}), 400
            valid_count = 0
            for y, v in seri.items():
                try:
                    int(y)
                except (ValueError, TypeError):
                    return jsonify({"hata": f"'{m['ad']}' icin nufus_serisi gecersiz bir yil anahtari iceriyor: '{y}'"}), 400
                if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
                    return jsonify({"hata": f"'{m['ad']}' icin nufus_serisi[{y}] sonlu (NaN/Infinity olmayan) sayisal bir deger olmalidir"}), 400
                valid_count += 1
            if valid_count < 5:
                return jsonify({"hata": f"'{m['ad']}' nufus_serisi en az 5 yil icermelidir, bulunan: {valid_count}"}), 400

        # Her mahalle icin projeksiyon
        sonuclar = []
        for m in mahalleler:
            seri = m["nufus_serisi"]
            yillar_pop = [(int(y), float(v)) for y, v in seri.items() if isinstance(v, (int, float)) and not isinstance(v, bool)]
            yillar_pop.sort(key=lambda x: x[0])
            # Sadece son 10 yili al (veya eksikse hepsini)
            pencere = yillar_pop[-10:]
            yillar = np.array([y for y, _ in pencere])
            pop = np.array([p for _, p in pencere])
            katsayilar = np.polyfit(yillar, pop, 1)
            egim, kesme = katsayilar[0], katsayilar[1]
            son_yil = yillar[-1]
            hedef_yil = son_yil + ufuk_yil
            tahmin = egim * hedef_yil + kesme
            tahmin_yuvarlanmis = max(0, int(round(tahmin)))
            ilk_yil = yillar[0]
            kullanilan_aralik = f"{ilk_yil}-{son_yil}"
            sonuclar.append({
                "ad": m["ad"],
                "tahmini_nufus": tahmin_yuvarlanmis,
                "hedef_yil": int(hedef_yil),
                "yontem": "dogrusal_trend_son_10_yil",
                "kullanilan_veri_araligi": kullanilan_aralik,
            })

        return jsonify({
            "servis_surumu": SERVIS_SURUMU,
            "ufuk_yil": ufuk_yil,
            "sonuclar": sonuclar,
        })

    return app


if __name__ == "__main__":
    create_app().run(debug=False, port=8000)
