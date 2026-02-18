export type SlackThreadHistoryMessage = Readonly<{
  sourceEventId: string;
  messageTs: string;
  userId: string;
  text: string;
  isBot: boolean;
}>;
