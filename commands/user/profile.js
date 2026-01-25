const { buildAuthorization, getUserRecentlyPlayedGames, getGame, getUserSummary, getUserRecentAchievements, getUserAwards } = require("@retroachievements/api");
require('dotenv').config();
const { ComponentType, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, MessageFlags } = require("discord.js");
const { createAwardImage } = require("../../canvasUtils.js");
const { db } = require("../../index.js");

const authorization = buildAuthorization({ username: process.env.USERNAME, webApiKey: process.env.APIKEY});

module.exports = {
    data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Shows a RetroAchievements\' profile. If empty, shows your profile, if linked.')
    .addStringOption(option =>
        option.setName("user")
        .setDescription("User to search.")
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
            .setLabel("Show All Awards")
            .setEmoji("🏆")
            .setValue("allawards"),
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
        if(!interaction.options.getString("user"))
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
            ra_username = interaction.options.getString("user");
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
        var beatenGameCount = 0;

        awards.visibleUserAwards.forEach(element => 
        {
            if(element.awardType == "Mastery/Completion")
                awardsCount++;
            if(element.awardType == "Event")
                eventAwardsCount++;
            if(element.awardType == "Game Beaten")
                beatenGameCount++;
        });

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
                profileEmbed.addFields({name: "Rank", value: "#" + userProfile.rank.toString(), inline: true});

            if(beatenGameCount > 0)
                profileEmbed.addFields({name: "Beaten Games", value: beatenGameCount.toString(), inline: true})
                

            profileEmbed.addFields(
                {name: "Hardcore Points", value: userProfile.totalPoints.toString(), inline: true},
                {name: "RetroPoints", value: userProfile.totalTruePoints.toString(), inline: true},
            )
            
            if(userProfile.totalSoftcorePoints > 0)
                profileEmbed.addFields({name: "Softcore Points", value: userProfile.totalSoftcorePoints.toString(), inline: true});
            
            profileEmbed.setFooter({text: "Last Game Played: " + lastGame.title + " - " + userProfile.richPresenceMsg, iconURL: 'https://retroachievements.org' + lastGame.gameIcon});

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

        if(awardsCount > 0)
        {
            awardsImage = await createAwardImage(awards, { totalAwardsToDisplay: 7, maxImagesPerRow: 7 });
            awardsAttachment = new AttachmentBuilder(awardsImage, {name: "awards5.png"})
            
            profileEmbed.setImage("attachment://awards5.png");

            messageFiles.push(awardsAttachment);
        }

        // https://discordjs.guide/legacy/interactive-components/interactions
        const reply = await interaction.editReply({embeds: messageEmbeds, files: messageFiles, components: [interactionRow], withResponse: true});

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300_000
        });

        collector.on('collect', async (i) => {
            const selection = i.values[0];
            if(selection === 'profile')
            {
                // use update for actionrow interactions instead of editReply
                await i.update({embeds: messageEmbeds, files: messageFiles});
            } 
            else if(selection === 'allawards')
            {
                await i.deferUpdate();

                const processingEmbed = new EmbedBuilder()
                .setTitle("Creating images...");

                await i.editReply({embeds: [processingEmbed], files: []});

                const masteryImage = await createAwardImage(awards, { totalAwardsToDisplay: 25 });
                const masteryAttachment = new AttachmentBuilder(masteryImage, {name: "mastery.png"});
                const masteryEmbed = new EmbedBuilder()
                .setTitle(`Game Awards (${awardsCount})`)
                .setImage("attachment://mastery.png")
                .setFooter({text: userProfile.user, iconURL: "https://retroachievements.org" + userProfile.userPic})
                
                const eventImage = await createAwardImage(awards, { totalAwardsToDisplay: 25, imageAwardType: "Event" });
                const eventAttachment = new AttachmentBuilder(eventImage, {name: "event.png"});
                const eventEmbed = new EmbedBuilder()
                .setTitle(`Event Awards (${eventAwardsCount})`)
                .setImage("attachment://event.png")
                .setFooter({text: userProfile.user, iconURL: "https://retroachievements.org" + userProfile.userPic})

                i.editReply({embeds: [masteryEmbed, eventEmbed], files: [masteryAttachment, eventAttachment]});
            }
            else if(selection === 'last5')
            {
                await i.update({embeds: recentGamesEmbeds, files: []});
            } 
            else if(selection === 'beaten')
            {
                // deferUpdate porque os awards demoram muito dependendo de quantas awards tem;
                // alguns usuarios tem muitas awards e isso excede o tempo de resposta
                await i.deferUpdate();

                const processingEmbed = new EmbedBuilder()
                .setTitle("Creating image...");

                await i.editReply({embeds: [processingEmbed], files: []});

                const beatenImage = await createAwardImage(awards, { imageAwardType: "Game Beaten", totalAwardsToDisplay: 49, maxImagesPerRow: 7 });

                const beatenAttachment = new AttachmentBuilder(beatenImage, {name: "beatengames.png"})
                const beatenEmbed = new EmbedBuilder()
                .setTitle(`Games Beaten (${beatenGameCount})`)
                .setImage("attachment://beatengames.png")
                .setFooter({text: userProfile.user, iconURL: "https://retroachievements.org" + userProfile.userPic})

                await i.editReply({embeds: [beatenEmbed], files: [beatenAttachment]})
            }
        })

    }
};