require('dotenv').config();
const { buildAuthorization, getUserAwards, getAchievementDistribution, getUserProfile, getGameInfoAndUserProgress} = require("@retroachievements/api");
const { db } = require("../../index.js");
const { ComponentType, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, MessageFlags, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");

const authorization = buildAuthorization({ username: process.env.USERNAME, webApiKey: process.env.APIKEY});

async function buildEmbed(index, gameAwards, profile, username)
{
    var hardcore;
    var awardEmbed = new EmbedBuilder()
    .setTitle(gameAwards[index].title)
    .setFooter({text: `${profile.user} - Award ${index + 1} of ${gameAwards.length}`, iconURL: "https://retroachievements.org" + profile.userPic})
    .setThumbnail("https://retroachievements.org" + gameAwards[index].imageIcon);

    if(gameAwards[index].awardDataExtra == 1)
    {
        awardEmbed.setDescription("Hardcore - " + gameAwards[index].awardType)
        .setColor(Colors.Gold);   
        hardcore = true;     
    }
    else
    {
        awardEmbed.setDescription("Softcore - " + gameAwards[index].awardType)
        .setColor(Colors.Default);
        hardcore = false;
    }
    
    const gameData = await getGameInfoAndUserProgress(authorization, {username: username, gameId: gameAwards[index].awardData})
    const achievementDistribution = await getAchievementDistribution(authorization, {gameId: gameAwards[index].awardData, hardcore: hardcore})
    const distributionArray = Object.values(achievementDistribution);

    if(gameData.numAwardedToUser == gameData.numAchievements)
        awardEmbed.addFields({name: "Rarity", value: `${ (distributionArray.at(-1) / gameData.numDistinctPlayersCasual * 100).toFixed(2) }%`, inline: true});

    if(gameAwards[index].awardType == "Mastery/Completion" || gameAwards[index].awardType == "Game Beaten")
        awardEmbed.addFields(
            {name: "Achievements", value: `${gameData.numAwardedToUser} of ${gameData.numAchievements}`, inline: true},
            {name: "Progress", value: `${gameData.userCompletion}`, inline: true},
            {name: "Platform", value: `${gameData.consoleName}`, inline: false},
        )

    return awardEmbed;
}

module.exports = {
    data: new SlashCommandBuilder()
    .setName('browse')
    .setDescription('Browse through an user\'s awards.')
    .addStringOption(option =>
        option.setName("user")
        .setDescription("User to search. If empty, shows your awards.")
    )
    .addStringOption(option => 
        option.setName("award_type")
        .setDescription("Award to search. Defaults to Beaten Games.")
        .addChoices(
            { name: "Masteries and Completions", value: "Mastery/Completion" },
            { name: "Beaten Games", value: "Game Beaten" },
            { name: "Event Awards", value: "Event" },
        )
    ),
    
    async execute(interaction)
    {
        const forward = new ButtonBuilder()
        .setCustomId("forward")
        .setLabel("🡪")
        .setStyle(ButtonStyle.Primary)
        const back = new ButtonBuilder()
        .setCustomId("back")
        .setLabel("🡨")
        .setStyle(ButtonStyle.Primary)

        const row = new ActionRowBuilder().addComponents(back, forward);
        
        var ra_username;
        var award_type = interaction.options.getString("award_type");
        var awards;

        if(!award_type)
            award_type = "Game Beaten";

        await interaction.deferReply();

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
            awards = await getUserAwards(authorization, { username: ra_username });
        } 
        catch(e)
        {
            console.log(e);

            interaction.editReply({ content: "This profile doesn't exist.", flags: MessageFlags.Ephemeral});
            setTimeout(() => {
                interaction.deleteReply();
            }, 5000);
            return;
        }

        var browseIndex = 0;
        var masteries = [];
        var awardGameIds = [];

        awards.visibleUserAwards.forEach(award => {
            if(award.awardType == award_type)
            {
                awardGameIds.push(award.awardData);
                masteries.push(award);
            }
        });

        if(masteries.length == 0)
        {
            interaction.editReply({ content: "This profile doesn't have any of the selected awards.", flags: MessageFlags.Ephemeral});
            setTimeout(() => {
                interaction.deleteReply();
            }, 5000);
            return;
        }

        const userProfile = await getUserProfile(authorization, { username: ra_username })

        const reply = await interaction.editReply({embeds: [await buildEmbed(browseIndex, masteries, userProfile, ra_username)], components: [row], withResponse: true});

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300_000
        });

        collector.on('collect', async (i) =>
        {
            const selection = i.customId;
            if(selection === "forward")
            {
                browseIndex++;
                if(browseIndex > masteries.length - 1)
                    browseIndex = 0;

                await i.update({embeds: [await buildEmbed(browseIndex, masteries, userProfile, ra_username)]});
            }
            else if(selection === "back")
            {
                browseIndex--;
                if(browseIndex < 0)
                    browseIndex = masteries.length - 1;

                await i.update({embeds: [await buildEmbed(browseIndex, masteries, userProfile, ra_username)]});
            }
        })
    }
}