import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Upload, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function InvoiceSettingsTab({ staffProfile, onUpdate }) {
  const [form, setForm] = useState({
    business_name: staffProfile?.business_name || "",
    business_logo_url: staffProfile?.business_logo_url || "",
    payment_info: {
      bank_name: staffProfile?.payment_info?.bank_name || "",
      account_name: staffProfile?.payment_info?.account_name || "",
      account_number: staffProfile?.payment_info?.account_number || "",
      sort_code: staffProfile?.payment_info?.sort_code || "",
      payment_reference: staffProfile?.payment_info?.payment_reference || "",
      additional_info: staffProfile?.payment_info?.additional_info || ""
    }
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const setPayment = (field, value) => {
    setForm(prev => ({ ...prev, payment_info: { ...prev.payment_info, [field]: value } }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, business_logo_url: file_url }));
      toast.success("Logo uploaded");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Staff.update(staffProfile.id, {
        business_name: form.business_name,
        business_logo_url: form.business_logo_url,
        payment_info: form.payment_info
      });
      onUpdate({ ...staffProfile, ...form });
      toast.success("Invoice settings saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Business Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-500" />
            Business Identity
          </CardTitle>
          <CardDescription>This information appears on your generated invoices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Business / Trading Name</Label>
            <Input
              value={form.business_name}
              onChange={e => setForm(prev => ({ ...prev, business_name: e.target.value }))}
              placeholder="e.g., Jane Smith Fitness Ltd"
              className="mt-1"
            />
            <p className="text-xs text-slate-400 mt-1">Leave blank to use your full name</p>
          </div>
          <div>
            <Label>Business Logo</Label>
            <div className="mt-1 flex items-center gap-4">
              {form.business_logo_url && (
                <img src={form.business_logo_url} alt="Logo" className="h-14 w-auto rounded border border-slate-200 object-contain" />
              )}
              <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer hover:border-indigo-300 transition-colors text-sm text-slate-500">
                <Upload className="w-4 h-4" />
                {uploadingLogo ? "Uploading..." : "Upload Logo"}
                <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment Details</CardTitle>
          <CardDescription>Bank details shown on your invoices so you can be paid</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Bank Name</Label>
              <Input value={form.payment_info.bank_name} onChange={e => setPayment('bank_name', e.target.value)} placeholder="e.g., Barclays" className="mt-1" />
            </div>
            <div>
              <Label>Account Name</Label>
              <Input value={form.payment_info.account_name} onChange={e => setPayment('account_name', e.target.value)} placeholder="e.g., Jane Smith" className="mt-1" />
            </div>
            <div>
              <Label>Account Number</Label>
              <Input value={form.payment_info.account_number} onChange={e => setPayment('account_number', e.target.value)} placeholder="e.g., 12345678" className="mt-1" />
            </div>
            <div>
              <Label>Sort Code</Label>
              <Input value={form.payment_info.sort_code} onChange={e => setPayment('sort_code', e.target.value)} placeholder="e.g., 20-00-00" className="mt-1" />
            </div>
            <div>
              <Label>Preferred Payment Reference</Label>
              <Input value={form.payment_info.payment_reference} onChange={e => setPayment('payment_reference', e.target.value)} placeholder="e.g., Invoice + number" className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Additional Payment Info</Label>
            <Textarea
              value={form.payment_info.additional_info}
              onChange={e => setPayment('additional_info', e.target.value)}
              placeholder="Any other payment instructions..."
              className="mt-1"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save Invoice Settings"}
      </Button>
    </div>
  );
}