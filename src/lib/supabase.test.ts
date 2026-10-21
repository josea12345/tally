import { describe, expect, it } from 'vitest'
import { validateSupabaseConfig } from './supabase'

const GOOD_URL = 'https://jbeljczivhiwkuylfvdf.supabase.co'
const GOOD_KEY = 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxxxxxx'

describe('validateSupabaseConfig — app initialization paths', () => {
  it('accepts a well-formed config', () => {
    expect(validateSupabaseConfig(GOOD_URL, GOOD_KEY)).toBeNull()
    expect(validateSupabaseConfig('http://localhost:54321', GOOD_KEY)).toBeNull()
  })

  it('rejects missing values with a specific message (previously crashed at import)', () => {
    expect(validateSupabaseConfig(undefined, GOOD_KEY)).toMatch(/VITE_SUPABASE_URL is missing/)
    expect(validateSupabaseConfig('', GOOD_KEY)).toMatch(/VITE_SUPABASE_URL is missing/)
    expect(validateSupabaseConfig('   ', GOOD_KEY)).toMatch(/VITE_SUPABASE_URL is missing/)
    expect(validateSupabaseConfig(GOOD_URL, undefined)).toMatch(/VITE_SUPABASE_ANON_KEY is missing/)
    expect(validateSupabaseConfig(GOOD_URL, '')).toMatch(/VITE_SUPABASE_ANON_KEY is missing/)
  })

  it('rejects malformed URLs', () => {
    expect(validateSupabaseConfig('not-a-url', GOOD_KEY)).toMatch(/not a valid URL/)
    expect(validateSupabaseConfig('ftp://example.com', GOOD_KEY)).toMatch(/http\(s\)/)
    expect(validateSupabaseConfig('://missing-scheme', GOOD_KEY)).toMatch(/not a valid URL/)
  })

  it('rejects implausibly short keys', () => {
    expect(validateSupabaseConfig(GOOD_URL, 'short')).toMatch(/too short/)
  })
})

describe('supabase module initialization', () => {
  it('imports without throwing regardless of env state', async () => {
    const mod = await import('./supabase')
    expect(mod.supabase).toBeTruthy()
    expect(typeof mod.isSupabaseConfigured).toBe('boolean')
    // error and flag always agree
    expect(mod.supabaseConfigError === null).toBe(mod.isSupabaseConfigured)
  })
})
