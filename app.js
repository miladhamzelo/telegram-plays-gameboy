import { createServer } from 'http'
import { readFileSync } from 'fs'
import express from 'express'
import { Server as WebSocketServer } from 'ws'
import emulator from './lib/emulator'

const rom = readFileSync(process.env['NODE_ROM'])
const emu = emulator(rom)
emu.initWithRom(rom)

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server: server })
let lastFrame = null

function wssBroadcast(data) {
	wss.clients.forEach(client => client.send(data))
}

app.use(express.static(__dirname + '/public'))
emu.on('frame', frame => {
	lastFrame = frame
	wssBroadcast(frame)
})

wss.on('connection', (ws) => {
	if (lastFrame) ws.send(lastFrame)
	wssBroadcast(wss.clients.length + '')
	ws.on('message', msg => {
		console.log("msg: " + msg)
		emu.move(msg)
	})
	ws.on('close', () => wssBroadcast(wss.clients.length + ''	))
})

server.listen(3000, (err) => {
	console.error(err)
	emu.run()
})