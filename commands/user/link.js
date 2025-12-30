const { EmbedBuilder, SlashCommandBuilder, messageLink, MessageFlags } = require('discord.js');
const { db } = require('../../index.js');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Links your Discord ID and your RetroAchievements username.')
    .addStringOption(option =>
        option.setName("username")
        .setDescription("RetroAchievements' account username or ULID.")
        .setRequired(true)
    ),

    async execute(interaction)
    {
        const rows = db.prepare(`SELECT * FROM account_link WHERE discord_id = ${interaction.user.id}`).all();
        if(rows[0])
        {
            const update = db.prepare(`UPDATE account_link SET ra_username = ? WHERE discord_id = ${interaction.user.id}`);
            update.run(interaction.options.getString("username"));

            interaction.reply({content: "Account link updated.", flags: MessageFlags.Ephemeral});
        }
        else
        {
            const insert = db.prepare("INSERT INTO account_link (discord_id, ra_username) VALUES (?, ?)");
            insert.run(interaction.user.id, interaction.options.getString("username"));

            interaction.reply({content: "Account linked successfully.", flags: MessageFlags.Ephemeral});
        }
    }
}