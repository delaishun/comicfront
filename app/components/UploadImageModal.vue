<script setup lang="ts">
import { processImage, ImageProcessError } from "~/utils/image-process";

interface ImagePublic {
  id: number;
  userId: number;
  albumId: number | null;
  title: string | null;
  objectKey: string;
  width: number;
  height: number;
  byteSize: number | null;
  mimeType: string | null;
  sortOrder: number;
  visibility: number;
  createdAt: string;
}

interface Props {
  modelValue: boolean;
  /** 传 null / 不传：图片进「我的插画」默认区；有值：编入该画册 */
  albumId?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  albumId: null,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "uploaded", image: ImagePublic): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

// ---- 单张上传项 ----
type ItemStatus =
  | "pending"
  | "processing"
  | "uploading"
  | "saving"
  | "done"
  | "error";

interface UploadItem {
  uid: number;
  file: File;
  previewUrl: string;
  status: ItemStatus;
  progress: number;
  meta: {
    originalWidth: number;
    originalHeight: number;
    originalSize: number;
    width: number;
    height: number;
    outputSize: number;
  } | null;
  error: string;
}

// ---- 状态 ----
const items = ref<UploadItem[]>([]);
const running = ref(false);
// 给 van-uploader 内部用的列表，读到后我们立刻清空，改用自己的列表渲染
const uploaderList = ref<any[]>([]);

// 每次开始/重置都会自增，用来打断进行中的串行任务
let runToken = 0;
let uidSeq = 0;

const total = computed(() => items.value.length);
const doneCount = computed(
  () => items.value.filter((i) => i.status === "done").length
);
const hasError = computed(() => items.value.some((i) => i.status === "error"));
const busy = computed(() => running.value);

const overallText = computed(() => {
  if (total.value === 0) return "";
  if (doneCount.value === total.value && !hasError.value) return "全部完成";
  if (hasError.value && !running.value)
    return `已完成 ${doneCount.value} / ${total.value}`;
  return `正在上传 ${Math.min(doneCount.value + 1, total.value)} / ${total.value}`;
});

function resetState() {
  // 打断可能的进行中任务
  runToken++;
  running.value = false;
  for (const it of items.value) {
    if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
  }
  items.value = [];
  uploaderList.value = [];
}

watch(visible, (v) => {
  if (!v) resetState();
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function statusText(item: UploadItem): string {
  switch (item.status) {
    case "pending":
      return "等待中";
    case "processing":
      return "压缩中…";
    case "uploading":
      return `上传中 ${item.progress}%`;
    case "saving":
      return "保存中…";
    case "done":
      return "已完成";
    case "error":
      return item.error || "失败";
    default:
      return "";
  }
}

// ---- 主流程：一次选中多张，按顺序依次上传 ----
async function onFilesSelected(files: File[]) {
  if (busy.value || files.length === 0) return;

  const token = ++runToken;

  items.value = files.map((file) => ({
    uid: ++uidSeq,
    file,
    previewUrl: "",
    status: "pending" as ItemStatus,
    progress: 0,
    meta: null,
    error: "",
  }));

  running.value = true;
  const { $api } = useNuxtApp();

  try {
    for (let i = 0; i < items.value.length; i++) {
      // 弹窗已关闭 / 状态已重置，放弃剩余任务
      if (token !== runToken) return;

      const item = items.value[i];
      if (!item) continue;

      try {
        // 1. 处理（压缩、校验、转 WebP）
        item.status = "processing";
        const processed = await processImage(item.file);
        if (token !== runToken) return;

        // 2. 生成预览
        item.previewUrl = URL.createObjectURL(processed.blob);
        item.meta = {
          originalWidth: processed.originalWidth,
          originalHeight: processed.originalHeight,
          originalSize: processed.originalSize,
          width: processed.width,
          height: processed.height,
          outputSize: processed.blob.size,
        };

        // 3. 上传 OSS
        item.status = "uploading";
        item.progress = 0;
        const filename = buildFilename(processed.ext);
        const { objectKey } = await uploadToOss(processed.blob, filename, {
          fdir: "comic_pics",
          onProgress: (p) => {
            item.progress = p;
          },
        });
        if (token !== runToken) return;

        // 4. 写库：sortOrder 按选择次序递增
        item.status = "saving";
        const image = await $api<ImagePublic>("/images", {
          method: "POST",
          body: {
            albumId: props.albumId ?? undefined,
            objectKey,
            width: processed.width,
            height: processed.height,
            byteSize: processed.blob.size,
            mimeType: processed.mimeType,
            // 选择顺序：0, 1, 2 …（后端如需自行分配可忽略此字段）
            sortOrder: i,
          },
        });
        if (token !== runToken) return;

        // 5. 成功
        item.status = "done";
        emit("uploaded", image);
      } catch (err: any) {
        console.error(`[UploadImageModal] item #${i} failed:`, err);
        item.status = "error";
        item.error =
          err instanceof ImageProcessError
            ? err.message
            : err?.message || "上传失败";
        // 单张失败不中断，继续后面的
      }
    }

    if (token !== runToken) return;
    running.value = false;

    // 全部成功 → 1.2 秒后自动关闭
    if (!hasError.value) {
      setTimeout(() => {
        if (token === runToken) visible.value = false;
      }, 1200);
    }
  } finally {
    if (token === runToken) running.value = false;
  }
}

// van-uploader 的 after-read 回调（多选时 item 是数组）
function handleAfterRead(item: any) {
  const arr = Array.isArray(item) ? item : [item];
  const files = arr
    .map((x) => x?.file)
    .filter((f): f is File => f instanceof File);

  // 清空 van-uploader 内部列表，改用自定义列表渲染
  uploaderList.value = [];

  if (files.length) void onFilesSelected(files);
}
</script>

<template>
  <van-popup
    v-model:show="visible"
    round
    :style="{ width: '92%', maxWidth: '440px' }"
    :close-on-click-overlay="!busy"
  >
    <div class="upload-modal">
      <header class="upload-modal__header">
        <h2 class="upload-modal__title">上传图片</h2>
        <p class="upload-modal__subtitle">
          {{ props.albumId ? "图片将加入当前画册" : "图片将加入「我的插画」" }}
        </p>
      </header>

      <!-- 状态 1：选择文件 -->
      <div v-if="items.length === 0" class="upload-modal__body">
        <van-uploader
          v-model="uploaderList"
          :after-read="handleAfterRead"
          :multiple="true"
          :max-count="20"
          :preview-image="false"
          accept="image/*,.heic,.heif"
          class="upload-modal__uploader"
        >
          <div class="picker">
            <div class="picker__icon">
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  fill="none"
                />
              </svg>
            </div>
            <div class="picker__text">点击选择图片</div>
            <div class="picker__hint">
              支持 JPG / PNG / WebP / HEIC，可多选，单张 ≤ 20MB
            </div>
          </div>
        </van-uploader>
      </div>

      <!-- 状态 2：批量上传列表 -->
      <div v-else class="upload-modal__body">
        <div class="overall">
          <span>{{ overallText }}</span>
        </div>

        <ul class="items">
          <li
            v-for="item in items"
            :key="item.uid"
            class="item"
            :class="`item--${item.status}`"
          >
            <div class="item__thumb">
              <img v-if="item.previewUrl" :src="item.previewUrl" alt="" />
              <van-loading
                v-else-if="item.status !== 'pending'"
                type="spinner"
                size="16"
              />
            </div>

            <div class="item__main">
              <div class="item__top">
                <span class="item__name">{{ item.file.name }}</span>
                <span class="item__status">{{ statusText(item) }}</span>
              </div>

              <div v-if="item.meta" class="item__meta">
                {{ formatSize(item.meta.originalSize) }}
                <span class="arrow">→</span>
                <span class="accent">{{ formatSize(item.meta.outputSize) }}</span>
              </div>

              <div v-if="item.status === 'uploading'" class="item__progress">
                <div
                  class="item__progress-bar"
                  :style="{ width: Math.max(item.progress, 2) + '%' }"
                />
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </van-popup>
</template>

<style scoped lang="less">
.upload-modal {
  padding: 24px 20px 20px;

  @media (max-width: 480px) {
    padding: 20px 16px 16px;
  }

  &__header {
    text-align: center;
    margin-bottom: 18px;
  }

  &__title {
    margin: 0 0 6px;
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 700;
    color: var(--ink-1);
    letter-spacing: -0.01em;
  }

  &__subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--ink-3);
  }

  &__body {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }

  &__uploader {
    width: 100%;

    :deep(.van-uploader__wrapper) {
      width: 100%;
    }
    :deep(.van-uploader__input-wrapper) {
      width: 100%;
    }
  }
}

/* ---------- 选择区 ---------- */
.picker {
  width: 100%;
  padding: 28px 16px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  &__icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-2);
  }

  &__text {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink-1);
  }

  &__hint {
    font-size: 12px;
    color: var(--ink-3);
    text-align: center;
  }
}

/* ---------- 进度总览 ---------- */
.overall {
  text-align: center;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--ink-3);
}

/* ---------- 上传列表 ---------- */
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 52vh;
  overflow-y: auto;
}

.item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  transition: border-color 0.15s ease, background 0.15s ease;

  &--done {
    border-color: var(--accent);
  }

  &--error {
    border-color: #e0a8a8;
    background: #fbe9e9;
  }

  &__thumb {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  &__main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12px;
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__status {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--ink-3);
  }

  &--done &__status {
    color: var(--accent);
  }

  &--error &__status {
    color: #c0392b;
  }

  &__meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-3);

    .arrow {
      padding: 0 4px;
    }
    .accent {
      color: var(--accent);
      font-weight: 500;
    }
  }

  &__progress {
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  &__progress-bar {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.2s ease;
  }
}
</style>