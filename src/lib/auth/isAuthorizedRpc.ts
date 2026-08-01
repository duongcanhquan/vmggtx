// ============================================================
// isAuthorizedRpc - gọi RPC is_authorized TƯƠNG THÍCH 2 phiên bản:
// - Bản 049 (4 tham số): thêm p_menu_key -> quyền kiêm nhiệm gán
//   theo user mở được action (tối đa mức Giáo vụ).
// - DB CHƯA chạy migration 049 -> lời gọi 4 tham số lỗi "function
//   not found" -> TỰ ĐỘNG gọi lại bản cũ 3 tham số (an toàn, không
//   làm sập các action khi deploy trước migration).
// ============================================================

type IsAuthorizedArgs = {
  p_user_id: string
  p_target_org_id: string
  p_required_role: string
  /** Menu key của hạng mục (049) - người được gán kiêm nhiệm sẽ qua cửa */
  p_menu_key?: string
}

type RpcResult = { data: unknown; error: { message: string } | null }

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>
}

export async function isAuthorizedRpc(
  client: unknown,
  args: IsAuthorizedArgs
): Promise<{ data: boolean | null; error: { message: string } | null }> {
  const supabase = client as RpcClient

  const first = await supabase.rpc('is_authorized', args)
  if (!first.error) {
    return { data: first.data === true, error: null }
  }

  // Lỗi + có p_menu_key -> khả năng DB chưa có bản 049: thử bản cũ
  if (args.p_menu_key !== undefined) {
    const { p_menu_key: _omitted, ...legacyArgs } = args
    void _omitted
    const retry = await supabase.rpc('is_authorized', legacyArgs)
    return { data: retry.error ? null : retry.data === true, error: retry.error }
  }

  return { data: null, error: first.error }
}
