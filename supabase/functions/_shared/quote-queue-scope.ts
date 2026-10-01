/** Generic senders must preserve QuoteDesk's price snapshot and receipt contract. */
export const QUOTE_QUEUE_SOURCE = "quotedesk_queue_v1";
export function isQuoteQueueMessage(row: Record<string, any>) {
  return row.metadata?.source === QUOTE_QUEUE_SOURCE;
}
