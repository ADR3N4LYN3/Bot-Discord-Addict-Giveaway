const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ActivityType, SlashCommandBuilder, REST, Routes, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Charger les variables d'environnement
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '0';
const DEFAULT_GIVEAWAY_CHANNEL_ID = process.env.DEFAULT_GIVEAWAY_CHANNEL_ID || '0';
const GIVEAWAY_ROLE_IDS = process.env.GIVEAWAY_ROLE_ID ? process.env.GIVEAWAY_ROLE_ID.split(',').map(id => id.trim()) : ['0'];

// Charger la configuration (giveaways actifs + stats)
let config = {
    giveaways: [],
    participants: {}, // {message_id: [user_ids]}
    stats: {
        total_created: 0,
        total_completed: 0,
        total_cancelled: 0,
        total_participants: 0
    }
};
try {
    const configData = fs.readFileSync('./config.json', 'utf8');
    config = JSON.parse(configData);
    // Ajouter les stats si elles n'existent pas
    if (!config.stats) {
        config.stats = {
            total_created: 0,
            total_completed: 0,
            total_cancelled: 0,
            total_participants: 0
        };
        saveConfig();
    }
    // Ajouter participants si n'existe pas
    if (!config.participants) {
        config.participants = {};
        saveConfig();
    }
} catch (error) {
    console.log('ℹ️ Aucune config trouvée, création d\'une nouvelle');
    saveConfig();
}

// Définition des slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Crée un giveaway')
        .setDefaultMemberPermissions(null) // Permissions vérifiées dans le code
        .addStringOption(option =>
            option.setName('prix')
                .setDescription('Montant du prix en euros (ex: 50)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duree')
                .setDescription('Durée en minutes')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(43200))
        .addIntegerOption(option =>
            option.setName('gagnants')
                .setDescription('Nombre de gagnants')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(20))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel où poster le giveaway (optionnel si channel par défaut configuré)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('glist')
        .setDescription('Liste les giveaways actifs')
        .setDefaultMemberPermissions(null),
    new SlashCommandBuilder()
        .setName('gend')
        .setDescription('Termine un giveaway manuellement')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID du message du giveaway')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('gcancel')
        .setDescription('Annule un giveaway')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID du message du giveaway')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('gstats')
        .setDescription('Affiche les statistiques des giveaways')
        .setDefaultMemberPermissions(null)
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
 * Formatte la durée en minutes en format lisible
 */
function formatDuration(minutes) {
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours}h`;
        } else {
            return `${hours}h${remainingMinutes}min`;
        }
    } else {
        return `${minutes}min`;
    }
}

/**
 * Enregistre les slash commands auprès de Discord
 */
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        console.log('🔄 Enregistrement des slash commands...');

        // Supprimer les commandes globales pour éviter les doublons
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [] }
        );
        console.log('🗑️ Commandes globales supprimées');

        if (GUILD_ID) {
            // Mode Guild : les commandes apparaissent instantanément
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, GUILD_ID),
                { body: commands }
            );
            console.log(`✅ Slash commands enregistrées avec succès pour le serveur ${GUILD_ID} !`);
        } else {
            // Mode Global : peut prendre jusqu'à 1 heure
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands }
            );
            console.log('✅ Slash commands enregistrées globalement (peut prendre jusqu\'à 1h) !');
        }
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

        // Récupérer les participants depuis le config
        const participantIds = config.participants[giveaway.message_id] || [];

        if (participantIds.length === 0) {
            await channel.send({ content: '❌ Aucune participation au giveaway !' });
            // Retirer le giveaway de la config
            config.giveaways = config.giveaways.filter(g => g.message_id !== giveaway.message_id);
            delete config.participants[giveaway.message_id];
            saveConfig();
            return;
        }

        // Tirer au sort les gagnants
        const winnersCount = Math.min(giveaway.winners, participantIds.length);
        const participantsCopy = [...participantIds];
        const winnerIds = [];

        for (let i = 0; i < winnersCount; i++) {
            const randomIndex = Math.floor(Math.random() * participantsCopy.length);
            winnerIds.push(participantsCopy[randomIndex]);
            participantsCopy.splice(randomIndex, 1);
        }

        // Annoncer les gagnants
        const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');

        const resultEmbed = new EmbedBuilder()
            .setTitle('🎉 GIVEAWAY TERMINÉ !')
            .setDescription(`**Prix:** ${giveaway.prize}€\n\n**Gagnant(s):** ${winnerMentions}\n\nFélicitations ! 🎊`)
            .setColor(0x00FF00)
            .setFooter({ text: `${participantIds.length} participant(s) au total` })
            .setTimestamp();

        await channel.send({ content: winnerMentions, embeds: [resultEmbed] });

        // Logger
        await sendLog(guild, `🎉 **Giveaway terminé**\nPrix: ${giveaway.prize}€\nGagnants: ${winnerMentions}\nParticipants: ${participantIds.length}`);

        // Mettre à jour les statistiques
        config.stats.total_completed++;
        config.stats.total_participants += participantIds.length;

        // Retirer le giveaway de la config
        config.giveaways = config.giveaways.filter(g => g.message_id !== giveaway.message_id);
        delete config.participants[giveaway.message_id];
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
    console.log(`Rôle(s) giveaway: ${GIVEAWAY_ROLE_IDS[0] !== '0' ? `✅ ${GIVEAWAY_ROLE_IDS.length} configuré(s)` : '❌ Seulement admins'}`);
    console.log('------');

    // Définir l'activité/statut du bot
    client.user.setPresence({
        activities: [{
            name: '🎁 Giveaways en cours',
            type: ActivityType.Custom
        }],
        status: 'online'
    });

    // Vérifier les giveaways toutes les 10 secondes
    setInterval(checkGiveaways, 10000);

    // Vérifier immédiatement au démarrage
    checkGiveaways();
});

// Événement : Interaction (slash command)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'giveaway') {
        // Vérifier les permissions
        const member = interaction.member;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        const hasRole = GIVEAWAY_ROLE_IDS[0] !== '0' && GIVEAWAY_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));

        if (!isAdmin && !hasRole) {
            const rolesList = GIVEAWAY_ROLE_IDS.filter(id => id !== '0').map(id => `<@&${id}>`).join(', ');
            await interaction.reply({
                content: GIVEAWAY_ROLE_IDS[0] !== '0'
                    ? `❌ Vous devez avoir un des rôles suivants ou être administrateur pour créer des giveaways: ${rolesList}`
                    : '❌ Vous devez être administrateur pour créer des giveaways.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

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
        const endTime = Date.now() + (duree * 60 * 1000);
        const endDate = new Date(endTime);

        // Créer l'embed du giveaway
        const embed = new EmbedBuilder()
            .setTitle('🎉 GIVEAWAY !')
            .setDescription(`Clique sur le bouton pour participer !\n\n**Prix:** ${prix}€\n**Gagnants:** ${gagnants}\n**Durée:** ${formatDuration(duree)}\n**Fin:** <t:${Math.floor(endTime / 1000)}:R>`)
            .setColor(0xFF1493)
            .setFooter({ text: `${gagnants} gagnant(s) | Se termine` })
            .setTimestamp(endDate);

        // Créer le bouton de participation
        const button = new ButtonBuilder()
            .setCustomId('join_giveaway')
            .setLabel('🎉 Participer')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder()
            .addComponents(button);

        try {
            // Répondre à l'interaction
            await interaction.reply({ content: '✅ Giveaway créé !', flags: MessageFlags.Ephemeral });

            // Envoyer le giveaway dans le channel avec ping @everyone
            const giveawayMessage = await channel.send({
                content: '@everyone',
                embeds: [embed],
                components: [row]
            });

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

            // Initialiser le tableau des participants
            config.participants[giveawayMessage.id] = [];

            // Mettre à jour les statistiques
            config.stats.total_created++;
            saveConfig();

            console.log(`✅ Giveaway créé par ${interaction.user.tag} - Prix: ${prix}€ - Durée: ${formatDuration(duree)}`);
            await sendLog(interaction.guild, `🎁 **Nouveau giveaway créé**\nPar: ${interaction.user}\nPrix: ${prix}€\nDurée: ${formatDuration(duree)}\nGagnants: ${gagnants}`);

        } catch (error) {
            console.error('❌ Erreur lors de la création du giveaway:', error.message);
            await interaction.editReply({ content: '❌ Erreur lors de la création du giveaway.' });
        }
    }

    // Commande /glist - Liste les giveaways actifs
    if (interaction.commandName === 'glist') {
        // Vérifier les permissions
        const member = interaction.member;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        const hasRole = GIVEAWAY_ROLE_IDS[0] !== '0' && GIVEAWAY_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));

        if (!isAdmin && !hasRole) {
            const rolesList = GIVEAWAY_ROLE_IDS.filter(id => id !== '0').map(id => `<@&${id}>`).join(', ');
            await interaction.reply({
                content: GIVEAWAY_ROLE_IDS[0] !== '0'
                    ? `❌ Vous devez avoir un des rôles suivants ou être administrateur: ${rolesList}`
                    : '❌ Vous devez être administrateur.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (config.giveaways.length === 0) {
            await interaction.reply({
                content: '📭 Aucun giveaway actif pour le moment.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 GIVEAWAYS ACTIFS')
            .setColor(0xFF1493)
            .setFooter({ text: `${config.giveaways.length} giveaway(s) en cours` })
            .setTimestamp();

        for (const giveaway of config.giveaways) {
            const channel = interaction.guild.channels.cache.get(giveaway.channel_id);
            const timeLeft = formatTimeRemaining(giveaway.end_time);

            // Récupérer le nombre de participants depuis la config
            const participantCount = config.participants[giveaway.message_id]?.length || 0;

            embed.addFields({
                name: `🎁 ${giveaway.prize}€`,
                value: `**Channel:** ${channel}\n**Gagnants:** ${giveaway.winners}\n**Temps restant:** ${timeLeft}\n**Participants:** ${participantCount}\n**Message ID:** \`${giveaway.message_id}\``,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Commande /gend - Termine un giveaway manuellement
    if (interaction.commandName === 'gend') {
        const messageId = interaction.options.getString('message_id');
        const giveaway = config.giveaways.find(g => g.message_id === messageId);

        if (!giveaway) {
            await interaction.reply({
                content: '❌ Aucun giveaway actif trouvé avec cet ID de message.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.reply({
            content: '⏳ Tirage au sort en cours...',
            flags: MessageFlags.Ephemeral
        });

        await endGiveaway(giveaway);

        await interaction.editReply({
            content: '✅ Giveaway terminé manuellement !'
        });
    }

    // Commande /gcancel - Annule un giveaway
    if (interaction.commandName === 'gcancel') {
        const messageId = interaction.options.getString('message_id');
        const giveaway = config.giveaways.find(g => g.message_id === messageId);

        if (!giveaway) {
            await interaction.reply({
                content: '❌ Aucun giveaway actif trouvé avec cet ID de message.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        try {
            const guild = interaction.guild;
            const channel = guild.channels.cache.get(giveaway.channel_id);
            const message = await channel.messages.fetch(giveaway.message_id);

            const cancelEmbed = new EmbedBuilder()
                .setTitle('❌ GIVEAWAY ANNULÉ')
                .setDescription(`**Prix:** ${giveaway.prize}€\n\nCe giveaway a été annulé par un administrateur.`)
                .setColor(0xFF0000)
                .setTimestamp();

            await channel.send({ embeds: [cancelEmbed] });

            // Logger
            await sendLog(guild, `❌ **Giveaway annulé**\nPrix: ${giveaway.prize}€\nPar: ${interaction.user}`);

            // Mettre à jour les statistiques
            config.stats.total_cancelled++;

            // Retirer le giveaway de la config
            config.giveaways = config.giveaways.filter(g => g.message_id !== messageId);
            saveConfig();

            await interaction.reply({
                content: '✅ Giveaway annulé avec succès !',
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('❌ Erreur lors de l\'annulation du giveaway:', error);
            await interaction.reply({
                content: '❌ Erreur lors de l\'annulation du giveaway.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // Commande /gstats - Affiche les statistiques
    if (interaction.commandName === 'gstats') {
        // Vérifier les permissions
        const member = interaction.member;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        const hasRole = GIVEAWAY_ROLE_IDS[0] !== '0' && GIVEAWAY_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));

        if (!isAdmin && !hasRole) {
            const rolesList = GIVEAWAY_ROLE_IDS.filter(id => id !== '0').map(id => `<@&${id}>`).join(', ');
            await interaction.reply({
                content: GIVEAWAY_ROLE_IDS[0] !== '0'
                    ? `❌ Vous devez avoir un des rôles suivants ou être administrateur: ${rolesList}`
                    : '❌ Vous devez être administrateur.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 STATISTIQUES DES GIVEAWAYS')
            .setColor(0x00FF00)
            .addFields(
                {
                    name: '🎁 Total créés',
                    value: `${config.stats.total_created}`,
                    inline: true
                },
                {
                    name: '✅ Total terminés',
                    value: `${config.stats.total_completed}`,
                    inline: true
                },
                {
                    name: '❌ Total annulés',
                    value: `${config.stats.total_cancelled}`,
                    inline: true
                },
                {
                    name: '👥 Total participants',
                    value: `${config.stats.total_participants}`,
                    inline: true
                },
                {
                    name: '⏳ En cours',
                    value: `${config.giveaways.length}`,
                    inline: true
                },
                {
                    name: '📈 Moyenne participants',
                    value: config.stats.total_completed > 0
                        ? `${Math.round(config.stats.total_participants / config.stats.total_completed)}`
                        : '0',
                    inline: true
                }
            )
            .setFooter({ text: 'Statistiques depuis le début' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
});

// Événement : Interaction avec le bouton
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'join_giveaway') {
        // Vérifier si c'est un giveaway actif
        const giveaway = config.giveaways.find(g => g.message_id === interaction.message.id);

        if (!giveaway) {
            await interaction.reply({
                content: '❌ Ce giveaway n\'est plus actif.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Initialiser le tableau si nécessaire
        if (!config.participants[interaction.message.id]) {
            config.participants[interaction.message.id] = [];
        }

        // Vérifier si l'utilisateur participe déjà
        if (config.participants[interaction.message.id].includes(interaction.user.id)) {
            await interaction.reply({
                content: '⚠️ Vous participez déjà à ce giveaway !',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Ajouter l'utilisateur
        config.participants[interaction.message.id].push(interaction.user.id);
        saveConfig();

        console.log(`🎉 ${interaction.user.tag} a participé au giveaway (${giveaway.prize}€)`);

        await interaction.reply({
            content: '✅ Vous participez au giveaway !',
            flags: MessageFlags.Ephemeral
        });
    }
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
