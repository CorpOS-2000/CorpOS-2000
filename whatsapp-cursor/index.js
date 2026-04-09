// index.js
import * as baileys from '@dannteam/baileys'
import P from 'pino'

// ---------------------------
// 1️⃣ Cursor API Key
// ---------------------------
const CURSOR_API_KEY = 'crsr_b1df87a9aa2c961950efbda86b0c5471fde19f3d077a4297b59312b307f193e0'

// ---------------------------
// 2️⃣ WhatsApp Auth State
// ---------------------------
const { state, saveState } = baileys.useSingleFileAuthState('./auth_info.json')

// ---------------------------
// 3️⃣ Start Bot
// ---------------------------
async function startBot() {
  const sock = baileys.makeWASocket({
    printQRInTerminal: true,
    auth: state,
    logger: P({ level: 'info' })
  })

  // Save auth state when it updates
  sock.ev.on('creds.update', saveState)

  // Listen for connection updates
  sock.ev.on('connection.update', (update) => {
    console.log(update)
    if (update.qr) {
      console.log('Scan this QR code with your WhatsApp app:')
      console.log(update.qr)
    }
    if (update.connection === 'open') {
      console.log('✅ Connected to WhatsApp!')
    }
    if (update.connection === 'close') {
      console.log('❌ Connection closed, retrying...')
      startBot() // retry automatically
    }
  })

  // Example: Listen for messages
  sock.ev.on('messages.upsert', async (m) => {
    console.log('Received message:', JSON.stringify(m, null, 2))
    try {
      const msg = m.messages[0]
      if (!msg.key.fromMe) {
        await sock.sendMessage(msg.key.remoteJid, { text: `Cursor bot received your message!` })
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  })
}

// ---------------------------
// 4️⃣ Run Bot
// ---------------------------
startBot()