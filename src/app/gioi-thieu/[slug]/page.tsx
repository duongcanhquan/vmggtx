import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChapterPage } from '@/components/landing/ChapterPage'
import { CHAPTERS, getChapter } from '@/components/landing/chapters'

type Props = { params: { slug: string } }

export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ slug: c.slug }))
}

export function generateMetadata({ params }: Props): Metadata {
  const chapter = getChapter(params.slug)
  if (!chapter) return { title: 'EDU SYSTEM' }
  return {
    title: `${chapter.title} · EDU SYSTEM`,
    description: chapter.teaser,
  }
}

export default function GioiThieuChapterPage({ params }: Props) {
  if (!getChapter(params.slug)) notFound()
  // Chỉ truyền slug (serializable) — icon Lucide không serialize được qua RSC
  return <ChapterPage slug={params.slug} />
}
