import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'
import { Button } from '../../components/ui/Button'

/** The address a machine's QR label opens: its page in FitOps. */
export function equipmentUrl(id: number): string {
  return `${window.location.origin}/equipment/${id}`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Prints a label: the QR code, the machine's name and asset tag. */
export function printLabel(dataUrl: string, name: string, assetTag: string) {
  const win = window.open('', '_blank', 'width=420,height=520')
  if (!win) return
  win.document.write(`<!doctype html><html><head><title>${escapeHtml(name)} label</title>
<style>
  @page { size: 62mm 80mm; margin: 4mm; }
  body { font-family: Helvetica, Arial, sans-serif; text-align: center; margin: 0; }
  img { width: 50mm; height: 50mm; }
  .name { font-size: 14px; font-weight: bold; margin-top: 2mm; }
  .tag { font-size: 11px; color: #444; }
  .hint { font-size: 9px; color: #666; margin-top: 1mm; }
</style></head><body>
<img src="${dataUrl}" alt="">
<div class="name">${escapeHtml(name)}</div>
${assetTag ? `<div class="tag">${escapeHtml(assetTag)}</div>` : ''}
<div class="hint">Scan to see status or report a fault</div>
<script>window.onload = function () { window.print(); }</script>
</body></html>`)
  win.document.close()
}

/** A machine's QR code, with a Print label button. */
export function EquipmentQr({ id, name, assetTag }: { id: number; name: string; assetTag: string }) {
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    let live = true
    QRCode.toDataURL(equipmentUrl(id), { width: 360, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => live && setDataUrl(url))
      .catch(() => live && setDataUrl(''))
    return () => {
      live = false
    }
  }, [id])

  return (
    <div className="flex items-center gap-4">
      {dataUrl ? (
        <img src={dataUrl} alt={`QR code for ${name}`} className="h-28 w-28 rounded border border-gray-200" data-testid="equipment-qr" />
      ) : (
        <div className="h-28 w-28 rounded border border-gray-200 bg-gray-50" />
      )}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-gray-500 max-w-[14rem]">
          Stick this on the machine. Scanning it shows its status and lets staff report a fault.
        </p>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Printer className="h-4 w-4" />}
          disabled={!dataUrl}
          onClick={() => printLabel(dataUrl, name, assetTag)}
        >
          Print label
        </Button>
      </div>
    </div>
  )
}
