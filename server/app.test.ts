import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '../src/analyzer/types'
import { createApp } from './app'
import { BicepCompilationError } from './bicepCompiler'

const analysisResult: AnalysisResult = {
  score: 100,
  status: 'Ready for Protection',
  findings: [],
  categories: [],
  compilation: {
    status: 'succeeded',
    entrypoint: 'main.bicep',
    fileCount: 1,
    resourceCount: 4,
    diagnostics: [],
  },
}

const createTestApp = (
  analyzer = vi.fn(async () => analysisResult),
) => ({
  analyzer,
  app: createApp({
    readinessCheck: async () => ({ status: 'available' }),
    analyzer,
  }),
})

describe('API', () => {
  it('reports liveness', async () => {
    const { app } = createTestApp()
    const response = await request(app).get('/api/health').expect(200)
    expect(response.body.status).toBe('ok')
    expect(response.body.service).toBe('sdusi-analyzer-app')
  })

  it('reports Key Vault readiness without exposing values', async () => {
    const { app } = createTestApp()
    const response = await request(app).get('/api/ready').expect(200)
    expect(response.body).toEqual({
      status: 'ready',
      dependencies: { keyVault: { status: 'available' } },
    })
  })

  it('returns serializable rule metadata', async () => {
    const { app } = createTestApp()
    const response = await request(app).get('/api/rules').expect(200)
    expect(response.body).toHaveLength(10)
    expect(response.body[0]).not.toHaveProperty('evaluate')
  })

  it('supports the backward-compatible single-source request', async () => {
    const { app, analyzer } = createTestApp()
    const response = await request(app)
      .post('/api/analyze')
      .send({ source: "targetScope = 'resourceGroup'" })
      .expect(200)

    expect(response.body.score).toBe(100)
    expect(analyzer).toHaveBeenCalledWith({
      entrypoint: 'main.bicep',
      files: { 'main.bicep': "targetScope = 'resourceGroup'" },
    })
  })

  it('supports a local multi-file Bicep project', async () => {
    const { app, analyzer } = createTestApp()
    await request(app)
      .post('/api/analyze')
      .send({
        entrypoint: 'main.bicep',
        files: {
          'main.bicep': "module child './modules/child.bicep' = { name: 'child' }",
          'modules/child.bicep': "targetScope = 'resourceGroup'",
        },
      })
      .expect(200)

    expect(analyzer).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: 'main.bicep',
        files: expect.objectContaining({
          'modules/child.bicep': expect.any(String),
        }),
      }),
    )
  })

  it('rejects parent-directory project paths', async () => {
    const { app } = createTestApp()
    await request(app)
      .post('/api/analyze')
      .send({
        entrypoint: '../main.bicep',
        files: { '../main.bicep': '' },
      })
      .expect(400)
  })

  it('rejects external registry module references', async () => {
    const { app } = createTestApp()
    await request(app)
      .post('/api/analyze')
      .send({
        entrypoint: 'main.bicep',
        files: {
          'main.bicep':
            "module remote 'br/public:avm/res/storage/storage-account:0.18.0' = { name: 'remote' }",
        },
      })
      .expect(400)
  })

  it('returns compiler diagnostics without internal errors', async () => {
    const analyzer = vi.fn(async () => {
      throw new BicepCompilationError('Bicep compilation failed.', [
        {
          file: 'main.bicep',
          line: 2,
          column: 3,
          level: 'error',
          code: 'BCP018',
          message: 'Expected a value.',
        },
      ])
    })
    const { app } = createTestApp(analyzer)
    const response = await request(app)
      .post('/api/analyze')
      .send({ source: 'invalid' })
      .expect(422)

    expect(response.body.diagnostics[0]).toMatchObject({ code: 'BCP018' })
  })

  it('returns 503 when Key Vault is unavailable', async () => {
    const app = createApp({
      readinessCheck: async () => ({ status: 'unavailable' }),
      analyzer: async () => analysisResult,
    })
    await request(app).get('/api/ready').expect(503)
  })
})
