export function useAuth() {
  const route = useRoute()
  const session = useCookie('app_session')

  async function bootstrap() {
    if (import.meta.dev && route.query.token) {
      session.value = String(route.query.token)
      return await $fetch('/api/me')
    }
    return null
  }

  return { bootstrap }
}
