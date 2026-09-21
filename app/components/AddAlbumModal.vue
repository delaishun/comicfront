<script setup lang="ts">
// 添加画册组件
interface AlbumPublic {
  id: number
  userId: number
  title: string
  description: string | null
  coverImageId: number | null
  imageCount: number
  visibility: number
  createdAt: string
  updatedAt: string
}

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success', album: AlbumPublic): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const form = reactive({
  title: '',
  description: '',
})

const errors = reactive({
  title: '',
  description: '',
  global: '',
})

const loading = ref(false)

const TITLE_MAX = 50
const DESC_MAX = 200

function resetErrors() {
  errors.title = ''
  errors.description = ''
  errors.global = ''
}

function resetForm() {
  form.title = ''
  form.description = ''
  resetErrors()
}

function validate(): boolean {
  resetErrors()
  let ok = true

  const t = form.title.trim()
  if (!t) {
    errors.title = '请输入标题'
    ok = false
  } else if (t.length > TITLE_MAX) {
    errors.title = `标题不能超过 ${TITLE_MAX} 字`
    ok = false
  }

  if (form.description.length > DESC_MAX) {
    errors.description = `描述不能超过 ${DESC_MAX} 字`
    ok = false
  }

  return ok
}

async function handleSubmit() {
  if (loading.value) return
  if (!validate()) return

  loading.value = true
  errors.global = ''

  try {
    const { $api } = useNuxtApp()

    const res = await $api<AlbumPublic>('/albums', {
      method: 'POST',
      body: {
        title: form.title.trim(),
        description: form.description.trim() || null,
      },
    })

    emit('success', res)
    visible.value = false
  } catch (err: any) {
    const msg =
      err?.data?.error ||
      err?.data?.message ||
      err?.message ||
      '创建失败，请稍后重试'
    errors.global = msg
  } finally {
    loading.value = false
  }
}

watch(visible, (v) => {
  if (!v) resetForm()
})
</script>

<template>
  <van-popup
    v-model:show="visible"
    round
    :style="{ width: '92%', maxWidth: '440px' }"
    :close-on-click-overlay="!loading"
  >
    <div class="album-form">
      <header class="album-form__header">
        <h2 class="album-form__title">新建画册</h2>
        <p class="album-form__subtitle">给这一组画起个名字</p>
      </header>

      <form class="album-form__body" @submit.prevent="handleSubmit">
        <div class="field">
          <label class="field__label" for="album-title">标题</label>
          <input
            id="album-title"
            v-model="form.title"
            type="text"
            class="input"
            placeholder="例如：夏日速写"
            :maxlength="TITLE_MAX"
            :disabled="loading"
          >
          <div class="field__row">
            <span v-if="errors.title" class="field__error">{{ errors.title }}</span>
            <span class="field__hint">{{ form.title.length }} / {{ TITLE_MAX }}</span>
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="album-desc">描述（可选）</label>
          <textarea
            id="album-desc"
            v-model="form.description"
            class="textarea"
            placeholder="简单介绍一下这本画册…"
            :maxlength="DESC_MAX"
            :disabled="loading"
          />
          <div class="field__row">
            <span v-if="errors.description" class="field__error">{{ errors.description }}</span>
            <span class="field__hint">{{ form.description.length }} / {{ DESC_MAX }}</span>
          </div>
        </div>

        <p v-if="errors.global" class="album-form__error">
          {{ errors.global }}
        </p>

        <button
          type="submit"
          class="btn btn--primary btn--block album-form__submit"
          :disabled="loading"
        >
          {{ loading ? '提交中…' : '提交' }}
        </button>
      </form>
    </div>
  </van-popup>
</template>

<style scoped lang="less">
.album-form {
  padding: 28px 24px 24px;

  @media (max-width: 480px) {
    padding: 24px 18px 18px;
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

  &__body {
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
    margin-top: 12px;
  }
}

/* 字段下方：左边错误、右边字数统计 */
.field__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
</style>