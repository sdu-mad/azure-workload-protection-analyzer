import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

const app = createApp({
  readinessCheck: async () => ({ status: 'available' }),
})

describe('API', () => {
  it('reports liveness', async () => {
    const response = await request(app).get('/api/health').expect(200)
    expect(response.body.status).toBe('ok')
    expect(response.body.service).toBe('sdusi-analyzer-app')
  })

  it('reports Key Vault readiness without exposing values', async () => {
    const response = await request(app).get('/api/ready').expect(200)
    expect(response.body).toEqual({
      status: 'ready',
      dependencies: { keyVault: { status: 'available' } },
    })
  })

  it('returns serializable rule metadata', async () => {
    const response = await request(app).get('/api/rules').expect(200)
    expect(response.body).toHaveLength(6)
    expect(response.body[0]).not.toHaveProperty('evaluate')
  })

  it('analyzes Bicep source', async () => {
    const response = await request(app)
      .post('/api/analyze')
      .send({
        source: [
          "identity: { type: 'SystemAssigned' }",
          'adminUserEnabled: false',
          "resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {}",
          'external: false',
          "resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {}",
        ].join('\n'),
      })
      .expect(200)

    expect(response.body.score).toBe(100)
  })

  it('rejects empty source', async () => {
    const response = await request(app)
      .post('/api/analyze')
      .send({ source: '' })
      .expect(400)

    expect(response.body.error).toBe('Invalid analysis request.')
  })

  it('rejects oversized source', async () => {
    await request(app)
      .post('/api/analyze')
      .send({ source: 'a'.repeat(200_001) })
      .expect(400)
  })

  it('returns 503 when Key Vault is unavailable', async () => {
    const unavailableApp = createApp({
      readinessCheck: async () => ({ status: 'unavailable' }),
    })
    await request(unavailableApp).get('/api/ready').expect(503)
  })
})
