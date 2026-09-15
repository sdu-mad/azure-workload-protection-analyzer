import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import type {
  AnalysisResult,
  BicepProject,
} from '../src/analyzer/types'
import { ruleCatalog } from '../src/analyzer/rules'
import {
  analyzeBicepProject,
  BicepCompilationError,
} from './bicepCompiler'
import type { KeyVaultReadiness } from './keyVault'

const MAX_FILE_COUNT = 32
const MAX_FILE_LENGTH = 200_000
const MAX_PROJECT_LENGTH = 1_000_000
const allowedFilePath = /^[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:bicep|json)$/
const externalModuleReference =
  /\bmodule\s+[A-Za-z_][A-Za-z0-9_]*\s+['"](?:br:|br\/|ts:)/i

const filePath = z
  .string()
  .min(1)
  .max(240)
  .regex(allowedFilePath, 'Project paths must be relative .bicep or .json files.')
  .refine(
    (value) =>
      !value.includes('\\') &&
      !value.startsWith('/') &&
      !value.split('/').some((segment) => segment === '.' || segment === '..'),
    'Project paths must not contain absolute or parent-directory segments.',
  )

const sourceRequest = z.object({
  source: z
    .string()
    .min(1, 'Bicep source is required.')
    .max(
      MAX_FILE_LENGTH,
      `Bicep source must not exceed ${MAX_FILE_LENGTH} characters.`,
    ),
})

const projectRequest = z
  .object({
    entrypoint: filePath,
    files: z.record(filePath, z.string().max(MAX_FILE_LENGTH)),
  })
  .superRefine((value, context) => {
    const entries = Object.entries(value.files)
    if (entries.length === 0 || entries.length > MAX_FILE_COUNT) {
      context.addIssue({
        code: 'custom',
        message: `Projects must contain between 1 and ${MAX_FILE_COUNT} files.`,
      })
    }
    if (!(value.entrypoint in value.files)) {
      context.addIssue({
        code: 'custom',
        message: 'The entrypoint must exist in the files map.',
      })
    }
    const totalLength = entries.reduce(
      (total, [, contents]) => total + contents.length,
      0,
    )
    if (totalLength > MAX_PROJECT_LENGTH) {
      context.addIssue({
        code: 'custom',
        message: `Project source must not exceed ${MAX_PROJECT_LENGTH} characters.`,
      })
    }
    for (const [path, contents] of entries) {
      if (path.endsWith('.bicep') && externalModuleReference.test(contents)) {
        context.addIssue({
          code: 'custom',
          path: ['files', path],
          message:
            'External Bicep registry and template-spec modules are not allowed.',
        })
      }
    }
  })

const analyzeRequest = z.union([sourceRequest, projectRequest])

const toProject = (request: z.infer<typeof analyzeRequest>): BicepProject =>
  'source' in request
    ? { entrypoint: 'main.bicep', files: { 'main.bicep': request.source } }
    : request

interface AppOptions {
  readinessCheck: () => Promise<KeyVaultReadiness>
  staticDirectory?: string
  analyzer?: (project: BicepProject) => Promise<AnalysisResult>
}

export const createApp = ({
  readinessCheck,
  staticDirectory,
  analyzer = analyzeBicepProject,
}: AppOptions) => {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(express.json({ limit: '1100kb', type: 'application/json' }))

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
    async (request, response, next) => {
      const parsed = analyzeRequest.safeParse(request.body)
      if (!parsed.success) {
        response.status(400).json({
          error: 'Invalid analysis request.',
          issues: parsed.error.issues.map((issue) => issue.message),
        })
        return
      }

      try {
        response.json(await analyzer(toProject(parsed.data)))
      } catch (error) {
        if (error instanceof BicepCompilationError) {
          response.status(422).json({
            error: error.message,
            diagnostics: error.diagnostics,
          })
          return
        }
        next(error)
      }
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
