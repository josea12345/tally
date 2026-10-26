import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { isPlaceholderUsername } from '../lib/format'

interface AuthCtx {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  needsOnboarding: boolean
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  configured: boolean
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[tally] profile fetch failed', error.message)
      setProfile(null)
      return
    }
    setProfile((data as Profile | null) ?? null)
  }

  useEffect(() => {
    let mounted = true
    const init = async () => {
      if (!isSupabaseConfigured) {
        setLoading(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) await fetchProfile(data.session.user.id)
      setLoading(false)
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, sess) => {
      if (!mounted) return
      setSession(sess)
      setUser(sess?.user ?? null)
      if (sess?.user) await fetchProfile(sess.user.id)
      else setProfile(null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signUp = async (email: string, password: string) => {
    // Send confirmation links back to THIS app explicitly — never rely on
    // the project's default Site URL (a fresh project points at localhost,
    // which stranded new users on an unknown page after signup).
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    return { error: error ? error.message : null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  const needsOnboarding = !!user && !!profile && isPlaceholderUsername(profile.username)

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        profile,
        loading,
        needsOnboarding,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        configured: isSupabaseConfigured,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside provider')
  return c
}
