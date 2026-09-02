import { assertEquals } from "jsr:@std/assert@1.0.14";

import { deriveReplyContext } from "./reply-context.ts";

const messageId = "<request@example.test>";

Deno.test("preserves the internal XBF requester reply contract", () => {
  assertEquals(
    deriveReplyContext({
      senderEmail: "jgonzalez@xbfreight.com",
      internetMessageId: messageId,
      subject: "Supplier registration",
      to: ["sales@heymarksman.com"],
      cc: ["carriers@xbfreight.com"],
    }),
    {
      to: ["jgonzalez@xbfreight.com"],
      cc: ["sales@heymarksman.com"],
      subject: "Re: Supplier registration",
      inReplyTo: messageId,
      references: [messageId],
    },
  );
});

Deno.test("routes a Sales-originated OSP request to its captured external recipients", () => {
  assertEquals(
    deriveReplyContext({
      senderEmail: "sales@heymarksman.com",
      internetMessageId: messageId,
      subject: "Re: PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN",
      to: ["telemarketing@salzillo.com.mx", "carriers@xbfreight.com"],
      cc: [],
    }),
    {
      to: ["telemarketing@salzillo.com.mx"],
      cc: ["sales@heymarksman.com"],
      subject: "Re: PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN",
      inReplyTo: messageId,
      references: [messageId],
    },
  );
});

Deno.test("fails closed when a Sales request has no captured external recipient", () => {
  assertEquals(
    deriveReplyContext({
      senderEmail: "sales@heymarksman.com",
      internetMessageId: messageId,
      subject: "Supplier registration",
      to: ["carriers@xbfreight.com"],
      cc: ["ops@xbfreight.com"],
    }),
    null,
  );
});
