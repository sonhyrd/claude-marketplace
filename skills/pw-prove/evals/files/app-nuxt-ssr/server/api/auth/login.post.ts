export default defineEventHandler(async (event) => {
  const { email } = await readBody(event)
  setCookie(event, 'app_session', await mintSession(email), { httpOnly: true, sameSite: 'lax' })
  return { ok: true }
})
