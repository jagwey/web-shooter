# Jagwey Web Shooter v0.6.0 🕸️⚡

### 🎮 Aktif El Komutları & Hareketler (Active Gestures & Commands)
| Hareket | Görsel | Eylem | Açıklama |
|---|---|---|---|
| **Yumruk** (`fist`) | ✊ | **Pencereyi Tut & Taşı** (`grab`) | Hedef pencereyi yakalar, elinizle sürükler. Hızlıca bırakırsanız diğer monitöre fırlatır. |
| **Açık Avuç** (`palm`) | 🖐️ | **Bırak / İptal Et** (`cancel`) | Tutulan pencereyi hemen serbest bırakır, eylemi iptal eder. |
| **Zafer İşareti** (`peace`) | ✌️ | **Pencereyi Küçült** (`minimize`) | İşaret ve orta parmak açık; hedef pencereyi görev çubuğuna simge durumuna küçültür. |
| **Örümcek Ağı** (`web`) | 🤟 | **Sekmeyi / Pencereyi Kapat** (`close`) | Klasik Spider-Man işareti (işaret + serçe açık); aktif sekmeyi/pencereyi güvenle kapatır. |
| **Özel Hareket** (`custom`) | 📸 | **Özel Eylem** | Stüdyoda kameraya bir poz tanıtıp ad vererek istediğiniz eyleme bağlayabilirsiniz. |

---

### ⌨️ Klavye Kısayolları (Global Hotkeys)
- **`Ctrl + Alt + J`** : Masaüstü şeffaf örtüsünü açar veya kapatır (`overlay_toggle`).
- **`Ctrl + Alt + K`** : Jagwey Kontrol Panelini ekrana getirir (`show_control`).
- **`Ctrl + Alt + P`** : El hareketlerini duraklatır veya tekrar başlatır (`gestures_pause`). *(Oyun oynarken veya video izlerken yanlış algılamayı önler).*

---

### 🗑️ Kaldırılan Eski ve Kararsız Özellikler (Removed / Deprecated)
Gereksiz CPU tüketen, yanlış tetiklenen ve kullanıcı deneyimini bozan eski özellikler temizlendi:
- ❌ **`flick` (OK Fiske Hareketi):** Başparmak-işaret temasındaki mikro titreşimler nedeniyle kaldırıldı.
- ❌ **`gojo` (İki El Hollow Purple Duruşu):** Aşırı CPU yükü ve çift el derinlik karmaşası yarattığı için kaldırıldı.
- ❌ **`finger_gun` (Parmak Tabancası):** Günlük kullanımda kazara tetiklenmelere yol açtığı için kaldırıldı.
- ❌ **`point` (İşaret Parmağı ile Gösterme):** Fare imleci ile çakıştığı için kaldırıldı.
- ❌ **`pinch` & `air_scroll` (Hava Kaydırma / Parmak Kıstırma):** Kararsız eksen okumaları nedeniyle temizlendi.
- ❌ **`maximize_restore`:** Pencere DPI ve ekran ölçeğini bozduğu için kaldırıldı.

---

### ✨ Yenilikler ve İyileştirmeler (What's New in v0.6.0)
- 🎨 **Soft Modern (Glassmorphism) Tasarım:**
  - Yenilenen anahtar butonlar (Switch Toggle Cards); metinler ve buton mandalları (`knob`) artık asla iç içe geçmez, ferah ve modern görünür.
  - Yarı saydam buzlu cam paneller (`backdrop-filter: blur(16px)`), neon reticle, minimalist başlık çubuğu.
  - **Minimal (Koyu)** ve **Anime** tema desteği ile açılıp kapatılabilen görsel efektler.
- ⚡ **0ms'ye Yakın PC Senkronizasyonu & Donanım Hızlandırma:**
  - **60 FPS Kamera Akışı**: Donanımın desteklediği en yüksek kare hızı otomatik negotiate edilir.
  - **Zero-GC Transferable Pipeline**: Web Worker ile arayüz arasında sıfır bellek kopyalama (`Float32Array(63)`).
  - **55ms Adaptif Kinematik Filtre**: Ani duruşlarda %80 frenleme sönümlemesi ile sıfır aşma (overshoot).
  - **1ms Win32 Zamanlayıcı Hassasiyeti**: `timeBeginPeriod(1)` ve atomik HWND önbellekleme.
- 🧪 **126/126 Test Başarısı:**
  - Tüm çekirdek, hareket, filtre ve arayüz testleri eksiksiz geçmektedir.

---

### 📦 Kurulum:
- İndirin: `Jagwey.Web.Shooter_0.6.0_x64-setup.exe`
- Çalıştırın, kurulum otomatik olarak tamamlanıp uygulamayı başlatacaktır.
