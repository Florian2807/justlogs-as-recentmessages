import http from 'http'
import got from 'got'
import express, {Express} from 'express';
import fs from 'fs';

const config = require('./config.json')

const lastRecordedRMDowntime : string = fs.readFileSync('./last-down.json', 'utf8')
let lastRMDowntime: Date = new Date(lastRecordedRMDowntime || 0)
let loggedChannels: string[] = []

console.log(lastRMDowntime)


checkIsDown()
getAvailableChannels()
setInterval(() => {
    checkIsDown()
    getAvailableChannels()
}, 60000)


const app: Express = express()
const server = http.createServer(app)
server.listen(1234, () => {
    console.log('listening on port 1234')
})


app.get('/status/', (_, response) => {
    const timeSinceLastDowntime = Date.now() - lastRMDowntime.getTime()
    const hoursSinceLastDowntime = timeSinceLastDowntime / 1000 / 60 / 60
    response.send({
        "lastDowntime": lastRMDowntime.getTime() ? lastRMDowntime : null,
        "last24Hours": hoursSinceLastDowntime < 24,
    })
})

app.get('/api/v2/recent-messages/:channel/', (request, response) => {
    const timeSinceLastDowntime = Date.now() - lastRMDowntime.getTime()
    const hoursSinceLastDowntime = timeSinceLastDowntime / 1000 / 60 / 60

    const requestedChannel = request.params.channel
    const requestedLimit = parseInt(request.query.limit as string) || 800

    const isLogged = loggedChannels.includes(requestedChannel)
    if (!isLogged || hoursSinceLastDowntime > 24) {
        requestRecentMSG(response, requestedChannel, requestedLimit)
    } else {
        requestJustLogs(response, requestedChannel, requestedLimit)
    }
})


function requestRecentMSG(response: any, requestedChannel: string, requestedLimit: number) {
    const recentMessages = `${config.recentMsgInstance}/api/v2/recent-messages/${requestedChannel}?limit=${requestedLimit}`

    got(recentMessages, {throwHttpErrors: false}).then(result => {
        response.header('content-type', 'application/json')
        if (response.error !== null) {
            requestJustLogs(response, requestedChannel, requestedLimit)
        } else {
            response.send(result.rawBody)
        }
    }).catch(() => {
        lastRMDowntime = new Date()
        console.log('recent-messages request failed')
        response.sendStatus(500)
    })
}

function requestJustLogs(response: any, requestedChannel: string, requestedLimit: number) {
    got(`${config.recentMsgJustLogsInstance}/${requestedChannel}`).json<RecentMessages>().then(result => {
        const messageLimit = Math.min(result.messages.length, requestedLimit)
        result.messages = result.messages.slice(0, messageLimit)

        const recentMessages: string[] = []
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


function convertIRCMessage(ircMsg: string) {
    let regexTmiTS = /tmi-sent-ts=(\d+)/
    let regexInsertRMTags = /(.+flags=;)(id=.+mod=\d;)(room-id=.+)/

    let tmiTS = regexTmiTS.exec(ircMsg)?.[1]

    return ircMsg.replace(regexInsertRMTags, `$1historical=1;$2rm-received-ts=${tmiTS};$3`)
}

function checkIsDown() {
    got(`${config.recentMsgInstance}/api/v2/recent-messages/forsen?limit=1`).json<RecentMessages>().then(result => {
        if (result.error !== null) {
            console.error("recent-messages went down")
            fs.writeFileSync('./last-down.json', new Date().toISOString())
            lastRMDowntime = new Date()
        }
    }).catch(() => {
        console.error("recent-messages went down")
        lastRMDowntime = new Date()
        fs.writeFileSync('./last-down.json', new Date().toISOString())
    })
}

function getAvailableChannels() {
    got(`${config.justlogsInstance}/channels`).json<string[]>().then(channels => loggedChannels = channels)
}

interface RecentMessages {
    error: string
    error_code: string
    messages: string[]
}
