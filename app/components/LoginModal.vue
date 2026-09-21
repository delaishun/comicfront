<script setup lang="ts">
import type { AuthUser, AuthResponse } from '~/types/auth'

interface LoginResponse {
  token: string
  user: AuthUser
}

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
}>()

// 让组件支持 v-model
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

type Mode = 'login' | 'register'
const mode = ref<Mode>('login')

const form = reactive({
  email: '',
  password: '',
  confirmPassword: '',
})

const errors = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  global: '',            // 新增：全局错误提示（邮箱/密码错误之类）
})

const loading = ref(false)

function resetErrors() {
  errors.email = ''
  errors.password = ''
  errors.confirmPassword = ''
  errors.global = ''
}

function resetForm() {
  form.email = ''
  form.password = ''
  form.confirmPassword = ''
  resetErrors()
}

function switchMode(m: Mode) {
  if (mode.value === m) return
  mode.value = m
  form.confirmPassword = ''
  resetErrors()
}

function validate(): boolean {
  resetErrors()
  let ok = true

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!form.email) {
    errors.email = '请输入邮箱'
    ok = false
  } else if (!emailRe.test(form.email)) {
    errors.email = '邮箱格式不正确'
    ok = false
  }

  if (!form.password) {
    errors.password = '请输入密码'
    ok = false
  } else if (form.password.length < 6) {
    errors.password = '密码至少 6 位'
    ok = false
  }

  if (mode.value === 'register') {
    if (!form.confirmPassword) {
      errors.confirmPassword = '请再次输入密码'
      ok = false
    } else if (form.confirmPassword !== form.password) {
      errors.confirmPassword = '两次输入的密码不一致'
      ok = false
    }
  }

  return ok
}

/**
 * 登录 / 注册成功后统一处理：
 * 1. 把 token 写入 cookie（useCookie 会同时在 SSR / 客户端可用）
 * 2. 把 user 写入全局状态，header 立刻切换成头像
 * 3. 关闭弹窗、重置表单
 */
function applyAuthResult(res: LoginResponse) {
  const token = useCookie<string | null>('token', {
    maxAge: 60 * 60 * 24 * 7,   // 7 天，与后端 JWT 过期时间保持一致
    sameSite: 'lax',
    path: '/',
    // 线上用 HTTPS 时改成 secure: true
    secure: process.env.NODE_ENV === 'production',
  })
  token.value = res.token

  const user = useState<AuthUser | null>('auth:user', () => null)
  user.value = res.user

  emit('success')
  visible.value = false
}

async function handleSubmit() {
  if (loading.value) return
  if (!validate()) return

  loading.value = true
  errors.global = ''

  try {
    const { $api } = useNuxtApp()

    if (mode.value === 'login') {
      const res = await $api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: {
          email: form.email,
          password: form.password,
        },
      })
      applyAuthResult(res)
    } else {
      const res = await $api<LoginResponse>('/api/auth/register', {
        method: 'POST',
        body: {
          email: form.email,
          password: form.password,
        },
      })
      applyAuthResult(res)
    }
  } catch (err: any) {
    // Fastify 的错误返回一般是 { error: string } 或 { message: string }
    const msg =
      err?.data?.error ||
      err?.data?.message ||
      err?.message ||
      '操作失败，请稍后重试'
    errors.global = msg
  } finally {
    loading.value = false
  }
}

// 弹窗关闭后重置表单
watch(visible, (v) => {
  if (!v) {
    resetForm()
    mode.value = 'login'
  }
})
</script>

<template>
  <van-popup
    v-model:show="visible"
    round
    :style="{ width: '92%', maxWidth: '400px' }"
    :close-on-click-overlay="!loading"
  >
    <div class="auth">
      <!-- 标题 -->
      <header class="auth__header">
        <h2 class="auth__title">
          {{ mode === 'login' ? 'Welcome back' : 'Create account' }}
        </h2>
        <p class="auth__subtitle">
          {{
            mode === 'login'
              ? '登录你的 Inkwell 账号'
              : '注册一个新的 Inkwell 账号'
          }}
        </p>
      </header>

      <!-- 表单 -->
      <form class="auth__form" @submit.prevent="handleSubmit">
        <div class="field">
          <label class="field__label" for="auth-email">邮箱</label>
          <input
            id="auth-email"
            v-model.trim="form.email"
            type="email"
            class="input"
            placeholder="you@example.com"
            autocomplete="email"
            :disabled="loading"
          >
          <span v-if="errors.email" class="field__error">{{ errors.email }}</span>
        </div>

        <div class="field">
          <label class="field__label" for="auth-password">密码</label>
          <input
            id="auth-password"
            v-model="form.password"
            type="password"
            class="input"
            placeholder="至少 6 位"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            :disabled="loading"
          >
          <span v-if="errors.password" class="field__error">{{ errors.password }}</span>
        </div>

        <div v-if="mode === 'register'" class="field">
          <label class="field__label" for="auth-confirm">确认密码</label>
          <input
            id="auth-confirm"
            v-model="form.confirmPassword"
            type="password"
            class="input"
            placeholder="请再次输入密码"
            autocomplete="new-password"
            :disabled="loading"
          >
          <span v-if="errors.confirmPassword" class="field__error">
            {{ errors.confirmPassword }}
          </span>
        </div>

        <!-- 新增：全局错误提示 -->
        <p v-if="errors.global" class="auth__error">
          {{ errors.global }}
        </p>

        <button
          type="submit"
          class="btn btn--primary btn--block auth__submit"
          :disabled="loading"
        >
          {{ loading ? '处理中…' : (mode === 'login' ? 'Login' : 'Register') }}
        </button>
      </form>

      <!-- 模式切换 -->
      <footer class="auth__footer">
        <template v-if="mode === 'login'">
          <span>还没有账号？</span>
          <a href="javascript:;" @click="switchMode('register')">Register</a>
        </template>
        <template v-else>
          <span>已有账号？</span>
          <a href="javascript:;" @click="switchMode('login')">Login</a>
        </template>
      </footer>
    </div>
  </van-popup>
</template>

<style scoped lang="less">
.auth {
  padding: 28px 24px 20px;

  @media (max-width: 480px) {
    padding: 24px 18px 16px;
  }

  &__header {
    text-align: center;
    margin-bottom: 20px;
  }

  &__title {
    margin: 0 0 6px;
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 700;
    color: var(--ink-1);
    letter-spacing: -0.01em;
  }

  &__subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--ink-3);
  }

  &__form {
    margin-top: 4px;
  }

  &__error {
    margin: 4px 0 0;
    padding: 8px 10px;
    font-size: 13px;
    color: #c0392b;
    background: #fbe9e9;
    border-radius: var(--radius);
    line-height: 1.4;
  }

  &__submit {
    margin-top: 8px;
  }

  &__footer {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    text-align: center;
    font-size: 13px;
    color: var(--ink-3);

    a {
      margin-left: 6px;
      color: var(--accent);
      font-weight: 500;
      text-decoration: none;
      transition: color 0.15s ease;

      &:hover {
        color: var(--accent-hover);
        text-decoration: underline;
      }
    }
  }
}
</style>