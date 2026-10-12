# WebRunner

Alpine Linux'u doğrudan tarayıcıda çalıştıran, statik bir GitHub Pages sitesi.

## Nasıl çalışır?

- [v86](https://github.com/copy/v86), x86 bilgisayarını WebAssembly ile tarayıcıda emüle eder.
- GitHub Actions, v86 runtime dosyalarını ve Alpine Linux'un `latest-stable` x86 netboot kernel/initramfs dosyalarını yayınlama öncesinde `dist/assets` altına indirir.
- `main` dalına yapılan her push siteyi GitHub Pages'e deploy eder; zamanlanmış workflow her gün Alpine runtime'ını yeniler.
- Terminal içindeki komut kutusu, Enter veya **gönder** düğmesiyle komutu doğrudan emülatöre yollar.

## Yayınlama

1. Bu projeyi GitHub'a gönderin.
2. Repository Settings → Pages → Source bölümünde **GitHub Actions** seçin.
3. `main` dalına push edin veya Actions ekranından **Deploy WebRunner** workflow'unu manuel çalıştırın.

Workflow tamamlandığında site adresi Actions job özetinde görünür.

## Yerel önizleme

Statik dosyaları bir HTTP sunucusuyla açın:

```bash
python3 -m http.server 4173
```

Ardından <http://localhost:4173> adresine gidin. `assets/` klasörü yerelde yoksa uygulama geliştirme için v86 ve Alpine dosyalarını kaynak adreslerinden yüklemeyi dener; ağ erişimi yoksa GitHub Actions deploy'unun tamamlanmasını bekleyin.

## Lisans notu

Bu arayüz bu proje içindir. v86 kendi lisansına, Alpine Linux ise kendi lisans ve marka koşullarına tabidir.
