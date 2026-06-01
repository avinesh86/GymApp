import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getTenantSettings, updateTenantSettings } from '../../../api/settings'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Card } from '../../../components/ui/Card'

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 6, label: 'Saturday' },
]

const VIEW_OPTIONS = [
  { value: 'week', label: 'Week View' },
  { value: 'list', label: 'List View' },
]

export function TimetableTab() {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings })

  const [weekStart, setWeekStart] = useState('1')
  const [defaultView, setDefaultView] = useState('week')

  useEffect(() => {
    if (settings) {
      setWeekStart(String(settings.week_start_day ?? 1))
      setDefaultView(settings.default_timetable_view ?? 'week')
    }
  }, [settings])

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      updateTenantSettings({
        week_start_day: Number(weekStart),
        default_timetable_view: defaultView as 'week' | 'list',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] })
      toast.success('Timetable settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })

  return (
    <div className="max-w-md">
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Timetable Preferences</h3>
        <div className="flex flex-col gap-4">
          <Select
            label="Week Start Day"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            options={DAY_OPTIONS.map((d) => ({ value: String(d.value), label: d.label }))}
          />
          <Select
            label="Default View"
            value={defaultView}
            onChange={(e) => setDefaultView(e.target.value)}
            options={VIEW_OPTIONS}
          />
          <Button onClick={() => save()} isLoading={isPending} className="w-fit">
            Save Preferences
          </Button>
        </div>
      </Card>
    </div>
  )
}
