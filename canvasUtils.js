const Canvas = require("@napi-rs/canvas");
const { request } = require('undici');

module.exports = { createAwardImage }

// propriedades
const awardIconSize = 48;
const iconOffset = 2;

const maxAwardsDisplay = 15;
const maxBeatenDisplay = 25;

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Default_parameters

// award types:
// Mastery/Completion
// Event
// Game Beaten

async function createAwardImage(playerAwards, 
    { 
        imageAwardType = "Mastery/Completion",
        doGradient = false,
        drawBorder = true,
        maxImagesPerRow = 5,
        totalAwardsToDisplay = 15,
        iconSize = 48,
        pixelOffset = 2 
    } = {}
)
{
    // awards for masteries
    var awardsCount = 0;
    var maxRowAwards = maxImagesPerRow;    

    playerAwards.visibleUserAwards.forEach(element => 
    {
        if(element.awardType == imageAwardType)
            awardsCount++;
    });
            
    // limite de linhas
    var awardRows = Math.ceil(awardsCount / 5);

    if(awardRows * maxRowAwards > totalAwardsToDisplay)
        awardRows = totalAwardsToDisplay / maxRowAwards;

    if(awardsCount < maxRowAwards)
        maxRowAwards = awardsCount;

    // criar canvas correspondente ao número de awards
    const canvas = Canvas.createCanvas((iconSize * maxRowAwards + pixelOffset * maxRowAwards), (iconSize * awardRows + pixelOffset * awardRows));
    const context = canvas.getContext("2d");

    // propriedades do canvas
    context.lineWidth = 2;

    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createLinearGradient
    if(doGradient)
    {
        const gradient = context.createLinearGradient(0, 0, 0, iconSize + 16);
        gradient.addColorStop(0, "#ffd445");
        gradient.addColorStop(1, "#8f7624");
        context.strokeStyle = gradient;        
    }
    else
    {
        context.strokeStyle = "#ffce2b";
    }


    // inserir as imagens no canvas
    for (let index = 0, counter = 0, counterRow, counterColumn = 0; index < playerAwards.visibleUserAwards.length; index++) {

        // quebra o loop se o counter for maior que 14 (começa em 0, 15 awards no total)
        if(counter > totalAwardsToDisplay - 1)
            break;

        counterRow = Math.ceil((counter + 1) / 5);

        if(counterColumn + 1 > maxRowAwards)
            counterColumn = 0;

        if(playerAwards.visibleUserAwards[index].awardType == imageAwardType)
        {
            const { body } = await request("https://retroachievements.org" + playerAwards.visibleUserAwards[index].imageIcon);
            awardImage = await Canvas.loadImage(await body.arrayBuffer());

            // (posiçao x, posiçao y, largura x, largura y)
            await context.drawImage(
                awardImage, 
                counterColumn * iconSize + pixelOffset * counterColumn, 
                (counterRow - 1) * iconSize + pixelOffset * counterRow, 
                iconSize, 
                iconSize);

            // se pegou no hardcore, borda dourada
            if(playerAwards.visibleUserAwards[index].awardDataExtra == 1 && drawBorder)
            context.strokeRect(
                counterColumn * iconSize + pixelOffset * counterColumn + 1, 
                (counterRow - 1) * iconSize + pixelOffset * counterRow + 1, 
                iconSize - 2, 
                iconSize - 2);

            counter++; counterColumn++;             

        }
    }

    const awardsImage = await canvas.encode('png');
    return awardsImage;
}