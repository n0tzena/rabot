const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Displays an user avatar.')
    .addStringOption(option =>
        option.setName("user")
        .setDescription("User to display.")
    ),

    async execute(interaction)
    {
        interaction.reply({files: interaction.user.avatarURL(options = {size: 4096})});
    }
}