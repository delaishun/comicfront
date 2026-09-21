<script setup lang="ts">
interface AlbumPublic {
  id: number
  userId: number
  title: string
  description: string | null
  coverImageId: number | null
  coverObjectKey: string | null
  imageCount: number
  likeCount: number
  favoriteCount: number
  visibility: number
  createdAt: string
  updatedAt: string
  likedByMe: boolean
  favoritedByMe: boolean
}

interface UserWithAlbumCount {
  id: number
  handle: string
  displayName: string
  avatarUrl: string | null
  albumCount: number
}

// 一次拉取多少条
const PAGE_SIZE = 10

const config = useRuntimeConfig()
const { $api } = useNuxtApp()

// ---- 首屏数据（SSR 直出） ----
const { data: initialAlbums } = await useAsyncData(
  'home-albums',
  () =>
    $api<AlbumPublic[]>('/albums', {
      query: { limit: PAGE_SIZE, offset: 0 },
    }),
)

const { data: initialUsers } = await useAsyncData(
  'home-users',
  () =>
    $api<UserWithAlbumCount[]>('/users', {
      query: { limit: PAGE_SIZE, offset: 0 },
    }),
)

// ---- 画册列表 ----
const albums = ref<AlbumPublic[]>(initialAlbums.value ?? [])
const albumsHasMore = ref((initialAlbums.value?.length ?? 0) >= PAGE_SIZE)
const albumsLoadingMore = ref(false)

async function loadMoreAlbums() {
  if (albumsLoadingMore.value || !albumsHasMore.value) return
  albumsLoadingMore.value = true
  try {
    const list = await $api<AlbumPublic[]>('/albums', {
      query: { limit: PAGE_SIZE, offset: albums.value.length },
    })
    albums.value = [...albums.value, ...list]
    albumsHasMore.value = list.length >= PAGE_SIZE
  } catch (err: any) {
    console.error('[index] loadMoreAlbums failed:', err)
  } finally {
    albumsLoadingMore.value = false
  }
}

// ---- 用户列表 ----
const users = ref<UserWithAlbumCount[]>(initialUsers.value ?? [])
const usersHasMore = ref((initialUsers.value?.length ?? 0) >= PAGE_SIZE)
const usersLoadingMore = ref(false)

async function loadMoreUsers() {
  if (usersLoadingMore.value || !usersHasMore.value) return
  usersLoadingMore.value = true
  try {
    const list = await $api<UserWithAlbumCount[]>('/users', {
      query: { limit: PAGE_SIZE, offset: users.value.length },
    })
    users.value = [...users.value, ...list]
    usersHasMore.value = list.length >= PAGE_SIZE
  } catch (err: any) {
    console.error('[index] loadMoreUsers failed:', err)
  } finally {
    usersLoadingMore.value = false
  }
}

// ---- 工具 ----
function coverUrl(key: string) {
  const base = String(config.public.ossBaseUrl || '').replace(/\/$/, '')
  const path = key.replace(/^\//, '')
  return `${base}/${path}`
}

function userInitial(u: UserWithAlbumCount) {
  return u.displayName?.charAt(0)?.toUpperCase() || '?'
}

useHead(() => ({
  title: '61Comic',
}))
</script>

<template>
  <div class="home-page container">
    <!-- ==================== 画册列表 ==================== -->
    <section class="home-section">
      <div class="home-section__head">
        <h2 class="home-section__title">最新画册</h2>
      </div>

      <div v-if="albums.length === 0" class="empty home-section__empty">
        <p class="empty__title">还没有公开画册</p>
      </div>

      <div v-else class="album-grid">
        <NuxtLink
          v-for="album in albums"
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
        </NuxtLink>
      </div>

      <div v-if="albumsHasMore" class="home-section__more">
        <button
          type="button"
          class="btn btn--ghost home-section__more-btn"
          :disabled="albumsLoadingMore"
          @click="loadMoreAlbums"
        >
          {{ albumsLoadingMore ? '加载中…' : '查看更多' }}
        </button>
      </div>
    </section>

    <!-- ==================== 用户列表 ==================== -->
    <section class="home-section">
      <div class="home-section__head">
        <h2 class="home-section__title">活跃作者</h2>
      </div>

      <div v-if="users.length === 0" class="empty home-section__empty">
        <p class="empty__title">还没有公开画册的作者</p>
      </div>

      <div v-else class="user-grid">
        <NuxtLink
          v-for="u in users"
          :key="u.id"
          :to="`/users/${u.id}`"
          class="user-card"
        >
          <div class="user-card__avatar-wrap">
            <img
              v-if="u.avatarUrl"
              class="user-card__avatar"
              :src="u.avatarUrl"
              :alt="u.displayName"
              loading="lazy"
            >
            <span
              v-else
              class="user-card__avatar user-card__avatar--fallback"
            >
              {{ userInitial(u) }}
            </span>
          </div>
          <div class="user-card__name">{{ u.displayName }}</div>
          <div class="user-card__meta">{{ u.albumCount }} 本画册</div>
        </NuxtLink>
      </div>

      <div v-if="usersHasMore" class="home-section__more">
        <button
          type="button"
          class="btn btn--ghost home-section__more-btn"
          :disabled="usersLoadingMore"
          @click="loadMoreUsers"
        >
          {{ usersLoadingMore ? '加载中…' : '查看更多' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="less">
.home-page {
  padding-top: 40px;
  padding-bottom: 60px;
}

/* ---------- 区块通用 ---------- */
.home-section {
  margin-bottom: 64px;

  &:last-child {
    margin-bottom: 0;
  }

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  &__title {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 700;
    color: var(--ink-1);
    letter-spacing: -0.01em;
  }

  &__empty {
    padding: 48px 16px;
  }

  /* 「查看更多」按钮行 */
  &__more {
    display: flex;
    justify-content: center;
    margin-top: 28px;
  }

  &__more-btn {
    min-width: 140px;
    font-size: 13px;
  }
}

/* ---------- 画册网格 ---------- */
.album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 20px;

  @media (max-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
}

.album-card {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;
  transition: transform 0.15s ease;

  &:hover {
    transform: translateY(-2px);
  }

  &__cover {
    position: relative;
    aspect-ratio: 3 / 4;
    border-radius: var(--radius);
    overflow: hidden;
    background: linear-gradient(135deg, #f5f3ef 0%, #e5e2db 100%);
    box-shadow: var(--shadow-1);

    &-img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  &__badge {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 1;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 11px;
    font-weight: 500;
    backdrop-filter: blur(2px);
  }

  &__title {
    margin-top: 10px;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--ink-1);
    /* 最多两行，超出省略 */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

/* ---------- 用户网格 ---------- */
.user-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 20px;

  @media (max-width: 480px) {
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
}

.user-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: inherit;
  text-align: center;
  transition: transform 0.15s ease;

  &:hover {
    transform: translateY(-2px);
  }

  &__avatar-wrap {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-1);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;

    @media (max-width: 480px) {
      width: 72px;
      height: 72px;
    }
  }

  &__avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;

    &--fallback {
      font-family: var(--font-serif);
      font-size: 32px;
      font-weight: 700;
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  &__name {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink-1);
    line-height: 1.3;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__meta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--ink-3);
  }
}
</style>