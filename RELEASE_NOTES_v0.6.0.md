# Jagwey Web Shooter v0.6.0 🕸️⚡🌸

### 🎮 Aktif El Komutları & Hareketler (Active Gestures & Commands)
| Hareket | Görsel | Eylem | Açıklama |
|---|---|---|---|
| **Yumruk** (`fist`) | ✊ | **Pencereyi Tut & Taşı** (`grab`) | Hedef pencereyi yakalar, elinizle sürükler. Diğer monitöre doğru hızlıca savurursanız (el kameradan çıksa bile) pencereyi yan ekrana fırlatır. |
| **Fiske (OK Hareketi)** (`flick`) | 👌 | **Sekmeyi Anında Kapat** (`close_tab`) | Başparmak ve işaret parmağıyla fiske atın; aktif sekmeyi (`Ctrl+W`) **0ms bekleme süresiyle** anında kapatır. |
| **Alkış (İki El)** (`clap`) | 👏 | **Medya Oynat / Durdur** (`media_play_pause`) | İki elinizi hızla birbirine vurun (alkış yapın); çalan müzik veya videoyu anında oynatır ya da durdurur. |
| **Açık Avuç** (`palm`) | 🖐️ | **Bırak / İptal Et** (`cancel`) | Tutulan pencereyi hemen serbest bırakır, eylemi iptal eder. |
| **Zafer İşareti** (`peace`) | ✌️ | **Pencereyi Küçült** (`minimize`) | İşaret ve orta parmak açık (~0,6 sn); hedef pencereyi görev çubuğuna simge durumuna küçültür. |
| **Örümcek Ağı / Rock** (`web`) | 🤟 | **Pencereyi / Sekmeyi Kapat** (`close`) | İşaret + serçe parmak açık (~0,8 sn); aktif pencere veya sekmeyi güvenle kapatır. |
| **Özel Hareket** (`custom`) | 📸 | **Özel Eylem** | Stüdyoda kameraya bir poz tanıtıp ad vererek istediğiniz eyleme bağlayabilirsiniz. |

---

### ⌨️ Klavye Kısayolları (Global Hotkeys)
- **`Ctrl + Alt + J`** : Masaüstü şeffaf örtüsünü açar veya kapatır (`overlay_toggle`).
- **`Ctrl + Alt + K`** : Jagwey Kontrol Panelini ekrana getirir (`show_control`).
- **`Ctrl + Alt + P`** : El hareketlerini duraklatır veya tekrar başlatır (`gestures_pause`). *(Oyun oynarken veya video izlerken yanlış algılamayı önler).*

---

### 🗑️ Kaldırılan Eski ve Kararsız Özellikler (Removed / Deprecated)
- ❌ **Avuç İçi Bekletme ile Medya Aç/Kapa (`isAirMediaHold`):** Kaldırıldı; yerine çok daha hızlı ve net çalışan **👏 İki El Alkış (`isHandClap`)** komutu getirildi.
- ❌ **`gojo` (İki El Hollow Purple Duruşu):** Aşırı CPU yükü ve çift el derinlik karmaşası yarattığı için kaldırıldı.
- ❌ **`finger_gun` & `point`:** Günlük kullanımda kazara tetiklenmelere yol açtığı için kaldırıldı.
- ❌ **`pinch` & `air_scroll`:** Kararsız eksen okumaları nedeniyle temizlendi.
- ❌ **`maximize_restore`:** Pencere DPI ve ekran ölçeklendirmesini bozduğu için kaldırıldı.

---

### ✨ Yenilikler ve İyileştirmeler (What's New in v0.6.0)
- 👏 **Alkış ile Medya Kontrolü (`isHandClap`):**
  - İki elinizi birbirine vurduğunuz anda yaklaşma hızı ve avuç mesafesi analiz edilerek medya anında başlatılır veya duraklatılır.
- 👌 **0ms Fiske ile Sekme Kapatma (`isFlickRelease`):**
  - OK pozisyonundan işaret parmağınızı hızla fiskelediğinizde Win32 `AttachThreadInput` + `SendInput(Ctrl+W)` ile 60ms uyku gecikmesi olmadan aktif sekme anında kapanır.
- 🚀 **Çok Hızlı Hareketlerde Kesintisiz Yan Ekrana Fırlatma:**
  - Elinizi çok hızlı savurduğunuzda kamera bulanıklığı veya elin kadrajdan çıkması nedeniyle pencerenin yarı yolda durması sorunu (`parkGrab`) tamamen giderildi. Hız vektörü yan ekranı işaret ediyorsa pencere anında diğer monitöre uçar. Negatif koordinatlı (sol/üst) ikinci monitör desteği (`SM_XVIRTUALSCREEN`) eklendi.
- 🌸 **Gerçek Anime Karakter Teması (`Anime Edition`):**
  - Üst çubuktaki **🌸 Anime Modu** butonu ve Görünüm sekmesiyle aktifleşen özel Anime teması!
  - Seçilebilir 3 özel anime karakter eşlikçisi: **Satoru Ren (Sonsuzluk Büyücüsü)**, **Akari Kumo (Neon Örümcek Kunoichi)** ve **Raiden Kuro (Yıldırım Shinobi)**.
  - Karakterler yaptığınız el hareketlerine (pencere tutma, yan ekrana fırlatma, fiske, alkış) canlı konuşma balonu replikleriyle tepki verir.
- 🛡️ **Kusursuz Buton & Metin Hizalaması:**
  - Kamera üst çubuğundaki (`Ayna`, `Büyüt`), hareket kontrollerindeki ve tüm kartlardaki buton sabitlikleri güçlendirildi; hiçbir ekran boyutunda yazılar taşmaz veya butonların yeri şaşmaz.
- 🧪 **131/131 Test Başarısı:**
  - Tüm çekirdek, hareket, filtre, çoklu monitör fırlatma ve arayüz testleri eksiksiz geçmektedir.

---

### 📦 Kurulum:
- İndirin: `Jagwey.Web.Shooter_0.6.0_x64-setup.exe`
- Çalıştırın, kurulum otomatik olarak tamamlanıp uygulamayı başlatacaktır.
