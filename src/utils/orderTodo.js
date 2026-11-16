export const todoOrderStatuses = ['confirmed', 'paying', 'escrow_pending', 'delivering']
export const orderStatusLabel = status => ({ confirmed: '待签署', paying: '付款中', escrow_pending: '已托管', delivering: '交割中', completed: '已完成', cancelled: '已取消', refunded: '已退款' })[status] || status
export const orderSteps = ['待签署', '付款中', '交割中', '已完成']
export const orderStepIndex = status => ({ confirmed: 0, paying: 1, escrow_pending: 1, delivering: 2, completed: 3 })[status] ?? -1

// 按进行中状态查询并读取全部页，避免已完成订单占满首页而遗漏待办。
export async function loadTodoOrders(api, role) {
  const groups = await Promise.all(todoOrderStatuses.map(async status => {
    const first = await api.listOrders({ role, status, pageNum: 1, pageSize: 100 })
    const rows = data => Array.isArray(data) ? data : data?.list || data?.rows || []
    const pages = Math.ceil(Number(first?.total || 0) / 100)
    const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => api.listOrders({ role, status, pageNum: i + 2, pageSize: 100 })))
    return [first, ...rest].flatMap(rows).filter(order => order.status === status)
  }))
  return groups.flat().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}
