export const MailComposerStatus = {
  CANCELLED: "cancelled",
  SAVED: "saved",
  SENT: "sent",
};

export const isAvailableAsync = jest.fn().mockResolvedValue(true);

export const composeAsync = jest
  .fn()
  .mockResolvedValue({ status: MailComposerStatus.SENT });
