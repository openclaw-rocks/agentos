import { describe, it, expect } from "vitest";
import { isDehydratedDeviceSupported, setupDehydratedDevice } from "./dehydrated-device";

describe("dehydrated-device", () => {
  describe("isDehydratedDeviceSupported", () => {
    describe("Given MSC3814 is not yet implemented", () => {
      describe("When checking for support", () => {
        it("Then it should return false", () => {
          const result = isDehydratedDeviceSupported();

          expect(result).toBe(false);
        });
      });

      describe("When called multiple times", () => {
        it("Then it should consistently return false", () => {
          expect(isDehydratedDeviceSupported()).toBe(false);
          expect(isDehydratedDeviceSupported()).toBe(false);
          expect(isDehydratedDeviceSupported()).toBe(false);
        });
      });
    });
  });

  describe("setupDehydratedDevice", () => {
    describe("Given MSC3814 is not yet implemented", () => {
      describe("When calling setup", () => {
        it("Then it should resolve without error", async () => {
          await expect(setupDehydratedDevice()).resolves.toBeUndefined();
        });
      });

      describe("When calling setup multiple times", () => {
        it("Then it should resolve each time without error", async () => {
          await setupDehydratedDevice();
          await setupDehydratedDevice();
          // No error thrown
        });
      });
    });
  });
});
