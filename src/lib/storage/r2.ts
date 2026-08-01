// ============================================================
// CLOUDFLARE R2 - LƯU TRỮ FILE (S3-compatible API)
//
// Biến môi trường cần có (Cloudflare Dashboard -> R2):
//   R2_ACCOUNT_ID        : ID tài khoản Cloudflare
//   R2_ACCESS_KEY_ID     : Access Key của R2 API Token
//   R2_SECRET_ACCESS_KEY : Secret Key của R2 API Token
//   R2_BUCKET_NAME       : tên bucket (VD: gdtx-erp)
//
// Mô hình PRESIGNED URL - server KHÔNG trung chuyển file:
//   Upload  : server ký URL PUT (hết hạn 10') -> browser PUT thẳng lên R2
//   Download: server ký URL GET (hết hạn 1h)  -> browser tải thẳng từ R2
// Mọi hàm ở đây CHỈ được gọi từ Server Action đã kiểm tra quyền.
// ============================================================

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const UPLOAD_EXPIRES_SECONDS = 10 * 60
const DOWNLOAD_EXPIRES_SECONDS = 60 * 60

/** Giới hạn 50MB/file - đủ cho slide, PDF, audio bài giảng */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

/** Loại file cho phép trong LMS (bài giảng + bài nộp) */
export const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument', // docx, xlsx, pptx
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/zip',
  'text/plain',
  'text/markdown',
]

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))
}

/** R2 đã cấu hình chưa (thiếu -> tính năng file tự ẩn, KHÔNG crash app) */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  )
}

let cachedClient: S3Client | null = null

function getR2Client(): S3Client {
  if (!isR2Configured()) {
    throw new Error(
      'Chưa cấu hình lưu trữ R2. Thêm R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME vào .env'
    )
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return cachedClient
}

/** Làm sạch tên file: bỏ dấu, ký tự lạ -> an toàn làm object key */
export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120)
}

/**
 * Sinh object key có namespace theo org -> file các cơ sở không lẫn nhau:
 * org/{orgId}/{scope}/{timestamp}-{random}-{fileName}
 */
export function buildObjectKey(orgId: string, scope: string, fileName: string): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `org/${orgId}/${scope}/${Date.now()}-${random}-${sanitizeFileName(fileName)}`
}

/** Ký URL upload (PUT). Browser phải PUT đúng Content-Type đã ký. */
export async function presignUpload(
  key: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
  })
  const url = await getSignedUrl(client, command, { expiresIn: UPLOAD_EXPIRES_SECONDS })
  return { url, key }
}

/** Ký URL tải xuống (GET), ép tên file gốc khi save-as */
export async function presignDownload(key: string, fileName?: string): Promise<string> {
  const client = getR2Client()
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ...(fileName
      ? {
          ResponseContentDisposition: `attachment; filename="${sanitizeFileName(fileName)}"`,
        }
      : {}),
  })
  return getSignedUrl(client, command, { expiresIn: DOWNLOAD_EXPIRES_SECONDS })
}
