// utils/image-process.ts

// ============================================================
// 常量
// ============================================================

/** 输出图片最长边的目标像素 */
const MAX_SIDE = 2048
/** 原图尺寸的硬上限（超过直接拒绝，避免浏览器 OOM） */
const HARD_LIMIT = 8000
/** 原始文件大小上限（20MB） */
const MAX_FILE_SIZE = 20 * 1024 * 1024
/** WebP 输出质量 */
const OUTPUT_QUALITY = 0.85
/** 长宽比范围：1:3 ~ 3:1 */
const RATIO_MIN = 1 / 3
const RATIO_MAX = 3
/** 输出格式 */
const OUTPUT_MIME = 'image/webp'
const OUTPUT_EXT = 'webp'
/** 头像输出边长（正方形） */
const AVATAR_SIDE = 200
/** 头像 WebP 输出质量（比普通图片略高，头像清晰度重要） */
const AVATAR_QUALITY = 0.9

// ============================================================
// 类型
// ============================================================

export type ImageProcessErrorCode =
  | 'UNSUPPORTED'   // 不是图片 / 不支持的格式
  | 'FILE_TOO_LARGE'// 原始文件过大
  | 'TOO_LARGE'     // 图片像素尺寸过大
  | 'RATIO'         // 长宽比不合法
  | 'DECODE_FAILED' // 浏览器无法解码
  | 'HEIC_FAILED'   // HEIC 转换失败
  | 'CANVAS'        // Canvas 相关失败
  | 'UNKNOWN'

export class ImageProcessError extends Error {
  code: ImageProcessErrorCode
  constructor(code: ImageProcessErrorCode, message: string) {
    super(message)
    this.name = 'ImageProcessError'
    this.code = code
  }
}

export interface ProcessedImage {
  /** 处理后的 Blob（webp），可直接上传 OSS */
  blob: Blob
  /** 处理后尺寸（可能已缩放） */
  width: number
  height: number
  /** 输出 MIME */
  mimeType: string
  /** 建议的文件扩展名（不含点） */
  ext: string
  /** 原图信息，用于日志或展示 */
  originalWidth: number
  originalHeight: number
  originalSize: number
  originalName: string
}

export interface ProcessedAvatar {
  /** 处理后的 Blob（webp 200×200） */
  blob: Blob
  width: number
  height: number
  mimeType: string
  ext: string
  originalWidth: number
  originalHeight: number
  originalSize: number
  originalName: string
}

// ============================================================
// 工具函数
// ============================================================

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function formatRatio(w: number, h: number): string {
  const g = gcd(w, h) || 1
  return `${w / g}:${h / g}`
}

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.heic') || name.endsWith('.heif')) return true
  const type = (file.type || '').toLowerCase()
  return type === 'image/heic' || type === 'image/heif'
}

/**
 * Canvas -> Blob 的 Promise 包装
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new ImageProcessError('CANVAS', '图片处理失败')),
      type,
      quality,
    )
  })
}

/**
 * 解码图片为 ImageBitmap，自动应用 EXIF 方向
 */
async function decodeBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new ImageProcessError(
      'DECODE_FAILED',
      '图片解码失败，可能文件损坏或格式不受支持',
    )
  }
}

// ============================================================
// HEIC / HEIF 转换
// ============================================================

/**
 * 动态加载 heic2any。
 * ES 模块本身就有缓存，不需要手动缓存 Promise。
 */
async function loadHeic2any(): Promise<any> {
  // const mod: any = await import('~/utils/heic2any.js')
  // 兼容 default 导出 / 命名导出 / 命名空间对象
  // return mod?.default?.heic2any || mod?.default || mod?.heic2any || mod

  // HEIC 转换只在浏览器里跑，SSR 阶段直接拒绝
  if (import.meta.server) {
    throw new ImageProcessError(
      'HEIC_FAILED',
      'HEIC 转换仅支持浏览器环境',
    )
  }

  const mod: any = await import('heic2any')
  return mod?.default || mod
}

/**
 * 把 HEIC / HEIF 转成 JPEG Blob
 */
async function convertHeic(file: File): Promise<Blob> {
  try {
    const heic2any = await loadHeic2any()
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.95,
    })
    // heic2any 可能返回 Blob 或 Blob[]
    const blob = Array.isArray(result) ? result[0] : result
    if (!(blob instanceof Blob)) {
      throw new Error('HEIC 转换返回了非 Blob')
    }
    return blob
  } catch (err: any) {
    throw new ImageProcessError(
      'HEIC_FAILED',
      `HEIC/HEIF 转换失败：${err?.message || err}`,
    )
  }
}

// ============================================================
// 主函数
// ============================================================

/**
 * 对用户上传的图片做完整预处理：
 *
 *   1. 类型 / 大小校验
 *   2. HEIC / HEIF → JPEG
 *   3. createImageBitmap 解码，自动应用 EXIF 方向
 *   4. 像素尺寸硬上限校验
 *   5. 长宽比校验（1:3 ~ 3:1）
 *   6. 等比缩放到最长边 ≤ 2048
 *   7. 导出 WebP（质量 0.85）
 *
 * @param file 用户通过 <input type="file"> 或拖拽选择的原始文件
 * @returns    处理后的图片信息，blob 可直接传给 uploadToOss()
 * @throws     ImageProcessError，带 code 便于分类处理
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  // ---- 1. 类型校验 ----
  const type = (file.type || '').toLowerCase()
  const isImageMime = type.startsWith('image/')
  if (!isImageMime && !isHeicFile(file)) {
    throw new ImageProcessError('UNSUPPORTED', '仅支持图片文件')
  }

  // ---- 2. 文件大小校验 ----
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageProcessError(
      'FILE_TOO_LARGE',
      `文件大小不能超过 ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB`,
    )
  }

  // ---- 3. HEIC 转换（如需） ----
  let workBlob: Blob = file
  if (isHeicFile(file)) {
    workBlob = await convertHeic(file)
  }

  // ---- 4. 解码 ----
  const bitmap = await decodeBitmap(workBlob)

  try {
    const ow = bitmap.width
    const oh = bitmap.height

    // ---- 5. 像素尺寸硬上限 ----
    if (ow > HARD_LIMIT || oh > HARD_LIMIT) {
      throw new ImageProcessError(
        'TOO_LARGE',
        `图片像素尺寸不能超过 ${HARD_LIMIT}×${HARD_LIMIT}`,
      )
    }

    // ---- 6. 长宽比校验 ----
    const ratio = ow / oh
    if (ratio < RATIO_MIN || ratio > RATIO_MAX) {
      throw new ImageProcessError(
        'RATIO',
        `图片长宽比需在 1:3 ~ 3:1 之间，当前为 ${formatRatio(ow, oh)}`,
      )
    }

    // ---- 7. 计算目标尺寸（等比缩放） ----
    let tw = ow
    let th = oh
    const maxSide = Math.max(ow, oh)
    if (maxSide > MAX_SIDE) {
      const scale = MAX_SIDE / maxSide
      tw = Math.max(1, Math.round(ow * scale))
      th = Math.max(1, Math.round(oh * scale))
    }

    // ---- 8. 绘制到 Canvas ----
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new ImageProcessError('CANVAS', '无法创建 Canvas 上下文')
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, tw, th)

    // ---- 9. 导出 WebP ----
    const blob = await canvasToBlob(canvas, OUTPUT_MIME, OUTPUT_QUALITY)

    return {
      blob,
      width: tw,
      height: th,
      mimeType: OUTPUT_MIME,
      ext: OUTPUT_EXT,
      originalWidth: ow,
      originalHeight: oh,
      originalSize: file.size,
      originalName: file.name,
    }
  } finally {
    // 立刻释放，避免大量图片同时处理时内存爆炸
    bitmap.close()
  }
}

/**
 * 处理头像：中心裁剪为正方形，缩放到 200×200，导出 WebP。
 *
 * 与 processImage 的差异：
 * - 不做长宽比校验（任意比例都能中心裁剪）
 * - 不做等比缩放（固定输出 200×200）
 * - 输出质量略高（0.9）
 *
 * @param file 用户选择的原始文件
 * @throws ImageProcessError
 */
export async function processAvatar(file: File): Promise<ProcessedAvatar> {
  // ---- 1. 类型校验 ----
  const type = (file.type || '').toLowerCase()
  const isImageMime = type.startsWith('image/')
  if (!isImageMime && !isHeicFile(file)) {
    throw new ImageProcessError('UNSUPPORTED', '仅支持图片文件')
  }

  // ---- 2. 文件大小校验 ----
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageProcessError(
      'FILE_TOO_LARGE',
      `文件大小不能超过 ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB`,
    )
  }

  // ---- 3. HEIC 转换（如需） ----
  let workBlob: Blob = file
  if (isHeicFile(file)) {
    workBlob = await convertHeic(file)
  }

  // ---- 4. 解码 ----
  const bitmap = await decodeBitmap(workBlob)

  try {
    const ow = bitmap.width
    const oh = bitmap.height

    // ---- 5. 像素尺寸硬上限 ----
    if (ow > HARD_LIMIT || oh > HARD_LIMIT) {
      throw new ImageProcessError(
        'TOO_LARGE',
        `图片像素尺寸不能超过 ${HARD_LIMIT}×${HARD_LIMIT}`,
      )
    }

    // ---- 6. 中心裁剪：取 min(宽, 高) 为边长 ----
    const side = Math.min(ow, oh)
    const sx = Math.floor((ow - side) / 2)
    const sy = Math.floor((oh - side) / 2)

    // ---- 7. 绘制到 200×200 Canvas ----
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIDE
    canvas.height = AVATAR_SIDE
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new ImageProcessError('CANVAS', '无法创建 Canvas 上下文')
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      bitmap,
      sx,
      sy,
      side,
      side, // 源矩形
      0,
      0,
      AVATAR_SIDE,
      AVATAR_SIDE, // 目标矩形
    )

    // ---- 8. 导出 WebP ----
    const blob = await canvasToBlob(canvas, OUTPUT_MIME, AVATAR_QUALITY)

    return {
      blob,
      width: AVATAR_SIDE,
      height: AVATAR_SIDE,
      mimeType: OUTPUT_MIME,
      ext: OUTPUT_EXT,
      originalWidth: ow,
      originalHeight: oh,
      originalSize: file.size,
      originalName: file.name,
    }
  } finally {
    bitmap.close()
  }
}