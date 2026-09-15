import './telemetry'
import { resolve } from 'node:path'
import { createApp } from './app'
import { createKeyVaultReadinessCheck } from './keyVault'

const port = Number(process.env.PORT ?? 3001)
const app = createApp({
  readinessCheck: createKeyVaultReadinessCheck(),
  staticDirectory: resolve(process.cwd(), 'dist'),
})

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`sdusi-analyzer-app listening on port ${port}`)
})

const shutdown = (signal: string) => {
  console.log(`Received ${signal}; shutting down.`)
  server.close((error) => {
    if (error) {
      console.error('Failed to close HTTP server', error)
      process.exitCode = 1
    }
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
