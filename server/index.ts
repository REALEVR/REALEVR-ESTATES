import express, { type Request, Response, NextFunction } from 'express'
import { registerRoutes } from './routes'
import { createTablesIfNotExist } from './dynamodb'
import { initCronJobs } from './cron/index'
import fs from 'fs'
import path from 'path'

// Create necessary directories for uploads
const uploadDir = path.join(process.cwd(), 'uploads')
const imageDir = path.join(uploadDir, 'images')
const tourDir = path.join(uploadDir, 'tours')

// Create directories if they don't exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir)
}
if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir)
}
if (!fs.existsSync(tourDir)) {
    fs.mkdirSync(tourDir)
}

const app = express()
app.use(express.json({ limit: '5gb' }))
app.use(express.urlencoded({ extended: true, limit: '5gb' }))

// Add CORS headers
app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin) {
        res.header('Access-Control-Allow-Origin', origin)
    }
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')

    if (req.method === 'OPTIONS') {
        return res.status(200).end()
    }
    next()
})

app.use((req, res, next) => {
    const start = Date.now()
    const path = req.path
    let capturedJsonResponse: Record<string, any> | undefined = undefined

    const originalResJson = res.json
    res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson
        return originalResJson.apply(res, [bodyJson, ...args])
    }

    res.on('finish', () => {
        const duration = Date.now() - start
        if (path.startsWith('/api')) {
            let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`
            if (capturedJsonResponse) {
                logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`
            }
            if (logLine.length > 80) {
                logLine = logLine.slice(0, 79) + '…'
            }
        }
    })
    next()
})
;(async () => {
    // Initialize DynamoDB tables before accepting any requests
    try {
        console.log('🔧 Initializing DynamoDB tables...')
        await createTablesIfNotExist()
        console.log('✅ DynamoDB tables ready')
    } catch (error) {
        console.error('❌ Failed to initialize DynamoDB tables:', error)
        process.exit(1)
    }

    const server = await registerRoutes(app)

    // Initialize cron jobs for automated reminders
    initCronJobs()

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500
        const message = err.message || 'Internal Server Error'
        res.status(status).json({ message })
        throw err
    })

    // Only import and use Vite dev server in development
    if (app.get('env') === 'development') {
        const { setupVite, log } = await import('./viteDevServer')
        await setupVite(app, server)
    } else {
        const { serveStatic } = await import('./vite')
        serveStatic(app)
    }

    try {
        const port = process.env.PORT || 5001
        const httpServer = app.listen(Number(port), '0.0.0.0', () => {
            console.log(`Server running at http://0.0.0.0:${port}`)
        })

        // Virtual tour ZIP exports go up to 5GB (see server/upload.ts's own
        // limit). Node has shipped a built-in requestTimeout since v18 -
        // 300000ms (5 minutes) by default - that forcibly destroys the
        // ENTIRE HTTP request once that clock runs out, even while bytes
        // are still actively arriving. A 5GB file on anything short of a
        // very fast connection routinely takes well past 5 minutes to
        // reach the server, so the request gets killed mid-transfer: the
        // browser's upload progress (see PropertyFormNew.tsx's "Uploading:
        // X%" badge) freezes right where the clock ran out, then the
        // connection drops and xhr.onerror fires with a bare "Upload
        // failed" - which is exactly what this looked like. Give large
        // tour uploads realistic headroom instead of Node's short default.
        httpServer.requestTimeout = 30 * 60 * 1000 // 30 minutes
        httpServer.headersTimeout = 30 * 60 * 1000
        httpServer.keepAliveTimeout = 30 * 60 * 1000
    } catch (error) {
        console.error('Failed to start server:', error)
        console.error(JSON.stringify(error, null, 2))
    }
})()
