const http = require('http')
const got = require('got')
const express = require('express')
const app = express()

app.get('/api/v2/recent-messages/:channel/', (req, res) => {
    const channel = req.params.channel
    const limit = req.query.limit ?? 800
    getLogs(channel, limit).then(i => {
        const messages = i
        console.log(messages.length)
        res.send({
            "error": null,
            "error_code": null,
            "messages": messages
        })
    })
})

const server = http.createServer(app)

server.listen(5000, () => {
    console.log('listening on port 5000')
})

getLogs("florian_2807", 800)

async function getLogs(channel, limit) {
    const today = new Date()
    const yesterday = new Date(today)

    yesterday.setDate(yesterday.getDate() - 1)

    today.toDateString()
    yesterday.toDateString()

    const days = [
        {
            "info": "today",
            "day": today.getDate(),
            "month": today.getMonth() + 1,
            "year": today.getFullYear()
        },
        {
            "info": "yesterday",
            "day": yesterday.getDate(),
            "month": yesterday.getMonth() + 1,
            "year": yesterday.getFullYear()
        }
    ]
    let justlogMessages = {"today": [], "yesterday": []}
    let counter = 0
    for (const i of days) {
        try {
            const {body} = await got(`https://logs.florian2807.me/channel/${channel}/${i.year}/${i.month}/${i.day}?reverse&json=1`)
            for (let c = 0; counter < limit && c < JSON.parse(body).messages.length; c++) {
                counter++
                justlogMessages[i.info].push(parseIrcMessage(JSON.parse(body).messages[c].raw))
            }
        } catch {}

    }
    const messages = justlogMessages["today"].concat(justlogMessages["yesterday"])
    return messages.slice(limit - limit * 2)
}

function parseIrcMessage(ircMsg) {
    let regexTmiTS = /tmi-sent-ts=(\d+)/
    let regexInsertRMTags = /(.+flags=;)(id=.+mod=\d;)(room-id=.+)/

    let tmiTS = regexTmiTS.exec(ircMsg)[1]

    let rmMsg = ircMsg.replace(regexInsertRMTags, `$1historical=1;$2rm-received-ts=${tmiTS};$3`)

    return rmMsg
}