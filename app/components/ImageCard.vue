<script setup lang="ts">
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

const props = withDefaults(
  defineProps<{
    image: ImagePublic
    ossBaseUrl: string
    /** 父组件控制：是否为高亮目标 */
    active?: boolean
    /** 是否为隐藏态（所有者视角下虚化显示） */
    hidden?: boolean
    /** 一次最多加载多少条评论作为弹幕（避免评论太多播放到天荒地老） */
    maxDanmaku?: number
    /** 弹幕条数超过这个值时，是否改用「随机采样」而不是「取最早的 N 条」 */
    sampleRandom?: boolean
  }>(),
  {
    active: false,
    hidden: false,
    maxDanmaku: 20,
    sampleRandom: false,
  },
)

const { $api } = useNuxtApp()

// 弹幕轨道数与每条轨道高度
const TRACK_COUNT = 4
const TRACK_HEIGHT = 40
// 弹幕层距离图片顶部的留白
const TOP_OFFSET = 48

const imageSrc = computed(() => {
  const base = String(props.ossBaseUrl || '').replace(/\/$/, '')
  const path = props.image.objectKey.replace(/^\//, '')
  return `${base}/${path}`
})

// ---- 弹幕 ----
interface DanmakuItem {
  key: string
  text: string
  track: number
  duration: number
  delay: number
}

const imgRef = ref<HTMLImageElement | null>(null)
const imageLoaded = ref(false)
const commentsRequested = ref(false)
const danmakuItems = ref<DanmakuItem[]>([])
const danmakuVisible = ref(false)

function onImageLoad() {
  if (imageLoaded.value) return
  imageLoaded.value = true
  if (commentsRequested.value) return
  commentsRequested.value = true
  void loadCommentsAndPlay()
}

// SSR 场景下，图片可能在 Vue hydrate 之前就加载完了，
// 那时 @load 监听还没挂上，事件就丢失了。
// onMounted 里主动检查一次，把丢失的事件补回来。
onMounted(() => {
  const el = imgRef.value
  if (el && el.complete && el.naturalWidth > 0) {
    onImageLoad()
  }
})

async function loadCommentsAndPlay() {
  let list: CommentPublic[] = []
  try {
    const res = await $api<CommentListResponse>(
      `/images/${props.image.id}/comments?limit=${props.maxDanmaku}&offset=0`,
    )
    list = res.list
  } catch {
    // 静默失败：图片照常展示，只是没有弹幕
    return
  }

  if (list.length === 0) return

  // 后端已按时间正序返回（从早到晚）
  danmakuItems.value = list.map((c, i) => ({
    key: String(c.id),
    // 弹幕只显示评论内容，不带作者
    text: c.content,
    track: i % TRACK_COUNT,
    // 每条弹幕飞行时长略有不同，看起来更自然
    duration: 9 + (i % 3) * 0.9,
    // 依次错开出现
    delay: i * 0.5,
  }))

  // 等 DOM 就绪再显示，确保动画从初始位置开始
  await nextTick()
  danmakuVisible.value = true
}

function onDanmakuEnd(key: string) {
  // 动画结束后移除，避免无谓的 DOM 节点堆积
  danmakuItems.value = danmakuItems.value.filter((d) => d.key !== key)
}

/** 供父组件按需调用：重播弹幕 */
function replayDanmaku() {
  if (danmakuItems.value.length === 0) return
  danmakuVisible.value = false
  void nextTick(() => {
    danmakuVisible.value = true
  })
}

defineExpose({ replayDanmaku })
</script>

<template>
  <figure
    class="image-card"
    :class="{
      'is-active': active,
      'is-hidden': hidden,
    }"
    :data-image-id="image.id"
  >
    <div class="image-card__stage">
      <img
        ref="imgRef"
        class="image-card__img"
        :src="imageSrc"
        :alt="image.title || ''"
        :width="image.width"
        :height="image.height"
        loading="lazy"
        @load="onImageLoad"
      >

      <!-- 隐藏态角标（仅所有者视角会看到） -->
      <div
        v-if="hidden"
        class="image-card__hidden-badge"
        aria-label="已隐藏"
      >
        已隐藏
      </div>

      <!-- 弹幕层 -->
      <div
        v-if="danmakuVisible && danmakuItems.length > 0"
        class="danmaku-layer"
        :style="{ top: TOP_OFFSET + 'px' }"
        aria-hidden="true"
      >
        <div
          v-for="d in danmakuItems"
          :key="d.key"
          class="danmaku-item"
          :style="{
            top: d.track * TRACK_HEIGHT + 'px',
            animationDuration: d.duration + 's',
            animationDelay: d.delay + 's',
          }"
          @animationend="onDanmakuEnd(d.key)"
        >
          {{ d.text }}
        </div>
      </div>
    </div>

    <figcaption v-if="image.title" class="image-card__caption">
      {{ image.title }}
    </figcaption>
  </figure>
</template>

<style scoped lang="less">
.image-card {
  margin: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: var(--radius);

  /* 图片舞台：作为弹幕的定位上下文，同时把飞出容器的弹幕裁掉 */
  &__stage {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--surface-2);
    box-shadow: var(--shadow-1);
    transition: box-shadow 0.25s ease, opacity 0.25s ease, filter 0.25s ease;
    /* 让弹幕的飞行位移能以容器宽度（100cqw）为基准 */
    container-type: inline-size;
  }

  &__img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: var(--radius);
    /* 图片自身也走 opacity 过渡，切换隐藏态更平滑 */
    transition: opacity 0.25s ease, filter 0.25s ease;
  }

  /* 隐藏态角标 */
  &__hidden-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 2;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    pointer-events: none;
    backdrop-filter: blur(2px);
  }

  /* 高亮态：写评论 / 显示评论 / 编辑图片时的目标图片 */
  &.is-active &__stage {
    box-shadow:
      0 0 0 3px var(--accent),
      0 0 24px rgba(217, 61, 61, 0.35),
      var(--shadow-1);
  }

  /* 隐藏态：所有者视角下虚化显示 */
  &.is-hidden &__stage {
    opacity: 0.45;
    filter: grayscale(40%);
  }

  /* 隐藏态但被高亮（正在编辑它）：恢复清晰，方便看清操作对象 */
  &.is-hidden.is-active &__stage {
    opacity: 1;
    filter: none;
  }

  &__caption {
    margin-top: 10px;
    font-size: 13px;
    color: var(--ink-3);
    text-align: center;
  }
}

/* ---------- 弹幕 ---------- */
/* 定位在 stage 内：left / right / bottom 撑满，top 由内联样式设置 */
.danmaku-layer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  overflow: hidden;
}

.danmaku-item {
  position: absolute;
  left: 100%;
  white-space: nowrap;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 500;
  letter-spacing: 0.01em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  will-change: transform;
  animation-name: danmaku-fly;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
  animation-iteration-count: 1;

  @media (max-width: 480px) {
    font-size: 12px;
    padding: 3px 8px;
  }
}

/* 从容器右边缘外飞向容器左边缘外 */
@keyframes danmaku-fly {
  from {
    transform: translateX(0);
  }
  to {
    /* 100cqw = 容器宽度；100% = 元素自身宽度 */
    transform: translateX(calc(-100cqw - 100%));
  }
}

@media (prefers-reduced-motion: reduce) {
  .danmaku-item {
    animation-duration: 0.01s !important;
    animation-delay: 0s !important;
  }
}
</style>