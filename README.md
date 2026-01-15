# Townsquare Discord Bot

A powerful Discord bot designed to manage [Townsquare](https://github.com/FerLuisxd/townsquare) sessions. It automates server organization, player roles, and provides seamless integration between the web application and Discord.

## Features

- **Automated Workspace**: Creates the necessary category, voice channels (Main Hall, Potion Shop, Library), and private rooms for whispers with a single command.
- **Role Management**: Automatically handles `Host`, `Player`, and `Spectator` roles.
- **Web Integration**: Creates a secure control channel with a webhook for real-time communication with the Townsquare web app.
- **Game Control**: Commands to mute/unmute players (`/silence`, `/talk`), move everyone back to the main hall (`/moveallplayerstomain`), and end games gracefully.
- **Clean Uninstall**: Completely removes all generated roles and channels when you're done.

## Prerequisites

- **Node.js**: v16.11.0 or higher.
- **Discord Bot**: A bot created in the [Discord Developer Portal](https://discord.com/developers/applications) with the following **Privileged Gateway Intents**:
  - `Server Members Intent`
  - `Message Content Intent`

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/FerLuisxd/townsquare-discord-bot.git
   cd townsquare-discord-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory and add your bot credentials:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

## Usage

### 1. Launch the Bot
Start the bot using:
```bash
npm run start
```
For development with auto-reload:
```bash
npm run dev
```

### 2. Discord Server Setup
Once the bot is online:
1. Invite the bot to your server with `Administrator` permissions (required for channel and role management).
2. Run `/setup` in any text channel. This will:
   - Create the **Townsquare** category.
   - Create the required roles and channels.
   - Set up the `#townsquare-control` channel with a Webhook URL.

### 3. Connect to Townsquare Web App
1. Go to the `#townsquare-control` channel in Discord.
2. Copy the **Webhook URL** from the pinned message.
3. Paste it into the **Townsquare web app** settings to enable Discord automation features.

## Commands

| Command | Description |
| :--- | :--- |
| `/setup` | Initializes the server with roles and channels. |
| `/newgame` | Starts a new game session with players in your current voice channel. |
| `/spectator` | Switches your role from Player to Spectator. |
| `/silence` | Mutes all players (Storyteller only). |
| `/talk` | Unmutes all players (Storyteller only). |
| `/moveallplayerstomain` | Moves all players back to the Main Hall. |
| `/endgame` | Ends the current session and clears roles. |
| `/uninstall` | **Destructive**: Removes all Townsquare-related channels and roles. |

## Uninstalling

To completely remove the bot's footprint from your server:
1. Run the `/uninstall` command in Discord.
2. Stop the bot process (`Ctrl+C` in your terminal).
3. (Optional) Remove the bot from your Discord Developer Portal if no longer needed.

