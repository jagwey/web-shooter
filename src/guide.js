// Offline knowledge base for the in-app assistant. Keys are lowercase, accent-free stems.
const KB = [
  {
    keys: ["tasi", "tut", "yumruk", "surukle", "move", "grab", "fist", "drag"],
    text: `Pencere taşımak (yumruk):
1. Kamerayı aç, elini kameraya göster.
2. Taşımak istediğin pencerenin üstüne elini getir; hedef çerçevesi pencereyi gösterir.
3. Yumruk yap: pencere eline yapışır. Elini oynattıkça pencere gelir.
4. Açık avuç yapınca pencere bırakılır.
İpucu: Kamera altındaki rozet ne algılandığını gösterir. "Takip tepkisi" yüksekse pencere anında gelir, düşükse daha yumuşak gelir.`,
  },
  {
    keys: ["diger monitor", "monitore at", "ekrana at", "firlat", "savur", "throw", "flick", "other monitor", "ikinci ekran", "baska ekran"],
    text: `Diğer monitöre atmak:
1. Pencereyi yumrukla tut.
2. Elini gitmek istediğin monitöre doğru hızlıca hareket ettirirken aç.
3. Pencere o yöndeki komşu monitöre gider. Yön, savurma yönünden belirlenir.
Yavaş bırakırsan pencere olduğu ekranda kalır. Tek monitörde hızlı bırakma bir şey yapmaz.`,
  },
  {
    keys: ["kenar", "yasla", "snap", "tam ekran", "buyut", "maximize", "yarim ekran", "half"],
    text: `Kenara yaslama:
• Pencereyi tutup ekranın üst kenarında bırakırsan tam ekran olur.
• Sol veya sağ kenarda bırakırsan ekranın yarısına yaslanır.`,
  },
  {
    keys: ["birak", "iptal", "acik avuc", "avuc", "release", "cancel", "palm"],
    text: `Açık avuç: Tuttuğun pencereyi bırakır veya basılı tutma hareketini (küçült/kapat) iptal eder. Bir şey yanlış gidiyorsa elini açman yeterli.`,
  },
  {
    keys: ["kucult", "minimize", "simge", "peace", "zafer", "v isareti"],
    text: `Pencere küçültmek (V işareti):
1. İşaret ve orta parmağını aç, diğerlerini kapat (V işareti).
2. İşareti sabit tut; rozetteki halka dolar (~0,6 sn).
3. Halka dolunca pencere küçülür. Erken bırakır veya avucunu açarsan iptal olur.`,
  },
  {
    keys: ["kapat", "close", "rock", "sekme", "kapatma korumasi", "guvenlik"],
    text: `Pencere kapatmak (rock işareti):
1. İşaret ve serçe parmağını aç, orta ve yüzük parmağını kapat.
2. ~0,8 sn sabit tut; halka dolunca pencerenin tamamı kapanır.
Kapatma koruması (Hareketler sekmesi) açıksa kod editörü, belge ve form pencereleri kazara kapanmaz.
Sadece sekme kapatmak istiyorsan Özel hareket ile "Sekmeyi kapat (Ctrl+W)" işine bir poz bağla.`,
  },
  {
    keys: ["duraklat", "durdur", "pause", "deneme", "practice", "test modu"],
    text: `Duraklatma ve deneme modu:
• "Duraklat" düğmesi veya Ctrl+Alt+P hareketleri geçici olarak durdurur; kamera açık kalır.
• Deneme modu açıkken hareketler algılanır ama komut çalışmaz; ne yapılacağı rozette gösterilir. Hareketleri öğrenmek için idealdir.`,
  },
  {
    keys: ["kisayol", "hotkey", "ctrl", "klavye", "tus", "shortcut"],
    text: `Kısayollar:
• Ctrl+Alt+J: Örtüyü aç/kapat.
• Ctrl+Alt+K: Kontrol penceresini göster.
• Ctrl+Alt+P: Hareketleri duraklat/sürdür.
Kendi kısayollarını Sistem sekmesindeki "Komutlar ve kısayollar" bölümünden ekleyebilirsin.`,
  },
  {
    keys: ["monitor", "ekranlar", "coklu", "multi", "display", "ikinci monitor"],
    text: `Birden fazla monitör: Bağlı ekranlar Sistem sekmesinde listelenir. Pencereyi tutup hedef monitöre doğru hızlıca bırakarak taşırsın. Monitör takıp çıkarınca liste kendiliğinden yenilenir. Örtü seçili ekranı kaplar.`,
  },
  {
    keys: ["algilanmiyor", "calismiyor", "gormuyor", "tanimiyor", "not detect", "not working", "isik", "mesafe", "ipucu", "tips"],
    text: `Jest algılanmıyorsa:
1. Kameradan 40–80 cm uzakta dur, elinin tamamı kadrajda olsun.
2. Önden gelen iyi ışık kullan; arkanda parlak pencere varsa perdeyi kapat.
3. Hareketi kısa bir an sabit tut; rozet ne algılandığını gösterir.
4. Duraklatılmış mı veya deneme modu açık mı kontrol et.
5. Kamera listesinden doğru kamerayı seç, gerekirse "Yenile"ye bas.`,
  },
  {
    keys: ["kamera", "camera", "webcam", "siyah", "izin", "goruntu yok"],
    text: `Kamera: Kamera kartındaki anahtarla açılır. Görüntü siyahsa başka bir uygulama kamerayı kullanıyor olabilir; onu kapatıp "Tekrar dene"ye bas. Windows Ayarlar > Gizlilik > Kamera altında masaüstü uygulamalarına izin verildiğinden emin ol. "Boşta kamerayı kapat" açıksa el yokken kamera bir süre sonra durur.`,
  },
  {
    keys: ["telefon", "phone", "droidcam", "iriun", "camo"],
    text: `Telefonu kamera yapmak: DroidCam, Iriun Webcam veya Camo kur, telefonu Wi-Fi ya da USB ile bağla. Ardından kamera listesinden telefonu seç (gerekirse "Yenile").`,
  },
  {
    keys: ["ortu", "overlay", "efekt", "effect", "cerceve"],
    text: `Örtü ve efektler: Örtü masaüstünün üstünde hedef çerçevesini ve hareket geri bildirimini çizer (Ctrl+Alt+J). Görünüm sekmesinde "Efektler: Kapalı / Klasik" seçilir; Kapalı en hızlısıdır.`,
  },
  {
    keys: ["tema", "theme", "gorunum", "anime", "minimal", "renk"],
    text: `Tema: Görünüm sekmesindeki "Tema" listesinden Minimal (koyu) veya Anime seçilir. Tema yalnızca kontrol penceresinin görünümünü değiştirir.`,
  },
  {
    keys: ["ozel hareket", "poz", "custom", "komut ekle", "baglama", "binding"],
    text: `Özel hareket ve komutlar:
• Hareketler sekmesindeki "Özel hareket" kartında kameraya bir poz göster, ad ver ve bir işe (sekmeyi kapat, küçült, örtü) bağla.
• Sistem sekmesindeki "Komutlar ve kısayollar" bölümünde her işe bir el hareketi veya klavye tuşu atayabilirsin.`,
  },
  {
    keys: ["ses", "sound", "sessiz"],
    text: `Ses efektleri: Tutma ve fırlatmada kısa ses çalar. Sistem sekmesindeki "Ses efektleri" anahtarıyla kapatabilirsin.`,
  },
  {
    keys: ["fps", "performans", "yavas", "kasma", "cpu", "pil", "gecikme", "lag"],
    text: `Performans: Sistem sekmesinden hedef FPS seçilir; düşük FPS daha az CPU kullanır. Efektleri Kapalı yapmak ve vücut takibini kapatmak da hızlandırır. Kamera kartındaki Gecikme değeri anlık tepki süresini gösterir.`,
  },
  {
    keys: ["windows ile", "otomatik basla", "autostart", "baslangic", "tepsi", "tray"],
    text: `Windows ile açılış: Sistem sekmesinde "Windows ile aç" açıksa uygulama tepside başlar ve kamerayı kendiliğinden açmaz. Pencereyi kapatınca uygulama tepside çalışmaya devam eder.`,
  },
  {
    keys: ["guncelle", "update", "surum", "version"],
    text: `Güncelleme: Üstteki "Güncellemeleri denetle" düğmesine bas. Yeni sürüm varsa çubukta "Güncelle" çıkar. Mevcut sürüm başlığın altında yazar.`,
  },
  {
    keys: ["gizlilik", "privacy", "veri", "kayit", "goruntu gonder", "internet"],
    text: `Gizlilik: El takibi tamamen yerel çalışır (MediaPipe). Kamera görüntüsü bilgisayardan çıkmaz, telemetri yoktur ve internet bağlantısı gerekmez.`,
  },
];

export const GUIDE_TOPICS = [
  "Pencere nasıl taşınır?",
  "Diğer monitöre nasıl atarım?",
  "Pencere nasıl küçültülür?",
  "Kısayollar neler?",
  "Jest algılanmıyor",
  "Deneme modu nedir?",
];

export const GUIDE_HELP = `Bana uygulamayla ilgili her şeyi sorabilirsin. Örnek:
• Pencere nasıl taşınır? · Diğer monitöre nasıl atarım? · Kenara yaslama
• Pencere nasıl küçültülür? · Pencere nasıl kapatılır? · Kapatma koruması
• Jest algılanmıyor / kamera siyah · Telefonu kamera yapma
• Kısayollar · Duraklat · Deneme modu
• Tema ve efektler · Özel hareket · Güncelleme`;
// Full KB as plain text, fed to the LLM so it answers from real app facts.
export const GUIDE_TEXT = KB.map((entry) => entry.text).join("\n\n");

export function fold(text) {
  return text
    .toLowerCase()
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function isQuestion(message) {
  return /\?|\b(nasil|neden|nerede|nedir|ne|hangi|niye|how|what|why|where|yardim|help)\b/.test(fold(message));
}

// Best entry by keyword hits (longer keys weigh more), or null.
export function answerGuide(message) {
  const text = fold(message);
  let best = null;
  let bestScore = 0;
  for (const entry of KB) {
    let score = 0;
    for (const key of entry.keys) if (text.includes(key)) score += key.length;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best ? best.text : null;
}
