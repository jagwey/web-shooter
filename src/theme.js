// UI skin for the control window. Anything other than "anime" falls back to minimal.
export const THEMES = ["minimal", "anime"];

export const ANIME_CHARACTERS = {
  satoru: {
    id: "satoru",
    avatar: "/anime-satoru.svg",
    nameKey: "animeCharSatoru",
    accent: "#a855f7",
    quotes: {
      tr: {
        idle: "「Sonsuzluk Aktif!」 Yumrukla pencere tut, fiskeyle sekme kapat, alkışla medyayı yönet!",
        grab: "「Mavi Çekim!」 Pencere sonsuzluk alanına kilitlendi, istediğin ekrana savur!",
        throw: "「Boyutlar Arası Fırlatma!」 Pencere diğer monitöre ışınlandı!",
        flick: "「Murasaki Fiske!」 Aktif sekme sıfır gecikmeyle kapatıldı!",
        clap: "「Boogie Woogie Alkışı!」 Medya oynatma durumu değiştirildi!",
      },
      en: {
        idle: "「Infinity Active!」 Fist to grab windows, flick to close tabs, clap to toggle media!",
        grab: "「Blue Attraction!」 Window locked in infinity field — swing to throw!",
        throw: "「Dimensional Fling!」 Window teleported to the adjacent display!",
        flick: "「Hollow Flick!」 Active tab closed with zero latency!",
        clap: "「Boogie Woogie Clap!」 Media playback toggled!",
      },
    },
  },
  akari: {
    id: "akari",
    avatar: "/anime-akari.svg",
    nameKey: "animeCharAkari",
    accent: "#f472b6",
    quotes: {
      tr: {
        idle: "「Neon Ağ Hazır!」 Parmaklarının ucundaki siber ağlarla tüm masaüstü kontrolünde!",
        grab: "「Siber Ağ Tutuşu!」 Pencere neon iplerle yakalandı!",
        throw: "「Tam İsabet!」 Pencere yan ekrana fırlatıldı!",
        flick: "「İpek Fiske!」 Sekme tek hareketle kapatıldı!",
        clap: "「Ritim Alkışı!」 Müzik ve medya senin komutunda!",
      },
      en: {
        idle: "「Neon Web Ready!」 Every window on your desktop is caught in my cyber threads!",
        grab: "「Cyber Tether!」 Window captured in neon silk!",
        throw: "「Bullseye!」 Window flung across displays!",
        flick: "「Silk Snap!」 Active tab closed in a flash!",
        clap: "「Rhythm Clap!」 Media playback synced to your beat!",
      },
    },
  },
  kuro: {
    id: "kuro",
    avatar: "/anime-kuro.svg",
    nameKey: "animeCharKuro",
    accent: "#38bdf8",
    quotes: {
      tr: {
        idle: "「Gölge Duruşu!」 0ms shinobi refleksleriyle pencereleri ve sekmeleri yönet!",
        grab: "「Gölge Kavrayışı!」 Hedef pencere yakalandı!",
        throw: "「Yıldırım Adımı!」 Pencere diğer ekrana uçtu!",
        flick: "「Katana Fiskesi!」 Sekme anında kesildi!",
        clap: "「Shinobi Mührü!」 Medya komutu tetiklendi!",
      },
      en: {
        idle: "「Shadow Stance!」 Command windows and tabs with 0ms shinobi reflexes!",
        grab: "「Shadow Grip!」 Target window secured!",
        throw: "「Thunder Step!」 Window dashed to the other monitor!",
        flick: "「Katana Flick!」 Tab severed instantaneously!",
        clap: "「Shinobi Seal!」 Media command executed!",
      },
    },
  },
};

export function applyTheme(name) {
  const theme = name === "anime" ? "anime" : "minimal";
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.theme = theme;
  }
  return theme;
}
