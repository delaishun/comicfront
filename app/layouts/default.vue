<script setup lang="ts">
import type { AuthUser } from '~/types/auth'

// 全局登录用户。登录成功后调用：
//   user.value = { id, handle, displayName, avatarUrl }
// 登出：user.value = null
const user = useState<AuthUser | null>('auth:user', () => null)

const isLoggedIn = computed(() => !!user.value)

// 新增一个控制弹窗的状态
const loginModalVisible = ref(false)

function handleLogin() {
  loginModalVisible.value = true
}
</script>

<template>
  <div class="layout-wrapper">
    <header class="site-header">
      <div class="container site-header__inner">
        <!-- 左：Logo -->
        <NuxtLink to="/" class="site-header__logo">61Comic</NuxtLink>

        <!-- 右：登录按钮 / 圆形头像 -->
        <div class="site-header__right">
          <van-button
            v-if="!isLoggedIn"
            type="primary"
            size="small"
            @click="handleLogin"
          >
            Login
          </van-button>

          <NuxtLink
            v-else
            :to="`/users/${user!.id}`"
            class="avatar"
            :title="user?.displayName"
            :aria-label="user?.displayName"
          >
            <img
              v-if="user?.avatarUrl"
              class="avatar__img"
              :src="user.avatarUrl"
              :alt="user.displayName"
            >
            <span v-else class="avatar__fallback">
              {{ user?.displayName?.charAt(0)?.toUpperCase() || '?' }}
            </span>
          </NuxtLink>
        </div>
      </div>
    </header>

    <main class="site-main">
      <slot />
    </main>

    <footer class="site-footer">
      <div class="container">
        <!-- 页脚内容以后放这 -->
      </div>
    </footer>

    <!-- 新增：登录弹窗 -->
    <LoginModal v-model="loginModalVisible" />
  </div>
</template>

<style scoped lang="less">
.layout-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ---------- Header ---------- */
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(245, 243, 239, .88);   /* var(--paper) 带透明度 */
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--border);

  &__inner {
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__logo {
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -.01em;
    color: var(--ink-1);
    text-decoration: none;
    transition: color .15s ease;

    &:hover { color: var(--accent); }
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

/* Login 按钮微调 */
.site-header__right :deep(.van-button--primary) {
  height: 32px;
  padding: 0 16px;
  font-weight: 500;
  letter-spacing: .02em;
  border-radius: var(--radius);
}

/* ---------- 用户头像（无按钮外观，就是一个圆） ---------- */
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  text-decoration: none;
  flex: 0 0 auto;
  transition: transform .15s ease;

  &:hover {
    transform: scale(1.04);
  }

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__fallback {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-serif);
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
    background: var(--surface);
    user-select: none;
  }
}

/* ---------- Main / Footer ---------- */
.site-main {
  flex: 1;
}

.site-footer {
  margin-top: 60px;
  padding: 24px 0;
  border-top: 1px solid var(--border);
  background: var(--surface);
  text-align: center;
  font-size: 13px;
  color: var(--ink-3);
}
</style>