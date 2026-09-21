// app/types/auth.ts

export interface AuthUser {
  id: number
  handle: string
  displayName: string
  email: string
  avatarUrl: string | null
}

/** 登录 / 注册接口返回结构 */
export interface AuthResponse {
  token: string
  user: AuthUser
}

/** /api/auth/me 返回结构（未登录时 user 为 null） */
export interface MeResponse {
  user: AuthUser | null
}