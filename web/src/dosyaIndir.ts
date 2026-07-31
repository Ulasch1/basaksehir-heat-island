/**
 * Tarayici dosya indirme yardimcisi.
 *
 * Dosya olusturup, gecici bir <a> elemani uzerinden kullaniciya indirtir.
 * Herhangi bir dis kutuphane kullanmaz.
 */
export function dosyaIndir(icerik: string, dosyaAdi: string, mimeType: string): void {
  const blob = new Blob([icerik], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dosyaAdi;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Turkce karakterleri ve bosluklari dosya adi icin guvenli hale getirir.
 * Standart ASCII disi karakterleri '-' ile degistirir.
 */
export function dosyaAdiGuvenliHaleGetir(metin: string): string {
  return metin
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
