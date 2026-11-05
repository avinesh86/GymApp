import type { EquipmentCategory, EquipmentStatus, FaultSeverity, FaultStatus } from '../../types'

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

export function options<K extends string>(map: Record<K, string | { label: string }>) {
  return (Object.keys(map) as K[]).map((value) => {
    const entry = map[value]
    return { value, label: typeof entry === 'string' ? entry : entry.label }
  })
}
