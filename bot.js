const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ActivityType, SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Charger les variables d'environnement
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '0';
const DEFAULT_GIVEAWAY_CHANNEL_ID = process.env.DEFAULT_GIVEAWAY_CHANNEL_ID || '0';

// Charger la configuration (giveaways actifs)
let config = { giveaways: [] };
try {
    const configData = fs.readFileSync('./config.json', 'utf8');
    config = JSON.parse(configData);
} catch (error) {
    console.log('ℹ️ Aucune config trouvée, création d\'une nouvelle');
    saveConfig();
}

// Définition de la slash command
const commands = [
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Crée un giveaway')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('prix')
                .setDescription('Montant du prix en euros (ex: 50)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duree')
                .setDescription('Durée en heures')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(720))
        .addIntegerOption(option =>
            option.setName('gagnants')
                .setDescription('Nombre de gagnants')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(20))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel où poster le giveaway (optionnel si channel par défaut configuré)')
                .setRequired(false))
].map(command => command.toJSON());

// Créer le client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers
    ]
});

/**
 * Envoie un message dans le channel de logs si configuré
 */
async function sendLog(guild, message) {
    if (LOG_CHANNEL_ID === '0') {
        console.log(message);
        return;
    }

    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) {
        console.log(`⚠️ Channel de logs non trouvé (ID: ${LOG_CHANNEL_ID})`);
        console.log(message);
        return;
    }

    try {
        await logChannel.send(message);
        console.log(message);
    } catch (error) {
        console.log(`⚠️ Erreur lors de l'envoi du log: ${error.message}`);
        console.log(message);
    }
}

/**
 * Sauvegarde la configuration dans config.json
 */
function saveConfig() {
    try {
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4), 'utf8');
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde de config.json:', error.message);
    }
}

/**
 * Enregistre les slash commands auprès de Discord
 */
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        console.log('🔄 Enregistrement des slash commands...');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('✅ Slash commands enregistrées avec succès !');
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement des slash commands:', error);
    }
}

/**
 * Formatte la durée restante
 */
function formatTimeRemaining(endTime) {
    const now = Date.now();
    const remaining = endTime - now;

    if (remaining <= 0) return 'Terminé !';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Tire au sort les gagnants d'un giveaway
 */
async function endGiveaway(giveaway) {
    try {
        const guild = client.guilds.cache.get(giveaway.guild_id);
        if (!guild) return;

        const channel = guild.channels.cache.get(giveaway.channel_id);
        if (!channel) return;

        const message = await channel.messages.fetch(giveaway.message_id);
        if (!message) return;

        // Récupérer toutes les réactions 🎉
        const reaction = message.reactions.cache.get('🎉');
        if (!reaction) {
            await channel.send('❌ Aucune participation au giveaway !');
            return;
        }

        // Récupérer tous les utilisateurs qui ont réagi (sauf le bot)
        const users = await reaction.users.fetch();
        const participants = users.filter(user => !user.bot);

        if (participants.size === 0) {
            await channel.send('❌ Aucune participation au giveaway !');
            return;
        }

        // Tirer au sort les gagnants
        const winnersCount = Math.min(giveaway.winners, participants.size);
        const participantsArray = Array.from(participants.values());
        const winners = [];

        for (let i = 0; i < winnersCount; i++) {
            const randomIndex = Math.floor(Math.random() * participantsArray.length);
            winners.push(participantsArray[randomIndex]);
            participantsArray.splice(randomIndex, 1);
        }

        // Annoncer les gagnants
        const winnerMentions = winners.map(w => `<@${w.id}>`).join(', ');

        const resultEmbed = new EmbedBuilder()
            .setTitle('🎉 GIVEAWAY TERMINÉ !')
            .setDescription(`**Prix:** ${giveaway.prize}€\n\n**Gagnant(s):** ${winnerMentions}`)
            .setColor(0x00FF00)
            .setFooter({ text: `${participants.size} participant(s) au total` })
            .setTimestamp();

        await channel.send({ embeds: [resultEmbed] });

        // Logger
        await sendLog(guild, `🎉 **Giveaway terminé**\nPrix: ${giveaway.prize}€\nGagnants: ${winnerMentions}\nParticipants: ${participants.size}`);

        // Retirer le giveaway de la config
        config.giveaways = config.giveaways.filter(g => g.message_id !== giveaway.message_id);
        saveConfig();

    } catch (error) {
        console.error('❌ Erreur lors de la fin du giveaway:', error);
    }
}

/**
 * Vérifie les giveaways actifs et termine ceux qui sont expirés
 */
function checkGiveaways() {
    const now = Date.now();

    for (const giveaway of config.giveaways) {
        if (giveaway.end_time <= now) {
            endGiveaway(giveaway);
        }
    }
}

// Événement : Bot prêt
client.once('clientReady', async () => {
    console.log(`${client.user.tag} est connecté et prêt !`);
    console.log(`ID du bot: ${client.user.id}`);
    console.log('------');

    // Enregistrer les slash commands
    await registerCommands();

    console.log('------');
    console.log(`Actif sur ${client.guilds.cache.size} serveur(s)`);
    console.log('------');
    console.log(`Logs Discord: ${LOG_CHANNEL_ID !== '0' ? '✅ Activés' : '❌ Désactivés'}`);
    console.log(`Channel giveaway par défaut: ${DEFAULT_GIVEAWAY_CHANNEL_ID !== '0' ? '✅ Configuré' : '❌ Non configuré'}`);
    console.log('------');

    // Définir l'activité/statut du bot
    client.user.setPresence({
        activities: [{
            name: '🎁 Giveaways en cours',
            type: ActivityType.Custom
        }],
        status: 'online'
    });

    // Vérifier les giveaways toutes les minutes
    setInterval(checkGiveaways, 60000);

    // Vérifier immédiatement au démarrage
    checkGiveaways();
});

// Événement : Interaction (slash command)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'giveaway') {
        const prix = interaction.options.getString('prix');
        const duree = interaction.options.getInteger('duree');
        const gagnants = interaction.options.getInteger('gagnants');
        let channel = interaction.options.getChannel('channel');

        // Si aucun channel n'est fourni, utiliser le channel par défaut
        if (!channel) {
            if (DEFAULT_GIVEAWAY_CHANNEL_ID === '0') {
                await interaction.reply({
                    content: '❌ Aucun channel fourni et aucun channel par défaut configuré dans le .env',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            channel = interaction.guild.channels.cache.get(DEFAULT_GIVEAWAY_CHANNEL_ID);
            if (!channel) {
                await interaction.reply({
                    content: `❌ Le channel par défaut (ID: ${DEFAULT_GIVEAWAY_CHANNEL_ID}) n'existe pas!`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }

        // Calculer la date de fin
        const endTime = Date.now() + (duree * 60 * 60 * 1000);
        const endDate = new Date(endTime);

        // Créer l'embed du giveaway
        const embed = new EmbedBuilder()
            .setTitle('🎉 GIVEAWAY !')
            .setDescription(`Réagis avec 🎉 pour participer !\n\n**Prix:** ${prix}€\n**Gagnants:** ${gagnants}\n**Durée:** ${duree}h\n**Fin:** <t:${Math.floor(endTime / 1000)}:R>`)
            .setColor(0xFF1493)
            .setFooter({ text: `${gagnants} gagnant(s) | Se termine` })
            .setTimestamp(endDate);

        try {
            // Répondre à l'interaction
            await interaction.reply({ content: '✅ Giveaway créé !', flags: MessageFlags.Ephemeral });

            // Envoyer le giveaway dans le channel
            const giveawayMessage = await channel.send({ embeds: [embed] });

            // Ajouter la réaction
            await giveawayMessage.react('🎉');

            // Sauvegarder le giveaway
            config.giveaways.push({
                message_id: giveawayMessage.id,
                channel_id: channel.id,
                guild_id: interaction.guild.id,
                prize: prix,
                winners: gagnants,
                end_time: endTime,
                created_by: interaction.user.id
            });
            saveConfig();

            console.log(`✅ Giveaway créé par ${interaction.user.tag} - Prix: ${prix}€ - Durée: ${duree}h`);
            await sendLog(interaction.guild, `🎁 **Nouveau giveaway créé**\nPar: ${interaction.user}\nPrix: ${prix}€\nDurée: ${duree}h\nGagnants: ${gagnants}`);

        } catch (error) {
            console.error('❌ Erreur lors de la création du giveaway:', error.message);
            await interaction.editReply({ content: '❌ Erreur lors de la création du giveaway.' });
        }
    }
});

// Événement : Réaction ajoutée
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('❌ Erreur lors de la récupération de la réaction:', error);
            return;
        }
    }

    // Vérifier si c'est un giveaway actif
    const giveaway = config.giveaways.find(g => g.message_id === reaction.message.id);
    if (!giveaway) return;

    // Vérifier si c'est le bon emoji
    if (reaction.emoji.name !== '🎉') return;

    console.log(`🎉 ${user.tag} a participé au giveaway (${giveaway.prize}€)`);
});

// Gestion des erreurs
client.on('error', error => {
    console.error('❌ Erreur du client Discord:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Erreur non gérée:', error);
});

// Connexion du bot
if (!DISCORD_TOKEN) {
    console.error('❌ ERREUR: DISCORD_TOKEN non trouvé dans le fichier .env');
    console.error('Veuillez créer un fichier .env avec votre token Discord');
    process.exit(1);
}

client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Erreur de connexion:', error.message);
    process.exit(1);
});
