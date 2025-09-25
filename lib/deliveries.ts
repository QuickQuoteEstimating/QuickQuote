import * as FileSystem from "expo-file-system";
import { EstimateRecord } from "./estimates";
import { supabase } from "./supabase";

export type SendEstimateEmailOptions = {
  estimate: EstimateRecord;
  pdfUri: string;
  toEmail: string;
  subject?: string;
  message?: string;
};

export async function sendEstimateEmail({
  estimate,
  pdfUri,
  toEmail,
  subject,
  message,
}: SendEstimateEmailOptions): Promise<void> {
  if (!toEmail) {
    throw new Error("Missing recipient email address");
  }

  const base64Pdf = await FileSystem.readAsStringAsync(pdfUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const fileName = pdfUri.split("/").pop() ?? `estimate-${estimate.id}.pdf`;

  const { error } = await supabase.functions.invoke("send-estimate-email", {
    body: {
      estimateId: estimate.id,
      to: toEmail,
      subject: subject ?? `Estimate ${estimate.id}`,
      message,
      pdfBase64: base64Pdf,
      fileName,
      customer: estimate.customer,
      total: estimate.total,
      date: estimate.date,
      notes: estimate.notes,
      items: estimate.items,
    },
  });

  if (error) {
    throw new Error(error.message ?? "Failed to send estimate email");
  }
}
