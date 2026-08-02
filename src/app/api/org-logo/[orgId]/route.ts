import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getObject, isR2Configured } from '@/lib/storage/r2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: { orgId: string } }

/**
 * Phục vụ logo công khai cho cổng login (anon).
 * Đọc logo_key từ organizations → stream từ R2.
 * Nếu logo_url là http(s)/data → redirect / trả trực tiếp.
 */
export async function GET(_req: Request, { params }: Params) {
  const orgId = params.orgId
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('logo_url, logo_key')
      .eq('id', orgId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!org) return new NextResponse('Not found', { status: 404 })

    const url = org.logo_url?.trim()
    if (url?.startsWith('http://') || url?.startsWith('https://')) {
      return NextResponse.redirect(url, 302)
    }
    if (url?.startsWith('data:image/')) {
      const comma = url.indexOf(',')
      if (comma < 0) return new NextResponse('Bad logo', { status: 404 })
      const meta = url.slice(5, comma) // image/png;base64
      const mime = meta.split(';')[0] || 'image/png'
      const b64 = url.slice(comma + 1)
      const buf = Buffer.from(b64, 'base64')
      return new NextResponse(buf, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    if (!org.logo_key || !isR2Configured()) {
      return new NextResponse('Not found', { status: 404 })
    }

    const obj = await getObject(org.logo_key)
    const body = obj.Body
    if (!body) return new NextResponse('Not found', { status: 404 })

    const bytes = await body.transformToByteArray()
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': obj.ContentType || 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
