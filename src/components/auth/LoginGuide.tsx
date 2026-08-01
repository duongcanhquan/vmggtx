'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Copy, KeyRound } from 'lucide-react'

/**
 * Hộp hướng dẫn đăng nhập — hiện trên /login (glass) và /coso (light).
 * Tài khoản demo (sau khi chạy `npm run seed` + migration 045).
 */
const DEMO_ROWS = [
  {
    role: 'Super Admin',
    email: 'superadmin@gdtx-demo.edu.vn',
    where: '/login',
  },
  {
    role: 'Admin Cầu Giấy',
    email: 'admin.cs1@gdtx-demo.edu.vn',
    where: '/coso/cau-giay/login',
  },
  {
    role: 'Admin Hà Đông',
    email: 'admin.cs2@gdtx-demo.edu.vn',
    where: '/coso/ha-dong/login',
  },
  {
    role: 'Admin Q.1',
    email: 'admin.cs3@gdtx-demo.edu.vn',
    where: '/coso/quan-1/login',
  },
  {
    role: 'Admin Thủ Đức',
    email: 'admin.cs4@gdtx-demo.edu.vn',
    where: '/coso/thu-duc/login',
  },
] as const

export function LoginGuide({
  compact = false,
  variant = 'glass',
}: {
  compact?: boolean
  /** glass = trên nền AuthShell tối; light = trang /coso sáng */
  variant?: 'glass' | 'light'
}) {
  const [open, setOpen] = useState(!compact)
  const [copied, setCopied] = useState<string | null>(null)
  const light = variant === 'light'

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`mt-4 rounded-xl border text-left ${
        light
          ? 'border-slate-200 bg-white text-slate-800 shadow-sm'
          : 'border-white/30 bg-black/20 text-white'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm font-semibold ${
          light ? 'text-slate-800' : 'text-white'
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
          Hướng dẫn đăng nhập / tài khoản demo
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          className={`space-y-3 border-t px-3.5 py-3 text-xs leading-relaxed ${
            light
              ? 'border-slate-200 text-slate-600'
              : 'border-white/20 text-white/90'
          }`}
        >
          <p>
            <strong className={light ? 'text-slate-900' : 'text-white'}>
              Mật khẩu demo chung:
            </strong>{' '}
            <button
              type="button"
              onClick={() => void copyText('Demo@123456')}
              className={`inline-flex items-center gap-1 font-mono font-bold hover:underline ${
                light ? 'text-indigo-700' : 'text-amber-200'
              }`}
            >
              Demo@123456
              <Copy className="h-3 w-3" aria-hidden="true" />
            </button>
            {copied === 'Demo@123456' && (
              <span className={`ml-1 ${light ? 'text-emerald-600' : 'text-emerald-200'}`}>
                đã copy
              </span>
            )}
          </p>
          <ul className="space-y-1.5">
            <li>
              • <strong className={light ? 'text-slate-800' : 'text-white'}>Super Admin</strong> →{' '}
              <Link
                href="/login"
                className={`font-mono underline ${light ? 'text-indigo-600' : ''}`}
              >
                /login
              </Link>
            </li>
            <li>
              • <strong className={light ? 'text-slate-800' : 'text-white'}>Mỗi cơ sở</strong> →{' '}
              <Link
                href="/coso"
                className={`font-mono underline ${light ? 'text-indigo-600' : ''}`}
              >
                /coso
              </Link>{' '}
              chọn trường, rồi bấm Đăng nhập
            </li>
            <li>• Học viên / Phụ huynh cũng vào từ trang cơ sở (/coso/…)</li>
          </ul>
          <div
            className={`overflow-x-auto rounded-lg border ${
              light ? 'border-slate-200' : 'border-white/20'
            }`}
          >
            <table className="min-w-full text-left text-[11px]">
              <thead
                className={light ? 'bg-slate-50 text-slate-600' : 'bg-white/10 text-white'}
              >
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Vai trò</th>
                  <th className="px-2 py-1.5 font-semibold">Email</th>
                  <th className="px-2 py-1.5 font-semibold">Vào tại</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ROWS.map((row) => (
                  <tr
                    key={row.email}
                    className={`border-t ${light ? 'border-slate-100' : 'border-white/10'}`}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5">{row.role}</td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => void copyText(row.email)}
                        className={`font-mono hover:underline ${
                          light ? 'text-indigo-700' : 'text-amber-100'
                        }`}
                        title="Sao chép email"
                      >
                        {row.email}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <Link
                        href={row.where}
                        className={`font-mono underline ${light ? 'text-indigo-600' : ''}`}
                      >
                        {row.where}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={light ? 'text-slate-500' : 'text-white/70'}>
            Sai mật khẩu / không có tài khoản → chạy{' '}
            <code
              className={`rounded px-1 ${light ? 'bg-slate-100' : 'bg-white/10'}`}
            >
              npm run seed
            </code>
            . /coso trống → chạy migration{' '}
            <code
              className={`rounded px-1 ${light ? 'bg-slate-100' : 'bg-white/10'}`}
            >
              045_org_slugs.sql
            </code>
            .
          </p>
        </div>
      )}
    </div>
  )
}
