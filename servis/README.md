# ARC-05 AI Servisi

Bu servis, Basaksehir Isi Adasi karar destek sistemi icin
bagimsiz bir Flask HTTP servisidir.

## Calistirma

```bash
pip install -r requirements.txt
python uygulama.py
```

Varsayilan olarak `http://0.0.0.0:5000` adresinde calisir.

## Uc Noktalar

### GET /saglik

Servis surum bilgisi ve son egitim zamanini dondurur.

### POST /tipoloji

Girdi: mahalleler listesi (`ad`, `yesil_alan_orani`, `bina_yogunlugu`,
`olceklenmis_maruziyet`) ve `kume_sayisi`.
Cikti: her mahalle icin atanan tipoloji kumesi, kume merkezleri,
belirleyici ozellik ve siluet skoru.

### POST /projeksiyon

Girdi: mahalleler listesi (`ad`, `nufus_serisi`) ve `ufuk_yil`.
Cikti: her mahalle icin "dogrusal_trend_son_10_yil" yontemiyle hesaplanan
tahmini nufus ve kullanilan veri araligi.

## Son Egitim Zamani

Bu servis durumsuzdur; her istekte model sifirdan hesaplanir.
`/saglik` uc noktasindaki `son_egitim_zamani`, servis surecinin
basladigi ani gosterir. Bu deger, kodun/modelin en son hangi anda
kullanima alindigini ifade eder ve istek basina degismez.
