// plugins/api.ts
export default defineNuxtPlugin(() => {
  const token = useCookie('token')
  return {
    provide: {
      api: $fetch.create({
        baseURL: useRuntimeConfig().public.apiBase,
        onRequest({ options }) {
          if (token.value) {
            const headers = new Headers(options.headers)
            headers.set('Authorization', `Bearer ${token.value}`)
            options.headers = headers
          }
        },
      }),
    },
  }
})