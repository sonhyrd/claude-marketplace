export default defineNuxtConfig({
  ssr: true,
  runtimeConfig: {
    sessionSecret: process.env.NUXT_SESSION_SECRET,
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE,
      tenantSlug: process.env.NUXT_PUBLIC_TENANT_SLUG,
    },
  },
})
