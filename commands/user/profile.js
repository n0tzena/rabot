const { buildAuthorization, getUserRecentlyPlayedGames, getGame, getUserSummary, getUserRecentAchievements, getUserAwards } = require("@retroachievements/api");
require('dotenv').config();
const { ComponentType, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, MessageFlags } = require("discord.js");
const { createAwardImage } = require("../../canvasUtils.js");
const { db } = require("../../index.js");

const authorization = buildAuthorization({ username: process.env.USERNAME, webApiKey: process.env.APIKEY});

module.exports = {
    data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Mostra um perfil no RetroAchievements detalhadamente. Se estiver vazio, irá pegar o seu perfil.')
    .addStringOption(option =>
        option.setName("usuario")
        .setDescription("Insira o usuário para pesquisar.")
    ),
    
    async execute(interaction)
    {
        const selectDisplayMenu = new StringSelectMenuBuilder()
        .setCustomId("displayMenu")
        .setPlaceholder("Display other info...")
        .addOptions(
            new StringSelectMenuOptionBuilder()
            .setLabel("Profile")
            .setEmoji("🗒️")
            .setValue("profile"),
            new StringSelectMenuOptionBuilder()
            .setLabel("Last 5 Games Played")
            .setEmoji("🕒")
            .setValue("last5"),
            new StringSelectMenuOptionBuilder()
            .setLabel("Beaten Games")
            .setEmoji("🗡️")
            .setValue("beaten")
        );

        const interactionRow = new ActionRowBuilder().addComponents(selectDisplayMenu);

        await interaction.deferReply();

        var ra_username;

        var userProfile;
        var lastGame;
        var lastAchievement;
        var awards;
        var recentGames;

        // defer reply porque demora pra caralho pra funcionar essa porra de canvas
        if(!interaction.options.getString("usuario"))
        {
            const rows = db.prepare(`SELECT * FROM account_link WHERE discord_id = ${interaction.user.id}`).all();
            if(rows[0])
            {
                ra_username = rows[0].ra_username;
            }
            else
            {
                interaction.editReply("Link your account using `/link`!");
                setTimeout(() => {
                    interaction.deleteReply();
                }, 5000);
                return;
            }
        }
        else
        {
            ra_username = interaction.options.getString("usuario");
        }

        try
        {
            userProfile = await getUserSummary(authorization, { username: ra_username });
            lastGame = await getGame(authorization, { gameId: userProfile.lastGameId });
            lastAchievement = await getUserRecentAchievements(authorization, { username: ra_username, minutes: 9999999999999 });
            awards = await getUserAwards(authorization, { username: ra_username });
            recentGames = await getUserRecentlyPlayedGames(authorization, { username: ra_username, count: 5});            
        } catch
        {
            interaction.editReply({ content: "This profile doesn't exist.", flags: MessageFlags.Ephemeral});
            setTimeout(() => {
                interaction.deleteReply();
            }, 5000);
            return;
        }

        var awardsCount = 0;
        var eventAwardsCount = 0;
        awards.visibleUserAwards.forEach(element => 
        {
            if(element.awardType == "Mastery/Completion")
                awardsCount++;
            if(element.awardType == "Event")
                eventAwardsCount++;
        });

        const awardsImage = await createAwardImage(awards);
        const awardsAttachment = new AttachmentBuilder(awardsImage, {name: "awards.png"});

        const eventAwardsImage = await createAwardImage(awards, { imageAwardType: "Event", drawBorder: false });
        const eventAwardsAttachment = new AttachmentBuilder(eventAwardsImage, {name: "eventawards.png"});

        var messageEmbeds = [];
        var messageFiles = [];

        var recentGamesEmbeds = [];

        // recent games
        recentGames.forEach(element => {
            let gameEmbed = new EmbedBuilder()
                .setTitle(element.title)
                .setThumbnail("https://retroachievements.org" + element.imageIcon)
                .setURL('https://retroachievements.org/game/' + element.gameId)
                .setFooter({ text: "Last played in"})
                .setTimestamp(Date.parse(element.lastPlayed))
                .addFields(
                    {name: "Achievements", value: `${element.numAchieved} of ${element.numPossibleAchievements}`, inline: true},
                    {name: "Points", value: `${element.scoreAchieved} of ${element.possibleScore}`, inline: true}
                );

            recentGamesEmbeds.push(gameEmbed);
        });

        // profile
        const profileEmbed = new EmbedBuilder()
            .setTitle(userProfile.user)
            .setThumbnail("https://retroachievements.org" + userProfile.userPic)
            .setDescription(userProfile.motto === '' ? null : userProfile.motto)
            .setURL('https://retroachievements.org/user/' + userProfile.user);

            if(userProfile.rank != null)
            profileEmbed.addFields({name: "Rank", value: "#" + userProfile.rank.toString(), inline: false});

            profileEmbed.addFields(
                {name: "Hardcore Points", value: userProfile.totalPoints.toString(), inline: true},
                {name: "RetroPoints", value: userProfile.totalTruePoints.toString(), inline: true},
            )
            
            if(userProfile.totalSoftcorePoints > 0)
            profileEmbed.addFields({name: "Softcore Points", value: userProfile.totalSoftcorePoints.toString(), inline: true});
            
            profileEmbed.setFooter({text: userProfile.richPresenceMsg, iconURL: 'https://retroachievements.org' + lastGame.gameIcon});

        messageEmbeds.push(profileEmbed);
        
        // achievement
        var achievementEmbed = new EmbedBuilder()
            .setTitle("Last achievement for " + userProfile.user);
        
        if(lastAchievement[0] == null)
            achievementEmbed.setDescription("This user doesn't have any recent achievement.");
        else
        {
            const unixTimestamp = Math.floor(new Date(lastAchievement[0].date).getTime()/1000);
            achievementEmbed.addFields(
                {name: lastAchievement[0].title, value: lastAchievement[0].description},
                {name: "Achieved in", value: `<t:${unixTimestamp}:F>`}
            );
            achievementEmbed.setThumbnail("https://retroachievements.org" + lastAchievement[0].badgeUrl);

            messageEmbeds.push(achievementEmbed);
        }

        // award embed
        const awardEmbed = new EmbedBuilder()
        .setTitle(`Game Awards (${awardsCount})`)
        .setImage("attachment://awards.png");

        if(awardsCount > 0)
        {
            messageEmbeds.push(awardEmbed);
            messageFiles.push(awardsAttachment);
        }

        const eventAwardEmbed = new EmbedBuilder()
        .setTitle(`Event Awards (${eventAwardsCount})`)
        .setImage("attachment://eventawards.png");

        if(eventAwardsCount > 0)
        {
            messageEmbeds.push(eventAwardEmbed);
            messageFiles.push(eventAwardsAttachment);
        }

        // https://discordjs.guide/legacy/interactive-components/interactions
        const reply = await interaction.editReply({embeds: messageEmbeds, files: messageFiles, components: [interactionRow], withResponse: true});

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000
        });

        collector.on('collect', async (i) => {
            const selection = i.values[0];
            if(selection === 'profile')
            {
                // use update for actionrow interactions instead of editReply
                await i.update({embeds: messageEmbeds, files: messageFiles});
            } else if(selection === 'last5')
            {
                await i.update({embeds: recentGamesEmbeds, files: []});
            } else if(selection === 'beaten')
            {
                const beatenImage = await createAwardImage(awards, { imageAwardType: "Game Beaten", totalAwardsToDisplay: 25 });

                const beatenAttachment = new AttachmentBuilder(beatenImage, {name: "beatengames.png"})
                const beatenEmbed = new EmbedBuilder()
                .setTitle("Games Beaten")
                .setImage("attachment://beatengames.png")

                await i.update({embeds: [beatenEmbed], files: [beatenAttachment]})
            }
        })

    }
};