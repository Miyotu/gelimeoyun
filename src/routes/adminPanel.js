const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const { getRandomTurkishWord } = require('../utils/turkishWords');

function checkAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

async function checkAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: 'Yetkisiz erişim' });
  }

  try {
    const conf = require('../configs/config.json');
    const { client } = require('../../app');
    const guild = client.guilds.cache.get(conf.guildID);

    if (!guild) {
      return res.status(500).json({ success: false, error: 'Sunucu bulunamadı' });
    }

    const member = await guild.members.fetch(req.user.id).catch(() => null);

    if (!member || !member.permissions.has('Administrator')) {
      return res.status(403).json({ success: false, error: 'Admin yetkisi gerekli' });
    }

    next();
  } catch (error) {
    console.error('Admin kontrol hatası:', error);
    res.status(500).json({ success: false, error: 'Bir hata oluştu' });
  }
}

router.get('/admin-panel', checkAuth, async (req, res) => {
  try {
    const conf = require('../configs/config.json');
    const { client } = require('../../app');
    const guild = client.guilds.cache.get(conf.guildID);

    if (!guild) {
      return res.status(500).send('Sunucu bulunamadı');
    }

    const member = await guild.members.fetch(req.user.id).catch(() => null);

    if (!member || !member.permissions.has('Administrator')) {
      return res.status(403).send('Bu sayfaya erişim yetkiniz yok. Sadece sunucu yöneticileri admin panele erişebilir.');
    }

    const games = await Game.find({}).sort({ createdAt: -1 }).limit(50);

    const gamesWithChannelNames = await Promise.all(
      games.map(async (game) => {
        const channel = await client.channels.fetch(game.channelId).catch(() => null);
        return {
          ...game.toObject(),
          channelName: channel ? channel.name : null
        };
      })
    );

    const stats = {
      totalGames: games.length,
      totalWords: games.reduce((sum, game) => sum + game.usedWords.length, 0),
      activeChannels: games.filter(g => g.isActive).length,
      avgGameTime: games.length > 0
        ? Math.round(
            games.reduce((sum, game) => {
              const duration = (Date.now() - new Date(game.createdAt).getTime()) / (1000 * 60);
              return sum + duration;
            }, 0) / games.length
          ) + ' dk'
        : '0 dk'
    };

    res.render('admin-panel', {
      user: req.user,
      games: gamesWithChannelNames,
      stats
    });
  } catch (error) {
    console.error('Admin panel hatası:', error);
    res.status(500).send('Bir hata oluştu');
  }
});

router.post('/api/admin/game/start', checkAdmin, async (req, res) => {
  try {
    const { channelId, startWord } = req.body;

    if (!channelId) {
      return res.json({ success: false, error: 'Kanal ID gerekli' });
    }

    const existingGame = await Game.findOne({ channelId, isActive: true });

    if (existingGame) {
      return res.json({ success: false, error: 'Bu kanalda zaten aktif bir oyun var' });
    }

    const firstWord = startWord && startWord.trim() ? startWord.trim().toLowerCase() : await getRandomTurkishWord();

    const newGame = new Game({
      channelId,
      currentWord: firstWord,
      usedWords: [{ word: firstWord, userId: 'bot' }],
      isActive: true
    });

    await newGame.save();

    const { client } = require('../../app');
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (channel) {
      await channel.send({
        embeds: [{
          color: 0x4ECDC4,
          title: '🎮 Kelime Oyunu Başladı! (Admin tarafından)',
          description: `İlk kelime: **${firstWord}**\n\nSıradaki kelime **"${firstWord.slice(-1)}"** harfi ile başlamalı!`,
          fields: [
            { name: '📝 Kurallar', value: '• Kelimenin son harfi ile başlayan yeni kelime yazın\n• Daha önce kullanılmış kelimeleri tekrar yazmayın\n• Sadece Türkçe kelimeler geçerlidir\n• Aynı kişi ard arda kelime yazamaz' }
          ]
        }]
      });
    }

    res.json({ success: true, message: 'Oyun başarıyla başlatıldı' });
  } catch (error) {
    console.error('Oyun başlatma hatası:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/api/admin/game/end', checkAdmin, async (req, res) => {
  try {
    const { channelId } = req.body;

    if (!channelId) {
      return res.json({ success: false, error: 'Kanal ID gerekli' });
    }

    const game = await Game.findOne({ channelId, isActive: true });

    if (!game) {
      return res.json({ success: false, error: 'Aktif oyun bulunamadı' });
    }

    game.isActive = false;
    await game.save();

    const { client } = require('../../app');
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (channel) {
      await channel.send({
        embeds: [{
          color: 0xFF6B6B,
          title: '🏁 Kelime Oyunu Bitti! (Admin tarafından)',
          description: `Oyun sona erdi!\n\n**Son Kelime:** ${game.currentWord}`,
          fields: [
            { name: '📊 İstatistikler', value: `**Toplam Kelime:** ${game.usedWords.length}\n**Süre:** ${Math.floor((Date.now() - game.createdAt) / (1000 * 60))} dakika` }
          ]
        }]
      });
    }

    res.json({ success: true, message: 'Oyun durduruldu' });
  } catch (error) {
    console.error('Oyun durdurma hatası:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/api/admin/game/reset', checkAdmin, async (req, res) => {
  try {
    const { channelId } = req.body;

    if (!channelId) {
      return res.json({ success: false, error: 'Kanal ID gerekli' });
    }

    const game = await Game.findOne({ channelId, isActive: true });

    if (!game) {
      return res.json({ success: false, error: 'Aktif oyun bulunamadı' });
    }

    const newWord = await getRandomTurkishWord();
    game.currentWord = newWord;
    game.usedWords = [{ word: newWord, userId: 'bot' }];
    game.lastUserId = null;
    game.createdAt = new Date();

    await game.save();

    const { client } = require('../../app');
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (channel) {
      await channel.send({
        embeds: [{
          color: 0x4ECDC4,
          title: '🔄 Oyun Sıfırlandı! (Admin tarafından)',
          description: `Yeni kelime: **${newWord}**\n\nSıradaki kelime **"${newWord.slice(-1)}"** harfi ile başlamalı!`
        }]
      });
    }

    res.json({ success: true, message: 'Oyun sıfırlandı' });
  } catch (error) {
    console.error('Oyun sıfırlama hatası:', error);
    res.json({ success: false, error: error.message });
  }
});

router.get('/api/admin/game/details/:channelId', checkAdmin, async (req, res) => {
  try {
    const { channelId } = req.params;

    const game = await Game.findOne({ channelId, isActive: true });

    if (!game) {
      return res.json({ success: false, error: 'Oyun bulunamadı' });
    }

    res.json({
      success: true,
      words: game.usedWords,
      currentWord: game.currentWord,
      isActive: game.isActive
    });
  } catch (error) {
    console.error('Oyun detay hatası:', error);
    res.json({ success: false, error: error.message });
  }
});

module.exports = router;
