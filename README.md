# Jagwey Web Shooter 🕸️

**Windows Masaüstü Örümcek Ağı Katmanı (Desktop Overlay & Window Fling)**  
Tauri 2 + MediaPipe Hands (Float16 Web Worker) + Win32 API (`EnumWindows`, `SetWindowPos`)  
Geliştirici: **Jagwey** (Osman) · Repo: [github.com/jagwey/web-shooter](https://github.com/jagwey/web-shooter)

---

## 🇹🇷 Türkçe Açıklama

**Jagwey Web Shooter**, ekranınızın üzerinde tamamen şeffaf ve fare tıklamalarını geçiren (`WS_EX_TRANSPARENT`) bir katman oluşturarak webcam aracılığıyla ellerinizi takip eder. Klasik Spider-Man ağ atma işaretiyle gerçek pencerelere ağ atıp geri teptirebilir, yumruk yaparak altındaki pencereyi tutup sürükleyebilir ve elinizi açtığınızda pencereyi fiziksel momentumuyla ekran boyunca fırlatabilirsiniz!

### ✨ Öne Çıkan Özellikler

1. **Çift El Desteği (Dual-Hand Tracking):**
   - MediaPipe ile aynı anda 2 eli birden takip eder.
   - İki elinizle bağımsız olarak ağ atabilir (`double-web shoot`) veya iki ayrı pencereyi tutup ekranın farklı köşelerine fırlatabilirsiniz.

2. **Örümcek Adam Temaları (Themes & Looks):**
   - 🕷️ **Spider-Man (Klasik):** Canlı kırmızı ışıma, örümcek mavisi lifler ve saf beyaz örümcek ağı.
   - ⚡ **Miles Morales:** Karbon siyahı ve altın biyo-elektrik kıvılcımları, neon kırmızı atış hattı.
   - 🖤 **Symbiote (Venom):** Gece karası ve parlak mor dokunaçlar, mor biyolüminesans parçacıklar.
   - 🌿 **Jagwey Mint:** Forest Green ve ferahlatıcı nane yeşili ışıma.
   - 🌈 **Cyber Neon:** Synthwave pembe ve neon kireç yeşili lazer ağı.
   - *Arayüz, seçilen temanın renk paletine anında bürünür.*

3. **Gerçekçi Ses Efektleri (Synthesized Web Audio FX):**
   - Harici ses dosyası indirmeden, sıfır gecikmeli Web Audio API ile üretilen efsanevi çizgi roman ağ atış sesi (**THWIP!**), pencere vuruş tokmağı, gerilme ipi çınlaması ve fırlatma rüzgarı.
   - Ayarlardan tek tıkla açılıp kapatılabilir.

4. **Akıcı 120 FPS / 60 FPS Seçeneği:**
   - **120 FPS (Ultra Akıcı):** Yüksek tazeleme hızına sahip monitörler için 6-8 ms tespit döngüsü ile e-spor seviyesinde pürüzsüz takip.
   - **60 FPS (Pil & Eko):** Güç tasarrufu için optimize edilmiş 60 Hz kilitli takip.
   - **Akıllı Boşta Bekleme (Idle Throttle):** Ekranda el yokken tespit 4 Hz'e iner; ağ yokken boyama tamamen durur (sıfır GPU/CPU tüketimi).

5. **Gerçek Pencereleri Tut & Fırlat (Win32 Mechanics):**
   - **Yumruk:** Elin altındaki en üst Z-sıralı pencereyi yakalar, gergin ağ ipi (`tether`) ile elinize bağlar.
   - **Açık Avuç:** Pencereyi elinizin fırlatma hızıyla (`velocity`) ekran boyunca momentumla fırlatır.
   - **Akıllı Yaslama (Snap):** Ekranın soluna/sağına fırlatılan pencereler yarı ekrana yaslanır; üst kenara fırlatılanlar tam ekran olur.
   - **Ekran Dışı Koruma:** Sert fırlatmalarda pencerelerin ekran dışına kaybolması engellenir.
   - **Maksimize Pencere Desteği:** Ekranı kaplayan pencereler tutulduğunda otomatik serbest pencereye dönüştürülür.

6. **Kamera & Güç Yönetimi:**
   - Çoklu kamera desteği (webcam seçimi arayüzden anında değiştirilebilir).
   - Windows Registry üzerinden kamerayı o anda kullanan diğer uygulamaların (Chrome, Discord, Zoom vb.) anlık tespiti.
   - **Temiz Kapatma:** Pencere kapatıldığında veya tepsiye küçültüldüğünde kamera donanımı ve worker derhal serbest bırakılır (kamera ışığı söner).
   - Arka planda yalnızca ~50 MB RAM tüketir (Electron'a kıyasla 5-10 kat daha hafif).

---

## 🇬🇧 English Summary

**Jagwey Web Shooter** is a lightweight, ultra-responsive Windows desktop overlay powered by Tauri 2, MediaPipe Hands (float16 WebAssembly Worker), and native Win32 APIs (`EnumWindows`, `SetWindowPos`). 

Point your webcam, flick the iconic Spider-Man web-sign to shoot cinematic webs at real windows, grab them with a fist, and fling them across your monitors with natural physics momentum!

### Key Capabilities
- **Dual-Hand Tracking:** Track both hands simultaneously for double-web shoots or two-window manipulation.
- **Iconic Spidey Themes:** Classic Spider-Man (Red & Blue), Miles Morales (Bio-Electric Gold & Crimson), Symbiote (Dark Purple Tendrils), Jagwey Mint, and Cyber Neon.
- **Procedural Audio FX:** Instant synthesized Web Audio API sound effects featuring the iconic **THWIP!** web-shooter sound, impact thuds, and whoosh flings.
- **60 FPS & 120 FPS Modes:** Choose between Eco 60 FPS or silky-smooth 120 FPS high-refresh tracking.
- **Native Win32 Integration:** Smooth window drag, fling physics with edge snapping (half-screen / maximize), and Z-order window detection underneath transparent click-through layers.
- **Ultra-Low Memory:** Built on Rust + WebView2 (uses ~50 MB RAM vs Electron's 400+ MB).
- **Clean Hardware Release:** Camera hardware turns off completely when minimized or idle.

---

## 🎮 Jestler / Gestures

| Hareket / Gesture | Nasıl Yapılır / How-to | Eylem / Action |
|-------------------|------------------------|----------------|
| 🤟 **Ağ İşareti (Web Sign)** | İşaret ve serçe açık, orta ve yüzük kapalı | Ağ atar (**THWIP!**), pencereyi geri teptirir |
| ✊ **Yumruk (Fist)** | Tüm parmaklar kapalı | Altındaki pencereyi tutar ve ağ ipiyle bağlar |
| 🖐️ **Açık Avuç (Open Palm)** | Tüm parmaklar açık | Pencereyi momentumla fırlatır (**Bırak**) |
| ☝️ **İşaret (Point)** | Yalnızca işaret parmağı açık | İsteğe bağlı / özel eylem atanabilir |

*Tüm jestler ve klavye kısayolları (`Ctrl+Alt+J`, `Ctrl+Alt+K`) arayüzdeki **Tuşlar / Controls** sekmesinden yeniden atanabilir.*

---

## 🛠️ Kurulum ve Derleme / Build from Source

### Gereksinimler
- Windows 10 / 11 (64-bit)
- WebView2 Runtime (Windows 10/11'de varsayılan olarak yüklüdür)
- Node.js 18+ & npm
- [Rust & Cargo](https://rustup.rs)
- Visual Studio C++ Build Tools (MSVC)

### Adımlar

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. Testleri çalıştır
npm test

# 3. Geliştirme modunda çalıştır
npm run desktop

# 4. Bağımsız Release Exe ve NSIS Kurucusunu derle
npm run desktop:build
```

> **Not:** Windows OneDrive kilitlenmelerini önlemek amacıyla derleme hedef dizini `src-tauri/.cargo/config.toml` ile otomatik olarak `C:\Users\<Kullanıcı>\.cargo-target\web-shooter` altına yönlendirilmiştir.

### Derleme Çıktıları
- **Standalone Portable Exe:** `dist-win/jagwey-web-shooter.exe`
- **NSIS Windows Installer:** `dist-win/Jagwey Web Shooter_0.1.0_x64-setup.exe`

---

## ⚖️ Lisans ve Haklar / License & Credits

- **Geliştirici:** Jagwey (Osman) — [github.com/jagwey/web-shooter](https://github.com/jagwey/web-shooter)
- **SpiderSense Uyarlaması:** Jest geometrisi ve sinematik eğrisel ağ çizimi Rittika Das'ın [SpiderSense](https://github.com/rittika-das/SpiderSense) projesinden uyarlanmıştır (MIT Lisansı korunmuştur, bkz. [`NOTICE`](./NOTICE)).
- **El Modeli:** Google MediaPipe Tasks Vision (`hand_landmarker.task`), Apache 2.0 Lisansı.
- Instagram üzerindeki ilham verici Spidey makarası yalnızca görsel motivasyon kaynağıdır; kod tabanı orijinal olarak sıfırdan Tauri 2 + Rust + Vanilla JS mimarisinde geliştirilmiştir.
