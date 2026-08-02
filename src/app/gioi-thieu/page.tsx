import { redirect } from 'next/navigation'

/** Hub khám phá → chương đầu tiên (linh hoạt) */
export default function GioiThieuIndexPage() {
  redirect('/gioi-thieu/linh-hoat')
}
