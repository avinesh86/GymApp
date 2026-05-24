import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Building2 } from "lucide-react";

export default function BusinessInfoTab({ editedStaff, setEditedStaff, canEdit }) {
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const setPayment = (field, value) => {
    setEditedStaff(prev => ({
      ...prev,
      payment_info: { ...(prev.payment_info || {}), [field]: value }
    }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setEditedStaff(prev => ({ ...prev, business_logo_url: file_url }));
    setUploadingLogo(false);
  };

  const pi = editedStaff.payment_info || {};

  return (
    <div className="space-y-5 pt-4">
      {/* Business identity */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Business Identity</p>
        <p className="text-xs text-slate-400">Appears on generated invoices. Leave blank to use full name.</p>
        <div>
          <Label>Company / Trading Name <span className="text-slate-400 font-normal">(optional)</span></Label>
          <Input
            value={editedStaff.business_name || ""}
            onChange={e => setEditedStaff(prev => ({ ...prev, business_name: e.target.value }))}
            placeholder="e.g. Jane Smith Fitness Ltd"
            className="mt-1"
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label>Business Logo <span className="text-slate-400 font-normal">(optional)</span></Label>
          <div className="mt-1 flex items-center gap-4">
            {editedStaff.business_logo_url && (
              <img src={editedStaff.business_logo_url} alt="Logo" className="h-12 w-auto rounded border border-slate-200 object-contain" />
            )}
            {canEdit && (
              <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer hover:border-indigo-300 transition-colors text-sm text-slate-500">
                <Upload className="w-4 h-4" />
                {uploadingLogo ? "Uploading…" : "Upload Logo"}
                <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={handleLogoUpload} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Payment details */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Details</p>
        <p className="text-xs text-slate-400">Bank details shown on invoices so payment can be made.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Bank Name</Label>
            <Input value={pi.bank_name || ""} onChange={e => setPayment("bank_name", e.target.value)} placeholder="e.g. Barclays" className="mt-1" disabled={!canEdit} />
          </div>
          <div>
            <Label>Account Name</Label>
            <Input value={pi.account_name || ""} onChange={e => setPayment("account_name", e.target.value)} placeholder="e.g. Jane Smith" className="mt-1" disabled={!canEdit} />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input value={pi.account_number || ""} onChange={e => setPayment("account_number", e.target.value)} placeholder="e.g. 12345678" className="mt-1" disabled={!canEdit} />
          </div>
          <div>
            <Label>Sort Code</Label>
            <Input value={pi.sort_code || ""} onChange={e => setPayment("sort_code", e.target.value)} placeholder="e.g. 20-00-00" className="mt-1" disabled={!canEdit} />
          </div>
          <div>
            <Label>Payment Reference</Label>
            <Input value={pi.payment_reference || ""} onChange={e => setPayment("payment_reference", e.target.value)} placeholder="e.g. Invoice number" className="mt-1" disabled={!canEdit} />
          </div>
        </div>
        <div>
          <Label>Additional Notes</Label>
          <Textarea value={pi.additional_info || ""} onChange={e => setPayment("additional_info", e.target.value)} placeholder="Any other payment instructions…" className="mt-1" rows={2} disabled={!canEdit} />
        </div>
      </div>
    </div>
  );
}