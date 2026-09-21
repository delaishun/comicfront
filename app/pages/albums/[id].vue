<script setup lang="ts">
import { showToast } from 'vant'
import type { AuthUser } from '~/types/auth'

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

interface ImagePublic {
  id: number
  userId: number
  albumId: number | null
  title: string | null
  objectKey: string
  width: number
  height: number
  byteSize: number | null
  mimeType: string | null
  sortOrder: number
  // 0=隐藏 1=可见
  visibility: number
  createdAt: string
}

interface CommentPublic {
  id: number
  imageId: number
  userId: number
  content: string
  createdAt: string
  userDisplayName: string
  userHandle: string
}

interface CommentListResponse {
  list: CommentPublic[]
  total: number
  limit: number
  offset: number
}

// 底部弹窗在宽屏下的最大宽度与居中定位
const POPUP_MAX_WIDTH = 600
const popupInlineStyle = {
  width: '100%',
  maxWidth: `${POPUP_MAX_WIDTH}px`,
  // 宽屏时居中（滚动条宽度无关紧要，居中误差最多几 px）；
  // 窄屏时 left 归 0，铺满全宽
  left: `max(0px, calc(50vw - ${POPUP_MAX_WIDTH / 2}px))`,
  paddingBottom: 'env(safe-area-inset-bottom)',
}

const route = useRoute()
const config = useRuntimeConfig()
const { $api } = useNuxtApp()
const id = computed(() => Number(route.params.id))

const currentUser = useState<AuthUser | null>('auth:user', () => null)

const { data: album, pending, error, refresh: refreshAlbum } = await useAsyncData<AlbumPublic>(
  () => `album-${id.value}`,
  () => $api<AlbumPublic>(`/albums/${id.value}`),
  { watch: [id] },
)

const { data: images, pending: imagesPending, refresh: refreshImages } = await useAsyncData<ImagePublic[]>(
  () => `album-${id.value}-images`,
  () => $api<ImagePublic[]>(`/albums/${id.value}/images`),
  { watch: [id] },
)

const isOwner = computed(
  () =>
    !!currentUser.value &&
    !!album.value &&
    currentUser.value.id === album.value.userId,
)

// ---- 上传弹窗 ----
const uploadVisible = ref(false)

function handleUpload() {
  uploadVisible.value = true
}

const hasUploaded = ref(false)

function onUploaded(_image: ImagePublic) {
  hasUploaded.value = true
}

watch(uploadVisible, (v) => {
  if (v) return
  if (!hasUploaded.value) return
  hasUploaded.value = false
  refreshImages()
  refreshAlbum()
})

// ---- 右侧悬浮操作面板 ----
const panelExpanded = ref(false)

const hasImages = computed(() => !!images.value && images.value.length > 0)

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
}

// ---- 当前居中的图片（写评论 / 看评论 / 编辑的目标） ----
const activeImageId = ref<number | null>(null)

function updateActiveImage() {
  if (!import.meta.client) return
  if (!images.value || images.value.length === 0) {
    activeImageId.value = null
    return
  }

  const viewportCenter = window.innerHeight / 2
  const nodes = document.querySelectorAll<HTMLElement>('[data-image-id]')
  let bestId: number | null = null
  let bestDist = Infinity

  nodes.forEach((el) => {
    const rect = el.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) return
    const center = rect.top + rect.height / 2
    const dist = Math.abs(center - viewportCenter)
    if (dist < bestDist) {
      bestDist = dist
      bestId = Number(el.dataset.imageId)
    }
  })

  activeImageId.value = bestId
}

let scrollRaf = 0
function onScrollOrResize() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    updateActiveImage()
  })
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, { passive: true })
  window.addEventListener('resize', onScrollOrResize, { passive: true })
  nextTick(updateActiveImage)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollOrResize)
  window.removeEventListener('resize', onScrollOrResize)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
})

watch(
  images,
  () => {
    if (!import.meta.client) return
    nextTick(updateActiveImage)
  },
  { immediate: true },
)

// ---- 高亮目标：3 个弹窗任一打开时，都高亮它对应的图片 ----
const highlightedImageId = computed<number | null>(() => {
  if (imageEditVisible.value) return imageEditTargetId.value
  if (commentVisible.value || commentsVisible.value) return commentTargetId.value
  return null
})

// ---- 登录弹窗 ----
const loginVisible = ref(false)

async function onLoginSuccess() {
  await refreshAlbum()
}

// ---- 点赞 ----
const likeLoading = ref(false)

const likeIcon = computed(() =>
  album.value?.likedByMe ? 'good-job' : 'good-job-o',
)

async function handleLike() {
  if (!album.value) return

  if (!currentUser.value) {
    loginVisible.value = true
    return
  }

  if (album.value.likedByMe) {
    showToast('已经点过赞了')
    return
  }

  if (likeLoading.value) return
  likeLoading.value = true
  try {
    const res = await $api<{ liked: boolean; likeCount: number }>(
      `/albums/${id.value}/like`,
      { method: 'POST' },
    )
    album.value.likedByMe = res.liked
    album.value.likeCount = res.likeCount
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '操作失败')
  } finally {
    likeLoading.value = false
  }
}

// ---- 收藏 ----
const favoriteLoading = ref(false)

const favoriteIcon = computed(() =>
  album.value?.favoritedByMe ? 'star' : 'star-o',
)

async function toggleFavorite() {
  if (!album.value) return

  if (!currentUser.value) {
    loginVisible.value = true
    return
  }

  if (favoriteLoading.value) return
  favoriteLoading.value = true
  try {
    const isFav = album.value.favoritedByMe
    const res = await $api<{ favorited: boolean; favoriteCount: number }>(
      `/albums/${id.value}/favorite`,
      { method: isFav ? 'DELETE' : 'POST' },
    )
    album.value.favoritedByMe = res.favorited
    album.value.favoriteCount = res.favoriteCount
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '操作失败')
  } finally {
    favoriteLoading.value = false
  }
}

// ---- 写评论 ----
const commentVisible = ref(false)
const commentContent = ref('')
const commentSubmitting = ref(false)
// 写评论 & 看评论共用的「目标图片」
const commentTargetId = ref<number | null>(null)

function writeComment() {
  if (!currentUser.value) {
    loginVisible.value = true
    return
  }

  updateActiveImage()
  if (!activeImageId.value) {
    showToast('请先滚动到某张图片')
    return
  }

  commentTargetId.value = activeImageId.value
  commentContent.value = ''
  commentVisible.value = true
}

async function submitComment() {
  if (!commentTargetId.value) return

  const content = commentContent.value.trim()
  if (!content) {
    showToast('评论内容不能为空')
    return
  }
  if (content.length > 300) {
    showToast('评论不超过 300 字')
    return
  }
  if (commentSubmitting.value) return

  commentSubmitting.value = true
  try {
    await $api(`/images/${commentTargetId.value}/comments`, {
      method: 'POST',
      body: { content },
    })
    commentVisible.value = false
    commentContent.value = ''
    commentTargetId.value = null
    showToast('评论已发送')
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '评论发送失败')
  } finally {
    commentSubmitting.value = false
  }
}

function cancelComment() {
  commentVisible.value = false
  commentContent.value = ''
  commentTargetId.value = null
}

// ---- 显示评论 ----
const commentsVisible = ref(false)
const commentsList = ref<CommentPublic[]>([])
const commentsTotal = ref(0)
const commentsLoading = ref(false)
const commentsLoadingMore = ref(false)
const COMMENTS_PAGE_SIZE = 10

const hasMoreComments = computed(
  () => commentsList.value.length < commentsTotal.value,
)

function openComments() {
  // 无论是否登录都能看评论
  updateActiveImage()
  if (!activeImageId.value) {
    showToast('请先滚动到某张图片')
    return
  }

  commentTargetId.value = activeImageId.value
  commentsList.value = []
  commentsTotal.value = 0
  commentsVisible.value = true
  void loadFirstPageComments()
}

async function loadFirstPageComments() {
  if (!commentTargetId.value) return
  commentsLoading.value = true
  try {
    const res = await $api<CommentListResponse>(
      `/images/${commentTargetId.value}/comments?limit=${COMMENTS_PAGE_SIZE}&offset=0`,
    )
    commentsList.value = res.list
    commentsTotal.value = res.total
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '加载评论失败')
  } finally {
    commentsLoading.value = false
  }
}

async function loadMoreComments() {
  if (!commentTargetId.value) return
  if (commentsLoadingMore.value) return
  if (!hasMoreComments.value) return

  commentsLoadingMore.value = true
  try {
    const offset = commentsList.value.length
    const res = await $api<CommentListResponse>(
      `/images/${commentTargetId.value}/comments?limit=${COMMENTS_PAGE_SIZE}&offset=${offset}`,
    )
    commentsList.value = [...commentsList.value, ...res.list]
    commentsTotal.value = res.total
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '加载更多评论失败')
  } finally {
    commentsLoadingMore.value = false
  }
}

function closeComments() {
  commentsVisible.value = false
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---- 图片编辑 ----
const imageEditVisible = ref(false)
const imageEditTargetId = ref<number | null>(null)
const imageOrderInput = ref<number>(0)
const imageEditIsCover = ref(false)
const imageEditIsHidden = ref(false)

function openImageEdit() {
  if (!currentUser.value) {
    loginVisible.value = true
    return
  }
  if (!isOwner.value) return

  updateActiveImage()
  if (!activeImageId.value) {
    showToast('请先滚动到某张图片')
    return
  }

  const targetId = activeImageId.value
  const target = images.value?.find((img) => img.id === targetId)

  imageEditTargetId.value = targetId
  imageOrderInput.value = target?.sortOrder ?? 0
  imageEditIsCover.value = album.value?.coverImageId === targetId
  // 从真实数据读取可见状态
  imageEditIsHidden.value = target?.visibility === 0
  imageEditVisible.value = true
}

function closeImageEdit() {
  imageEditVisible.value = false
  imageEditTargetId.value = null
}

// ---- 设为 / 取消封面 ----
const coverLoading = ref(false)

async function onToggleCover() {
  if (!album.value || !imageEditTargetId.value) return
  if (coverLoading.value) return

  const isCover = album.value.coverImageId === imageEditTargetId.value
  const nextImageId = isCover ? null : imageEditTargetId.value

  coverLoading.value = true
  try {
    const res = await $api<AlbumPublic>(
      `/albums/${id.value}/cover`,
      {
        method: 'PATCH',
        body: { imageId: nextImageId },
      },
    )

    album.value = res
    imageEditIsCover.value =
      res.coverImageId === imageEditTargetId.value

    showToast(nextImageId === null ? '已取消封面' : '已设为封面')
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '操作失败')
  } finally {
    coverLoading.value = false
  }
}

// ---- 隐藏 / 显示（图片） ----
const visibilityLoading = ref(false)

async function onToggleVisibility() {
  if (!imageEditTargetId.value) return
  if (visibilityLoading.value) return

  const target = images.value?.find((img) => img.id === imageEditTargetId.value)
  if (!target) return

  const isHidden = target.visibility === 0
  const nextVisibility = isHidden ? 1 : 0

  visibilityLoading.value = true
  try {
    const res = await $api<ImagePublic>(
      `/images/${imageEditTargetId.value}/visibility`,
      {
        method: 'PATCH',
        body: { visibility: nextVisibility },
      },
    )

    const idx = images.value?.findIndex(
      (img) => img.id === imageEditTargetId.value,
    )
    if (images.value && idx !== undefined && idx >= 0) {
      images.value[idx] = res
    }
    imageEditIsHidden.value = res.visibility === 0

    showToast(nextVisibility === 0 ? '已隐藏' : '已显示')
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '操作失败')
  } finally {
    visibilityLoading.value = false
  }
}

// ---- 修改顺序 ----
const orderLoading = ref(false)

async function onConfirmOrder() {
  if (!album.value || !imageEditTargetId.value) return
  if (orderLoading.value) return

  const value = Number(imageOrderInput.value)
  if (!Number.isFinite(value) || value < 0) {
    showToast('请输入合法的顺序值')
    return
  }

  orderLoading.value = true
  try {
    await $api(`/images/${imageEditTargetId.value}/sort-order`, {
      method: 'PATCH',
      body: { sortOrder: Math.floor(value) },
    })

    await refreshImages()

    const target = images.value?.find(
      (i) => i.id === imageEditTargetId.value,
    )
    imageOrderInput.value = target?.sortOrder ?? value

    showToast('顺序已更新')
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '操作失败')
  } finally {
    orderLoading.value = false
  }
}

// ---- 编辑画册 ----
const albumEditVisible = ref(false)
const albumEditTitle = ref('')
const albumEditDescription = ref('')
const albumEditIsHidden = ref(false)
const albumEditSubmitting = ref(false)

function openAlbumEdit() {
  if (!currentUser.value) {
    loginVisible.value = true
    return
  }
  if (!isOwner.value || !album.value) return

  albumEditTitle.value = album.value.title
  albumEditDescription.value = album.value.description ?? ''
  albumEditIsHidden.value = album.value.visibility === 0
  albumEditVisible.value = true
}

function closeAlbumEdit() {
  if (albumEditSubmitting.value) return
  albumEditVisible.value = false
}

function toggleAlbumEditVisibility() {
  albumEditIsHidden.value = !albumEditIsHidden.value
}

async function submitAlbumEdit() {
  if (!album.value) return
  if (albumEditSubmitting.value) return

  const title = albumEditTitle.value.trim()
  if (!title) {
    showToast('标题不能为空')
    return
  }
  if (title.length > 50) {
    showToast('标题不超过 50 字')
    return
  }
  if (albumEditDescription.value.length > 200) {
    showToast('描述不超过 200 字')
    return
  }

  albumEditSubmitting.value = true
  try {
    const res = await $api<AlbumPublic>(`/albums/${id.value}`, {
      method: 'PATCH',
      body: {
        title,
        description: albumEditDescription.value.trim() || null,
        visibility: albumEditIsHidden.value ? 0 : 1,
      },
    })

    // 覆盖本地画册状态
    album.value = res
    albumEditVisible.value = false
    showToast('已保存')
  } catch (err: any) {
    showToast(err?.data?.error || err?.message || '保存失败')
  } finally {
    albumEditSubmitting.value = false
  }
}

useHead(() => ({
  title: album.value ? `${album.value.title} · Inkwell` : 'Album · Inkwell',
}))
</script>

<template>
  <div class="album-page">
    <div v-if="pending" class="container album-page__state">
      <div class="skeleton album-page__title-skeleton" />
      <div class="skeleton album-page__meta-skeleton" />
    </div>

    <div v-else-if="error || !album" class="container album-page__state empty">
      <p class="empty__title">画册不存在</p>
      <p class="empty__desc">链接可能已失效或被删除</p>
      <NuxtLink to="/" class="btn btn--ghost mt-4">返回首页</NuxtLink>
    </div>

    <template v-else>
      <header class="container album-header">
        <h1 class="album-header__title">{{ album.title }}</h1>

        <p v-if="album.description" class="album-header__desc">
          {{ album.description }}
        </p>

        <div class="album-header__meta">
          <span>{{ album.imageCount }} 张</span>
          <span class="album-header__dot">·</span>
          <span>{{ album.likeCount }} 赞</span>
          <span class="album-header__dot">·</span>
          <span>{{ album.favoriteCount }} 人收藏</span>
          <span class="album-header__dot">·</span>
          <NuxtLink :to="`/users/${album.userId}`" class="album-header__author">
            查看作者
          </NuxtLink>
        </div>
      </header>

      <div class="container">
        <div v-if="imagesPending" class="album-page__state">
          <div class="skeleton album-page__image-skeleton" />
        </div>

        <div v-else-if="!images || images.length === 0" class="empty album-page__empty">
          <p class="empty__title">画册还没有内容</p>
          <p v-if="isOwner" class="empty__desc">
            点击下方按钮上传第一张画
          </p>
        </div>

        <div v-else class="image-list">
          <ImageCard
            v-for="img in images"
            :key="img.id"
            :image="img"
            :oss-base-url="config.public.ossBaseUrl"
            :active="img.id === highlightedImageId"
            :hidden="img.visibility === 0"
          />
        </div>
      </div>

      <div v-if="hasImages" class="action-panel">
        <button
          v-if="!panelExpanded"
          type="button"
          class="action-panel__trigger"
          aria-label="展开操作面板"
          @click="panelExpanded = true"
        >
          <van-icon name="add-o" />
        </button>

        <div v-else class="action-panel__list">
          <button type="button" class="action-panel__btn" aria-label="回到顶部" @click="scrollTop">
            <van-icon name="arrow-up" />
          </button>

          <button
            type="button"
            class="action-panel__btn"
            :class="{ 'is-active': album.likedByMe }"
            aria-label="点赞"
            :disabled="likeLoading"
            @click="handleLike"
          >
            <van-icon :name="likeIcon" />
          </button>

          <button
            v-if="!isOwner"
            type="button"
            class="action-panel__btn"
            :class="{ 'is-active': album.favoritedByMe }"
            aria-label="收藏"
            :disabled="favoriteLoading"
            @click="toggleFavorite"
          >
            <van-icon :name="favoriteIcon" />
          </button>

          <button type="button" class="action-panel__btn" aria-label="收起面板" @click="panelExpanded = false">
            <van-icon name="shrink" />
          </button>

          <button type="button" class="action-panel__btn" aria-label="写评论" @click="writeComment">
            <van-icon name="records-o" />
          </button>

          <button type="button" class="action-panel__btn" aria-label="显示评论" @click="openComments">
            <van-icon name="notes-o" />
          </button>

          <!-- 编辑图片（仅画册所有者可见） -->
          <button
            v-if="isOwner"
            type="button"
            class="action-panel__btn"
            aria-label="编辑图片"
            @click="openImageEdit"
          >
            <van-icon name="edit" />
          </button>

          <button type="button" class="action-panel__btn" aria-label="回到底部" @click="scrollBottom">
            <van-icon name="arrow-down" />
          </button>
        </div>
      </div>

      <!-- 底部操作区：编辑画册 + 上传图片（仅所有者） -->
      <div v-if="isOwner" class="album-actions">
        <button
          type="button"
          class="btn btn--ghost btn--lg album-actions__btn"
          @click="openAlbumEdit"
        >
          编辑画册
        </button>
        <button
          type="button"
          class="btn btn--primary btn--lg album-actions__btn"
          @click="handleUpload"
        >
          上传图片
        </button>
      </div>

      <UploadImageModal
        v-if="isOwner"
        v-model="uploadVisible"
        :album-id="id"
        @uploaded="onUploaded"
      />

      <LoginModal v-model="loginVisible" @success="onLoginSuccess" />

      <!-- 写评论弹窗 -->
      <van-popup
        v-model:show="commentVisible"
        position="bottom"
        round
        :overlay-style="{ background: 'rgba(0, 0, 0, 0.15)' }"
        :close-on-click-overlay="!commentSubmitting"
        :style="popupInlineStyle"
      >
        <div class="comment-modal">
          <h3 class="comment-modal__title">写评论</h3>

          <textarea
            v-model="commentContent"
            class="comment-modal__input"
            placeholder="写下你的评论…"
            rows="4"
            maxlength="300"
          />

          <div class="comment-modal__count">
            {{ commentContent.length }} / 300
          </div>

          <div class="comment-modal__actions">
            <button
              type="button"
              class="btn btn--ghost comment-modal__btn"
              :disabled="commentSubmitting"
              @click="cancelComment"
            >
              取消
            </button>
            <button
              type="button"
              class="btn btn--primary comment-modal__btn"
              :disabled="commentSubmitting || !commentContent.trim()"
              @click="submitComment"
            >
              {{ commentSubmitting ? '发送中…' : '发送' }}
            </button>
          </div>
        </div>
      </van-popup>

      <!-- 显示评论弹窗 -->
      <van-popup
        v-model:show="commentsVisible"
        position="bottom"
        round
        :overlay-style="{ background: 'rgba(0, 0, 0, 0.15)' }"
        :style="popupInlineStyle"
      >
        <div class="comments-modal">
          <h3 class="comments-modal__title">评论</h3>

          <div class="comments-modal__body">
            <div v-if="commentsLoading" class="comments-modal__state">
              <van-loading type="spinner" size="20" />
            </div>

            <div v-else-if="commentsList.length === 0" class="comments-modal__state">
              <p class="comments-modal__empty">还没有评论</p>
            </div>

            <div v-else class="comments-modal__list">
              <div
                v-for="c in commentsList"
                :key="c.id"
                class="comment-item"
              >
                <div class="comment-item__head">
                  <NuxtLink
                    :to="`/users/${c.userId}`"
                    class="comment-item__author"
                  >
                    {{ c.userDisplayName || c.userHandle || `用户 ${c.userId}` }}
                  </NuxtLink>
                  <span class="comment-item__time">
                    {{ formatCommentTime(c.createdAt) }}
                  </span>
                </div>
                <div class="comment-item__content">{{ c.content }}</div>
              </div>

              <div v-if="hasMoreComments" class="comments-modal__more">
                <button
                  type="button"
                  class="btn btn--ghost comments-modal__more-btn"
                  :disabled="commentsLoadingMore"
                  @click="loadMoreComments"
                >
                  {{ commentsLoadingMore ? '加载中…' : '显示更多' }}
                </button>
              </div>
            </div>
          </div>

          <div class="comments-modal__actions">
            <button
              type="button"
              class="btn btn--ghost comments-modal__btn"
              @click="closeComments"
            >
              关闭
            </button>
          </div>
        </div>
      </van-popup>

      <!-- 编辑图片弹窗 -->
      <van-popup
        v-model:show="imageEditVisible"
        position="bottom"
        round
        :overlay-style="{ background: 'rgba(0, 0, 0, 0.15)' }"
        :style="popupInlineStyle"
      >
        <div class="image-edit-modal">
          <button
            type="button"
            class="image-edit-modal__close"
            aria-label="关闭"
            @click="closeImageEdit"
          >
            <van-icon name="close" />
          </button>

          <h3 class="image-edit-modal__title">编辑图片</h3>

          <!-- 封面 -->
          <div class="image-edit-modal__row">
            <button
              type="button"
              class="btn btn--ghost image-edit-modal__btn"
              :disabled="coverLoading"
              @click="onToggleCover"
            >
              {{
                coverLoading
                  ? '处理中…'
                  : imageEditIsCover
                    ? '取消封面'
                    : '设为封面'
              }}
            </button>
          </div>

          <!-- 隐藏 / 显示 -->
          <div class="image-edit-modal__row">
            <button
              type="button"
              class="btn btn--ghost image-edit-modal__btn"
              :disabled="visibilityLoading"
              @click="onToggleVisibility"
            >
              {{
                visibilityLoading
                  ? '处理中…'
                  : imageEditIsHidden
                    ? '显示图片'
                    : '隐藏图片'
              }}
            </button>
          </div>

          <!-- 顺序 -->
          <div class="image-edit-modal__row image-edit-modal__row--order">
            <label class="image-edit-modal__label" for="image-order-input">
              图片顺序
            </label>
            <input
              id="image-order-input"
              v-model.number="imageOrderInput"
              class="image-edit-modal__input"
              type="number"
              min="0"
            >
            <button
              type="button"
              class="btn btn--primary image-edit-modal__btn image-edit-modal__btn--sm"
              :disabled="orderLoading"
              @click="onConfirmOrder"
            >
              {{ orderLoading ? '...' : '确认' }}
            </button>
          </div>

          <!-- 状态提示 -->
          <p class="image-edit-modal__hint">
            图片显示顺序从0开始，修改后插入到指定位置，其它图片依次后延。
          </p>
        </div>
      </van-popup>

      <!-- 编辑画册弹窗 -->
      <van-popup
        v-model:show="albumEditVisible"
        position="bottom"
        round
        :overlay-style="{ background: 'rgba(0, 0, 0, 0.15)' }"
        :close-on-click-overlay="!albumEditSubmitting"
        :style="popupInlineStyle"
      >
        <div class="album-edit-modal">
          <button
            type="button"
            class="album-edit-modal__close"
            aria-label="关闭"
            :disabled="albumEditSubmitting"
            @click="closeAlbumEdit"
          >
            <van-icon name="close" />
          </button>

          <h3 class="album-edit-modal__title">编辑画册</h3>

          <!-- 标题 -->
          <div class="album-edit-modal__field">
            <label class="album-edit-modal__label" for="album-title-input">
              标题
            </label>
            <input
              id="album-title-input"
              v-model="albumEditTitle"
              class="album-edit-modal__input"
              type="text"
              maxlength="50"
              placeholder="画册标题"
            >
            <div class="album-edit-modal__count">
              {{ albumEditTitle.length }} / 50
            </div>
          </div>

          <!-- 描述 -->
          <div class="album-edit-modal__field">
            <label class="album-edit-modal__label" for="album-desc-input">
              描述
            </label>
            <textarea
              id="album-desc-input"
              v-model="albumEditDescription"
              class="album-edit-modal__textarea"
              rows="3"
              maxlength="200"
              placeholder="画册描述（可选）"
            />
            <div class="album-edit-modal__count">
              {{ albumEditDescription.length }} / 200
            </div>
          </div>

          <!-- 隐藏 / 显示 -->
          <div class="album-edit-modal__row">
            <button
              type="button"
              class="btn btn--ghost album-edit-modal__btn"
              @click="toggleAlbumEditVisibility"
            >
              {{ albumEditIsHidden ? '显示画册' : '隐藏画册' }}
            </button>
            <span class="album-edit-modal__status">
              {{ albumEditIsHidden ? '当前：已隐藏' : '当前：公开' }}
            </span>
          </div>

          <!-- 操作按钮 -->
          <div class="album-edit-modal__actions">
            <button
              type="button"
              class="btn btn--ghost album-edit-modal__btn"
              :disabled="albumEditSubmitting"
              @click="closeAlbumEdit"
            >
              取消
            </button>
            <button
              type="button"
              class="btn btn--primary album-edit-modal__btn"
              :disabled="albumEditSubmitting || !albumEditTitle.trim()"
              @click="submitAlbumEdit"
            >
              {{ albumEditSubmitting ? '保存中…' : '提交' }}
            </button>
          </div>
        </div>
      </van-popup>
    </template>
  </div>
</template>

<style scoped lang="less">
.album-page {
  padding-top: 40px;
  padding-bottom: 120px;
}

/* ---------- 画册头部 ---------- */
.album-header {
  text-align: center;
  margin-bottom: 40px;

  &__title {
    margin: 0 0 12px;
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 700;
    color: var(--ink-1);
    letter-spacing: -0.01em;
  }

  &__desc {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.7;
    color: var(--ink-2);
    max-width: 640px;
    margin-left: auto;
    margin-right: auto;
  }

  &__meta {
    font-size: 13px;
    color: var(--ink-3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__dot { color: var(--border-strong); }

  &__author {
    color: var(--ink-2);
    &:hover { color: var(--accent); }
  }
}

/* ---------- 图片列表 ---------- */
.image-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 900px;
  margin: 0 auto;
}

/* ---------- 右侧悬浮操作面板 ---------- */
.action-panel {
  position: fixed;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 95;
  display: flex;
  flex-direction: column;
  align-items: center;

  @media (max-width: 480px) { right: 10px; }

  &__trigger {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink-1);
    box-shadow: var(--shadow-1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;

    &:hover {
      background: var(--accent-soft);
      color: var(--accent);
      transform: scale(1.05);
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    border-radius: 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-1);
    max-height: 76vh;
    overflow-y: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }

  &__btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--ink-2);
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
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.is-active { color: var(--accent); }
  }
}

/* ---------- 底部操作区（编辑画册 + 上传图片） ---------- */
.album-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 24px;
  z-index: 90;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  pointer-events: none;

  &__btn {
    pointer-events: auto;
    padding: 12px 32px;
    border-radius: 999px;
    font-weight: 500;
    box-shadow: 0 8px 24px rgba(0, 0, 0, .12);
  }
}

/* ---------- 写评论弹窗 ---------- */
.comment-modal {
  padding: 20px 20px 24px;

  &__title {
    margin: 0 0 12px;
    font-family: var(--font-serif);
    font-size: 18px;
    font-weight: 700;
    color: var(--ink-1);
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
    resize: vertical;
    outline: none;
    transition: border-color 0.15s ease, background 0.15s ease;

    &:focus {
      border-color: var(--accent);
      background: var(--surface);
    }

    &::placeholder { color: var(--ink-3); }
  }

  &__count {
    margin-top: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-3);
    text-align: right;
  }

  &__actions {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  &__btn {
    min-width: 88px;
  }
}

/* ---------- 显示评论弹窗 ---------- */
.comments-modal {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  padding: 20px 20px 16px;

  &__title {
    margin: 0 0 12px;
    flex: 0 0 auto;
    font-family: var(--font-serif);
    font-size: 18px;
    font-weight: 700;
    color: var(--ink-1);
  }

  &__body {
    flex: 1 1 auto;
    min-height: 120px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  &__state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    padding: 20px 0;
  }

  &__empty {
    margin: 0;
    font-size: 13px;
    color: var(--ink-3);
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 4px 0;
  }

  &__more {
    display: flex;
    justify-content: center;
    padding: 6px 0 2px;
  }

  &__more-btn {
    min-width: 120px;
    font-size: 13px;
  }

  &__actions {
    flex: 0 0 auto;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
  }

  &__btn {
    min-width: 88px;
  }
}

.comment-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  &__author {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-1);
    text-decoration: none;

    &:hover { color: var(--accent); }
  }

  &__time {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-3);
  }

  &__content {
    font-size: 14px;
    line-height: 1.65;
    color: var(--ink-2);
    white-space: pre-wrap;
    word-break: break-word;
  }
}

/* ---------- 编辑图片弹窗 ---------- */
.image-edit-modal {
  position: relative;
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;

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

    &:hover {
      background: var(--surface-2);
      color: var(--ink-1);
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

  &__row {
    display: flex;
    align-items: center;
    gap: 10px;

    &--order {
      gap: 12px;
    }
  }

  &__label {
    flex: 0 0 auto;
    font-size: 14px;
    color: var(--ink-2);
  }

  &__input {
    flex: 0 0 auto;
    width: 96px;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--ink-1);
    text-align: center;
    outline: none;
    transition: border-color 0.15s ease, background 0.15s ease;

    &:focus {
      border-color: var(--accent);
      background: var(--surface);
    }

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    -moz-appearance: textfield;
    appearance: textfield;
  }

  &__btn {
    min-width: 108px;

    &--sm {
      min-width: 72px;
      padding-left: 14px;
      padding-right: 14px;
      margin-left: auto;
    }
  }

  &__hint {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--ink-3);
    text-align: center;
  }
}

/* ---------- 编辑画册弹窗 ---------- */
.album-edit-modal {
  position: relative;
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;

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

  &__input,
  &__textarea {
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

  &__textarea {
    resize: vertical;
    min-height: 72px;
  }

  &__count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-3);
    text-align: right;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__status {
    font-size: 13px;
    color: var(--ink-3);
  }

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

/* ---------- 状态 / skeleton ---------- */
.album-page {
  &__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 0;
  }

  &__empty { padding: 60px 16px; }

  &__title-skeleton {
    width: 240px;
    height: 32px;
    border-radius: 6px;
  }

  &__meta-skeleton {
    width: 160px;
    height: 16px;
    border-radius: 4px;
  }

  &__image-skeleton {
    width: 100%;
    max-width: 900px;
    height: 400px;
    border-radius: var(--radius);
  }
}
</style>