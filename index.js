require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags, ActivityType } = require('discord.js');
const { buildAuthorization, getRecentGameAwards } = require('@retroachievements/api');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });

client.commands = new Collection();

const db = new Database('foo.db', {verbose: console.log});
module.exports = { db };

const stmt = db.prepare(`
		CREATE TABLE IF NOT EXISTS account_link (
			discord_id varchar(128) NOT NULL,
			ra_username varchar(128) NOT NULL,
			PRIMARY KEY (discord_id)
		)
	`);
stmt.run();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.once(Events.ClientReady, readyClient => {
    console.log(`logged in ${readyClient.user.tag}`);

	setInterval(async () => {
		let authorization = buildAuthorization({username: process.env.USERNAME, webApiKey: process.env.APIKEY})
		let recentAwards = await getRecentGameAwards(authorization, {count: 1});
		let awardType;

		switch(recentAwards.results[0].awardKind)
		{
			case "beaten-hardcore":
				awardType = "beaten";
				break;
			case 'beaten-softcore':
				awardType = "beaten";
				break;
			case 'completed':
				awardType = "completed";
				break;
			case 'mastered':
				awardType = "mastered";
				break;
		}

		client.user.setActivity(
			`${recentAwards.results[0].user} has ${awardType} ${recentAwards.results[0].gameTitle}!`, 
			{ type: ActivityType.Custom }
		);
	}, 30000)
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
	// console.log(interaction);

    const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		}
	}
});

client.login(process.env.TOKEN);