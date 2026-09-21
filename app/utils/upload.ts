// utils/upload.ts

export type OssDir = 'comic_pics' | 'avatar' | 'comic_avatar'

export interface OssToken {
  accessid: string
  host: string
  policy: string
  signature: string
  expire: number
  dir: string
}

export interface OssUploadResult {
  /** OSS 上的 object key，形如 image/1/abc.webp */
  objectKey: string
  /** 可直接用于 <img src> 的完整 URL */
  url: string
}

export interface OssUploadOptions {
  /** 上传目录。默认 comic_pics */
  fdir?: OssDir
  /**
   * 上传进度回调（0-100）
   * 注意：只有当浏览器支持 XHR 的 upload.onprogress 时才会被调用
   */
  onProgress?: (percent: number) => void
  /** 外部 AbortSignal，用于取消上传 */
  signal?: AbortSignal
}

/**
 * 生成一个不容易冲突的文件名
 * 例：a1b2c3d4-....webp
 */
export function buildFilename(ext = 'webp'): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `${uuid}.${ext.replace(/^\./, '')}`
}

/**
 * 从后端拿 OSS 直传签名
 */
async function fetchOssToken(fdir: OssDir): Promise<OssToken> {
  const config = useRuntimeConfig()
  const token = useCookie<string | null>('token')

  const res = await $fetch<OssToken>(`/oss/token/${fdir}`, {
    baseURL: config.public.apiBase,
    headers: token.value
      ? { Authorization: `Bearer ${token.value}` }
      : undefined,
  })
  return res
}

/**
 * 用 XMLHttpRequest 上传，因为 $fetch 不支持上传进度
 */
function uploadWithXhr(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)

    // 阿里 OSS 直传不建议带 cookie / authorization
    // 这些头会污染请求，导致签名校验失败
    xhr.withCredentials = false

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(
          new Error(
            `OSS 上传失败：${xhr.status} ${xhr.statusText || ''}`.trim(),
          ),
        )
      }
    }

    xhr.onerror = () => reject(new Error('OSS 上传网络错误'))
    xhr.ontimeout = () => reject(new Error('OSS 上传超时'))
    xhr.onabort = () => reject(new Error('上传已取消'))

    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(formData)
  })
}

/**
 * 上传 Blob 到阿里 OSS（直传，不经过后端服务器）
 *
 * @param blob      已经过 Canvas 压缩后的 Blob（webp/jpeg/png）
 * @param filename  文件名（不含目录），如 buildFilename('webp') 生成
 * @param options   可选配置
 * @returns         { objectKey, url }，objectKey 需要再发给后端写库
 *
 * @example
 * const blob = await processImage(file)       // 见 image-process.ts
 * const filename = buildFilename('webp')
 * const { objectKey, url } = await uploadToOss(blob, filename, {
 *   fdir: 'image',
 *   onProgress: (p) => console.log(`${p}%`),
 * })
 * // 然后调 POST /images 把 objectKey 写库
 */
export async function uploadToOss(
  blob: Blob,
  filename: string,
  options: OssUploadOptions = {},
): Promise<OssUploadResult> {
  const { fdir = 'comic_pics', onProgress, signal } = options

  // 1. 拿签名
  const token = await fetchOssToken(fdir)

  // 2. 组装表单（字段顺序按阿里 OSS 要求，file 必须放最后）
  const objectKey = `${token.dir}${filename}`
  const formData = new FormData()
  formData.append('key', objectKey)
  formData.append('policy', token.policy)
  formData.append('OSSAccessKeyId', token.accessid)
  formData.append('signature', token.signature)
  formData.append('success_action_status', '200')
  formData.append('file', blob, filename)

  // 3. 直传 OSS
  await uploadWithXhr(token.host, formData, onProgress, signal)

  // 4. 拼接完整 URL 返回（host 末尾可能带 /，dir 也可能带 /，统一处理）
  const base = token.host.replace(/\/$/, '')
  const path = objectKey.replace(/^\//, '')
  const url = `${base}/${path}`

  return { objectKey, url }
}