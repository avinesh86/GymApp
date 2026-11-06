import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getTenantSettings, updateTenantSettings } from '../../../api/settings'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Card } from '../../../components/ui/Card'
import type { TenantSettings, TimetableTileStyle } from '../../../types'
import { WhenLoaded } from './WhenLoaded'

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 6, label: 'Saturday' },
]

const VIEW_OPTIONS = [
  { value: 'week', label: 'Week View' },
  { value: 'list', label: 'List View' },
]

const TILE_STYLES: { value: TimetableTileStyle; label: string; hint: string }[] = [
  { value: 'stripe', label: 'Stripe', hint: 'Class colour down the side' },
  { value: 'tint', label: 'Tint', hint: 'Light wash of the class colour' },
  { value: 'solid', label: 'Solid', hint: 'Full class colour' },
]

/** A miniature class tile in the given style, using an example teal class. */
function TilePreview({ style }: { style: TimetableTileStyle }) {
  const colour = '#0d9488'
  const background = style === 'solid' ? colour : style === 'tint' ? `${colour}26` : '#ffffff'
  return (
    <div
      aria-hidden="true"
      className="rounded-md border border-gray-100 border-l-4 px-2 py-1.5 text-xs"
      style={{ borderLeftColor: colour, backgroundColor: background }}
    >
      <p className={`font-bold ${style === 'solid' ? 'text-white' : 'text-gray-900'}`}>Sprint</p>
      <p className={style === 'solid' ? 'text-white/80' : 'text-gray-400'}>8:30am</p>
    </div>
  )
}

export function TimetableTab() {
  const query = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings })
  return (
    <WhenLoaded query={query} what="the timetable settings">
      {(settings) => <TimetableForm settings={settings} />}
    </WhenLoaded>
  )
}

function TimetableForm({ settings }: { settings: TenantSettings }) {
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState(String(settings.week_start_day ?? 1))
  const [defaultView, setDefaultView] = useState<string>(settings.default_timetable_view ?? 'week')
  const [tileStyle, setTileStyle] = useState<TimetableTileStyle>(settings.timetable_tile_style ?? 'tint')

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      updateTenantSettings({
        week_start_day: Number(weekStart),
        default_timetable_view: defaultView as 'week' | 'list',
        timetable_tile_style: tileStyle,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] })
      queryClient.invalidateQueries({ queryKey: ['timetable-display'] })
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
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-1">Class Tile Colour</legend>
            <p className="text-xs text-gray-500 mb-2">
              How strongly each class's colour shows on the week view. Once attendance is recorded,
              the tile turns a pastel of its viability colour instead.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TILE_STYLES.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    'flex flex-col gap-2 rounded-lg border p-2 cursor-pointer transition-colors',
                    tileStyle === opt.value ? 'border-cyan-500 ring-1 ring-cyan-500' : 'border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                >
                  <TilePreview style={opt.value} />
                  <span className="flex items-center gap-1.5 text-sm text-gray-900">
                    <input
                      type="radio"
                      name="tile-style"
                      value={opt.value}
                      checked={tileStyle === opt.value}
                      onChange={() => setTileStyle(opt.value)}
                      className="accent-cyan-500"
                    />
                    {opt.label}
                  </span>
                  <span className="text-xs text-gray-500">{opt.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button onClick={() => save()} isLoading={isPending} className="w-fit">
            Save Preferences
          </Button>
        </div>
      </Card>
    </div>
  )
}
