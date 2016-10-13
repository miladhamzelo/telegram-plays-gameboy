import { readFileSync, writeFile } from 'fs'
import { join, basename } from 'path'
import { parse as parseUrl } from 'url'
import { parse as parseQuery } from 'querystring'
import { hostname } from 'os'
import { createServer } from 'http'
import { sync as glob } from 'glob'
import { sync as mkdirp } from 'mkdirp'
import { pack, unpack } from 'msgpack'
import express from 'express'
import { Server as WebSocketServer } from 'ws'
import TelegramBot from 'node-telegram-bot-api'
import Emulator from './lib/emulator'

// == CONFIG ==
const token = process.env['NODE_BOT_TOKEN']
if (!token) {
    console.error('NODE_BOT_TOKEN not found on environment variables')
    process.exit(1)
}

const host = process.env['NODE_HOSTNAME'] || hostname()
console.log(`Host set to: ${ host }`)

const romsPath = process.env['NODE_ROMS_PATH'] || './roms'
console.log(`Roms directory set to: ${ romsPath }`)
mkdirp(romsPath) // Create directory if doesn't exist

// == EMULATORS ==
const roms = glob(join(romsPath, '*.gbc'), { absolute: true })
console.log(`found ${ roms.length } roms, setting up emulators`)

// Setup emulators hash for its usage by the app later
const emulators = roms.reduce((emulators, romPath) => {
    const romName = basename(romPath, '.gbc')
    const saves = glob(join(romsPath, `${romName}-*.sav`)).sort()

    // Load rom or state depending of whats available
    const emu = Emulator()
    if (saves.length > 0) {
        console.log(`found save state for ${ romName }, loading it.`)
        const state = unpack(readFileSync(saves.pop())) // Take the latest available
        emu.initWithState(state)
    } else {
        console.log(`didn't found a save state for ${ romName }, starting rom from scracth`)
        const rom = readFileSync(romPath)
        emu.initWithRom(rom)
    }

    // Periodically save a state of the game
    setInterval(() => {
        const snapshot = emu.snapshot()
        if (snapshot) {
            const stateFilename = join(romsPath, `${ romName }-${ Date.now() }.sav`)
            console.log(`saving state for ${ romName } to file ${ basename(stateFilename) }`)
            const state = pack(snapshot)
            writeFile(stateFilename, state, (err) => { if (err) throw err })
        }
    }, 60000)

    // Start the emulator for this rom
    emu.run()

    // Set the emulator on the hash
    emulators[romName] = emu
    return emulators
}, {})

// Store last frames emited by each emulator for client initialization
let lastFrames = {}
Object.keys(emulators).forEach(game => {
    emulators[game].on('frame', frame => lastFrames[game] = frame)
})

// == WEB SERVER ==

// Setup game server
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

// Helper function for broadcasting current client count to all clients
function wssBroadcastClientCount() {
    wss.clients.forEach(client => client.send(String(wss.clients.length)))
}

wss.on('connection', (ws) => {
    const url = ws.upgradeReq.url
    const query = parseUrl(url).query
    const queryParams = parseQuery(query)
    const game = queryParams.game
    const emu = emulators[game]

    if (emu) {
        // Send last frame if available (useful when static images)
        if (lastFrames[game]) ws.send(lastFrames[game])
        wssBroadcastClientCount()
        const sendFrame = (frame => ws.send(frame))
        emu.on('frame', sendFrame)
        ws.on('message', key => emu.move(key))
        ws.on('close', () => {
            emu.removeListener('frame', sendFrame)
            wssBroadcastClientCount()
        })
    } else {
        console.error(`Couldn't find game ${ game }`)
    }
})

app.use(express.static(__dirname + '/public'))

server.listen(3000, err => {
    if (err)
        console.error(err)
})

// == TELEGRAM BOT ==
const games = roms.map(rom => basename(rom, '.gbc'))
const bot = new TelegramBot(token, { polling: true })

// Send all available games on each request
bot.on('inline_query', msg => {
    const result = games.map(game => (
        {
            id: String(Date.now()),
            type: 'game',
            game_short_name: game
        }
    ))
    bot.answerInlineQuery(msg.id, result)
})

// Send individual game urls
bot.on('callback_query', msg => {
    const url = `http://${ host }/?game=${ msg.game_short_name }`
    bot.answerCallbackQuery(msg.id, '', false, { url })
})
