// The store hydrates from TWO localStorage keys: a credential and the user record.
// Seeding only `auth.token` renders an authenticated but empty shell.
export const KEYS = { token: 'auth.token', user: 'auth.user' } as const

export function hydrate() {
  const token = localStorage.getItem(KEYS.token)
  const user = JSON.parse(localStorage.getItem(KEYS.user) ?? 'null')
  return { token, user }
}
export function setToken(t: string) { localStorage.setItem(KEYS.token, t) }
export async function getCurrentUser() { return fetch('/api/me').then(r => r.json()) }
