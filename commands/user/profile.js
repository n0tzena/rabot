const { buildAuthorization, getUserProfile, getGame, getUserSummary, getUserRecentAchievements, getUserAwards } = require("@retroachievements/api");
require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const Canvas = require("@napi-rs/canvas");
const { request } = require('undici');

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
        if(!interaction.options.getString("usuario")) return;

        // defer reply porque demora pra caralho pra funcionar essa porra de canvas
        await interaction.deferReply();

        const userProfile = await getUserSummary(authorization, { username: interaction.options.getString("usuario") });
        const lastGame = await getGame(authorization, { gameId: userProfile.lastGameId });
        const lastAchievement = await getUserRecentAchievements(authorization, { username: interaction.options.getString("usuario"), minutes: 9999999999999 })
        const awards = await getUserAwards(authorization, { username: interaction.options.getString("usuario") });
        
        // console.log(userProfile);

        // awards for masteries
        var awardsCount = 0;
        var masteriesCount;
        var completedCount;
        
        awards.visibleUserAwards.forEach(element => 
        {
            if(element.awardType == "Mastery/Completion")
                awardsCount++;
            
            // hardcore award
            if(element.awardDataExtra == 1)
                masteriesCount++;

            if(element.awardDataExtra == 0)
                completedCount++;
        });

        // awards canvas
        // propriedades
        const awardIconSize = 48;
        const iconOffset = 2;

        var awardRows = Math.ceil(awardsCount / 5);

        var maxRowAwards = 5;
        const maxAwardsDisplay = 15;
        
        // limite de linhas
        if(awardRows * maxRowAwards > maxAwardsDisplay)
            awardRows = maxAwardsDisplay / maxRowAwards;

        if(awardsCount < maxRowAwards)
            maxRowAwards = awardsCount;

        // criar canvas correspondente ao número de awards
        
        const canvas = Canvas.createCanvas((awardIconSize * maxRowAwards + iconOffset * maxRowAwards), (awardIconSize * awardRows + iconOffset * awardRows));
        const context = canvas.getContext("2d");

        // propriedades do canvas
        context.lineWidth = 2;
        // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createLinearGradient
        const gradient = context.createLinearGradient(0, 0, 0, awardIconSize + 16);
        gradient.addColorStop(0, "#ffd445");
        gradient.addColorStop(1, "#8f7624");
        context.strokeStyle = gradient;

        // inserir as imagens no canvas
        for (let index = 0, counter = 0, counterRow, counterColumn = 0; index < awards.visibleUserAwards.length; index++) {
            // quebra o loop se o counter for maior que 14 (começa em 0, 15 awards no total)
            if(counter > maxAwardsDisplay - 1)
                break;

            counterRow = Math.ceil((counter + 1) / 5);
            if(counterColumn + 1 > maxRowAwards)
                counterColumn = 0;

            if(awards.visibleUserAwards[index].awardType == "Mastery/Completion")
            {
                const { body } = await request("https://retroachievements.org" + awards.visibleUserAwards[index].imageIcon);
                awardImage = await Canvas.loadImage(await body.arrayBuffer());

                // (posiçao x, posiçao y, largura x, largura y)
                await context.drawImage(
                    awardImage, 
                    counterColumn * awardIconSize + iconOffset * counterColumn, 
                    (counterRow - 1) * awardIconSize + iconOffset * counterRow, 
                    awardIconSize, 
                    awardIconSize);

                // se pegou no hardcore, borda dourada
                if(awards.visibleUserAwards[index].awardDataExtra == 1)
                context.strokeRect(
                    counterColumn * awardIconSize + iconOffset * counterColumn + 1, 
                    (counterRow - 1) * awardIconSize + iconOffset * counterRow + 1, 
                    awardIconSize - 2, 
                    awardIconSize - 2);

                counter++; counterColumn++;             
            }
        }

        const awardsImage = await canvas.encode('png');
        const awardsAttachment = new AttachmentBuilder(awardsImage, {name: "awards.png"});

        // profile
        const profileEmbed = new EmbedBuilder()
            .setTitle(userProfile.user)
            .setThumbnail("https://retroachievements.org" + userProfile.userPic)
            .setDescription(userProfile.motto === '' ? null : userProfile.motto);

            if(userProfile.rank != null)
            profileEmbed.addFields({name: "Rank", value: "#" + userProfile.rank.toString(), inline: false});

            profileEmbed.addFields(
                {name: "Hardcore Points", value: userProfile.totalPoints.toString(), inline: true},
                {name: "RetroPoints", value: userProfile.totalTruePoints.toString(), inline: true},
            )
            
            if(userProfile.totalSoftcorePoints > 0)
            profileEmbed.addFields({name: "Softcore Points", value: userProfile.totalSoftcorePoints.toString(), inline: true});
            
            profileEmbed.setFooter({text: userProfile.richPresenceMsg, iconURL: 'https://retroachievements.org' + lastGame.gameIcon});


        // award embed
        const awardEmbed = new EmbedBuilder()
            .setTitle("Game Awards 👑")
            .setImage("attachment://awards.png");
        
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
        }

        await interaction.editReply({embeds: [profileEmbed, achievementEmbed, awardEmbed], files: [awardsAttachment]});
    }
};


