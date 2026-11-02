# Jagwey Web Shooter v0.6.2

Bu sürüm kamera, el takibi ve pencere kontrolünde kararlılık düzeltmelerine odaklanır.

- Tepsiye gizleyip geri açınca el takibi motorunun yeniden başlamaması düzeltildi.
- Kamera açılırken kapatma isteği verilirse geç gelen kamera akışı artık kapatılıyor. Eski oturuma ait kareler işlenmiyor; kamera çıkarıldığında tekrar deneme gösteriliyor.
- Yanıt vermeyen motor ve tekrarlayan algılama hataları için zaman aşımı ve sınırlı CPU yeniden başlatma eklendi.
- Sekme kapatma için açık bir pencere hedefi zorunlu. Hedef odaklanamazsa veya odak değişirse klavye girdisi gönderilmiyor.
- El verileri worker ile arayüz arasında tek aktarılabilir buffer biçiminde taşınıyor.
- Yeni kurulumlar için dengeli 60 FPS varsayılanı; takip üst sınırı gerçek kamera hızına göre uygulanıyor. Mevcut kullanıcının tercihi korunuyor.
- AI API anahtarı Windows kullanıcı hesabına bağlı DPAPI şifrelemesiyle ayrı tutuluyor. Eski düz metin ayarlar taşınıyor; profil kopyalarından anahtarlar çıkarılıyor.
- Ayar/profil kayıtları atomik değiştirme ve son sağlam JSON yedeğiyle korunuyor. Özel jest adları HTML yerine düz metin işleniyor.
- Sürüm tutarlılığı testi düzeltildi; kamera/motor yaşam döngüsü, güvenli hedefleme ve gizli bilgi temizliği için regresyonlar eklendi.

Doğrulama: 143 JavaScript testi, 3 Windows yerel testi, sentetik benchmark/stres kontrolleri ve Windows kurulum derlemesi. Gerçek kamera/GPU çeşitliliğinde uzun kullanım ve temiz makinede yükseltme henüz doğrulanmadı; tüm donanımlarda kusursuzluk iddiası yoktur.

Kurulum dosyası Tauri otomatik güncelleme imzasıyla yayımlanır. Windows Authenticode yayıncı sertifikası mevcut değildir; ilk kurulumda Windows güven uyarısı çıkabilir.

Not: DPAPI ile saklanan API anahtarı başka bir Windows hesabına taşınamaz. Ayar dosyalarını başka hesaba taşırsanız anahtarı yeniden girmeniz gerekir.
