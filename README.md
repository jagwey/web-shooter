# Jagwey Web Shooter

Windows masaüstü örtüsü. Şeffaf katman seçtiğin ekranın üstünde durur. Webcam elini görür, ağ işareti ağ atar, vuruş gerçek pencereyi iter. Yumruk pencereyi sürükler, bırakınca fırlatır.

A Windows desktop overlay. A transparent layer sits on the display you pick. The webcam reads your hand, the web sign shoots, and a hit moves a real window. A fist drags; letting go flings.

## Neden Tauri

Electron ikinci bir Chromium taşır ve boşta bile yüzlerce MB yer. Tauri, Windows’ta zaten yüklü olan WebView2’yi kullanır. Pencere taşıma (`EnumWindows`, `SetWindowPos`) Rust içindedir. El modeli float16 MediaPipe görevidir, ayrı bir worker’da çalışır.

Electron would ship a second Chromium. Tauri uses the WebView2 runtime already on Windows. Window moves (`EnumWindows`, `SetWindowPos`) stay in Rust. The float16 MediaPipe hand model runs in a worker.

120 Hz bir panelde örtü çizimi `requestAnimationFrame` ile ekran tazelemesine kilitlenir. Tespit, bir kare 8 ms’den kısaysa 120’ye kadar çıkar; daha yavaşsa aralığı uzatır ki çizim aç kalmasın. El yokken tespit yaklaşık 4 Hz’e iner ve ağ yoksa örtü boyamayı durdurur. Tepside, kontrol de örtü de kapalıyken kamera kapanır ve worker silinir.

On a 120 Hz panel the overlay paint follows the display refresh. Detection aims for 120 Hz only while a single detect stays under about 8 ms, then backs off so painting is not starved. With no hand, detection drops to about 4 Hz and the overlay stops painting when no web is on screen. In the tray, with both windows hidden, the camera closes and the worker is dropped.

## Kurulum / Build the exe

Windows 10/11, WebView2, [Rust](https://rustup.rs), ve Visual Studio C++ araçları gerekir.

```bash
npm install
npm run desktop
npm run desktop:build
```

Kurulum dosyası: `src-tauri/target/release/bundle/nsis/`. `npm run desktop` geliştirme penceresini açar. `npm run desktop:build` NSIS `.exe` kurucusunu üretir.

`npm test` jest, bağlama ve katalog testlerini çalıştırır.

## İlk açılış

1. Kamera adımında Windows iznini ver. Reddetmek uygulamayı kapatmaz; tekrar dene düğmesi durur.
2. Ekran seç veya tüm ekranları kapla. Monitör takılınca veya çıkınca liste yenilenir; seçili ekran kaybolursa örtü ana ekrana geçer.
3. Örtü anahtarı katmanı açar. Kontrol penceresini kapatmak uygulamayı kapatmaz; tepside kalır.
4. `Ctrl+Alt+J` örtüyü açar/kapatır. `Ctrl+Alt+K` kontrolü gösterir. Tuşlar ayardan değişir, yeni bağ eklenebilir.
5. Windows ile aç seçilirse uygulama `--tray` ile, kamerayı açmadan başlar.

Efektler: Klasik (SpiderSense camgöbeği), Nane, Neon, Hafif. Hafif mod gölge ve parçacığı kısar.

Kamera kartı aygıt adını gösterir. Windows, İzin deposundaki `LastUsedTimeStart` / `LastUsedTimeStop` kayıtlarından kamerayı tutan uygulamayı okur. Meşgulse ad yazılır ve tekrar dene çıkır. Bu kayıt her uygulamada dolmaz; dolmazsa arayüz bunu gizlemez, yalnızca bildiği adı yazar.

## Jest

İşaret ve serçe açık, orta ve yüzük kapalı: atış. Yumruk: altındaki pencereyi tut ve sürükle. Açık avuç: bırak. Başparmak serbest. Bu kontrol jesti SpiderSense’ten uyarlanmıştır (MIT, Rittika Das).

## Düzen

```
index.html                 kontrol penceresi
overlay.html               şeffaf örtü
src/gestures.js            ağ / yumruk / avuç
src/effects.js             ağ çizimi ve efekt seçenekleri
src/hands-worker.js        MediaPipe worker
src-tauri/src/win32.rs     EnumWindows, SetWindowPos, kamera kaydı
src-tauri/src/lib.rs       tepsi, kısayol, ekran takibi
```

Linux’ta kabuk derlenir; Win32 çağrıları “yalnızca Windows” döner. Ürün hedefi Windows exe’dir.
