const { Client, GatewayIntentBits, Partials, REST, Routes, PermissionsBitField, Collection, EmbedBuilder } = require("discord.js");
const express = require("express");
const app = express();
const settings = require("./src/configs/settings.json");
const bodyParser = require("body-parser");
const jsonconfig = require("./src/configs/config.json");
const { Database } = require("quickmongo");
const cookieParser = require("cookie-parser");
const ejs = require("ejs");
const path = require("path");
const passport = require("passport");
const { Strategy } = require("passport-discord");
const session = require("express-session");
const mongoose = require("mongoose");
const url = require("url");
const moment = require("moment");
const fs = require("fs");
const router = express.Router();
const multer = require('multer');
require("moment-duration-format");
const { PermissionFlagsBits } = require('discord.js');
const { Events } = require('discord.js');
const DiscordTicket = require('./src/models/discordticket');
const rest = new REST({ version: '10' }).setToken(settings.token);

const http = require("http");
const socketIo = require("socket.io");
const { spawn } = require("child_process");
const Game = require('./src/models/GameBoom');
const GameStats = require('./src/models/GameBoomStats');

const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo } = require('kazagumo');
const config = require('./src/configs/config.js');

const server = http.createServer(app);
const io = socketIo(server);

moment.locale("tr");
const cooldown = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,                    // Sunucu bilgisi
    GatewayIntentBits.GuildMessages,             // Sunucudaki mesajları görebilme
    GatewayIntentBits.MessageContent,            // Mesaj içeriğine erişim (ayar panelinden açılmış olmalı)
    GatewayIntentBits.GuildMembers,              // Üye listesi ve bilgileri (ayar panelinden açılmış olmalı)
    GatewayIntentBits.GuildPresences,            // Kullanıcı çevrim içi durumları
    GatewayIntentBits.GuildVoiceStates,          // Ses kanalı durumu
    GatewayIntentBits.GuildMessageReactions,     // Mesaj tepkileri
    GatewayIntentBits.DirectMessages,            // DM mesajları
    GatewayIntentBits.GuildInvites,              // Davetleri yönetmek
  ],
  partials: [
    Partials.Channel,         // DM'lerde kanal bilgisi için gerekli
    Partials.Message,         // Kısmi mesajlar
    Partials.Reaction,        // Kısmi tepkiler
    Partials.User,            // Kısmi kullanıcı verisi
    Partials.GuildMember,     // Kısmi guild üyeleri
  ]
});

const messageListener = require('./src/handler/messageListener');
client.on('messageCreate', messageListener.execute);

const linkListener = require('./src/handler/linkListener');
client.on('messageCreate', linkListener.execute);

const sayıListener = require('./src/handler/sayıListener');
client.on('messageCreate', sayıListener.execute);

// const pictureListener = require('./src/handler/pictureListener');
// client.on('messageCreate', pictureListener.execute);


const { handleTicketButtons } = require('./src/handler/ticketHandler');
client.on('interactionCreate', async (interaction) => {
  await handleTicketButtons(interaction);
});


// </> Middlewares </>
app.engine('.ejs', ejs.renderFile);
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false, }));
app.use(cookieParser());
app.set('views', path.join(__dirname, 'src/views'));
const templateDir = path.resolve(`${process.cwd()}${path.sep}src/views`);
app.use(express.static(__dirname + '/src/public'));
app.use(session({ secret: 'secret-session-thing', resave: false, saveUninitialized: false, }));
app.use(passport.initialize());
app.use(passport.session());

// Passport kullanıcı serializasyonu ve deserializasyonu
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

const scopes = ['identify', 'guilds', 'email'];

// Passport Discord OAuth2 stratejisi
passport.use(new Strategy({
  clientID: settings.clientID,
  clientSecret: settings.secret,
  callbackURL: settings.callbackURL,
  scope: scopes,
},
(accessToken, refreshToken, profile, done) => {
  const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
  
  // Eğer e-posta bilgisi mevcut ise, profile objesine ekle
  if (email) {
    profile.email = email;
  }
  
  process.nextTick(() => done(null, profile));
}));

app.get('/login', passport.authenticate('discord', { scope: scopes, }));
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/error', }), (req, res) => res.redirect('/'));
app.get('/logout', (req, res) => {
  req.logout();
  return res.redirect('/');
});
// </> Authorization </>

// </> DB Connection </>
mongoose.connect(settings.mongoURL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false, // Bu satırı ekleyin
})
  .then(() => {
    console.log('[CONNECTED] Mongo Database bağlantısı başarıyla bağlandı.');
  })
  .catch((error) => {
    console.error('[UNCONNECTED] Mongo Database bağlantısı başarısız:', error);
  });

["eventHandler", "commandHandler"].forEach(handler => {
  require(`./src/handler/${handler}`)(client);
});

require('./src/events/ready.js');
require('./src/events/interactionCreate.js');
// </> DB Connection </>

app.use(express.json());
app.use(cookieParser());

const discordTicketRoute  = require('./src/routes/discordTicket');
app.use(discordTicketRoute)


app.get("/", async (req, res) => {
  const conf = require("./src/configs/config.json");
  const lang = req.cookies.lang || "tr"; // Varsayılan dil
  const guild = client.guilds.cache.get(conf.guildID);
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  // IPv6 localhost düzeltmesi
  if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
  }


  res.render("index", {
    user: req.user,
    guild,
    ip,
    bot: client,
    path: req.path,
    conf,
    moment,
    member: req.isAuthenticated() ? req.user : null,
    reduce: ((a, b) => a + b.memberCount, 0),
    reqMember: req.user
      ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id)
      : null
  });
});

app.get('/discord-ticket', (req, res) => {
  res.render('discord-ticket', {
    error: null,
    tickets: []
  });
});

app.post('/verify-code', async (req, res) => {
  const code = req.body.code?.trim()?.toLowerCase();

  if (!code || !/^[a-f0-9]{8}$/.test(code)) {
    return res.render('discord-ticket', {
      error: 'Geçersiz kod formatı.',
      tickets: []
    });
  }

  try {
    // BURADA HATA VARDI ↓
    const ticket = await DiscordTicket.findOne({ code }).lean();

    if (!ticket) {
      return res.render('discord-ticket', {
        error: 'Bu kodla eşleşen bir ticket bulunamadı.',
        tickets: []
      });
    }

    res.render('discord-ticket', {
      error: null,
      tickets: [ticket]
    });

  } catch (err) {
    console.error('Kod doğrulama hatası:', err);
    res.render('discord-ticket', {
      error: 'Sunucu hatası oluştu.',
      tickets: []
    });
  }
});

const messageCreateHandler = require('./src/handler/messageCreate');
client.on(messageCreateHandler.name, messageCreateHandler.execute);

app.use((err, req, res, next) => {
  console.error(err.stack); // Hata detaylarını konsola yazdır

  // Belirli bir hata türüne göre yönlendirme
  if (err instanceof TypeError && err.message.includes('Cannot read properties of undefined')) {
      // Belirli bir TypeError mesajını kontrol edin
      res.redirect('/login'); // Kullanıcıyı login sayfasına yönlendir
  } else {
      // Diğer hataları işlemeye devam et
      res.status(500).send('Sunucuda bir hata oluştu');
  }
});

// </> Pages </>

// </> Functions </>

app.use((req, res) => error(res, 404, "Sayfa bulunamadı!"));

const error = (res, statuscode, message) => {
  return res.redirect(url.format({ pathname: "/error", query: { statuscode, message }}));
};

const PORT = 5060;

app.listen(PORT, function(err){
  if (err) console.log("Error in server setup")
  console.log(`[CONNECTED] Bot başarıyla başlatıldı! Şu Portu kullanıyor: ${PORT}`,);
});

client.on("ready", () => {
  console.log("[CONNECTED] Bot için gerekli komutlar başarıyla yüklendi!");
});


//main.js

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    if (content.includes('ne zaman') || content.includes('nezaman') || content.includes('nezmn') || content.includes('ne zmn')) {
        await message.reply({
            content: `${message.author}, Modlarımızın çıkış tarihi hakkında net bir zaman veremiyoruz. Duyuruları takip edin! <#861228998964412446>`,
            allowedMentions: { users: [message.author.id] },
        });
    }
});

// const clientId = '912051560660480040';       // Bot uygulama (client) ID
// const guildId = '861217299025494037';            // Temizlemek istediğin sunucunun ID'si

// (async () => {
  // try {
    // console.log('🧹 Guild (sunucu) komutları siliniyor...');

    // await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      // body: [], // Boş komut listesi göndererek tümünü siler
    // });

    // console.log(`✅ ${guildId} sunucusundaki tüm komutlar silindi!`);
  // } catch (error) {
    // console.error('❌ Guild komutları silinirken hata oluştu:', error);
  // }
// })();

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const kelimeCommand = client.commands.get('kelime-oyunu-başlat');
    if (kelimeCommand && kelimeCommand.handleMessage) {
        await kelimeCommand.handleMessage(message);
    }
});

// Mesajları dinle (sayı kontrolü için)
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    const game = await Game.findOne({ channelId: message.channelId });
    if (!game || !game.isActive) return;
    
    const content = message.content.trim().toLowerCase();
    let number;
    
    // "boom" kelimesi kontrolü
    if (content === 'boom') {
        // Boom yazmak, boom sayısının katını atlamak için kullanılır
        if (game.isBoom(game.currentNumber)) {
            // Doğru boom kullanımı - sayıyı atla
            await message.react('✅');
            game.makeMove(message.author.id);
            await game.save();
            return;
        } else {
            // Yanlış boom kullanımı
            await message.react('❌');
            setTimeout(() => message.delete().catch(() => {}), 3000);
            return;
        }
    } else {
        number = parseInt(content);
        if (isNaN(number) || number <= 0) return;
    }
    
    // Geçerli hamle kontrolü
    if (!game.isValidMove(number, message.author.id)) {
        if (number === game.currentNumber && game.lastUser === message.author.id) {
            await message.react('⚠️');
            setTimeout(() => message.delete().catch(() => {}), 3000);
        } else if (number !== game.currentNumber) {
            await message.react('❌');
            setTimeout(() => message.delete().catch(() => {}), 3000);
        }
        return;
    }
    
    // Boom kontrolü
    if (game.isBoom(number)) {
        await message.react('💥');
        
        // İstatistikleri güncelle
        let stats = await GameStats.findOne({ channelId: message.channelId });
        if (!stats) {
            stats = new GameStats({
                channelId: message.channelId,
                guildId: message.guildId
            });
        }
        
        const gameTime = (Date.now() - game.startTime) / 1000;
        stats.addBoom(message.author.id, number, gameTime);
        await stats.save();
        
        // Boom mesajı
        const boomEmbed = {
            color: 0xff4444,
            title: '💥 BOOM! 💥',
            description: `<@${message.author.id}> **${number}** sayısı ile patladı!\n\n🎯 Boom sayısı: **${game.boomNumber}**\n📊 Ulaşılan sayı: **${number}**\n⏱️ Oyun süresi: **${Math.floor(gameTime)}** saniye\n\n🔄 Yeni oyun başlıyor...`,
            timestamp: new Date(),
            footer: { text: 'Boom Oyunu' }
        };
        
        await message.channel.send({ embeds: [boomEmbed] });
        
        // Oyunu sıfırla
        game.resetGame();
        await game.save();
        
        const newGameEmbed = {
            color: 0x44ff44,
            title: '🎮 Yeni Oyun Başladı!',
            description: `🎯 Yeni boom sayısı: **${game.boomNumber}**\n📝 Sıradaki sayı: **${game.currentNumber}**\n\n✅ **${game.boomNumber}**'in katlarını yazmayın!\n⚠️ Üst üste aynı kişi yazamaz!`,
            footer: { text: 'İyi şanslar!' }
        };
        
        await message.channel.send({ embeds: [newGameEmbed] });
        
    } else {
        // Doğru sayı
        await message.react('✅');
        game.makeMove(message.author.id);
        await game.save();
        
        // Her 10 sayıda bir durum mesajı
        if (number % 10 === 0) {
            const statusEmbed = {
                color: 0x4444ff,
                title: '📊 Oyun Durumu',
                description: `🎯 Boom sayısı: **${game.boomNumber}**\n📝 Sıradaki sayı: **${game.currentNumber}**\n👥 Katılımcı sayısı: **${game.participants.length}**`,
                footer: { text: `Son yazan: ${message.author.displayName}` }
            };
            
            await message.channel.send({ embeds: [statusEmbed] });
        }
    }
});

// Komut işleme fonksiyonları
async function handleStartGame(interaction) {
    const channel = interaction.options.getChannel('kanal');
    const boomNumber = interaction.options.getInteger('sayı') || 0;
    
    if (!channel.isTextBased()) {
        return interaction.reply({ 
            content: '❌ Lütfen bir metin kanalı seçin!', 
            ephemeral: true 
        });
    }
    
    const existingGame = await Game.findOne({ channelId: channel.id });
    if (existingGame && existingGame.isActive) {
        return interaction.reply({ 
            content: '❌ Bu kanalda zaten aktif bir oyun var!', 
            ephemeral: true 
        });
    }
    
    const finalBoomNumber = boomNumber === 0 ? Math.floor(Math.random() * 10) + 1 : boomNumber;
    
    // Mevcut oyunu güncelle veya yeni oyun oluştur
    let game = existingGame;
    if (game) {
        game.boomNumber = finalBoomNumber;
        game.currentNumber = 1;
        game.lastUser = null;
        game.isActive = true;
        game.startTime = new Date();
        game.participants = [];
    } else {
        game = new Game({
            channelId: channel.id,
            guildId: interaction.guildId,
            boomNumber: finalBoomNumber
        });
    }
    
    await game.save();
    
    const startEmbed = {
        color: 0x44ff44,
        title: '🎮 Boom Oyunu Başladı!',
        description: `🎯 Boom sayısı: **${finalBoomNumber}**\n📝 İlk sayı: **1**\n\n✅ **${finalBoomNumber}**'in katlarını yazmayın!\n⚠️ Üst üste aynı kişi yazamaz!\n\n🚀 Oyun <#${channel.id}> kanalında başladı!`,
        footer: { text: `Oyunu başlatan: ${interaction.user.displayName}` }
    };
    
    await interaction.reply({ embeds: [startEmbed] });
    
    await channel.send({ 
        content: '**1** sayısından başlayın! 🎯',
        embeds: [startEmbed]
    });
}

async function handleGameStatus(interaction) {
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    const game = await Game.findOne({ channelId: channel.id });
    
    if (!game || !game.isActive) {
        return interaction.reply({ 
            content: '❌ Bu kanalda aktif bir oyun yok!', 
            ephemeral: true 
        });
    }
    
    const status = game.getStatus();
    const uptime = `${Math.floor(status.uptime / 60)}:${(status.uptime % 60).toString().padStart(2, '0')}`;
    
    const statusEmbed = {
        color: 0x4444ff,
        title: '📊 Oyun Durumu',
        fields: [
            { name: '🎯 Boom Sayısı', value: `**${status.boomNumber}**`, inline: true },
            { name: '📝 Sıradaki Sayı', value: `**${status.currentNumber}**`, inline: true },
            { name: '👥 Katılımcı', value: `**${status.participants}**`, inline: true },
            { name: '🎮 Oynanan Oyun', value: `**${status.totalGames}**`, inline: true },
            { name: '⏱️ Süre', value: `**${uptime}**`, inline: true },
            { name: '🔄 Durum', value: status.isActive ? '**Aktif**' : '**Pasif**', inline: true }
        ],
        footer: { text: `Kanal: #${channel.name}` }
    };
    
    await interaction.reply({ embeds: [statusEmbed] });
}

async function handleGameStats(interaction) {
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    const stats = await GameStats.findOne({ channelId: channel.id });
    
    if (!stats) {
        return interaction.reply({ 
            content: '❌ Bu kanal için istatistik bulunamadı!', 
            ephemeral: true 
        });
    }
    
    // En çok boom yapan kullanıcılar
    const topBoomers = stats.getTopBoomers()
        .map((user, index) => `${index + 1}. <@${user.userId}> - **${user.boomCount}** boom`)
        .join('\n') || 'Henüz veri yok';
    
    const fastestTime = stats.records.fastest === Infinity ? 'Henüz kayıt yok' : `${Math.floor(stats.records.fastest)} saniye`;
    
    const statsEmbed = {
        color: 0xff8844,
        title: '📈 Oyun İstatistikleri',
        fields: [
            { name: '💥 Toplam Boom', value: `**${stats.totalBooms}**`, inline: true },
            { name: '🏆 En Yüksek Sayı', value: `**${stats.records.highest}**`, inline: true },
            { name: '⚡ En Hızlı Boom', value: `**${fastestTime}**`, inline: true },
            { name: '👑 En Çok Boom Yapanlar', value: topBoomers, inline: false }
        ],
        footer: { text: `Kanal: #${channel.name}` }
    };
    
    await interaction.reply({ embeds: [statsEmbed] });
}

async function handleEndGame(interaction) {
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    const game = await Game.findOne({ channelId: channel.id });
    
    if (!game || !game.isActive) {
        return interaction.reply({ 
            content: '❌ Bu kanalda aktif bir oyun yok!', 
            ephemeral: true 
        });
    }
    
    game.isActive = false;
    await game.save();
    
    const endEmbed = {
        color: 0xff4444,
        title: '⏹️ Oyun Bitirildi',
        description: `<#${channel.id}> kanalındaki boom oyunu bitirildi.\n\n📊 **Son durum:**\n🎯 Boom sayısı: **${game.boomNumber}**\n📝 Son sayı: **${game.currentNumber - 1}**\n👥 Katılımcı: **${game.participants.length}**`,
        footer: { text: `Bitiren: ${interaction.user.displayName}` }
    };
    
    await interaction.reply({ embeds: [endEmbed] });
}

async function handleResetGame(interaction) {
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    const newNumber = interaction.options.getInteger('yeni-sayı') || 0;
    const game = await Game.findOne({ channelId: channel.id });
    
    if (!game || !game.isActive) {
        return interaction.reply({ 
            content: '❌ Bu kanalda aktif bir oyun yok!', 
            ephemeral: true 
        });
    }
    
    const finalNewNumber = newNumber === 0 ? Math.floor(Math.random() * 10) + 1 : newNumber;
    const oldNumber = game.boomNumber;
    
    game.resetGame(finalNewNumber);
    await game.save();
    
    const resetEmbed = {
        color: 0xffaa44,
        title: '🔄 Oyun Sıfırlandı',
        description: `<#${channel.id}> kanalındaki oyun sıfırlandı!\n\n🔄 **Değişiklikler:**\n🎯 Eski boom sayısı: **${oldNumber}**\n🎯 Yeni boom sayısı: **${finalNewNumber}**\n📝 Başlangıç sayısı: **1**`,
        footer: { text: `Sıfırlayan: ${interaction.user.displayName}` }
    };
    
    await interaction.reply({ embeds: [resetEmbed] });
}

class MusicBot extends Client {
    constructor() {

              super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent
            ]
        });

        this.config = config;

            this.shoukaku = new Shoukaku(new Connectors.DiscordJS(this), [{
            name: 'main',
            url: `${config.lavalink.secure ? 'wss' : 'ws'}://${config.lavalink.host}:${config.lavalink.port}`,
            auth: config.lavalink.password,
            secure: config.lavalink.secure
        }]);

        this.kazagumo = new Kazagumo({
            defaultSearchEngine: 'youtube_music',
            send: (guildId, payload) => {
                const guild = this.guilds.cache.get(guildId);
                if (guild) guild.shard.send(payload);
            }
        }, new Connectors.DiscordJS(this), [{
            name: 'main',
            url: `${config.lavalink.secure ? 'wss' : 'ws'}://${config.lavalink.host}:${config.lavalink.port}`,
            auth: config.lavalink.password,
            secure: config.lavalink.secure
        }]);
    }
}
new MusicBot();

client.login(settings.token).catch((err) => console.log(err));