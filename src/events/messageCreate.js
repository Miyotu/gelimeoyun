const Game = require('../models/Game');
const { isValidTurkishWord, normalizeWord, turkishToLowerCase } = require('../utils/turkishWords');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    // Bot mesajlarını yok say
    if (message.author.bot) return;

    // Slash command mesajlarını yok say
    if (message.content.startsWith('/')) return;

    const channelId = message.channel.id;
    const userId = message.author.id;
    const messageContent = message.content.trim();

    // Sadece tek kelime mesajlarını işle
    if (messageContent.split(' ').length !== 1) return;

    try {
      const game = await Game.findOne({ channelId, isActive: true });
      
      if (!game) return; // Aktif oyun yok

      const word = turkishToLowerCase(messageContent);
      const currentWord = game.currentWord;
      const expectedFirstLetter = turkishToLowerCase(currentWord.slice(-1));
      const wordFirstLetter = turkishToLowerCase(word.charAt(0));

      // Aynı kişi ard arda kelime yazamaz
      if (game.lastUserId === userId) {
        await message.react('⏳');
        const reply = await message.reply('❌ Aynı kişi ard arda kelime yazamaz! Başka birinin kelime yazmasını bekleyin.');
        setTimeout(async () => {
          try {
            await message.delete();
            await reply.delete();
          } catch (error) {
            console.log('Mesaj silme hatası:', error.message);
          }
        }, 5000);
        return;
      }

      // Kelime daha önce kullanılmış mı
      const alreadyUsed = game.usedWords.some(usedWord => 
        normalizeWord(usedWord.word) === normalizeWord(word)
      );

      if (alreadyUsed) {
        await message.react('🔄');
        const reply = await message.reply(`❌ "${word}" kelimesi daha önce kullanılmış!`);
        setTimeout(async () => {
          try {
            await message.delete();
            await reply.delete();
          } catch (error) {
            console.log('Mesaj silme hatası:', error.message);
          }
        }, 5000);
        return;
      }

      // Kelime doğru harfle başlıyor mu
      if (wordFirstLetter !== expectedFirstLetter) {
        await message.react('🔤');
        const reply = await message.reply(`❌ Kelime "${expectedFirstLetter}" harfi ile başlamalı! (Yazdığınız: "${word}")`);
        setTimeout(async () => {
          try {
            await message.delete();
            await reply.delete();
          } catch (error) {
            console.log('Mesaj silme hatası:', error.message);
          }
        }, 5000);
        return;
      }

      // Kelime geçerli mi kontrol et (API'dan)
      console.log(`🔍 "${word}" kelimesi doğrulanıyor...`);
      const isValid = await isValidTurkishWord(word);
      
      if (!isValid) {
        await message.react('❌');
        const reply = await message.reply(`❌ "${word}" geçerli bir Türkçe kelime değil veya sözlükte bulunamadı!`);
        setTimeout(async () => {
          try {
            await message.delete();
            await reply.delete();
          } catch (error) {
            console.log('Mesaj silme hatası:', error.message);
          }
        }, 5000);
        return;
      }

      // Kelime geçerli! Oyunu güncelle
      game.currentWord = word;
      game.usedWords.push({
        word: word,
        userId: userId,
        timestamp: new Date()
      });
      game.lastUserId = userId;
      await game.save();

      // Başarılı tepki ver
      await message.react('✅');
      await message.react('🎉');

      // Sıradaki harfi belirt
      const nextLetter = turkishToLowerCase(word.slice(-1));

      // Ğ kontrolü - Ğ ile başlayan Türkçe kelime yok, yeni kelime başlat
      if (nextLetter === 'ğ') {
        const { getRandomTurkishWord } = require('../utils/turkishWords');
        const newWord = await getRandomTurkishWord();

        game.currentWord = newWord;
        game.usedWords.push({
          word: newWord,
          userId: 'bot',
          timestamp: new Date()
        });
        game.lastUserId = null;
        await game.save();

        await message.reply(`🎯 Harika! **"${word}"** kelimesi kabul edildi!\n\n⚠️ **"${nextLetter}"** harfi ile başlayan Türkçe kelime olmadığı için yeni kelime başlatıldı:\n\n🎮 Yeni kelime: **${newWord}**\nSıradaki kelime **"${newWord.slice(-1)}"** harfi ile başlamalı!`);
      } else {
        await message.reply(`🎯 Harika! **"${word}"** kelimesi kabul edildi! Sıradaki kelime **"${nextLetter}"** harfi ile başlamalı!`);
      }

      console.log(`✅ "${word}" kelimesi ${message.author.username} tarafından kabul edildi`);

    } catch (error) {
      console.error('Mesaj işleme hatası:', error);
      await message.react('❌');
      await message.reply('❌ Kelime kontrol edilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
        
  }
};