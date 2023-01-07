# Recent-Messages

A small NodeJS utility to fetch recent messages for Chatterino or other Twitch chat clients.

The special thing about this utility is that if [recent-messages](https://recent-messages.robotty.de/) is down or have gaps  
it automatically uses JustLogs instances to fetch the recent messages.

Live Instance: [recent-messages](https://recent-messages.florian2807.me/api/v2/recent-messages/<channelName>)

This live instance is using my own instance of [JustLogs](https://github.com/Florian2807/JustlogRedirector)

## Installation

Install [Node.js](https://nodejs.org/), if you don't have it already.

**Clone** the repository:
```bash
git clone https://github.com/Florian2807/justlogs-as-recentmessages | cd justlogs-as-recentmessages
```
**Edit** the config.json:
```bash
vim config.json
```
**Rename** last-down.json: 
```bash
mv last-down.json.example last-down.json
```
**Install** the dependencies:
```bash
npm install
```
To **Run** the server:
```bash
node index.js
```

#### You also can use [PM2](https://www.npmjs.com/package/pm2) to run this application in the background:

**Install** PM2 as a global dependency:
```bash
npm install -g pm2
```

**Run** the application:
```bash
pm2 start index.js
```

## Configuration

Use the provided config.json file to set configuration options:

```js
{
    "recentMsgInstance": "https://recent-messages.robotty.de",
    "recentMsgJustLogsInstance": "https://rmjl.florian2807.me",
    "justlogsInstance": "https://logs.florian2807me",
    "port": 1234
}
```