import React, { createContext, useContext, useState, useEffect } from 'react'
import { loginStaff, getCurrentStaffUser, type StaffUser } from '../services/api'

interface AuthContextType {
  token: string | null
  user: StaffUser | null
  isLoading: boolean
  error: string | null
  login: (email: string, pass: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'saarthi_staff_token'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<StaffUser | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) {
      getCurrentStaffUser(token)
        .then(u => {
          setUser(u)
          setIsLoading(false)
        })
        .catch(() => {
          // Token expired or invalid
          setToken(null)
          setUser(null)
          localStorage.removeItem(TOKEN_KEY)
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [token])

  const login = async (email: string, pass: string) => {
    setError(null)
    setIsLoading(true)
    try {
      const res = await loginStaff(email, pass)
      setToken(res.access_token)
      localStorage.setItem(TOKEN_KEY, res.access_token)
      const u = await getCurrentStaffUser(res.access_token)
      setUser(u)
      setIsLoading(false)
    } catch (err: any) {
      setError(err.message || 'Login failed')
      setIsLoading(false)
      throw err
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem(TOKEN_KEY)
  }

  return (
    <AuthContext.Provider value={{ token, user, isLoading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
