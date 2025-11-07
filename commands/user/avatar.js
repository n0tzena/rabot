const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Displays an user avatar.')
    .addUserOption(option =>
        option.setName("user")
        .setDescription("User to display.")
    ),

    async execute(interaction)
    {
        var avatar;
        var user;

        if(interaction.options.getUser('user'))
            user = interaction.options.getUser('user');
        else user = interaction.user;

        avatar = user.avatarURL({size: 4096});
        const embed = new EmbedBuilder()
        .setTitle(user.displayName)
        .setImage(avatar);

        interaction.reply({embeds: [embed]});
    }
}