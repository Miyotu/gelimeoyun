const axios = require('axios');
const cheerio = require('cheerio');

// Kelime cache'i - performans için
let wordCache = new Set();
let lastCacheUpdate = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 saat

// Türkçe karakterleri doğru şekilde küçük harfe çevir
function turkishToLowerCase(str) {
  return str
    .replace(/İ/g, 'i')  // Türkçe büyük İ → küçük i
    .replace(/I/g, 'ı')  // İngilizce I → Türkçe ı
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ş/g, 'ş')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    .toLowerCase();
}

// TDK API'sinden kelime doğrulama
async function validateWordWithTDK(word) {
  try {
    const response = await axios.get(`https://sozluk.gov.tr/gts?ara=${encodeURIComponent(word)}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    return response.data && response.data.length > 0;
  } catch (error) {
    // console.log(`TDK API hatası: ${error.message}`);
    return false;
  }
}

// Alternatif API - Türkçe kelime listesi
async function fetchWordsFromAPI() {
  try {
    // GitHub'daki Türkçe kelime listesi
    const response = await axios.get('https://raw.githubusercontent.com/mertemin/turkish-word-list/master/turkish_word_list.txt', {
      timeout: 10000
    });
    
    const words = response.data
      .split('\n')
      .map(word => word.trim())
      .map(word => turkishToLowerCase(word))
      .filter(word => word.length > 2 && word.length < 15)
      .filter(word => /^[a-züğışöç]+$/.test(word)); // Sadece Türkçe karakterler
    
    return new Set(words);
  } catch (error) {
    // console.log(`Kelime listesi API hatası: ${error.message}`);
    return null;
  }
}

// Wiktionary'den Türkçe kelimeler çekme
async function fetchWordsFromWiktionary() {
  try {
    const response = await axios.get('https://tr.wiktionary.org/wiki/Kategori:Türkçe_sözcükler', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const words = new Set();
    
    $('#mw-pages .mw-category-group ul li a').each((i, element) => {
      const word = turkishToLowerCase($(element).text().trim());
      if (word.length > 2 && word.length < 15 && /^[a-züğışöç]+$/.test(word)) {
        words.add(word);
      }
    });
    
    return words;
  } catch (error) {
    // console.log(`Wiktionary API hatası: ${error.message}`);
    return null;
  }
}

// Kelime cache'ini güncelle
async function updateWordCache() {
  const now = Date.now();
  
  if (wordCache.size > 0 && (now - lastCacheUpdate) < CACHE_DURATION) {
    return; // Cache hala geçerli
  }
  
  // console.log('🔄 Kelime listesi güncelleniyor...');
  
  try {
    // Önce GitHub'daki listeyi dene
    let newWords = await fetchWordsFromAPI();
    
    // GitHub başarısız olursa Wiktionary'yi dene
    if (!newWords || newWords.size < 1000) {
      // console.log('📚 Wiktionary\'den kelimeler çekiliyor...');
      const wiktionaryWords = await fetchWordsFromWiktionary();
      if (wiktionaryWords && wiktionaryWords.size > 0) {
        newWords = wiktionaryWords;
      }
    }
    
    if (newWords && newWords.size > 0) {
      wordCache = newWords;
      lastCacheUpdate = now;
      // console.log(`✅ ${wordCache.size} kelime yüklendi!`);
    } else {
      // Fallback - temel kelime listesi
      // console.log('⚠️ API\'lar başarısız, temel liste kullanılıyor');
      wordCache = new Set(getFallbackWords());
    }
  } catch (error) {
    // console.error('Kelime listesi güncelleme hatası:', error);
    wordCache = new Set(getFallbackWords());
  }
}

// Fallback kelime listesi
function getFallbackWords() {
  const words = [
    'araba', 'ev', 'masa', 'kalem', 'kitap', 'telefon', 'bilgisayar', 'oyun',
    'çocuk', 'anne', 'baba', 'kardeş', 'arkadaş', 'okul', 'öğretmen', 'öğrenci',
    'deniz', 'göl', 'dağ', 'orman', 'şehir', 'köy', 'mahalle', 'sokak',
    'yemek', 'su', 'ekmek', 'peynir', 'domates', 'patates', 'soğan', 'elma',
    'armut', 'üzüm', 'portakal', 'muz', 'çilek', 'kiraz', 'karpuz', 'kavun',
    'köpek', 'kedi', 'kuş', 'balık', 'at', 'inek', 'koyun', 'tavuk',
    'güneş', 'ay', 'yıldız', 'bulut', 'yağmur', 'kar', 'rüzgar', 'hava',
    'renk', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'beyaz', 'siyah', 'mor',
    'müzik', 'şarkı', 'dans', 'resim', 'film', 'kitap', 'gazete', 'dergi',
    'spor', 'futbol', 'basketbol', 'voleybol', 'yüzme', 'koşu', 'bisiklet',
    'abide', 'acele', 'adalet', 'aile', 'aklıma', 'alarm', 'amaç', 'anlaşma',
    'banyo', 'bahar', 'bahçe', 'balkon', 'barış', 'başarı', 'berber', 'bisiklet',
    'cadde', 'cami', 'çanta', 'çiçek', 'çorba', 'dalga', 'defter', 'dergi',
    'ekonomi', 'elektrik', 'endüstri', 'fabrika', 'fırın', 'gazete', 'güzellik',
    'haber', 'hastane', 'hayat', 'hediye', 'hukuk', 'ilaç', 'internet', 'iş',
    'jandarma', 'kabin', 'kalp', 'kampanya', 'kanun', 'kapı', 'karar', 'kargo',
    'liman', 'lüks', 'makina', 'mağaza', 'meydan', 'millet', 'muhabbet', 'neden',
    'ofis', 'otopark', 'ödeme', 'paket', 'parti', 'perde', 'proje', 'radyo',
    'salon', 'sanat', 'seçim', 'sistem', 'şirket', 'taksi', 'teknoloji', 'ticaret',
    'uydu', 'üniversite', 'ürün', 'vatan', 'vergi', 'video', 'yönetim', 'zengin',
    'istanbul', 'ispanak', 'ısıtma', 'ışık', 'iğne', 'içecek', 'idare', 'imza'
  ];
  
  return words.map(word => turkishToLowerCase(word));
}

// Rastgele Türkçe kelime getir
async function getRandomTurkishWord() {
  await updateWordCache();
  
  const wordsArray = Array.from(wordCache);
  if (wordsArray.length === 0) {
    return 'kelime'; // Fallback
  }
  
  return wordsArray[Math.floor(Math.random() * wordsArray.length)];
}

// Kelime geçerli mi kontrol et
async function isValidTurkishWord(word) {
  await updateWordCache();
  
  const normalizedWord = turkishToLowerCase(word.trim());
  
  // Önce cache'de kontrol et
  if (wordCache.has(normalizedWord)) {
    return true;
  }
  
  // Cache'de yoksa TDK API'sini dene
  try {
    const isValid = await validateWordWithTDK(normalizedWord);
    if (isValid) {
      // Geçerli kelimeyi cache'e ekle
      wordCache.add(normalizedWord);
      return true;
    }
  } catch (error) {
    // console.log('TDK doğrulama hatası:', error.message);
  }
  
  return false;
}

// Kelime normalizasyonu (karşılaştırma için)
function normalizeWord(word) {
  return turkishToLowerCase(word.trim());
}

// Belirli harfle başlayan kelimeleri getir
async function getWordsStartingWith(letter) {
  await updateWordCache();
  
  const normalizedLetter = turkishToLowerCase(letter);
  const wordsArray = Array.from(wordCache);
  return wordsArray.filter(word => turkishToLowerCase(word.charAt(0)) === normalizedLetter);
}

// Cache istatistikleri
function getCacheStats() {
  return {
    wordCount: wordCache.size,
    lastUpdate: new Date(lastCacheUpdate).toLocaleString('tr-TR'),
    cacheAge: Math.floor((Date.now() - lastCacheUpdate) / (1000 * 60)) // dakika
  };
}

module.exports = {
  getRandomTurkishWord,
  isValidTurkishWord,
  normalizeWord,
  getWordsStartingWith,
  getCacheStats,
  updateWordCache,
  turkishToLowerCase
};