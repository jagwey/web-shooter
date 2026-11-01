// Offline knowledge base for the in-app assistant. Keys are lowercase, accent-free stems.
const KB = [
  {
    keys: ["ag at", "ag nasil", "web", "ag atis", "agla", "orumcek", "spider", "shoot", "thwip"],
    text: `🤟 Ağ atmak:
1. Kamerayı aç (kamera kartının altındaki "Kamera" anahtarı).
2. Elini kameraya göster, avuç içi kameraya baksın.
3. İşaret + serçe parmağını aç, orta ve yüzük parmağını kapat (🤟 rock işareti).
4. İşaret parmağının gösterdiği yere ağ fırlar, hedef pencerenin içine yapışır.
5. Ağı tutup eli diğer monitöre doğru savurursan pencere (site) o ekrana gider. Tek ekranda hızlı savurma kenara yaslar.
İpucu: Jesti ~0.1 sn sabit tut. Aynı hareket arka arkaya 0.6 sn içinde tekrar tetiklenmez (yanlış atış koruması).
Görünmüyorsa: "Özellikler" kartında "Ağ efektleri" açık mı, overlay açık mı bak.`,
  },
  {
    keys: ["pencere tasi", "pencere nasil tas", "tut", "yakala", "grab", "yumruk", "fist", "surukle", "move window", "tasima"],
    text: `✊ Pencere taşımak:
1. Overlay açık olmalı (tutma overlay olmadan çalışmaz).
2. Elini taşımak istediğin pencerenin üstüne getir — hedef pencere renkli çerçeveyle işaretlenir.
3. Yumruk yap ✊ → pencere tutuldu (rozet "✊" olur).
4. Elini oynat, pencere peşinden gelir.
5. Avucunu aç 🖐️ → bırakır. Hızlı açarsan pencere fırlar ve en yakın ekran kenarına yapışır (snap).
Çift el: "Özellikler > İki el" açıksa iki elle iki pencereyi aynı anda tutabilirsin.`,
  },
  {
    keys: ["birak", "firlat", "fling", "snap", "kenara", "avuc", "palm", "open hand", "oynat", "sonraki parca", "muzik", "medya"],
    text: `🖐️ Açık avuç:
• Pencere tutuluyken: aç → bırak. Hızlı savurarak açarsan fırlatır ve ekran kenarına yapıştırır.
• Tutma yokken avuç SABİT → oynat/duraklat.
• Avuç yana SAVUR → sonraki parça.
• Bekleyen sekme kapatma / AI sorusu varsa açık avuç iptal eder.`,
  },
  {
    keys: ["sekme kapat", "kapat", "peace", "zafer", "makas", "v isareti", "close tab"],
    text: `✌️ Sekme kapatma (Ctrl+W):
1. İşaret + orta parmağı V gibi AYRIK aç, yüzük + serçe kapalı.
2. Pozu tut: rozetteki halka dolarken beklemeye devam et; dolunca aktif sekme kapanır.
3. Vazgeçmek için eli indir ya da avucunu aç (kapatma iptal edilir).
Parmaklar bitişikse bu Gojo'dur (kaydırma), sekme kapanmaz.`,
  },
  {
    keys: ["gojo", "purple", "mor", "hollow", "kaydir", "scroll", "bitisik"],
    text: `🟣 Gojo = iki parmak BİTİŞİK (işaret + orta), yüzük + serçe kapalı.
• Tek el: eli yukarı/aşağı oynat → sayfa kaydırma.
• İki el: biri kameraya belirgin yakın (~1.5 kat büyük) ~0.4 sn tut → Hollow Purple, vurulan pencereyi kapatır (bilgisayarı KAPATMAZ).
Kapanan hedef: son 3 sn içinde ağladığın pencere, yoksa öndeki elin gösterdiği pencere. Hedef yoksa hiçbir şey kapanmaz.
Yanlışlıkla kapatmayı "Infinity Shield" engeller (bkz. "kalkan nedir"). İptal: açık avuç.`,
  },
  {
    keys: ["pinch", "cimdik", "ses", "volume", "zoom", "yakinlas", "uzaklas", "ses nasil"],
    text: `🤏 Çimdik (başparmak + işaret): 
• Bileği çevir → ses artar/azalır (sağa = +, sola = −).
• Parmakları aç-kapa → yakınlaştır / uzaklaştır (zoom).
Çimdik pozundayken diğer komutlar kilitlenir, yanlışlıkla sekme kapanmaz.`,
  },
  {
    keys: ["tabanca", "finger gun", "nisan", "sniper", "ask ai", "ai sor", "yapay zekaya sor"],
    text: `🎯 Tabanca: işaret açık, başparmak BELİRGİN dışarıda, diğerleri kapalı.
• Tek el: pozu tut (halka dolar) → ekrandaki hedefi yapay zekaya sorar.
• İki el tabanca: nişan (sniper) kombinasyonu, hedefi seçip AI'ya gönderir.
Başparmak içerideyse bu tabanca değil, sadece "işaret" olur.`,
  },
  {
    keys: ["duraklat", "durdur", "surdur", "pause", "resume", "hareketleri kapat", "ctrl+alt+p", "duraklatirim"],
    text: `⏸️ Hareketleri duraklat/sürdür: kamera kartındaki "Duraklat" düğmesi ya da Ctrl+Alt+P. Duraklatılmışken kamera izlenir ama hiçbir komut çalışmaz; durum rozeti "Duraklatıldı" der. Tekrar basınca sürer.`,
  },
  {
    keys: ["deneme modu", "deneme", "practice", "dry run", "dene", "pratik"],
    text: `🧪 Deneme modu: kamera kartındaki "Deneme modu" kutusu. Hareketler algılanır ama komut ÇALIŞMAZ; sadece "yapılacaktı" bildirimi görürsün. Yeni hareketleri güvenle öğrenmek için ideal. Kapatınca normale döner. Oturuma özeldir, kaydedilmez.`,
  },
  {
    keys: ["fiske", "flick", "ok isareti", "kucult", "minimize", "gorev cubugu", "taskbar"],
    text: `👌 Fiske = görev çubuğuna indir (pencereyi KAPATMAZ):
1. Başparmak ile işaret parmağı bir halka yapsın (OK), orta, yüzük ve serçe açık kalsın.
2. Sonra işaret parmağını halkadan hızla fırlat (fiske). Sadece OK pozu bir şey indirmez; hareket gerekir.
3. Windows pencereyi görev çubuğuna alır (SW_MINIMIZE). WM_CLOSE gitmez.
Hollow Purple ayrıdır: iki el Gojo işareti pencereyi kapatır.`,
  },
  {
    keys: ["kalkan", "shield", "infinity", "guvenlik", "yanlislikla", "safety", "ninja", "masaustu"],
    text: `🛡️ Infinity Shield: Gojo kartındaki "Güvenlik" anahtarı. Açıkken kod editörü, doküman ve form pencerelerinde kapatma jestini engeller; ekranda kalkan efekti çıkar. Kaydedilmemiş işi kaybetmemek için açık tut.
🥷 Ninja kalkanı: iki açık avucu birlikte aşağı indir → masaüstünü göster.`,
  },
  {
    keys: ["jest", "hareket", "gesture", "el hareketleri", "hangi hareket", "komutlar listesi", "ne yapabilir", "hotkey", "ctrl+alt"],
    text: `✋ Tüm el hareketleri:
• 🤟 İşaret + serçe → ağ at
• ✊ Yumruk → pencereyi tut
• 🖐️ Açık avuç → bırak/fırlat; tutma yokken sabit = oynat/duraklat, savur = sonraki parça
• 👌 OK yap, işaret parmağını fırlat → görev çubuğuna indir (kapatmaz)
• ✌️ V (parmaklar ayrık), halka dolana dek tut → sekmeyi kapat
• 🤞 İki parmak bitişik → kaydır; iki elle → Hollow Purple (pencere kapat)
• 🎯 Tabanca (başparmak dışarıda), tut → AI'ya sor; iki elle → sniper
• 🤏 Çimdik → bileği çevir = ses, aç/kapa = zoom
• 🥷 İki avuç aşağı → masaüstü
• ☝️ Yalnız işaret → sadece gösterge (komut yok)
Kısayollar: Ctrl+Alt+J / Ctrl+Alt+K (komut kısayolları), Ctrl+Alt+P (hareketleri duraklat/sürdür).
Çoğu komut ~0.1 sn sabit tutulunca algılanır. "Deneme modu" ile komut çalıştırmadan dene."Ayarlar & Güç > Komutlar" kısmından aksiyonlara kendi jest veya klavye kısayolunu bağlayabilirsin.`,
  },
  {
    keys: ["komut ekle", "kisayol", "shortcut", "binding", "tus ata", "klavye"],
    text: `⌨️ Kendi komutun:
1. "Ayarlar & Güç" bölümünü aç → "Komutlar".
2. "Yeni komut ekle"de aksiyonu seç.
3. Tür: "Jest" ya da "Kısayol".
4. Jest seçtiysen listeden el hareketini seç; kısayolsa "Tuşu yakala"ya basıp tuşa bas.
5. "Kaydet".`,
  },
  {
    keys: ["algila", "taninm", "tanimiyor", "okumuyor", "calismiyor jest", "gormuyor", "detect", "not working", "tutmuyor", "kasiyor", "yavas", "lag"],
    text: `🔧 Jest algılanmıyor / takılıyor:
1. Elini kameradan 40–80 cm uzakta tut, avuç içi kameraya baksın.
2. Işık önden gelsin; arkada pencere/lamba varsa el karanlık kalır.
3. Parmakları net aç/kapat, yarım bükme algıyı karıştırır.
4. Jesti ~0.1 sn sabit tut, savurma.
5. Kasıyorsa "Ayarlar & Güç > Hedef FPS"i 30'a düşür ya da yapay zekaya "optimize et" yaz.
6. Kamera listesinden doğru kamerayı seçtiğinden emin ol.`,
  },
  {
    keys: ["overlay", "efekt gorunmuyor", "ekranda yok", "katman"],
    text: `🪟 Overlay: Efektleri ve hedef çerçevesini masaüstünün üstüne çizen şeffaf katman. Pencere tutma da buna bağlı — kapalıyken tutma çalışmaz. Kamera kartının altındaki "Örtü" anahtarından aç. Birden fazla monitörde "Monitör" kartından hangi ekranda çalışacağını seç.`,
  },
  {
    keys: ["kamera", "camera", "siyah", "black", "acilmiyor kamera", "webcam"],
    text: `📷 Kamera:
• Kamera kartının altındaki "Kamera" anahtarıyla açılır, ilk seferde Windows izin sorar → izin ver.
• Görüntü siyahsa: başka uygulama (Zoom, Discord, OBS) kamerayı tutuyor olabilir, kapat.
• Windows Ayarları > Gizlilik > Kamera'da masaüstü uygulamalarına izin açık olsun.
• Birden fazla kamera varsa listeden doğru olanı seç, sonra "Kameraları Yenile".`,
  },
  {
    keys: ["telefon", "phone", "droidcam", "iriun", "camo", "mobil"],
    text: `📱 Telefonu kamera yapmak:
1. Telefona ve PC'ye DroidCam, Iriun veya Camo kur.
2. İkisi aynı Wi-Fi'de olsun (ya da USB bağla).
3. Telefondaki uygulamayı aç, PC istemcisi bağlansın.
4. Burada "Kameraları Yenile"ye bas, listeden telefon kamerasını seç.`,
  },
  {
    keys: ["monitor", "ekran sec", "ikinci ekran", "multi monitor", "display", "diger ekran", "throw"],
    text: `🖥️ İkinci ekran: Ağ işaretiyle pencereyi tut, eli diğer monitöre doğru hızlı savur. Pencere o ekrana oturur (site oraya gider). Yavaş bırakırsan yerinde kalır. Tek monitörde savurma eski kenar yaslamasını kullanır.
👌 Fiske (OK yapıp işaret parmağını fırlat) küçültür, kapatmaz. 🟣 Hollow Purple pencereyi kapatır.`,
  },
  {
    keys: ["tema", "theme", "renk", "gorunum", "sakura", "miles", "symbiote", "neon"],
    text: `🎨 Tema: Tema çiplerinden birini seç (Spider-Man, Miles, Symbiote, Sakura, Neon, Gojo, Midnight, Sage, Clean…). Ağ, iz ve hedef çerçevesi o renge döner. Kendi rengini yapmak için "özel efekt nasıl yapılır" diye sor.`,
  },
  {
    keys: ["ozel efekt", "custom", "kendi efekt", "renk degis", "kalinlik", "efekt yap"],
    text: `✨ Özel efekt:
1. "Özel Efekt" kartını aç.
2. Ana renk, parıltı ve parçacık rengini seç.
3. Stil: kıvılcım, yıldız tozu, ağ, sakura, ateş veya mor.
4. Kalınlık kaydırıcısı 1–8.
5. "Önizle" ile dene, beğenince "Kaydet" → tema "custom" olur.`,
  },
  {
    keys: ["ses", "sound", "thwip ses", "sessiz"],
    text: `🔊 Ses: "Ayarlar & Güç > Ses Efektleri (THWIP)" anahtarı. Açıkken ağ atışında ve fırlatmada ses çalar.`,
  },
  {
    keys: ["fps", "performans", "pil", "batarya", "guc", "power", "bosta", "idle"],
    text: `⚡ Performans & güç ("Ayarlar & Güç"):
• Hedef FPS: düşük = az CPU/pil, yüksek = akıcı.
• "Boşta kamerayı kapat": el görünmeyince bir süre sonra kamera durur.
• Tek tık ayar: yapay zeka kutusuna "optimize et" yaz, FPS/yumuşatmayı donanımına göre ayarlar.`,
  },
  {
    keys: ["baslangic", "windows ile", "autostart", "otomatik ac", "startup", "tepsi", "tray"],
    text: `🚀 Windows ile aç: "Ayarlar & Güç > Windows ile aç". Açılışta tepside (sistem tepsisi) başlar, kamerayı açmaz. Pencereyi kapatınca uygulama tepside kalır; tamamen çıkmak için tepsi ikonuna sağ tık > Çık.`,
  },
  {
    keys: ["guncelle", "update", "surum", "versiyon", "yeni surum"],
    text: `🔄 Güncelleme: Uygulama açılınca yeni sürüm varsa üstte güncelleme çubuğu çıkar → "Güncelle"ye bas, iner, kurulur, yeniden başlar. Elle kontrol için başlıktaki 🔄 "Güncellemeleri kontrol et" butonu.`,
  },
  {
    keys: ["pencereleri duzenle", "hizala", "tile", "yerlestir", "optimize", "hizli buton"],
    text: `🤖 Yapay zeka hızlı butonları:
• "Merhaba" → bağlantıyı ve gecikmeyi test eder.
• "Optimize et" → FPS, yumuşatma, boşta süresini donanıma göre ayarlar.
• "Pencereleri düzenle" → açık pencereleri altın oranla ekrana dizer.
Kutucuğa da yazabilirsin: "pencereleri hizala", "optimize et" gibi.`,
  },
  {
    keys: ["yapay zeka", "ai ekle", "ai nasil", "llm", "api key", "api anahtar", "model ekle", "saglayici", "provider", "chatgpt", "openai"],
    text: `🧠 Yapay zeka eklemek:
1. Yapay Zeka kartında "⚙️ Model & Sağlayıcı Ayarları"nı aç.
2. Sağlayıcı çipini seç:
   • Google Gemini (bulut, ücretsiz kota) → "gemini nasıl eklenir" diye sor.
   • Yerel Ollama (internetsiz, gizli) → "ollama nasıl kurulur" diye sor.
   • Groq / OpenRouter (bulut, ücretsiz anahtar) → "groq nasıl" diye sor.
   • Pollinations (anahtarsız, ücretsiz) → çipi seç, "Merhaba" yaz, bitti.
   • LM Studio (yerel) → "lm studio nasıl" diye sor.
   • Özel API (OpenAI vb.) → "özel api nasıl" diye sor.
3. Kutuya "Merhaba" yaz → bağlantı ve gecikme görünür.
Kapalı modda bile bu rehber çalışır; AI ekleyince serbest soru da sorabilirsin.`,
  },
  {
    keys: ["gemini", "google ai", "aistudio"],
    text: `🔷 Gemini eklemek:
1. Tarayıcıda aistudio.google.com/apikey aç, Google hesabınla gir.
2. "Create API key" → anahtarı kopyala (AIza… ile başlar).
3. Burada "⚙️ Model & Sağlayıcı Ayarları" → "Google Gemini" çipi.
4. API Key kutusuna yapıştır. Model: gemini-3.5-flash-lite (boş bırakırsan bu kullanılır; ücretsiz kotada en az token yakan).
5. "Merhaba" yaz → "Gemini Hazır" görmelisin.
Anahtar yalnız bu bilgisayarda saklanır; kimseyle paylaşma.`,
  },
  {
    keys: ["ollama", "yerel model", "local", "llama", "offline ai", "internetsiz"],
    text: `🦙 Ollama (yerel, internetsiz):
1. ollama.com'dan Windows sürümünü indir, kur.
2. Terminal aç: ollama pull llama3.2   (≈2 GB; zayıf PC için: ollama pull qwen2.5:1.5b)
3. Ollama arka planda çalışır (tepside lama ikonu).
4. Burada "⚙️ Model & Sağlayıcı Ayarları" → "Yerel Ollama".
5. Endpoint: http://localhost:11434
6. "Tara"ya bas → indirdiğin modeller listelenir, birini seç.
7. "Merhaba" yaz → "Ollama Bağlandı".
Bağlanmıyorsa: Ollama açık mı, port 11434 başka uygulamada mı bak.`,
  },
  {
    keys: ["groq", "openrouter", "pollinations", "lm studio", "lmstudio", "ucretsiz api", "keysiz"],
    text: `⚡ Hazır sağlayıcılar (endpoint yazmana gerek yok):
• Groq: console.groq.com/keys → ücretsiz anahtar al → "Groq" çipi → API Key'e yapıştır. Çok hızlı. Model: llama-3.3-70b-versatile.
• OpenRouter: openrouter.ai/keys → ücretsiz anahtar → "OpenRouter" çipi. Model ":free" ile bitenlerden seç.
• Pollinations: anahtar YOK. Çipi seç, "Merhaba" yaz. Ücretsiz ama bazen yavaş/limitli.
• LM Studio: lmstudio.ai kur → bir model indir → "Developer" sekmesinde sunucuyu başlat (port 1234) → "LM Studio" çipi.
Model kutusu boşsa her sağlayıcının varsayılanı kullanılır.`,
  },
  {
    keys: ["ozel api", "custom api", "openai uyumlu", "endpoint"],
    text: `🔌 Özel API (OpenAI uyumlu):
1. "⚙️ Model & Sağlayıcı Ayarları" → "Özel API".
2. Endpoint'e /v1 ile biten adresi yaz:
   • OpenAI: https://api.openai.com/v1
   • Groq: https://api.groq.com/openai/v1
   • OpenRouter: https://openrouter.ai/api/v1
   • LM Studio: http://localhost:1234/v1
3. API Key: sağlayıcının anahtarı (LM Studio'da boş bırak).
4. Model: ör. gpt-4o-mini, llama-3.1-8b-instant.
5. "Merhaba" yaz → "Özel Endpoint Aktif".`,
  },
  {
    keys: ["gizlilik", "privacy", "veri", "kayit", "goruntu gonder"],
    text: `🔒 Gizlilik: Kamera görüntüsü bilgisayardan çıkmaz; el izleme tamamen yerel (MediaPipe). Yalnız sohbet mesajların, seçtiysen Gemini/Özel API'ye gider. Ollama seçersen hiçbir şey dışarı çıkmaz.`,
  },
];

export const GUIDE_TOPICS = [
  "Ağ nasıl atılır?",
  "Pencere nasıl taşınır?",
  "Yapay zeka nasıl eklenir?",
  "Jest algılanmıyor",
  "Hareketleri nasıl duraklatırım?",
  "Deneme modu nedir?",
];

export const GUIDE_HELP = `Bana uygulamayla ilgili her şeyi sorabilirsin. Örnek:
• Ağ nasıl atılır? · Pencere nasıl taşınır? · Sekme nasıl kapatılır? · Ses nasıl açılır? · Pinch
• Jest algılanmıyor / kamera siyah · Telefonu kamera yapma
• Hareketleri duraklat · Deneme modu
• Tema ve özel efekt · Kendi kısayolunu ekleme · Güncelleme
• Yapay zeka nasıl eklenir? (Gemini, Ollama, Özel API)
Komut da verebilirsin: "optimize et", "pencereleri hizala".`;

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
