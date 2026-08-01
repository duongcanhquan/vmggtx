// Util CLIENT: upload file lên R2 qua presigned URL do Server Action ký.
// Dùng chung cho cổng Giáo viên (bài giảng/bài tập) và Học viên (bài nộp).

export type AttachmentMeta = {
  key: string
  name: string
  size: number
  type: string
}

type PresignFn = (file: {
  fileName: string
  fileType: string
  fileSize: number
}) => Promise<{ error: string } | { url: string; key: string }>

/**
 * Upload tuần tự từng file (giữ đơn giản, file bài giảng thường ít).
 * Trả về metadata để lưu vào cột attachments (jsonb).
 */
export async function uploadFilesToR2(
  files: File[],
  presign: PresignFn
): Promise<{ error: string } | { attachments: AttachmentMeta[] }> {
  const attachments: AttachmentMeta[] = []

  for (const file of files) {
    const presigned = await presign({
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
    })
    if ('error' in presigned) return { error: `${file.name}: ${presigned.error}` }

    const res = await fetch(presigned.url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) return { error: `Upload thất bại: ${file.name} (HTTP ${res.status})` }

    attachments.push({
      key: presigned.key,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    })
  }

  return { attachments }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
