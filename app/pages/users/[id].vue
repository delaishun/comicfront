<script setup lang="ts">
import { showConfirmDialog, showToast } from 'vant'
import type { AuthUser } from '~/types/auth'
import { processAvatar, ImageProcessError } from '~/utils/image-process'
import { buildFilename, uploadToOss } from '~/utils/upload'

interface PublicUser {
  id: number
  handle: string
  displayName: string
  email: string
  avatarUrl: string | null
  bio: string | null
}

interface AlbumPublic {
  id: number
  userId: number
  title: string
  description: string | null
  coverImageId: number | null
  coverObjectKey: string | null
  imageCount: number
  visibility: number
  createdAt: string
  updatedAt: string
}

// 底部弹窗在宽屏下的最大宽度与居中定位
const POPUP_MAX_WIDTH = 600
const popupInlineStyle = {
  width: '100%',
  maxWidth: `${POPUP_MAX_WIDTH}px`,
  left: `max(0px, calc(50vw - ${POPUP_MAX_WIDTH / 2}px))`,
  paddingBottom: 'env(safe-area-inset-bottom)',
}

const route = useRoute()
const config = useRuntimeConfig()
const { $api } = useNuxtApp()
const id = computed(() => Number(route.params.id))

// 当前登录用户（和 header 共用同一份 state）
const currentUser = useState<AuthUser | null>('auth:user', () => null)
const isSelf = computed(
  () => !!currentUser.value && currentUser.value.id === id.value,
)

// 用户信息
const { data: user, pending, error } = await useAsyncData<PublicUser>(
  () => `user-${id.value}`,
  () =>
    $fetch<PublicUser>(`/users/${id.value}`, {
      baseURL: config.public.apiBase,
    }),
  { watch: [id] },
)

// 该用户的画册列表
const { data: albums, refresh: refreshAlbums } = await useAsyncData<AlbumPublic[]>(
  () => `user-${id.value}-albums`,
  () => $api<AlbumPublic[]>(`/albums/user/${id.value}`),
  { watch: [id] },
)

// ---- Tab 切换 ----
const activeTab = ref<'albums' | 'favorites'>('albums')

// 该用户收藏的画册（懒加载）
const {
  data: favorites,
  pending: favoritesPending,
  refresh: refreshFavorites,
} = await useAsyncData<AlbumPublic[]>(
  () => `user-${id.value}-favorites`,
  () =>
    $fetch<AlbumPublic[]>(`/albums/user/${id.value}/favorites`, {
      baseURL: config.public.apiBase,
    }),
  { watch: [id], immediate: false },
)

const favoritesLoadedOnce = ref(false)

watch(activeTab, async (tab) => {
  if (tab === 'favorites' && !favoritesLoadedOnce.value) {
    favoritesLoadedOnce.value = true
    await refreshFavorites()
  }
})

// 兜底头像（后端注册时已默认写入这个）
const FALLBACK_AVATAR =
  'https://cc-jpbucket.oss-ap-northeast-1.aliyuncs.com/comic_img/pop.jpg'

const avatarSrc = computed(() => user.value?.avatarUrl || FALLBACK_AVATAR)
const initial = computed(
  () => user.value?.displayName?.charAt(0)?.toUpperCase() || '?',
)

// object_key -> 完整 OSS URL
function coverUrl(key: string) {
  const base = String(config.public.ossBaseUrl || '').replace(/\/$/, '')
  const path = key.replace(/^\//, '')
  return `${base}/${path}`
}

// 添加画册弹窗
const addAlbumVisible = ref(false)

function openAddAlbum() {
  addAlbumVisible.value = true
}

function onAlbumCreated() {
  refreshAlbums()
}

// ---- 编辑个人资料 ----
const profileEditVisible = ref(false)
const profileEditName = ref('')
const profileEditSubmitting = ref(false)
const avatarUploading = ref(false)
const avatarInputRef = ref<HTMLInputElement | null>(null)

function openProfileEdit() {
  if (!user.value) return
  profileEditName.value = user.value.displayName
  profileEditVisible.value = true
}

function closeProfileEdit() {
  if (profileEditSubmitting.value || avatarUploading.value) return
  profileEditVisible.value = false
}

function pickAvatar() {
  if (avatarUploading.value) return
  avatarInputRef.value?.click()
}

async function onAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 input，允许重复选择同一文件
  input.value = ''
  if (!file) return
  if (avatarUploading.value) return

  avatarUploading.value = true
  try {
    // 1) 处理成 200×200 webp
    const processed = await processAvatar(file)

    // 2) 上传 OSS（comic_avatar 目录）
    const filename = buildFilename(processed.ext)
    const { url } = await uploadToOss(processed.blob, filename, {
      fdir: 'comic_avatar',
    })

    // 3) 立即写库
    const updated = await $api<PublicUser>('/users/me', {
      method: 'PATCH',
      body: { avatarUrl: url },
    })

    // 4) 同步本地状态
    user.value = updated
    if (currentUser.value) {
      currentUser.value.avatarUrl = updated.avatarUrl
    }

    showToast('头像已更新')
  } catch (err: any) {
    // ImageProcessError 的 message 直接展示；其它错误交给通用提示
    const msg =
      err instanceof ImageProcessError
        ? err.message
        : err?.data?.error || err?.message || '头像上传失败'
    showToast(msg)
  } finally {
    avatarUploading.value = false
  }
}

async function submitProfileEdit() {
  if (profileEditSubmitting.value) return

  const name = profileEditName.value.trim()
  if (!name) {
    showToast('显示名不能为空')
    return
  }
  if (name.length > 64) {
    showToast('显示名不超过 64 字符')
    return
  }

  // 显示名没变，直接关闭
  if (user.value && name === user.value.displayName) {
    profileEditVisible.value = false
    return
  }

  profileEditSubmitting.value = true
  try {
    const updated = await $api<PublicUser>('/users/me', {
      method: 'PATCH',
      body: { displayName: name },
    })

    user.value = updated
    if (currentUser.value) {
      currentUser.value.displayName = updated.displayName
    }

    profileEditVisible.value = false
    showToast('已保存')
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '保存失败')
  } finally {
    profileEditSubmitting.value = false
  }
}

// ---- 注销 ----
const logoutLoading = ref(false)

async function handleLogout() {
  try {
    await showConfirmDialog({
      title: '确认注销',
      message: '注销后需要重新登录才能继续操作',
      confirmButtonText: '注销',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  if (logoutLoading.value) return
  logoutLoading.value = true
  try {
    try {
      await $api('/auth/logout', { method: 'POST' })
    } catch {
      // 后端没实现也不影响本地清状态
    }

    currentUser.value = null
    useCookie('token').value = null

    showToast('已注销')
    await navigateTo('/')
  } finally {
    logoutLoading.value = false
  }
}

useHead(() => ({
  title: user.value
    ? `${user.value.displayName || user.value.handle} · 61Comic`
    : 'User · 61Comic',
}))
</script>

<template>
  <div class="user-page container">
    <!-- 加载中 -->
    <div v-if="pending" class="user-page__state">
      <div class="skeleton user-page__avatar-skeleton" />
      <div class="skeleton user-page__line-skeleton" />
      <div class="skeleton user-page__line-skeleton user-page__line-skeleton--short" />
    </div>

    <!-- 加载失败 / 用户不存在 -->
    <div v-else-if="error || !user" class="user-page__state empty">
      <p class="empty__title">用户不存在</p>
      <p class="empty__desc">该用户可能已被删除或链接失效</p>
      <NuxtLink to="/" class="btn btn--ghost mt-4">返回首页</NuxtLink>
    </div>

    <!-- 正常显示 -->
    <template v-else>
      <!-- 头像 + 信息 -->
      <div class="user-page__avatar-wrap">
        <img
          v-if="user.avatarUrl"
          class="user-page__avatar"
          :src="avatarSrc"
          :alt="user.displayName || user.handle"
        >
        <span v-else class="user-page__avatar user-page__avatar--fallback">
          {{ initial }}
        </span>
      </div>

      <h1 v-if="user.displayName" class="user-page__name">
        {{ user.displayName }}
      </h1>

      <!-- 邮箱 + 编辑图标（仅本人） -->
      <p class="user-page__email">
        <span class="user-page__email-text">{{ user.email }}</span>
        <button
          v-if="isSelf"
          type="button"
          class="user-page__email-edit"
          aria-label="编辑个人资料"
          @click="openProfileEdit"
        >
          <van-icon name="edit" />
        </button>
      </p>

      <p v-if="user.bio" class="user-page__bio">{{ user.bio }}</p>

      <!-- Tab 区块 -->
      <section class="user-page__content">
        <div class="section-title">
          <div class="user-page__tabs">
            <button
              type="button"
              class="user-page__tab"
              :class="{ 'is-active': activeTab === 'albums' }"
              @click="activeTab = 'albums'"
            >
              画册
            </button>
            <button
              type="button"
              class="user-page__tab"
              :class="{ 'is-active': activeTab === 'favorites' }"
              @click="activeTab = 'favorites'"
            >
              收藏
            </button>
          </div>

          <!-- 只在画册 tab 且本人时显示 -->
          <button
            v-if="isSelf && activeTab === 'albums'"
            type="button"
            class="btn btn--primary btn--sm"
            @click="openAddAlbum"
          >
            + 添加画册
          </button>
        </div>

        <!-- 画册 tab -->
        <template v-if="activeTab === 'albums'">
          <div v-if="!albums || albums.length === 0" class="empty user-page__empty">
            <p class="empty__title">还没有画册</p>
            <p v-if="isSelf" class="empty__desc">点击右上角按钮创建第一本画册</p>
          </div>

          <div v-else class="album-grid">
            <NuxtLink
              v-for="album in albums"
              :key="album.id"
              :to="`/albums/${album.id}`"
              class="album-card"
              :class="{ 'is-hidden': isSelf && album.visibility === 0 }"
            >
              <div class="album-card__cover">
                <img
                  v-if="album.coverObjectKey"
                  class="album-card__cover-img"
                  :src="coverUrl(album.coverObjectKey)"
                  :alt="album.title"
                  loading="lazy"
                >
                <span
                  v-if="isSelf && album.visibility === 0"
                  class="album-card__hidden-badge"
                >
                  已隐藏
                </span>
                <span class="album-card__badge">{{ album.imageCount }}</span>
              </div>
              <div class="album-card__title">{{ album.title }}</div>
              <div v-if="album.description" class="album-card__meta line-1">
                {{ album.description }}
              </div>
            </NuxtLink>
          </div>
        </template>

        <!-- 收藏 tab -->
        <template v-else>
          <div v-if="favoritesPending" class="user-page__state">
            <div class="skeleton user-page__line-skeleton" />
            <div class="skeleton user-page__line-skeleton user-page__line-skeleton--short" />
          </div>

          <div v-else-if="!favorites || favorites.length === 0" class="empty user-page__empty">
            <p class="empty__title">还没有收藏</p>
            <p v-if="isSelf" class="empty__desc">收藏喜欢的画册，会显示在这里</p>
          </div>

          <div v-else class="album-grid">
            <NuxtLink
              v-for="album in favorites"
              :key="album.id"
              :to="`/albums/${album.id}`"
              class="album-card"
            >
              <div class="album-card__cover">
                <img
                  v-if="album.coverObjectKey"
                  class="album-card__cover-img"
                  :src="coverUrl(album.coverObjectKey)"
                  :alt="album.title"
                  loading="lazy"
                >
                <span class="album-card__badge">{{ album.imageCount }}</span>
              </div>
              <div class="album-card__title">{{ album.title }}</div>
              <div v-if="album.description" class="album-card__meta line-1">
                {{ album.description }}
              </div>
            </NuxtLink>
          </div>
        </template>
      </section>

      <!-- 注销（仅本人可见） -->
      <div v-if="isSelf" class="user-page__logout">
        <button
          type="button"
          class="btn btn--ghost user-page__logout-btn"
          :disabled="logoutLoading"
          @click="handleLogout"
        >
          {{ logoutLoading ? '注销中…' : '注销' }}
        </button>
      </div>
    </template>

    <!-- 添加画册弹窗（仅本人挂载） -->
    <AddAlbumModal
      v-if="isSelf"
      v-model="addAlbumVisible"
      @success="onAlbumCreated"
    />

    <!-- 编辑个人资料弹窗（仅本人挂载） -->
    <van-popup
      v-if="isSelf"
      v-model:show="profileEditVisible"
      position="bottom"
      round
      :overlay-style="{ background: 'rgba(0, 0, 0, 0.15)' }"
      :close-on-click-overlay="!profileEditSubmitting && !avatarUploading"
      :style="popupInlineStyle"
    >
      <div class="profile-edit-modal">
        <button
          type="button"
          class="profile-edit-modal__close"
          aria-label="关闭"
          :disabled="profileEditSubmitting || avatarUploading"
          @click="closeProfileEdit"
        >
          <van-icon name="close" />
        </button>

        <h3 class="profile-edit-modal__title">编辑个人资料</h3>

        <!-- 头像 -->
        <div class="profile-edit-modal__avatar-section">
          <div class="profile-edit-modal__avatar-wrap">
            <img
              v-if="user?.avatarUrl"
              class="profile-edit-modal__avatar"
              :src="user.avatarUrl"
              :alt="user.displayName"
            >
            <span
              v-else
              class="profile-edit-modal__avatar profile-edit-modal__avatar--fallback"
            >
              {{ initial }}
            </span>

            <div
              v-if="avatarUploading"
              class="profile-edit-modal__avatar-mask"
            >
              <van-loading type="spinner" size="20" color="#fff" />
            </div>
          </div>

          <button
            type="button"
            class="btn btn--ghost profile-edit-modal__avatar-btn"
            :disabled="avatarUploading"
            @click="pickAvatar"
          >
            {{ avatarUploading ? '上传中…' : '更换头像' }}
          </button>

          <input
            ref="avatarInputRef"
            type="file"
            accept="image/*,.heic,.heif"
            class="profile-edit-modal__file-input"
            @change="onAvatarSelected"
          >
        </div>

        <!-- 显示名 -->
        <div class="profile-edit-modal__field">
          <label class="profile-edit-modal__label" for="profile-name-input">
            显示名
          </label>
          <input
            id="profile-name-input"
            v-model="profileEditName"
            class="profile-edit-modal__input"
            type="text"
            maxlength="64"
            placeholder="输入显示名"
          >
          <div class="profile-edit-modal__count">
            {{ profileEditName.length }} / 64
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="profile-edit-modal__actions">
          <button
            type="button"
            class="btn btn--ghost profile-edit-modal__btn"
            :disabled="profileEditSubmitting || avatarUploading"
            @click="closeProfileEdit"
          >
            取消
          </button>
          <button
            type="button"
            class="btn btn--primary profile-edit-modal__btn"
            :disabled="
              profileEditSubmitting ||
              avatarUploading ||
              !profileEditName.trim()
            "
            @click="submitProfileEdit"
          >
            {{ profileEditSubmitting ? '保存中…' : '确认' }}
          </button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped lang="less">
.user-page {
  padding-top: 60px;
  padding-bottom: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  &__avatar-wrap {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;

    &--fallback {
      font-family: var(--font-serif);
      font-size: 48px;
      font-weight: 700;
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  &__name {
    margin: 24px 0 6px;
    font-family: var(--font-serif);
    font-size: 26px;
    font-weight: 700;
    color: var(--ink-1);
    letter-spacing: -0.01em;
  }

  /* 邮箱 + 编辑图标 */
  &__email {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    color: var(--ink-3);
  }

  &__email-text {
    word-break: break-all;
  }

  &__email-edit {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--ink-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: var(--surface-2);
      color: var(--accent);
    }
  }

  &__bio {
    margin: 20px 0 0;
    max-width: 520px;
    font-size: 14px;
    line-height: 1.7;
    color: var(--ink-2);
  }

  /* Tab 区块 */
  &__content {
    width: 100%;
    max-width: 960px;
    margin-top: 56px;
    text-align: left;
  }

  &__tabs {
    display: flex;
    gap: 4px;
  }

  &__tab {
    position: relative;
    padding: 10px 4px 12px;
    margin-right: 20px;
    border: none;
    background: transparent;
    font-family: var(--font-serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--ink-3);
    cursor: pointer;
    transition: color 0.15s ease;

    &:hover {
      color: var(--ink-1);
    }

    &.is-active {
      color: var(--ink-1);

      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
        background: var(--accent);
        border-radius: 2px;
      }
    }
  }

  &__empty {
    padding: 48px 16px;
  }

  /* 注销 */
  &__logout {
    margin-top: 56px;
    padding-top: 32px;
    width: 100%;
    max-width: 960px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: center;
  }

  &__logout-btn {
    min-width: 120px;
  }

  /* 加载 / 空状态容器 */
  &__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 0;
  }

  &__avatar-skeleton {
    width: 120px;
    height: 120px;
    border-radius: 50%;
  }

  &__line-skeleton {
    width: 160px;
    height: 16px;
    border-radius: 4px;

    &--short { width: 220px; }
  }
}

/* 画册卡片封面：有封面图则铺满，否则显示占位渐变 */
.album-card__cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #f5f3ef 0%, #e5e2db 100%);

  &-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .album-card__badge {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 1;
  }
}

/* 「已隐藏」角标：左上角，仅本人可见 */
.album-card__hidden-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  backdrop-filter: blur(2px);
}

.album-card.is-hidden .album-card__cover-img {
  opacity: 0.55;
  filter: grayscale(30%);
}

/* ---------- 编辑个人资料弹窗 ---------- */
.profile-edit-modal {
  position: relative;
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--ink-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--surface-2);
      color: var(--ink-1);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__title {
    margin: 0 0 4px;
    font-family: var(--font-serif);
    font-size: 18px;
    font-weight: 700;
    color: var(--ink-1);
    text-align: left;
  }

  /* 头像区块 */
  &__avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  &__avatar-wrap {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface-2);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;

    &--fallback {
      font-family: var(--font-serif);
      font-size: 36px;
      font-weight: 700;
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  &__avatar-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__avatar-btn {
    min-width: 120px;
  }

  /* 隐藏原生 file input */
  &__file-input {
    display: none;
  }

  /* 显示名字段 */
  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__label {
    font-size: 13px;
    color: var(--ink-2);
    font-weight: 500;
  }

  &__input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink-1);
    outline: none;
    transition: border-color 0.15s ease, background 0.15s ease;

    &:focus {
      border-color: var(--accent);
      background: var(--surface);
    }

    &::placeholder { color: var(--ink-3); }
  }

  &__count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-3);
    text-align: right;
  }

  /* 底部按钮 */
  &__actions {
    margin-top: 4px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  &__btn {
    min-width: 96px;
  }
}
</style>