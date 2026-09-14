import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { analyzeBicep } from '../src/analyzer/analyze'
import { ruleCatalog } from '../src/analyzer/rules'
import type { KeyVaultReadiness } from './keyVault'

const MAX_BICEP_LENGTH = 200_000

const analyzeRequest = z.object({
  source: z
    .string()
    .min(1, 'Bicep source is required.')
    .max(
      MAX_BICEP_LENGTH,
      `Bicep source must not exceed ${MAX_BICEP_LENGTH} characters.`,
    ),
})

interface AppOptions {
  readinessCheck: () => Promise<KeyVaultReadiness>
  staticDirectory?: string
}

export const createApp = ({
  readinessCheck,
  staticDirectory,
}: AppOptions) => {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '256kb', type: 'application/json' }))

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'sdusi-analyzer-app',
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/api/ready', async (_request, response) => {
    const keyVault = await readinessCheck()
    const ready = keyVault.status !== 'unavailable'

    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not-ready',
      dependencies: { keyVault },
    })
  })

  app.get('/api/rules', (_request, response) => {
    response.json(ruleCatalog)
  })

  app.post(
    '/api/analyze',
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many analysis requests. Try again shortly.' },
    }),
    (request, response) => {
      const parsed = analyzeRequest.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({
          error: 'Invalid analysis request.',
          issues: parsed.error.issues.map((issue) => issue.message),
        })
        return
      }

      response.json(analyzeBicep(parsed.data.source))
    },
  )

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API endpoint not found.' })
  })

  if (staticDirectory && existsSync(staticDirectory)) {
    app.use(express.static(staticDirectory, { index: false }))
    app.use(((request, response, next) => {
      if (request.method !== 'GET' || !request.accepts('html')) {
        next()
        return
      }

      response.sendFile(resolve(staticDirectory, 'index.html'))
    }) satisfies RequestHandler)
  }

  app.use(((error, _request, response, _next) => {
    void _next
    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      response.status(413).json({ error: 'Request body is too large.' })
      return
    }

    if (error instanceof SyntaxError) {
      response.status(400).json({ error: 'Request body must be valid JSON.' })
      return
    }

    console.error('Unhandled API error', error)
    response.status(500).json({ error: 'An unexpected server error occurred.' })
  }) satisfies ErrorRequestHandler)

  return app
}
