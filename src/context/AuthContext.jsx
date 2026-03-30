import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { profileAPI } from '../lib/api'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const hydrate = async (authUser) => {
    if (!authUser) return null
    try {
      const profile = await profileAPI.get(authUser.id)
      return { ...authUser, ...profile }
    } catch { return authUser }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(await hydrate(session?.user ?? null))
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      setUser(await hydrate(session?.user ?? null))
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const login = async (creds) => {
    const { data, error } = await supabase.auth.signInWithPassword(creds)
    if (error) throw error
    const merged = await hydrate(data.user)
    setUser(merged)
    return merged
  }

  const register = async ({ name, email, password, phone, role, skills = [] }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { 
        data: { name, phone, role, skills },
        emailRedirectTo: window.location.origin
      }
    })
    if (error) throw error
    await new Promise(r => setTimeout(r, 800))
    const merged = await hydrate(data.user)
    setUser(merged)
    return merged
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <Ctx.Provider value={{
      user, loading, login, register, logout,
      isWorker: user?.role === 'worker',
      isEmployer: user?.role === 'employer',
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
