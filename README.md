<p align="center">
    <a href="https://github.com/remix-bot">
      <img src="https://i.imgur.com/Q7y2lAb.png" alt="Logo" width="80" height="80">
    </a>
    <h2 align="center">Remix</h2>
    <p align="center">
    The best high quality Stoat music bot.
    <br>
    <a href="https://stoat.chat/bot/01FVB28WQ9JHMWK8K7RD0F0VCW">Invite to your server</a>
      ·
    <a href="https://stt.gg/Remix">Report bug</a>
      ·
    <a href="https://stt.gg/Remix"> Request Feature</a>
  </p>
</p>

## About The Project

Remix is a free and open source music bot for Stoat built on [revoice.js](https://github.com/ShadowLp174/revoice.js). All commands on Remix are free and will always be free to use.

[![Wakatime stats](https://wakatime.com/badge/user/810f765c-4ad8-49cc-8be6-0f07dff3733f/project/e79f62e3-4d15-41fc-b239-53d5a30302c7.svg?style=flat)](https://wakatime.com/badge/user/810f765c-4ad8-49cc-8be6-0f07dff3733f/project/e79f62e3-4d15-41fc-b239-53d5a30302c7)

## Commands  

Below is a table of all of Remix's commands.

|Name|Description|Format|Alias|
|---|---|---|---|
|clear|Remove all songs from the queue.|%clear|clear, c|
|join|Make the bot join a specific voice channel.|%join 'Channel ID: channel'|join|
|leave|Make the bot leave your current voice channel|%leave|leave, l|
|list|List the queue in your current voice channel.|%list|list, queue|
|loop|Toggle the looping of your queue/song.|%loop <queue \| song>|loop|
|np|Request the name and URL of the currently playing song.|%np|np, current, nowplaying|
|pause|Pause the playback in your voice channel|%pause|pause|
|play|Play a YouTube video from URL/query or a playlist by URL.|%play 'query: text'|play, p|
|player|Create an emoji player control for your voice channel|%player|player|
|playnext|Play a YouTube video from url/query or a playlist by URL. The result will be added to the top of the queue.|%playnext 'query: text'|playnext, pn|
|remove|Remove a specific song from the queue.|%remove 'index: number'|remove|
|resume|Resume the playback in your voice channel|%resume|resume|
|search|Display the search results for a given query|%search 'query: text'|search|
|settings|Change/Get settings in the current server.|%settings <set \| get>|settings, s|
|shuffle|Re-orders the queue randomly.|%shuffle|shuffle|
|skip|Skip the current playing song.|%skip|skip|
|stats|Display stats about the bot like the uptime.|%stats|stats, info|
|test|A test command used for various purposes.|%test 'number: number'|test|
|thumbnail|Request the thumbnail of the currently playing song.|%thumbnail|thumbnail, thumb|
|volume|Change the current volume.|%volume 'volume: number'|volume, v|

## Getting Started

Firstly, you have to [invite Remix](https://stoat.chat/bot/01FVB28WQ9JHMWK8K7RD0F0VCW). Then use the `%help` command to get a list of commands that you can use through the bot.

<!-- TODO: more extensive tutorial -->

## Hosting The Bot

If you're self-hosting Remix, please make it clear that it is **not the main instance** (or **change the name**) but give credit by **linking to this repo** (for example, in the bot's profile - something like `This bot <is based on/is an instance of> [Remix](https://github.com/remix-bot/stoat)` will suffice).

-   Clone this repo (`git clone https://github.com/remix-bot/stoat.git)`)
-   Install the dependencies (`npm install`)
-   Set up a `config.json` file
    - Rename the `config.example.json` file and fill out the missing values. You can generate spotify credentials [here](https://developer.spotify.com/)
    - Important: since [
6cedcb9](https://github.com/remix-bot/stoat/commit/6cedcb9425d65171b79ce73fc91a9e890afc137a), a MySQL database is required.
      For setup instructions see [DB Setup](#setup-database).
-   Run the bot (`node index.js`; for node versions >21.1: `node --no-experimental-global-navigator index.js`)

> [!WARNING]
> For Node versions 21.1.X+ it is important to disable the navigator API. Unless the API is disabled, joining a voice channel will result in a "device not supported" error. It can be disabled with the `--no-experimental-global-navigator` flag when starting the node process. This is hopefully a temporary fix until the dependency is updated.

## Setup Database

1. The main thing you'll need is a MySQL database accessible to your server, either publicly or locally.
2. Create a separate database. This way none of your other data collides with Remix.
3. Enter the connection details into the respective fields in the `config.json` file.
4. Run the following SQL commands, to create all the necessary tables:
  ```SQL
  CREATE TABLE `settings` (
    `id` varchar(70) NOT NULL,
    `data` json NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
  ```
5. You're good to go! If you've used the old settings system and want to migrate your data,
check the README in the `settings` folder.


## Connecting To A Self-Hosted Instance

If you don't want to connect to the official Revolt instance, you need to fill out the `stoat.js` and `stoat-api` configuration values in your config file.

Please refer to the [stoat.js docs](https://stoat.js.org/classes/Client.html#constructor) for `stoat.js` and to [oapi's docs](https://github.com/insertish/oapi#example) for `stoat-api`.

## Updating YTDL-Core

Remix uses ytdl-core to download the music from YouTube. Since the original js package receives updates rarely,
we're using a more frequently updated/fixed fork by [DistubeJs](https://github.com/distubejs/ytdl-core).
That means if there are errors during playback, you can try to update ytdl using the following command:

```js
npm i ytdl-core@npm:@distube/ytdl-core@latest
```

## Contact

If you have any questions or would like to talk with other Remix users you can join our Stoat server <a href="https://stt.gg/Remix">here</a>.

---

&copy; 2026 Remix. All Rights Reserved.





