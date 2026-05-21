import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import punchcardRoutes from './routes/punchcard.js'
import fantasyRoutes from './routes/fantasy.js'
import adminRoutes from './routes/admin.js'
import publicRoutes from './routes/public.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 5000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/punchcard', punchcardRoutes)
app.use('/api/fantasy', fantasyRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/public', publicRoutes)

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`GAFL server running on port ${PORT}`)
})
