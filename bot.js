const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const queues = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, { songs: [], playing: false, connection: null, player: null });
  }
  return queues.get(guildId);
}

async function playSong(guild, song) {
  const queue = getQueue(guild.id);
  
  try {
    const stream = ytdl(song.url, { quality: 'highestaudio' });
    const resource = createAudioResource(stream);
    
    queue.player.play(resource);
    queue.playing = true;
    
    const channel = guild.channels.cache.get(song.channelId);
    if (channel) {
      channel.send(`🎵 Reproduciendo: **${song.title}**`);
    }
  } catch (error) {
    console.error('Error reproduciendo canción:', error);
    queue.songs.shift();
    if (queue.songs.length > 0) {
      playSong(guild, queue.songs[0]);
    }
  }
}

async function handleQueue(guild) {
  const queue = getQueue(guild.id);
  
  if (queue.songs.length === 0) {
    queue.playing = false;
    return;
  }
  
  playSong(guild, queue.songs[0]);
}

client.on('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'play') {
    if (!message.member.voice.channel) {
      return message.reply('❌ ¡Debes estar en un canal de voz!');
    }

    const query = args.join(' ');
    if (!query) {
      return message.reply('❌ ¡Proporciona una URL de YouTube!');
    }

    try {
      const url = query;
      
      if (!url.startsWith('http')) {
        return message.reply('⚠️ Por favor proporciona una URL de YouTube válida.');
      }

      const info = await ytdl.getInfo(url);
      const song = {
        title: info.videoDetails.title,
        url: url,
        channelId: message.channelId,
      };

      const queue = getQueue(message.guildId);
      queue.songs.push(song);

      if (!queue.connection) {
        queue.connection = joinVoiceChannel({
          channelId: message.member.voice.channel.id,
          guildId: message.guildId,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        queue.player = createAudioPlayer();
        queue.connection.subscribe(queue.player);

        queue.player.on(AudioPlayerStatus.Idle, () => {
          queue.songs.shift();
          if (queue.songs.length > 0) {
            handleQueue(message.guild);
          } else {
            queue.playing = false;
          }
        });

        queue.player.on('error', (error) => {
          console.error('Error del reproductor:', error);
          queue.songs.shift();
          if (queue.songs.length > 0) {
            handleQueue(message.guild);
          }
        });
      }

      if (!queue.playing) {
        handleQueue(message.guild);
      } else {
        message.reply(`✅ Agregado a la cola: **${song.title}**`);
      }
    } catch (error) {
      console.error('Error:', error);
      message.reply('❌ Error procesando la canción. ¡Asegúrate de que la URL sea válida!');
    }
  }

  if (command === 'stop') {
    const queue = getQueue(message.guildId);
    if (queue.connection) {
      queue.connection.destroy();
      queue.songs = [];
      queue.playing = false;
      queue.connection = null;
      queue.player = null;
      message.reply('⏹️ Música detenida y cola limpiada.');
    }
  }

  if (command === 'skip') {
    const queue = getQueue(message.guildId);
    if (queue.player) {
      queue.songs.shift();
      queue.player.stop();
      message.reply('⏭️ ¡Saltado!');
    }
  }

  if (command === 'queue') {
    const queue = getQueue(message.guildId);
    if (queue.songs.length === 0) {
      return message.reply('📭 ¡La cola está vacía!');
    }
    const queueList = queue.songs.map((song, i) => `${i + 1}. ${song.title}`).join('\n');
    message.reply(`📋 **Cola:**\n${queueList}`);
  }

  if (command === 'help') {
    message.reply(`
🎵 **Comandos del Bot de Música:**
\`!play <URL de YouTube>\` - Reproducir una canción
\`!skip\` - Saltar canción actual
\`!stop\` - Detener música y limpiar cola
\`!queue\` - Mostrar cola
\`!help\` - Mostrar este mensaje
    `);
  }
});

client.login(process.env.DISCORD_TOKEN);
