// UI skin for the control window. Anything other than "anime" falls back to minimal.
export const THEMES = ["minimal", "anime"];

export const ANIME_CHARACTERS = {
  satoru: {
    id: "satoru",
    avatar: "/anime-satoru.svg",
    nameKey: "animeCharSatoru",
    accent: "#a855f7",
    fxPreset: "gojo",
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
    fxPreset: "neon",
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
    fxPreset: "classic",
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
  tanjiro: {
    id: "tanjiro",
    avatar: "/anime-tanjiro.svg",
    nameKey: "animeCharTanjiro",
    accent: "#f97316",
    fxPreset: "spiderman",
    quotes: {
      tr: {
        idle: "「Hinokami Kagura!」 Güneş Nefesi alevleriyle masaüstünü tam odakla yönet!",
        grab: "「Tam Konsantrasyon!」 Pencere alev çemberiyle tutuldu!",
        throw: "「Alev Dansı!」 Pencere yan monitöre savruldu!",
        flick: "「Yanan Güneş Kesisi!」 Sekme tek darbede kapatıldı!",
        clap: "「Güneş Ritmi!」 Medya oynatma durumu değiştirildi!",
      },
      en: {
        idle: "「Hinokami Kagura!」 Command your desktop with Sun Breathing precision!",
        grab: "「Total Concentration!」 Window gripped in blazing flames!",
        throw: "「Flame Dance!」 Window launched across monitors!",
        flick: "「Burning Sun Slash!」 Active tab closed in one strike!",
        clap: "「Sun Rhythm!」 Media playback toggled!",
      },
    },
  },
  jinwoo: {
    id: "jinwoo",
    avatar: "/anime-jinwoo.svg",
    nameKey: "animeCharJinwoo",
    accent: "#8b5cf6",
    fxPreset: "symbiote",
    quotes: {
      tr: {
        idle: "「Uyan (Arise)!」 Gölge Hükümdarı'nın ordusu tüm pencereleri emrine amade kıldı!",
        grab: "「Hükümdarın Eli!」 Pencere telekineziyle yakalandı!",
        throw: "「Gölge Değişimi!」 Pencere diğer ekrana ışınlandı!",
        flick: "「Kamish'in Öfkesi!」 Sekme anında yok edildi!",
        clap: "「Hükümdar Komutu!」 Medya durumu değiştirildi!",
      },
      en: {
        idle: "「Arise!」 The Shadow Monarch commands every window on your screen!",
        grab: "「Ruler's Authority!」 Window seized by telekinesis!",
        throw: "「Shadow Exchange!」 Window swapped to the other display!",
        flick: "「Monarch's Strike!」 Active tab eliminated!",
        clap: "「Shadow Command!」 Media playback toggled!",
      },
    },
  },
  naruto: {
    id: "naruto",
    avatar: "/anime-naruto.svg",
    nameKey: "animeCharNaruto",
    accent: "#f59e0b",
    fxPreset: "miles",
    quotes: {
      tr: {
        idle: "「Kurama Chakra Modu!」 Altın çakra kollarıyla pencereleri yakala ve fırlat, dattebayo!",
        grab: "「Çakra Kolu!」 Pencere Kurama'nın pençesiyle tutuldu!",
        throw: "「Rasenshuriken Fırlatışı!」 Pencere diğer ekrana uçtu!",
        flick: "「Kurbağa Kumite Fiskesi!」 Sekme anında kapatıldı!",
        clap: "「Bilge Modu Alkışı!」 Medya komutu tetiklendi!",
      },
      en: {
        idle: "「Kurama Chakra Mode!」 Grab and fling windows with golden chakra arms, dattebayo!",
        grab: "「Chakra Arm!」 Window caught in Kurama's grip!",
        throw: "「Rasenshuriken Throw!」 Window blasted to the next screen!",
        flick: "「Frog Kumite Flick!」 Active tab closed instantly!",
        clap: "「Sage Clap!」 Media playback toggled!",
      },
    },
  },
  eva: {
    id: "eva",
    avatar: "/anime-eva.svg",
    nameKey: "animeCharEva",
    accent: "#4ade80",
    fxPreset: "neon",
    quotes: {
      tr: {
        idle: "「Senkronizasyon %400!」 AT-Alanı aktif, tüm masaüstü sıfır gecikmeyle bağlı!",
        grab: "「AT-Alanı Yakalaması!」 Hedef pencere kilitlendi!",
        throw: "「Berserk Fırlatışı!」 Pencere yandaki ekrana fırlatıldı!",
        flick: "「Prog-Bıçak Kesisi!」 Sekme milisaniyede kapatıldı!",
        clap: "「NERV Sinyali!」 Medya durumu değiştirildi!",
      },
      en: {
        idle: "「Sync Rate 400%!」 AT-Field active, zero-latency neural desktop link online!",
        grab: "「AT-Field Lock!」 Target window captured!",
        throw: "「Berserk Launch!」 Window hurled to the adjacent monitor!",
        flick: "「Prog-Knife Sever!」 Active tab closed in a millisecond!",
        clap: "「NERV Signal!」 Media playback toggled!",
      },
    },
  },
};

export function applyTheme(name, animeChar) {
  const theme = name === "anime" ? "anime" : "minimal";
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.theme = theme;
    if (animeChar && ANIME_CHARACTERS[animeChar]) {
      document.documentElement.dataset.animeChar = animeChar;
    } else if (!document.documentElement.dataset.animeChar) {
      document.documentElement.dataset.animeChar = "satoru";
    }
  }
  return theme;
}
