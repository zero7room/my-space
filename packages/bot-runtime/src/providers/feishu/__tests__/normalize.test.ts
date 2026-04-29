import { describe, expect, it } from "vitest";
import { normalizeFeishuInbound } from "../normalize.js";

const groupAtBot = {
  schema: "2.0",
  header: {
    event_id: "ev1",
    event_type: "im.message.receive_v1",
    create_time: "1714349900000",
  },
  event: {
    sender: { sender_id: { open_id: "ou_alice" } },
    message: {
      message_id: "om_1",
      message_type: "text",
      chat_id: "oc_x",
      chat_type: "group",
      content: '{"text":"<at user_id=\\"ou_bot\\">Bot</at> please summarize"}',
      mentions: [{ id: { open_id: "ou_bot" }, name: "Bot" }],
    },
  },
};

describe("normalizeFeishuInbound", () => {
  it("parses a group @bot text message", async () => {
    const got = await normalizeFeishuInbound(groupAtBot, { botOpenId: "ou_bot" });
    expect(got).toMatchObject({
      externalEventId: "ev1",
      externalMessageId: "om_1",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      externalUserId: "ou_alice",
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
    });
    expect(got?.text.toLowerCase()).toContain("please summarize");
  });

  it("parses DM (chat_type=p2p) as dm", async () => {
    const dm = JSON.parse(JSON.stringify(groupAtBot));
    dm.event.message.chat_type = "p2p";
    dm.event.message.content = '{"text":"hi"}';
    dm.event.message.mentions = [];
    const got = await normalizeFeishuInbound(dm, { botOpenId: "ou_bot" });
    expect(got?.externalConversationType).toBe("dm");
    expect(got?.mentionsBot).toBe(false);
  });

  it("returns null for non im.message.receive_v1 event_type", async () => {
    const e = JSON.parse(JSON.stringify(groupAtBot));
    e.header.event_type = "im.message.message_read_v1";
    expect(await normalizeFeishuInbound(e, { botOpenId: "ou_bot" })).toBeNull();
  });

  it("detects /confirm slash command", async () => {
    const e = JSON.parse(JSON.stringify(groupAtBot));
    e.event.message.content = '{"text":"<at user_id=\\"ou_bot\\">Bot</at> /confirm"}';
    const got = await normalizeFeishuInbound(e, { botOpenId: "ou_bot" });
    expect(got?.slashCommand).toBe("confirm");
  });
});
