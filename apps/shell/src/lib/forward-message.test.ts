import { describe, it, expect, vi } from "vitest";
import { buildForwardedContent, forwardMessage } from "./forward-message";

describe("ForwardMessage", () => {
  describe("buildForwardedContent", () => {
    describe("Given a text message", () => {
      it("should prepend a quote with the sender name", () => {
        const content = { msgtype: "m.text", body: "Hello world" };
        const result = buildForwardedContent(content, "Alice");

        expect(result).toEqual({
          msgtype: "m.text",
          body: "> Alice: Hello world\n\n",
        });
      });
    });

    describe("Given a notice message", () => {
      it("should treat it as text and add a quote", () => {
        const content = { msgtype: "m.notice", body: "Server notice" };
        const result = buildForwardedContent(content, "Bot");

        expect(result).toEqual({
          msgtype: "m.text",
          body: "> Bot: Server notice\n\n",
        });
      });
    });

    describe("Given an emote message", () => {
      it("should treat it as text and add a quote", () => {
        const content = { msgtype: "m.emote", body: "waves hello" };
        const result = buildForwardedContent(content, "Bob");

        expect(result).toEqual({
          msgtype: "m.text",
          body: "> Bob: waves hello\n\n",
        });
      });
    });

    describe("Given a message with no msgtype", () => {
      it("should default to text forwarding with a quote", () => {
        const content = { body: "plain message" };
        const result = buildForwardedContent(content, "Charlie");

        expect(result).toEqual({
          msgtype: "m.text",
          body: "> Charlie: plain message\n\n",
        });
      });
    });

    describe("Given an image message", () => {
      it("should copy the content as-is preserving the mxc URL", () => {
        const content = {
          msgtype: "m.image",
          body: "photo.jpg",
          url: "mxc://matrix.org/abc123",
          info: { w: 800, h: 600, mimetype: "image/jpeg", size: 102400 },
        };
        const result = buildForwardedContent(content, "Alice");

        expect(result).toEqual({
          msgtype: "m.image",
          body: "photo.jpg",
          url: "mxc://matrix.org/abc123",
          info: { w: 800, h: 600, mimetype: "image/jpeg", size: 102400 },
        });
      });
    });

    describe("Given a video message", () => {
      it("should copy the content as-is", () => {
        const content = {
          msgtype: "m.video",
          body: "clip.mp4",
          url: "mxc://matrix.org/vid456",
          info: { mimetype: "video/mp4", size: 5242880 },
        };
        const result = buildForwardedContent(content, "Bob");

        expect(result).toEqual({
          msgtype: "m.video",
          body: "clip.mp4",
          url: "mxc://matrix.org/vid456",
          info: { mimetype: "video/mp4", size: 5242880 },
        });
      });
    });

    describe("Given an audio message", () => {
      it("should copy the content as-is", () => {
        const content = {
          msgtype: "m.audio",
          body: "recording.ogg",
          url: "mxc://matrix.org/aud789",
          info: { mimetype: "audio/ogg", size: 65536, duration: 12000 },
        };
        const result = buildForwardedContent(content, "Charlie");

        expect(result).toEqual({
          msgtype: "m.audio",
          body: "recording.ogg",
          url: "mxc://matrix.org/aud789",
          info: { mimetype: "audio/ogg", size: 65536, duration: 12000 },
        });
      });
    });

    describe("Given a file message", () => {
      it("should copy the content as-is", () => {
        const content = {
          msgtype: "m.file",
          body: "report.pdf",
          url: "mxc://matrix.org/file000",
          info: { mimetype: "application/pdf", size: 1048576 },
        };
        const result = buildForwardedContent(content, "Dana");

        expect(result).toEqual({
          msgtype: "m.file",
          body: "report.pdf",
          url: "mxc://matrix.org/file000",
          info: { mimetype: "application/pdf", size: 1048576 },
        });
      });
    });

    describe("Given a media message with m.relates_to", () => {
      it("should strip relation metadata from the forwarded content", () => {
        const content = {
          msgtype: "m.image",
          body: "photo.jpg",
          url: "mxc://matrix.org/abc123",
          "m.relates_to": {
            "m.in_reply_to": { event_id: "$some-event" },
          },
        };
        const result = buildForwardedContent(content, "Eve");

        expect(result).not.toHaveProperty("m.relates_to");
        expect(result.msgtype).toBe("m.image");
        expect(result.url).toBe("mxc://matrix.org/abc123");
      });
    });

    describe("Given a sender name with special characters", () => {
      it("should include the sender name verbatim in the quote", () => {
        const content = { msgtype: "m.text", body: "test" };
        const result = buildForwardedContent(content, "@user:matrix.org");

        expect(result.body).toBe("> @user:matrix.org: test\n\n");
      });
    });
  });

  describe("forwardMessage", () => {
    describe("Given a valid client and target room", () => {
      it("should call sendEvent with the correct arguments", async () => {
        const sendEvent = vi.fn().mockResolvedValue({ event_id: "$new-event" });
        const mockClient = { sendEvent } as unknown as Parameters<typeof forwardMessage>[0];

        const content = { msgtype: "m.text", body: "> Alice: Hello\n\n" };
        await forwardMessage(mockClient, "!target:matrix.org", content);

        expect(sendEvent).toHaveBeenCalledTimes(1);
        expect(sendEvent).toHaveBeenCalledWith("!target:matrix.org", "m.room.message", content);
      });
    });

    describe("Given a sendEvent failure", () => {
      it("should propagate the error", async () => {
        const sendEvent = vi.fn().mockRejectedValue(new Error("Rate limited"));
        const mockClient = { sendEvent } as unknown as Parameters<typeof forwardMessage>[0];

        const content = { msgtype: "m.text", body: "> Alice: Hello\n\n" };
        await expect(forwardMessage(mockClient, "!target:matrix.org", content)).rejects.toThrow(
          "Rate limited",
        );
      });
    });
  });
});
