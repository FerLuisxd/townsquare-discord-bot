import 'dotenv/config';
import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    GuildMember,
    ChatInputCommandInteraction,
    TextChannel,
    StageChannel,
    VoiceChannel,
    Guild,
    Role,
    GuildBasedChannel,
    Collection
} from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
    ],
});


// Store game state
interface GameState {
    hostId: string;
    playerIds: Set<string>;
    spectatorIds: Set<string>;
    mainChannelId: string;
    privateRoomIds: string[];
}

const activeGames = new Map<string, GameState>();

const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Creates the Townsquare category with channels and roles'),
    new SlashCommandBuilder()
        .setName('newgame')
        .setDescription('Initialize a new game with players in the main channel'),
    new SlashCommandBuilder()
        .setName('spectator')
        .setDescription('Switch your role to spectator'),
    new SlashCommandBuilder()
        .setName('uninstall')
        .setDescription('Removes Townsquare channels and roles'),
    new SlashCommandBuilder()
        .setName('endgame')
        .setDescription('Ends the current game'),
    new SlashCommandBuilder()
        .setName('silence')
        .setDescription('Mute all players'),
    new SlashCommandBuilder()
        .setName('talk')
        .setDescription('Unmute all players'),
    new SlashCommandBuilder()
        .setName('moveallplayerstomain')
        .setDescription('Move all players to the main channel'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log('Registering slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully registered commands!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

async function uninstallTownsquare(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    if (!guild) {
        await interaction.editReply('This command must be used in a server!');
        return;
    }

    try {
        // ---- Delete category + children ----
        const channels = await guild.channels.fetch();
        const category = channels.find(
            ch => ch?.type === ChannelType.GuildCategory && ch.name === 'Townsquare'
        );

        if (category) {
            const children = channels.filter(ch => ch?.parentId === category.id);
            for (const ch of children.values()) {
                await ch?.delete('BOTC uninstall');
            }
            await category.delete('BOTC uninstall');
        }

        // ---- Delete roles ----
        const roleNames = ['Host', 'Player', 'Spectator'];
        for (const name of roleNames) {
            const role = guild.roles.cache.find(r => r.name === name);
            if (role) {
                await role.delete('BOTC uninstall');
            }
        }

        // ---- Clear game state ----
        activeGames.delete(guild.id);

        await interaction.editReply('🧹 Townsquare uninstalled successfully!');
    } catch (error) {
        console.error('Error during uninstall:', error);
        await interaction.editReply('❌ Failed to uninstall Townsquare.');
    }
}

async function endGame(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    await interaction.deferReply({ ephemeral: true });
    const game = activeGames.get(guild.id);
    if (!game) return;


    const hostRole = guild.roles.cache.find(r => r.name === 'Host')!;
    const playerRole = guild.roles.cache.find(r => r.name === 'Player')!;
    const spectatorRole = guild.roles.cache.find(r => r.name === 'Spectator')!;

    const rolesToRemove = [hostRole, playerRole, spectatorRole].filter(Boolean);

    for (const [, member] of guild.members.cache) {
        await member.roles.remove(rolesToRemove).catch(() => { });
    }

    activeGames.delete(guild.id);

    await interaction.editReply('🛑 Game ended. Roles cleared.');
}

async function silence(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const playerRole = guild.roles.cache.find(r => r.name === 'Player');
    if (!playerRole) return;

    await interaction.deferReply({ ephemeral: true });

    for (const [, member] of guild.members.cache) {
        if (
            member.roles.cache.has(playerRole.id) &&
            member.voice.channel
        ) {
            await member.voice.setMute(true, 'Silence phase').catch(() => { });
        }
    }

    await interaction.editReply('🔇 All players muted.');
}

async function talk(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const playerRole = guild.roles.cache.find(r => r.name === 'Player');
    if (!playerRole) return;

    await interaction.deferReply({ ephemeral: true });

    for (const [, member] of guild.members.cache) {
        if (
            member.roles.cache.has(playerRole.id) &&
            member.voice.channel
        ) {
            await member.voice.setMute(false, 'Talk phase').catch(() => { });
        }
    }

    await interaction.editReply('🗣️ Players can talk.');
}

async function moveAllToMainCore(
    guild: Guild,
    requester: GuildMember
): Promise<number> {
    const hostRole = guild.roles.cache.find(r => r.name === "Host");
    if (!hostRole || !requester.roles.cache.has(hostRole.id)) {
        throw new Error("NOT_HOST");
    }

    const playerRole = guild.roles.cache.find(r => r.name === "Player");
    const spectatorRole = guild.roles.cache.find(r => r.name === "Spectator");
    if (!playerRole || !spectatorRole) {
        throw new Error("ROLES_MISSING");
    }

    const category = guild.channels.cache.find(
        ch =>
            ch.type === ChannelType.GuildCategory &&
            ch.name.toLowerCase() === "townsquare"
    );
    if (!category) throw new Error("CATEGORY_MISSING");

    const voiceChannels = guild.channels.cache.filter(
        ch => ch?.isVoiceBased() && ch.parentId === category.id
    );

    const mainVC = voiceChannels.find(
        ch => ch?.name?.toLowerCase() === "main hall"
    ) as VoiceChannel | StageChannel | undefined;


    if (!mainVC) throw new Error("MAIN_VC_MISSING");

    let moved = 0;

    for (const member of guild.members.cache.values()) {
        if (
            (member.roles.cache.has(playerRole.id) ||
                member.roles.cache.has(spectatorRole.id)) &&
            member.voice.channel &&
            member.voice.channelId !== mainVC.id
        ) {
            await member.voice.setChannel(mainVC);
            moved++;
        }
    }

    return moved;
}

async function moveAllPlayersToMain(
    interaction: ChatInputCommandInteraction
) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const moved = await moveAllToMainCore(
            interaction.guild!,
            interaction.member as GuildMember
        );

        await interaction.editReply(
            `✅ Moved **${moved}** players & spectators to the main hall.`
        );
    } catch (err: any) {
        if (err.message === "NOT_HOST") {
            await interaction.editReply("⛔ Only the **Host** can do this.");
        } else {
            await interaction.editReply("❌ Failed to move members.");
        }
    }
}


async function setupTownsquare(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    if (!guild) {
        await interaction.editReply('This command must be used in a server!');
        return;
    }

    try {
        let hostRole = guild.roles.cache.find(r => r.name === 'Host');
        let spectatorRole = guild.roles.cache.find(r => r.name === 'Spectator');
        let playerRole = guild.roles.cache.find(r => r.name === 'Player');

        if (!hostRole) {
            hostRole = await guild.roles.create({
                name: 'Host',
                color: 0xFF0000,
                permissions: [],
                reason: 'Townsquare Setup'
            });
        }

        if (!spectatorRole) {
            spectatorRole = await guild.roles.create({
                name: 'Spectator',
                color: 0xFFFF00,
                permissions: [],
                reason: 'Townsquare Setup'
            });
        }

        if (!playerRole) {
            playerRole = await guild.roles.create({
                name: 'Player',
                color: 0x0000FF,
                permissions: [],
                reason: 'Townsquare Setup'
            });
        }

        let category = guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name === 'Townsquare'
        );

        if (!category) {
            category = await guild.channels.create({
                name: 'Townsquare',
                type: ChannelType.GuildCategory,
            });
        }

        const createPublicRoom = async (name: string) => {
            await guild.channels.create({
                name,
                type: ChannelType.GuildVoice,
                parent: category!.id,
            });
        };

        await createPublicRoom('Main Hall');
        await createPublicRoom('Potion Shop');
        await createPublicRoom('Library');

        for (let i = 1; i <= 5; i++) {
            await guild.channels.create({
                name: `private-room-${i}`,
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect
                        ],
                    },
                    {
                        id: hostRole.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.Speak
                        ],
                    },
                    {
                        id: spectatorRole.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.Speak
                        ],
                    },
                ],
            });
        }

        const controlChannel = await guild.channels.create({
            name: 'townsquare-control',
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: hostRole.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                }
            ],
        });

        const webhook = await controlChannel.createWebhook({
            name: 'Townsquare Control',
            reason: 'Townsquare web integration'
        });

        const infoMessage = await controlChannel.send(
            `🔗 **Townsquare Webhook Created**\n\n` +
            `Use this webhook URL in your web app:\n` +
            `|| \`${webhook.url}\` ||\n` +
            `⚠️ Set that in the web app to enable communication!`
        );

        await infoMessage.pin();

        await interaction.editReply(
            `✅ Townsquare setup complete!\n` +
            `Roles: ${hostRole}, ${spectatorRole}, ${playerRole}\n` +
            `Control channel & webhook created successfully.`
        );
    } catch (error) {
        console.error('Error in setup:', error);
        await interaction.editReply('❌ An error occurred during setup.');
    }
}



async function startNewGame(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    const member = interaction.member as GuildMember;

    if (!guild || !member) {
        await interaction.editReply('This command must be used in a server!');
        return;
    }

    // Must be in a voice channel
    const voiceChannel = member.voice.channel;
    console.log('Voice Channel:', voiceChannel, 'type ', voiceChannel?.type, 'should be: ', ChannelType.GuildVoice);
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
        await interaction.editReply('❌ You must be in a voice channel to start a game!');
        return;
    }

    try {
        // Find roles
        const hostRole = guild.roles.cache.find(r => r.name === 'Host');
        const playerRole = guild.roles.cache.find(r => r.name === 'Player');
        const spectatorRole = guild.roles.cache.find(r => r.name === 'Spectator');

        if (!hostRole || !playerRole || !spectatorRole) {
            await interaction.editReply('❌ Please run /setup first to create the necessary roles!');
            return;
        }

        const membersInChannel = voiceChannel.members;
        const playerIds = new Set<string>();

        // Assign host role to command user
        await member.roles.add(hostRole);
        await member.roles.remove([playerRole, spectatorRole]).catch(() => { });

        // Assign player role to others in the voice channel
        for (const [, channelMember] of membersInChannel) {
            if (channelMember.id === member.id || channelMember.user.bot) continue;

            await channelMember.roles.add(playerRole);
            await channelMember.roles.remove([hostRole, spectatorRole]).catch(() => { });
            playerIds.add(channelMember.id);
        }

        // Store game state
        activeGames.set(guild.id, {
            hostId: member.id,
            playerIds,
            spectatorIds: new Set(),
            mainChannelId: voiceChannel.id,
            privateRoomIds: [],
        });

        await interaction.editReply(
            `🎮 **New game started!**\n` +
            `🎤 Voice Channel: ${voiceChannel.name}\n` +
            `👑 Host: ${member}\n` +
            `🧑‍🤝‍🧑 Players: ${playerIds.size}\n` +
            `Players can use /spectator to switch to spectator mode.`
        );
    } catch (error) {
        console.error('Error starting game:', error);
        await interaction.editReply('❌ An error occurred while starting the game.');
    }
}

async function switchToSpectator(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const member = interaction.member as GuildMember;

    if (!guild || !member) {
        await interaction.editReply('This command must be used in a server!');
        return;
    }

    const gameState = activeGames.get(guild.id);
    if (!gameState) {
        await interaction.editReply('❌ No active game found. Use /newgame to start one!');
        return;
    }

    try {
        const spectatorRole = guild.roles.cache.find(r => r.name === 'Spectator');
        const playerRole = guild.roles.cache.find(r => r.name === 'Player');
        const hostRole = guild.roles.cache.find(r => r.name === 'Host');

        if (!spectatorRole || !playerRole) {
            await interaction.editReply('❌ Required roles not found!');
            return;
        }

        // Don't allow host to become spectator
        if (member.id === gameState.hostId) {
            await interaction.editReply('❌ The host cannot become a spectator!');
            return;
        }

        // Switch roles
        await member.roles.add(spectatorRole);
        if (member.roles.cache.has(playerRole.id)) {
            await member.roles.remove(playerRole);
        }

        // Update game state
        gameState.playerIds.delete(member.id);
        gameState.spectatorIds.add(member.id);

        await interaction.editReply('✅ You are now a spectator!');
    } catch (error) {
        console.error('Error switching to spectator:', error);
        await interaction.editReply('❌ An error occurred.');
    }
}

client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user?.tag}`);
    registerCommands();
});

client.on("messageCreate", async message => {
    if (message.author.bot && !message.webhookId) return;
    const guild = message.guild;
    if (!guild) return;

    if (
        message.channel.type !== ChannelType.GuildText ||
        message.channel.name !== "townsquare-control"
    ) {
        return;
    }
    let payload;
    try {
        payload = JSON.parse(message.content);
    } catch {
        return;
    }

    if (payload.type === "MOVEALL") {
        const guild = message.guild;
        if (!guild) return;

        const hostRole = guild.roles.cache.find(r => r.name === "Host");
        const hostMember = hostRole
            ? guild.members.cache.find(m => m.roles.cache.has(hostRole.id))
            : null;

        if (!hostMember) return;

        try {
            await moveAllToMainCore(guild, hostMember);
        } catch (err) {
            console.error("MOVEALL failed:", err);
        }
    }
    else if (payload.type === "MOVE") {
        const guild = message.guild;
        if (!guild) return;

        const member = guild.members.cache.find(
            m =>
                m.user.username.toLowerCase() ===
                payload.discordUsername.toLowerCase()
        );

        if (!member || !member.voice.channel) return;

        const category = guild.channels.cache.find(
            ch =>
                ch.type === ChannelType.GuildCategory &&
                ch.name === "Townsquare"
        );

        if (!category) return;

        const targetVC = guild.channels.cache.find(
            ch =>
                (ch.type === ChannelType.GuildVoice ||
                    ch.type === ChannelType.GuildStageVoice) &&
                ch.parentId === category.id &&
                ch.name.toLowerCase() === payload.channelName.toLowerCase()
        ) as VoiceChannel | StageChannel | undefined;

        if (!targetVC) return;

        await member.voice.setChannel(targetVC);
    }
    else if (payload.type === "MOVEPRIVATE") {
        const member = guild.members.cache.find(
            m => m.user.username.toLowerCase() === payload.discordUsername.toLowerCase()
        );

        const otherMember = guild.members.cache.find(
            m => m.user.username.toLowerCase() === payload.discordUsername2.toLowerCase()
        );

        if (!member || !member.voice.channel || !otherMember || !otherMember.voice.channel) return;

        const category = guild.channels.cache.find(
            ch => ch.type === ChannelType.GuildCategory && ch.name === "Townsquare"
        );

        if (!category) return;

        // Find all private rooms in the category
        const privateRooms = guild.channels.cache.filter(
            ch =>
                (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) &&
                ch.parentId === category.id &&
                ch.name.startsWith("private-room-")
        ) as Collection<string, VoiceChannel | StageChannel>;

        // Find the first empty private room
        const emptyRoom = privateRooms.find(room => room.members.size === 0);

        if (!emptyRoom) {
            console.error("No empty private rooms available");
            return;
        }

        try {
            await member.voice.setChannel(emptyRoom);
            await otherMember.voice.setChannel(emptyRoom);
        } catch (err) {
            console.error("MOVE failed:", err);
        }
    }
    else if (payload.type === "RETURN") {
        const member = guild.members.cache.find(
            m => m.user.username.toLowerCase() === payload.discordUsername.toLowerCase()
        );

        const otherMember = guild.members.cache.find(
            m => m.user.username.toLowerCase() === payload.discordUsername2.toLowerCase()
        );

        if (!member || !member.voice.channel || !otherMember || !otherMember.voice.channel) return;

        const category = guild.channels.cache.find(
            ch => ch.type === ChannelType.GuildCategory && ch.name === "Townsquare"
        );

        if (!category) return;

        const mainHall = guild.channels.cache.find(
            ch =>
                (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) &&
                ch.parentId === category.id &&
                ch.name === "Main Hall"
        ) as VoiceChannel | StageChannel | undefined;

        if (!mainHall) {
            console.error("Main Hall not found");
            return;
        }

        try {
            await member.voice.setChannel(mainHall);
            await otherMember.voice.setChannel(mainHall);
        } catch (err) {
            console.error("RETURN failed:", err);
        }
    }
    return;
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === 'setup') {
            await setupTownsquare(interaction);
        } else if (commandName === 'newgame') {
            await startNewGame(interaction);
        } else if (commandName === 'spectator') {
            await switchToSpectator(interaction);
        }
        else if (commandName === 'uninstall') {
            await uninstallTownsquare(interaction);
        }
        else if (commandName === 'endgame') {
            await endGame(interaction);
        } else if (commandName === 'silence') {
            await silence(interaction);
        }
        else if (commandName === 'talk') {
            await talk(interaction);
        }
        else if (commandName === 'moveallplayerstomain') {
            await moveAllPlayersToMain(interaction);
        }
    } catch (error) {
        console.error('Error handling command:', error);
    }
});

client.login(TOKEN);