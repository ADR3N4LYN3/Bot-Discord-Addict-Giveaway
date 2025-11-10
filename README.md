# Bot Discord - Giveaway automatique

Bot Discord qui permet de créer des giveaways avec tirage automatique des gagnants.

## Fonctionnalités

- Commande `/giveaway` pour créer un giveaway avec prix, durée et nombre de gagnants
- Réaction 🎉 pour participer
- **Tirage automatique** à la fin du timer
- **Logs automatiques** sur un channel Discord
- **Gestion multi-giveaways** simultanés
- Persistance des giveaways (redémarrage du bot sans perte)
- Configuration sécurisée avec fichier `.env`

## Prérequis

- **Node.js 16.9.0+**
- Un compte Discord Developer avec un bot créé
- Les permissions administrateur sur votre serveur Discord

## Installation rapide

```bash
# Clonez le repository
git clone https://github.com/ADR3N4LYN3/Bot-Discord-Addict-Giveaway.git
cd Bot-Discord-Addict-Giveaway

# Copiez et configurez le .env
cp .env.example .env
nano .env  # Ajoutez votre token et IDs

# Installez les dépendances
npm install

# Lancez le bot
npm start
# OU
node bot.js
# OU (avec le script)
chmod +x start.sh
./start.sh
```

## Configuration détaillée

### 1. Créer le bot sur Discord Developer Portal

1. Allez sur https://discord.com/developers/applications
2. Cliquez sur "New Application"
3. Donnez un nom à votre bot et acceptez les conditions
4. Allez dans l'onglet "Bot"
5. Cliquez sur "Add Bot"
6. **Important**: Activez les "Privileged Gateway Intents":
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT
7. Copiez le token du bot (vous en aurez besoin plus tard)

### 2. Inviter le bot sur votre serveur

1. Dans le Developer Portal, allez dans l'onglet "OAuth2" > "URL Generator"
2. Sélectionnez les scopes suivants:
   - `bot`
   - `applications.commands`
3. Sélectionnez les permissions suivantes:
   - Send Messages
   - Embed Links
   - Read Message History
   - Add Reactions
   - Use External Emojis
4. Copiez l'URL générée et ouvrez-la dans votre navigateur
5. Sélectionnez votre serveur et autorisez le bot

### 3. Créer un channel de logs (optionnel)

1. Sur votre serveur Discord, créez un nouveau salon textuel (par exemple `#bot-logs`)
2. Faites un clic droit sur le salon > "Copier l'identifiant du salon"
   - Si vous ne voyez pas cette option, activez le "Mode développeur" dans Paramètres utilisateur > Avancés
3. Gardez cet ID pour la configuration

### 4. Configuration du fichier .env

Éditez `.env` avec vos informations:

```env
# Token du bot Discord (OBLIGATOIRE)
DISCORD_TOKEN=votre_token_ici

# ID du channel Discord pour les logs (0 = logs en console uniquement)
LOG_CHANNEL_ID=123456789012345678
```

**Configuration minimale** (pour commencer) :
- `DISCORD_TOKEN`: Mettez votre token
- `LOG_CHANNEL_ID`: Laissez à `0` ou mettez l'ID de votre channel de logs

## Utilisation

### Lancer le bot

```bash
npm start
# OU
node bot.js
```

Vous devriez voir:
```
NomDuBot#1234 est connecté et prêt !
ID du bot: 123456789012345678
------
Logs Discord: ✅ Activés
------
```

Le bot apparaîtra en ligne avec le statut **"🎁 Giveaways en cours"**.

### Créer un giveaway

1. Dans n'importe quel salon de votre serveur, tapez:
```
/giveaway prix:50 duree:24 gagnants:3 channel:#giveaways
```

Paramètres:
- **prix**: Montant en euros (ex: `50` pour 50€)
- **duree**: Durée en heures (min: 1h, max: 720h soit 30 jours)
- **gagnants**: Nombre de gagnants (min: 1, max: 20)
- **channel**: Le channel où poster le giveaway

2. Le bot va:
   - Poster le giveaway dans le channel choisi avec un embed élégant
   - Ajouter automatiquement la réaction 🎉
   - Enregistrer le giveaway

### Fonctionnement automatique

Une fois le giveaway créé:
- Les utilisateurs réagissent avec 🎉 pour participer
- À la fin du timer, le bot tire automatiquement au sort les gagnants
- Les gagnants sont annoncés dans le channel du giveaway
- Un log est envoyé dans le channel de logs (si configuré)

**IMPORTANT**: Le bot vérifie les giveaways toutes les minutes. Si un giveaway se termine et que le bot est éteint, il sera traité au prochain démarrage.

## Exemples de commandes

```bash
# Giveaway de 100€ pendant 48h avec 1 gagnant
/giveaway prix:100 duree:48 gagnants:1 channel:#concours

# Giveaway de 25€ pendant 6h avec 5 gagnants
/giveaway prix:25 duree:6 gagnants:5 channel:#giveaways

# Giveaway de 500€ pendant 7 jours avec 2 gagnants
/giveaway prix:500 duree:168 gagnants:2 channel:#events
```

## Personnalisation

### Modifier le statut du bot

Dans [bot.js](bot.js), ligne ~198 :

```javascript
client.user.setPresence({
    activities: [{
        name: '🎁 Giveaways en cours',  // Changez ici
        type: ActivityType.Custom
    }],
    status: 'online' // online, idle, dnd, invisible
});
```

Types d'activité disponibles:
- `ActivityType.Playing` → "Joue à ..."
- `ActivityType.Streaming` → "Diffuse ..."
- `ActivityType.Listening` → "Écoute ..."
- `ActivityType.Watching` → "Regarde ..."
- `ActivityType.Custom` → Texte personnalisé
- `ActivityType.Competing` → "En compétition dans ..."

### Modifier l'emoji de participation

Dans [bot.js](bot.js), cherchez `'🎉'` et remplacez par l'emoji de votre choix.

**Attention**: Si vous utilisez un emoji personnalisé de votre serveur, utilisez la syntaxe `<:nom:id>`.

### Modifier les couleurs des embeds

Dans [bot.js](bot.js):
- Embed du giveaway: `.setColor(0xFF1493)` (rose)
- Embed des résultats: `.setColor(0x00FF00)` (vert)

## Structure du projet

```
Bot-Discord-Addict-Giveaway/
│
├── bot.js                 # Code principal du bot
├── package.json           # Dépendances Node.js
├── start.sh               # Script de démarrage automatique
├── config.json            # Giveaways actifs (généré automatiquement)
├── .env                   # Secrets (token, IDs) - NE PAS COMMIT
├── .env.example           # Template pour .env
├── .gitignore             # Fichiers à ignorer par Git
└── README.md              # Documentation
```

## Commandes disponibles

| Commande | Description | Permission requise |
|----------|-------------|-------------------|
| `/giveaway` | Crée un nouveau giveaway | Administrateur |

**Paramètres de `/giveaway`**:
- `prix` (requis): Montant en euros
- `duree` (requis): Durée en heures (1-720)
- `gagnants` (requis): Nombre de gagnants (1-20)
- `channel` (requis): Channel où poster

## Déploiement sur VPS

Pour déployer le bot sur un VPS (Debian/Ubuntu) :

```bash
# 1. Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Cloner le repository
git clone https://github.com/ADR3N4LYN3/Bot-Discord-Addict-Giveaway.git
cd Bot-Discord-Addict-Giveaway

# 3. Créer et configurer le .env
cp .env.example .env
nano .env  # Ajoutez votre token et IDs

# 4. Installer et lancer
npm install
node bot.js

# 5. Pour garder le bot actif (avec screen)
screen -S giveaway-bot
node bot.js
# Ctrl+A puis D pour détacher

# Pour revenir à la session
screen -r giveaway-bot
```

### Mettre à jour le bot sur le VPS

```bash
cd Bot-Discord-Addict-Giveaway
git pull
npm install  # Au cas où il y aurait de nouvelles dépendances
# Redémarrez le bot
```

## Avec systemd (service automatique)

Pour que le bot démarre automatiquement au démarrage du VPS :

Créez `/etc/systemd/system/giveaway-bot.service`:

```ini
[Unit]
Description=Bot Discord Giveaway
After=network.target

[Service]
Type=simple
User=votre_user
WorkingDirectory=/home/votre_user/bot/Bot-Discord-Addict-Giveaway
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Puis :
```bash
sudo systemctl daemon-reload
sudo systemctl enable giveaway-bot
sudo systemctl start giveaway-bot
sudo systemctl status giveaway-bot

# Pour voir les logs
sudo journalctl -u giveaway-bot -f
```

## Dépannage

### Le bot ne démarre pas
- Vérifiez que le fichier `.env` existe et contient votre token
- Vérifiez que vous avez installé les dépendances: `npm install`
- Vérifiez que Node.js 16.9+ est installé: `node --version`

### Le bot ne répond pas
- Vérifiez que le bot est bien en ligne sur Discord
- Vérifiez que les intents sont activés dans le Developer Portal
- Vérifiez que le token est correct dans `.env`

### Les giveaways ne se terminent pas
- Vérifiez que le bot est resté en ligne pendant toute la durée
- Vérifiez les logs pour voir s'il y a des erreurs
- Le bot vérifie toutes les minutes, attendez jusqu'à 1 minute après l'heure de fin

### Les logs ne s'affichent pas sur Discord
- Vérifiez que l'ID du channel de logs est correct
- Vérifiez que le bot a la permission d'envoyer des messages dans ce channel
- Si `LOG_CHANNEL_ID=0`, les logs s'affichent uniquement dans la console

## Sécurité

- Ne partagez JAMAIS votre token de bot
- Le fichier `.env` est dans `.gitignore` pour éviter de le partager par accident
- Utilisez `.env.example` comme modèle pour les autres développeurs
- Sur le VPS, créez le `.env` manuellement, ne le clonez jamais depuis Git

## Technologies utilisées

- **Node.js** v16.9.0+
- **discord.js** v14
- **dotenv** pour la gestion des variables d'environnement

## Améliorations futures possibles

- Commande `/glist` pour lister les giveaways actifs
- Commande `/gend` pour terminer un giveaway manuellement
- Commande `/gcancel` pour annuler un giveaway
- Conditions de participation (niveau, rôle, etc.)
- Giveaways récurrents
- Export des participants en CSV
- Interface web pour la gestion
- Statistiques des giveaways

## Support

Si vous rencontrez des problèmes, vérifiez:
1. Que Node.js 16.9+ est installé: `node --version`
2. Que les dépendances sont installées: `npm install`
3. Que le fichier `.env` existe et est correctement configuré
4. Que les permissions Discord sont bien configurées
5. Que les intents sont activés dans le Developer Portal

## Licence

Ce projet est libre d'utilisation. N'hésitez pas à le modifier selon vos besoins !

## Auteur

**ADR3N4LYN3** - [GitHub](https://github.com/ADR3N4LYN3)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
