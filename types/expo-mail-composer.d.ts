declare module "expo-mail-composer" {
  export type MailComposerOptions = {
    subject?: string;
    body?: string;
    recipients?: string[];
    attachments?: string[];
    isHtml?: boolean;
  };

  export enum MailComposerStatus {
    CANCELLED = "cancelled",
    SAVED = "saved",
    SENT = "sent",
    UNKNOWN = "unknown",
  }

  export type MailComposerResult = {
    status: MailComposerStatus;
  };

  export function composeAsync(options: MailComposerOptions): Promise<MailComposerResult>;
  export function isAvailableAsync(): Promise<boolean>;
}
