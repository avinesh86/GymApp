import type {
  ChecklistCategory,
  ChecklistFrequency,
  ChecklistRunStatus,
  EquipmentCategory,
  EquipmentStatus,
  FaultSeverity,
  FaultStatus,
} from '../../types'

type BadgeVariant = 'green' | 'blue' | 'cyan' | 'orange' | 'red' | 'grey' | 'yellow' | 'darkred'

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  cardio: 'Cardio',
  strength: 'Strength machine',
  free_weights: 'Free weights',
  functional: 'Functional / rig',
  studio: 'Studio / class',
  pool: 'Pool / spa',
  building: 'Building / plant',
  other: 'Other',
}

export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: string; variant: BadgeVariant }> = {
  in_service: { label: 'In service', variant: 'green' },
  out_of_order: { label: 'Out of order', variant: 'red' },
  retired: { label: 'Retired', variant: 'grey' },
}

export const SEVERITY: Record<FaultSeverity, { label: string; variant: BadgeVariant }> = {
  low: { label: 'Minor', variant: 'grey' },
  medium: { label: 'Needs attention', variant: 'yellow' },
  out_of_use: { label: 'Out of use / unsafe', variant: 'red' },
}

export const FAULT_STATUS: Record<FaultStatus, { label: string; variant: BadgeVariant }> = {
  reported: { label: 'Reported', variant: 'orange' },
  in_progress: { label: 'Being fixed', variant: 'blue' },
  waiting_parts: { label: 'Waiting on parts', variant: 'yellow' },
  resolved: { label: 'Fixed', variant: 'green' },
}

export const CHECKLIST_CATEGORY: Record<ChecklistCategory, string> = {
  opening: 'Opening',
  closing: 'Closing',
  cleaning: 'Cleaning',
  safety: 'Safety',
  pool: 'Pool / spa',
  equipment: 'Equipment check',
  other: 'Other',
}

export const FREQUENCY: Record<ChecklistFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  every_n_days: 'Every few days',
}

export const RUN_STATUS: Record<ChecklistRunStatus, { label: string; variant: BadgeVariant }> = {
  due: { label: 'Due', variant: 'blue' },
  overdue: { label: 'Overdue', variant: 'red' },
  done: { label: 'Done', variant: 'green' },
  late: { label: 'Done late', variant: 'yellow' },
}

/** 0 = Monday … 6 = Sunday, as the server counts them. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  gym_manager: 'Gym Manager',
  team_leader: 'Team Leader',
  payroll: 'Payroll',
}

/** "06:00:00" → "6:00am" */
export function formatTime(value: string): string {
  const [h, m] = value.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

export function describeSchedule(t: { frequency: ChecklistFrequency; weekdays: number[]; interval_days: number; due_time: string }) {
  const by = `by ${formatTime(t.due_time)}`
  if (t.frequency === 'weekly') return `Weekly on ${t.weekdays.map((d) => WEEKDAYS[d]).join(', ')}, ${by}`
  if (t.frequency === 'every_n_days') return `Every ${t.interval_days} days, ${by}`
  return `${FREQUENCY[t.frequency]}, ${by}`
}

export function options<K extends string>(map: Record<K, string | { label: string }>) {
  return (Object.keys(map) as K[]).map((value) => {
    const entry = map[value]
    return { value, label: typeof entry === 'string' ? entry : entry.label }
  })
}
