import http from 'http'
import got from 'got'
import express, {Express} from 'express';
import fs from 'fs';

const config = require('./config.json')
const lastRecordedRMDowntime: { [key: string]: string | null } = require('./last-down.json')

checkCorrectConfig();

let lastRMDowntime: { [key: string]: Date } = {}
Object.keys(lastRecordedRMDowntime).forEach(key => {
    lastRMDowntime[key] = new Date(lastRecordedRMDowntime[key] || 0)
})
let loggedChannels: string[] = []


getAvailableRecentMSG()
getAvailableChannels()
setInterval(() => {
    getAvailableRecentMSG()
    getAvailableChannels()
}, 60000)


const app: Express = express()
const server = http.createServer(app)
server.listen(config.port, () => {
    console.log('listening on port ' + config.port)
})

app.get('/status/', (_, response) => {
    const timeSinceLastDowntime = Date.now() - lastRMDowntime["https://recent-messages.robotty.de"].getTime()
    const hoursSinceLastDowntime = timeSinceLastDowntime / 1000 / 60 / 60
    response.send({
        "lastDowntime": lastRMDowntime["https://recent-messages.robotty.de"].getTime() ? lastRMDowntime : null,
        "last24Hours": hoursSinceLastDowntime < 24,
    })
})

app.get('/api/v2/recent-messages/:channel/', (request, response) => {

    let instanceStatus: { [key: string]: boolean } = {}
    let usefulInstance: string | null = ""
    for (const instance of config.recentMsgInstance) {
        const timeSinceLastDowntime = Date.now() - lastRMDowntime[instance]?.getTime() || 0
        const hoursSinceLastDowntime = timeSinceLastDowntime / 1000 / 60 / 60
        instanceStatus[instance] = hoursSinceLastDowntime < 24 // true means instance has downtime
    }
    for (let i = Object.keys(instanceStatus)?.length; i > 0; i--) {
        const instance = instanceStatus[Object.keys(instanceStatus)[i-1]]
        if (!instance) {
            usefulInstance = Object.keys(instanceStatus)[i-1]
        }
    }
    const requestedChannel = request.params.channel
    const requestedLimit = parseInt(request.query.limit as string) || 800
    if (request.query.justlogs) {
        requestJustLogs(response, requestedChannel, requestedLimit)
    } else if (request.query.recentmsg) {
        requestRecentMSG(response, requestedChannel, requestedLimit, usefulInstance)
    }

    const isLogged = loggedChannels.includes(requestedChannel)
    if (isLogged && usefulInstance.length > 0) {
        console.log(`requesting ${usefulInstance} for ${requestedChannel} NoLogs: ${!isLogged} wasDown: ${instanceStatus[usefulInstance] ?? true}`)
        requestRecentMSG(response, requestedChannel, requestedLimit, usefulInstance)
    } else if (isLogged && !instanceStatus[usefulInstance]) {
        console.log(`requesting JustLogs for ${requestedChannel} isLogged: ${!isLogged} wasDown: ${instanceStatus[usefulInstance] ?? true}`)
        requestJustLogs(response, requestedChannel, requestedLimit)
    } else if (!isLogged) {
        console.log(`requesting ${usefulInstance ?? config.recentMsgInstance[0]} for ${requestedChannel} NoLogs: ${!isLogged} wasDown: ${instanceStatus[usefulInstance] ?? true}`)
        requestRecentMSG(response, requestedChannel, requestedLimit, usefulInstance ?? config.recentMsgInstance[0])
    }
})


function requestRecentMSG(response: any, requestedChannel: string, requestedLimit: number, instance: string) {
    const recentMessages = `${instance}/api/v2/recent-messages/${requestedChannel}?limit=${requestedLimit}`

    got(recentMessages, {throwHttpErrors: false}).then(result => {
        response.header('content-type', 'application/json')
        if (JSON.parse(result.body).error !== null) {
            requestJustLogs(response, requestedChannel, requestedLimit)
        } else {
            response.send(result.rawBody)
        }
    }).catch(() => {
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
            "info": "JusLogs",
            "messages": recentMessages
        })
    }).catch(() => response.sendStatus(500))
}


function convertIRCMessage(ircMsg: string) {
    let regexTmiTS = /tmi-sent-ts=(\d+)/
    let regexInsertRMTags = /(.+flags=;)(id=.+mod=.+returning-chatter=.;)/

    let tmiTS = regexTmiTS.exec(ircMsg)?.[1]

    return ircMsg.replace(regexInsertRMTags, `$1historical=1;$2rm-received-ts=${tmiTS};$3`)
}

function getAvailableRecentMSG() {
    let lastDown = require('./last-down.json')
    for (const instance of config.recentMsgInstance) {
        got(`${instance}/api/v2/recent-messages/forsen?limit=1`).json<RecentMessages>().then(result => {
            if (result.error !== null) {
                console.error(`${instance} went down`)
                lastDown[instance] = new Date().toISOString()
                fs.writeFileSync('./last-down.json', JSON.stringify(lastDown, null, 4))
            }
        }).catch(() => {
            console.error(`${instance} went down`)
            lastDown[instance] = new Date().toISOString()
            fs.writeFileSync('./last-down.json', JSON.stringify(lastDown, null, 4))
        })
    }
}

function getAvailableChannels() {
    got(`${config.justlogsInstance}/channels`).json<string[]>().then(channels => loggedChannels = channels)
}

interface RecentMessages {
    error: string
    error_code: string
    messages: string[]
}


function checkCorrectConfig() {
    if (!config.port || typeof config.port !== 'number') {
        console.error('no port specified')
        process.exit(1)
    }
    if (!config.recentMsgInstance || !Array.isArray(config.recentMsgInstance)) {
        console.error('no recent-messages instance specified')
        process.exit(1)
    }
    if (!config.recentMsgJustLogsInstance || typeof config.recentMsgJustLogsInstance !== 'string') {
        console.error('no recent-messages instance specified')
        process.exit(1)
    }
    if (!config.justlogsInstance || typeof config.justlogsInstance !== 'string') {
        console.error('no justlogs instance specified')
        process.exit(1)
    }
    if (!lastRecordedRMDowntime || typeof lastRecordedRMDowntime !== 'object') {
        console.error('last-down.json not correct')
        process.exit(1)
    }
}