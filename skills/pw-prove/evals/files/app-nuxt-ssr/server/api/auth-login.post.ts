// Sets the session cookie server-side. The cookie VALUE is minted here, so a test
// must API-login and reuse the Set-Cookie it returns rather than hand-authoring one.
export default defineEventHandler(async (event) => {
  const { email } = await readBody(event)
  setCookie(event, 'app_session', await mintSession(email), { httpOnly: true, sameSite: 'lax' })
  return { ok: true }
})
