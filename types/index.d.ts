export type ApprovalStatus = 'pending' | 'approved' | 'chat' | 'resolved'

export type Approval = {
  id: string
  title: string
  recommendation: string
  why?: string
  alternatives?: string
  status: ApprovalStatus
  askedAt: number
  resolvedAt?: number
  outcome?: string
}

export type Board = { root: string; items: Approval[] }

declare module 'claude-code' {
  interface PluginState {
    approvals: { board: Board; expanded: string[] }
  }
}
