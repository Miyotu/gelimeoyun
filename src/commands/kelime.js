const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Game = require('../models/Game');
const { getRandomTurkishWord, getCacheStats } = require('../utils/turkishWords');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kelimeoyunu')
    .setDescription('Kelime oyunu başlat veya yönet!')
    .addSubcommand(subcommand =>
      subcommand
        .setName('başlat')
        .setDescription('Yeni bir kelime oyunu başlat')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('bitir')
        .setDescription('Mevcut kelime oyununu bitir')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('durum')
        .setDescription('Oyunun mevcut durumunu göster')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sıfırla')
        .setDescription('Oyunu sıfırla ve yeni kelime ile başla')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('istatistik')
        .setDescription('Kelime veritabanı istatistiklerini göster')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channelId = interaction.channel.id;

    try {
      switch (subcommand) {
        case 'başlat':
          await this.startGame(interaction, channelId);
          break;
        case 'bitir':
          await this.endGame(interaction, channelId);
          break;
        case 'durum':
          await this.showStatus(interaction, channelId);
          break;
        case 'sıfırla':
          await this.resetGame(interaction, channelId);
          break;
        case 'istatistik':
          await this.showStats(interaction);
          break;
      }
    } catch (error) {
      console.error('Kelime oyunu komutu hatası:', error);
      await interaction.reply({
        content: '❌ Bir hata oluştu! Lütfen daha sonra tekrar deneyin.',
        ephemeral: true
      });
    }
  },

  async startGame(interaction, channelId) {
    const existingGame = await Game.findOne({ channelId, isActive: true });
    
    if (existingGame) {
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Oyun Zaten Aktif!')
        .setDescription(`Bu kanalda zaten aktif bir kelime oyunu var!\n\n**Mevcut Kelime:** ${existingGame.currentWord}`)
        .setFooter({ text: 'Oyunu bitirmek için /kelimeoyunu bitir komutunu kullanın' });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Defer reply - kelime API'sinden çekerken zaman alabilir
    await interaction.deferReply();

    const firstWord = await getRandomTurkishWord();
    
    const newGame = new Game({
      channelId,
      currentWord: firstWord,
      usedWords: [{ word: firstWord, userId: 'bot' }],
      isActive: true
    });

    await newGame.save();

    const embed = new EmbedBuilder()
      .setColor('#4ECDC4')
      .setTitle('🎮 Kelime Oyunu Başladı!')
      .setDescription(`İlk kelime: **${firstWord}**\n\nSıradaki kelime **"${firstWord.slice(-1)}"** harfi ile başlamalı!`)
      .addFields(
        { name: '📝 Kurallar', value: '• Kelimenin son harfi ile başlayan yeni kelime yazın\n• Daha önce kullanılmış kelimeleri tekrar yazmayın\n• Sadece Türkçe kelimeler geçerlidir\n• Aynı kişi ard arda kelime yazamaz' },
        { name: '🏆 Puanlama', value: 'Doğru kelime = ✅🎉 tepki\nYanlış kelime = ❌ tepki ve silme' },
        { name: '🔍 Kelime Kaynağı', value: 'Kelimeler TDK ve çevrimiçi kaynaklardan doğrulanır' }
      )
      .setFooter({ text: 'Başlamak için kelimenin son harfi ile başlayan bir kelime yazın!' });

    await interaction.editReply({ embeds: [embed] });
  },

  async endGame(interaction, channelId) {
    const game = await Game.findOne({ channelId, isActive: true });
    
    if (!game) {
      await interaction.reply({
        content: '❌ Bu kanalda aktif bir kelime oyunu bulunamadı!',
        ephemeral: true
      });
      return;
    }

    game.isActive = false;
    await game.save();

    const embed = new EmbedBuilder()
      .setColor('#FF6B6B')
      .setTitle('🏁 Kelime Oyunu Bitti!')
      .setDescription(`Oyun sona erdi!\n\n**Son Kelime:** ${game.currentWord}`)
      .addFields(
        { name: '📊 İstatistikler', value: `**Toplam Kelime:** ${game.usedWords.length}\n**Süre:** ${Math.floor((Date.now() - game.createdAt) / (1000 * 60))} dakika` }
      )
      .setFooter({ text: 'Yeni oyun başlatmak için /kelimeoyunu başlat komutunu kullanın' });

    await interaction.reply({ embeds: [embed] });
  },

  async showStatus(interaction, channelId) {
    const game = await Game.findOne({ channelId, isActive: true });
    
    if (!game) {
      await interaction.reply({
        content: '❌ Bu kanalda aktif bir kelime oyunu bulunamadı!',
        ephemeral: true
      });
      return;
    }

    const recentWords = game.usedWords.slice(-5).reverse();
    const wordsText = recentWords.map(w => `• ${w.word}`).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#4ECDC4')
      .setTitle('📊 Oyun Durumu')
      .setDescription(`**Mevcut Kelime:** ${game.currentWord}\n**Sıradaki Harf:** "${game.currentWord.slice(-1)}"`)
      .addFields(
        { name: '🔤 Son Kelimeler', value: wordsText || 'Henüz kelime yok' },
        { name: '📈 İstatistikler', value: `**Toplam Kelime:** ${game.usedWords.length}\n**Süre:** ${Math.floor((Date.now() - game.createdAt) / (1000 * 60))} dakika` }
      )
      .setFooter({ text: 'Oyunu bitirmek için /kelimeoyunu bitir komutunu kullanın' });

    await interaction.reply({ embeds: [embed] });
  },

  async resetGame(interaction, channelId) {
    const game = await Game.findOne({ channelId, isActive: true });
    
    if (!game) {
      await interaction.reply({
        content: '❌ Bu kanalda aktif bir kelime oyunu bulunamadı!',
        ephemeral: true
      });
      return;
    }

    // Defer reply - yeni kelime API'sinden çekerken zaman alabilir
    await interaction.deferReply();

    const newWord = await getRandomTurkishWord();
    game.currentWord = newWord;
    game.usedWords = [{ word: newWord, userId: 'bot' }];
    game.lastUserId = null;
    game.createdAt = new Date();
    
    await game.save();

    const embed = new EmbedBuilder()
      .setColor('#4ECDC4')
      .setTitle('🔄 Oyun Sıfırlandı!')
      .setDescription(`Yeni kelime: **${newWord}**\n\nSıradaki kelime **"${newWord.slice(-1)}"** harfi ile başlamalı!`)
      .setFooter({ text: 'Oyun sıfırlandı ve yeni kelime ile devam ediyor!' });

    await interaction.editReply({ embeds: [embed] });
  },

  async showStats(interaction) {
    await interaction.deferReply();
    
    const stats = getCacheStats();
    
    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('📈 Kelime Veritabanı İstatistikleri')
      .addFields(
        { name: '📚 Toplam Kelime', value: `${stats.wordCount.toLocaleString('tr-TR')} kelime`, inline: true },
        { name: '🕒 Son Güncelleme', value: stats.lastUpdate, inline: true },
        { name: '⏱️ Cache Yaşı', value: `${stats.cacheAge} dakika`, inline: true },
        { name: '🔍 Kelime Kaynakları', value: '• GitHub Türkçe Kelime Listesi\n• Wiktionary Türkçe Kategorisi\n• TDK Sözlük API\n• Fallback Kelime Listesi' },
        { name: '⚡ Performans', value: 'Kelimeler bellekte cache\'lenir ve 24 saatte bir güncellenir' }
      )
      .setFooter({ text: 'Kelimeler otomatik olarak güncellenir ve doğrulanır' });

    await interaction.editReply({ embeds: [embed] });
  }
};