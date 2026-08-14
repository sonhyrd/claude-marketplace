// The ?token= bootstrap is DEV-GUARDED. `import.meta.dev` is a build-time constant the production
// build folds to false, so this rung does not exist in the artifact under proof: the parameter is
// never consumed and never stripped. The live rung is the server-set cookie minted by
// server/api/auth-login.post.ts -- API-login and reuse the Set-Cookie it returns.
export function useAuth() {
  const route = useRoute()

  async function bootstrap() {
    if (import.meta.dev && route.query.token) {
      setToken(String(route.query.token))
      return await getCurrentUser()
    }
    return null
  }

  return { bootstrap }
}
