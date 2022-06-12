import http from 'http'
import got from 'got'
import express, { Express } from 'express';

const app : Express = express()

let lastRMDowntime : Date = new Date(0)
let loggedChannels : string[] = []

checkIsDown()
getAvaiableChannels()
setInterval(() => {
    checkIsDown()
    getAvaiableChannels()
}, 60000)

const server = http.createServer(app)

server.listen(1234, () => {
    console.log('listening on port 1234')
})

app.get('/api/v2/recent-messages/:channel/', (request, response) => {
    const timeSinceLastDowntime = Date.now() - lastRMDowntime.getTime()
    const hoursSinceLastDowntime = timeSinceLastDowntime / 1000 / 60 / 60

    const requestedChannel = request.params.channel
    const requestedLimit = parseInt(request.query.limit as string) || 800

    const isLogged = loggedChannels.includes(requestedChannel)
    if (!isLogged || hoursSinceLastDowntime > 24) {
        const recentMessages = `https://recent-messages.robotty.de/api/v2/recent-messages/${requestedChannel}?limit=${requestedLimit}`
        console.log(recentMessages)
        got(recentMessages).then(result => {
            response.header('content-type', 'application/json')
            response.send(result.rawBody)
        }).catch(() => {
            lastRMDowntime = new Date()
            response.sendStatus(500)
        })
    }
    else {
        got(`https://rmjl.florian2807.me/${requestedChannel}`).json<RecentMessages>().then(result => {
            const messageLimit = Math.min(result.messages.length, requestedLimit)
            result.messages = result.messages.slice(0, messageLimit)

            const recentMessages : string[] = []
            result.messages.forEach(message => {
                recentMessages.push(convertIRCMessage(message))
            })

            response.send({
                "error": null,
                "error_code": null,
                "messages": recentMessages
            })
        }).catch(() => response.sendStatus(500))
    }
})

function convertIRCMessage(ircMsg : string) {
    let regexTmiTS = /tmi-sent-ts=(\d+)/
    let regexInsertRMTags = /(.+flags=;)(id=.+mod=\d;)(room-id=.+)/

    let tmiTS = regexTmiTS.exec(ircMsg)?.[1]

    let rmMsg = ircMsg.replace(regexInsertRMTags, `$1historical=1;$2rm-received-ts=${tmiTS};$3`)

    return rmMsg
}

function checkIsDown() {
    got('https://recent-messages.robotty.de/api/v2/recent-messages/forsen?limit=1').json<RecentMessages>().then(result => {
        if (result.error !== null) {
            lastRMDowntime = new Date()
        }
    }).catch(() => {
            lastRMDowntime = new Date()
        })
}

function getAvaiableChannels() {
    got("https://logs.florian2807.me/channels").json<string[]>().then(channels => loggedChannels = channels)
}

interface RecentMessages {
    error : string
    error_code : string
    messages : string[]
}
