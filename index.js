const http = require('http')
const got = require('got')
const express = require('express')
const app = express()

let lastDowntime
let allChannels = []

checkIsDown()
getAvaiableChannels()

app.get('/api/v2/recent-messages/:channel/', (req, res) => {
    const now = new Date().getTime()
    const hoursBetweenDates = Math.abs(lastDowntime - now) / (60 * 60 * 1000)
    const channel = req.params.channel
    const limit = req.query.limit ?? 800
    if (hoursBetweenDates < 24) { // if the last downtime was less than 24 hours ago, we use JustLogs insances to get the messages
        if (!allChannels.includes(channel)) {
            res.send({
                "error": "The bot is currently not joined to this channel (in progress or failed previously)",
                "error_code": "channel_not_joined",
                "messages": []
            })
        } else {
            got(`https://recent-messages.florian2807.me/api/v2/recent-messages/${channel}`).json().then(response => {
                console.log(channel)
                let i = 0
                let messageLimit = response.messages.length < parseInt(limit) ? response.messages.length : parseInt(limit)

                response. messages = response.messages.slice(0, messageLimit)
                const recentMessages = response.messages.forEach(message => {

                    message = parseIrcMessage(message)
                    i++
                })
                res.send({
                    "error": null,
                    "error_code": null,
                    "messages": response.messages
                })
            })
        }
    } else { // if the last downtime was more than 24 hours ago, we use the recentMessages API to get the messages
        got(`https://recent-messages.robotty.de/api/v2/recent-messages/${channel}?limit=${limit}`).json().then(response => {
            res.send(response)
        })
    }
})

const server = http.createServer(app)

server.listen(5000, () => {
    console.log('listening on port 5000')
})


function parseIrcMessage(ircMsg) {
        let regexTmiTS = /tmi-sent-ts=(\d+)/
        let regexInsertRMTags = /(.+flags=;)(id=.+mod=\d;)(room-id=.+)/

        let tmiTS = regexTmiTS.exec(ircMsg)?.[1]

        let rmMsg = ircMsg.replace(regexInsertRMTags, `$1historical=1;$2rm-received-ts=${tmiTS};$3`)

        return rmMsg
}

setInterval(async () => {
    await checkIsDown()
    await getAvaiableChannels()
}, 6000)

async function checkIsDown() {
    const {isDown} = await got("https://api-prod.downfor.cloud/httpcheck/https://recent-messages.robotty.de/api/v2/recent-messages/florian_2807").json()
    if (isDown) {
        lastDowntime = new Date().getTime()
    }

}

async function getAvaiableChannels() {
    const channels = await got("https://logs.florian2807.me/channels").json()
    allChannels = channels
}