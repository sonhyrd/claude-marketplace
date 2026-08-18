// The ?token= bootstrap is DEV-GUARDED: __DEV__ folds to false in the production
// bundle, so this rung does not exist in the built artifact under proof.
import { setToken, getCurrentUser } from './auth-store'

export function bootstrapSession(url: URL) {
  if (__DEV__) {
    const token = url.searchParams.get('token')
    if (token) {
      setToken(token)
      return getCurrentUser()
    }
  }
  return null
}
