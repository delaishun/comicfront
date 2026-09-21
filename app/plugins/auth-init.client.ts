// app/plugins/auth-init.client.ts

//页面刚打开时怎么用 token 换回用户信息

import type { AuthUser, MeResponse } from '~/types/auth'

export default defineNuxtPlugin(() => {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const token = useCookie<string | null>('token')

  // 没有 token 就没必要请求
  if (!token.value) return

  // 已经通过其他地方恢复过（比如 SSR），不重复请求
  if (user.value) return

  const config = useRuntimeConfig()

  // 不 await，让请求在后台跑，不阻塞页面渲染
  $fetch<MeResponse>('/api/auth/me', {
    baseURL: config.public.apiBase,
    headers: {
      Authorization: `Bearer ${token.value}`,
    },
  })
    .then((res) => {
      if (res?.user) {
        user.value = res.user
      } else {
        // 后端返回 user: null，token 已失效
        token.value = null
      }
    })
    .catch(() => {
      // 网络错误或 401 → 清掉本地 token
      token.value = null
    })
})