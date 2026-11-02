import { useQuery } from '@tanstack/react-query'
import { getUnrecordedReport } from '../../api/reports'
import { Card } from '../../components/ui/Card'

/**
 * Classes that ran with no attendance recorded, grouped into regular slots
 * (class, day, time) so repeat gaps stand out — e.g. "Sprint, Mon 8:30am,
 * missed 4 of 6". These classes are left out of every average above.
 */
export function UnrecordedSection({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ['reports', 'unrecorded', from, to],
    queryFn: () => getUnrecordedReport(from, to),
    enabled: !!(from && to),
  })

  if (!data) return null
  const slots = data.by_slot

  return (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          No Attendance Recorded
          <span className="ml-2 text-xs font-normal text-gray-400">({data.total} classes)</span>
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Classes that ran with no count. They're left out of the averages, so regular gaps show up here instead.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Classes with no attendance recorded">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium">
              <th className="px-4 py-2 text-left">Class</th>
              <th className="px-4 py-2 text-left">Day / Time</th>
              <th className="px-4 py-2 text-right">Not Recorded</th>
              <th className="px-4 py-2 text-left">Instructors</th>
              <th className="px-4 py-2 text-left">Last Missed</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => {
              const repeat = slot.missed >= 2
              return (
                <tr key={`${slot.class_type_id}-${slot.day}-${slot.time}`} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{slot.class_name}</td>
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                    {slot.day} {slot.time}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <span
                      className={[
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        repeat ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600',
                      ].join(' ')}
                    >
                      {slot.missed} of {slot.held}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {slot.instructors.map((i) => (i.missed > 1 ? `${i.name} (${i.missed})` : i.name)).join(', ')}
                  </td>
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{slot.last_missed}</td>
                </tr>
              )
            })}
            {slots.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Every class in this period has attendance recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
