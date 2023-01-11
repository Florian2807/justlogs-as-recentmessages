import http from 'http'
import got from 'got'
import express, {Express} from 'express';
import fs from 'fs';

const config = require('./config.json')
const lastRecordedRMDowntime: { [key: string]: string | null } = require('./last-down.json')

checkCorrectConfig();
let lastPingDown: lastPingDown = {}
config.recentMsgInstance.forEach((instance: string) => {
    lastPingDown[instance] = false
})

config.recentMsgInstance.forEach((instance: string) => {
    if (lastRecordedRMDowntime[instance] === undefined) {

        console.log(`${getDate()} ${instance} has been added to last-down.json`)
        lastRecordedRMDowntime[instance] = null
        fs.writeFileSync('./last-down.json', JSON.stringify(lastRecordedRMDowntime, null, 4))
    }
})

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
    console.log(`${getDate()} listening on port ${config.port}`)
})

app.get('/status/', (_, response) => {
    const {usefulInstance, instanceStatus} = getUsefulInstance()
    let output: object[] = []
    Object.keys(instanceStatus).forEach(instance => {
        output.push({
            "instance": instance,
            "lastDown": lastRMDowntime[instance].toISOString(),
            "last24Hours": instanceStatus[instance]
        })
    })

    response.send({"instances": output, "usedInstance": usefulInstance.length > 0 ? usefulInstance : "JustLogs"})
})

app.get('/api/v2/recent-messages/:channel/', (request, response) => {

    const {usefulInstance, instanceStatus} = getUsefulInstance()
    const requestedChannel = request.params.channel
    const requestedLimit = parseInt(request.query.limit as string) || 800
    if (request.query.justlogs) {
        return requestJustLogs(response, requestedChannel, requestedLimit)
    } else if (request.query.recentmsg) {
        return requestRecentMSG(response, requestedChannel, requestedLimit, usefulInstance)
    }

    const isLogged = loggedChannels.includes(requestedChannel)
    if (isLogged && (instanceStatus[usefulInstance] || !usefulInstance)) {
        console.log(`${getDate()} requesting JustLogs for ${requestedChannel} isLogged: ${isLogged} wasDown: ${instanceStatus[usefulInstance] ?? true}`)
        requestJustLogs(response, requestedChannel, requestedLimit)
    } else {
        console.log(`${getDate()} requesting ${usefulInstance ?? config.recentMsgInstance[0]} for ${requestedChannel} NoLogs: ${!isLogged} wasDown: ${instanceStatus[usefulInstance] ?? true}`)
        requestRecentMSG(response, requestedChannel, requestedLimit, usefulInstance ?? config.recentMsgInstance[0])
    }
})


function requestRecentMSG(response: any, requestedChannel: string, requestedLimit: number, instance: string) {
    const recentMessages = `${instance}/api/v2/recent-messages/${requestedChannel}?limit=${requestedLimit}`

    got(recentMessages).then(result => {
        response.header('content-type', 'application/json')
        response.send(result.rawBody)
    }).catch(() => {
        console.log(`${getDate()} recent-messages request failed`)
        response.send({
            "messages": [],
            "error": "The bot is currently not joined to this channel (in progress or failed previously)",
            "error_code": "channel_not_joined"
        })
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
            "error": result.error,
            "error_code": result.error_code,
            "info": "JustLogs",
            "messages": recentMessages
        })
    }).catch(() => {
        requestRecentMSG(response, requestedChannel, requestedLimit, config.recentMsgInstance[0])
    })
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
                    if (!lastPingDown[instance]) {
                        console.warn(`${getDate()} ${instance} went down`)
                        lastPingDown[instance] = true
                    }
                    lastDown[instance] = new Date().toISOString()
                    lastRMDowntime[instance] = new Date()
                    fs.writeFileSync('./last-down.json', JSON.stringify(lastDown, null, 4))
                } else {
                    lastPingDown[instance] = false // not down
                }
            }
        ).catch(() => {
            if (!lastPingDown[instance]) {
                console.warn(`${getDate()} ${instance} went down`)
                lastPingDown[instance] = true
            }
            lastDown[instance] = new Date().toISOString()
            lastRMDowntime[instance] = new Date()
            fs.writeFileSync('./last-down.json', JSON.stringify(lastDown, null, 4))
        })
    }
}

function getAvailableChannels() {
    got(`${config.justlogsInstance}/channels`).json<Channels>().then(result => loggedChannels = result.channels.map(c => c.name))
}

interface Channels {
    channels: Channel[]
}

interface Channel {
    userID: string
    name: string
}

interface RecentMessages {
    error: string
    error_code: string
    messages: string[]
}

interface lastPingDown {
    [key: string]: Boolean
}


function getUsefulInstance() {
    let instanceStatus: { [key: string]: boolean } = {}
    let usefulInstance: string | null = ""
    for (const instance of config.recentMsgInstance) {
        const timeSinceLastDowntime = Date.now() - lastRMDowntime[instance]?.getTime() || 0
        const hoursSinceLastDowntime = timeSinceLastDowntime / 1000 / 60 / 60
        instanceStatus[instance] = hoursSinceLastDowntime < 24 // true means instance has downtime
    }
    for (let i = Object.keys(instanceStatus)?.length; i > 0; i--) {
        const instance = instanceStatus[Object.keys(instanceStatus)[i - 1]]
        if (!instance) {
            usefulInstance = Object.keys(instanceStatus)[i - 1]
        }
    }
    return {usefulInstance, instanceStatus}
}


function checkCorrectConfig() {
    if (!config.port || typeof config.port !== 'number') {
        console.error(`${getDate()} no port specified`)
        process.exit(1)
    }
    if (!config.recentMsgInstance || !Array.isArray(config.recentMsgInstance)) {
        console.error(`${getDate()} no recent-messages instance specified`)
        process.exit(1)
    }
    if (!config.recentMsgJustLogsInstance || typeof config.recentMsgJustLogsInstance !== 'string') {
        console.error(`${getDate()} no recent-messages instance specified`)
        process.exit(1)
    }
    if (!config.justlogsInstance || typeof config.justlogsInstance !== 'string') {
        console.error(`${getDate()} no justlogs instance specified`)
        process.exit(1)
    }
    if (!lastRecordedRMDowntime || typeof lastRecordedRMDowntime !== 'object') {
        console.error(`${getDate()} last-down.json not correct`)
        process.exit(1)
    }
}

function getDate() {
    return `${(new Intl.DateTimeFormat("de-de", {
        dateStyle: "medium",
        timeStyle: "medium",
    }).format(new Date()))}:`
}