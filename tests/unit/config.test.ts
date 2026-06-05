import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock the Prisma DB
jest.mock("@/lib/db", () => ({
  db: {
    system_config: {
      findMany: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import {
  getConfig,
  getConfigBool,
  getConfigInt,
  getConfigDecimal,
  invalidateConfigCache,
} from "@/lib/config";

const mockDb = db as jest.Mocked<typeof db>;

function setConfigRows(rows: Array<{ ConfigKey: string; ConfigValue: string }>) {
  (mockDb.system_config.findMany as jest.Mock).mockResolvedValue(rows);
}

describe("lib/config", () => {
  beforeEach(() => {
    invalidateConfigCache();
    jest.clearAllMocks();
  });

  describe("getConfig", () => {
    it("returns correct value for existing key", async () => {
      setConfigRows([{ ConfigKey: "ranking_period", ConfigValue: "all_time" }]);
      const result = await getConfig("ranking_period");
      expect(result).toBe("all_time");
    });

    it("throws for missing key", async () => {
      setConfigRows([]);
      await expect(getConfig("nonexistent_key")).rejects.toThrow(
        "Config key 'nonexistent_key' not found in system_config."
      );
    });

    it("reads multiple keys from the same DB call", async () => {
      setConfigRows([
        { ConfigKey: "key_a", ConfigValue: "val_a" },
        { ConfigKey: "key_b", ConfigValue: "val_b" },
      ]);
      await getConfig("key_a");
      await getConfig("key_b");
      expect(mockDb.system_config.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("getConfigBool", () => {
    it("returns true for 'true'", async () => {
      setConfigRows([{ ConfigKey: "some_flag", ConfigValue: "true" }]);
      expect(await getConfigBool("some_flag")).toBe(true);
    });

    it("returns false for 'false'", async () => {
      setConfigRows([{ ConfigKey: "some_flag", ConfigValue: "false" }]);
      expect(await getConfigBool("some_flag")).toBe(false);
    });

    it("returns false for any non-true string", async () => {
      setConfigRows([{ ConfigKey: "some_flag", ConfigValue: "yes" }]);
      expect(await getConfigBool("some_flag")).toBe(false);
    });

    it("is case-insensitive ('TRUE' → true)", async () => {
      setConfigRows([{ ConfigKey: "some_flag", ConfigValue: "TRUE" }]);
      expect(await getConfigBool("some_flag")).toBe(true);
    });
  });

  describe("getConfigInt", () => {
    it("returns integer for valid numeric string", async () => {
      setConfigRows([{ ConfigKey: "otp_expiry_minutes", ConfigValue: "10" }]);
      expect(await getConfigInt("otp_expiry_minutes")).toBe(10);
    });

    it("truncates decimals (parseInt behaviour)", async () => {
      setConfigRows([{ ConfigKey: "val", ConfigValue: "12.7" }]);
      expect(await getConfigInt("val")).toBe(12);
    });

    it("throws for non-numeric string", async () => {
      setConfigRows([{ ConfigKey: "bad", ConfigValue: "abc" }]);
      await expect(getConfigInt("bad")).rejects.toThrow("not a valid integer");
    });
  });

  describe("getConfigDecimal", () => {
    it("returns float for '0.6'", async () => {
      setConfigRows([{ ConfigKey: "ranking_value_weight", ConfigValue: "0.6" }]);
      expect(await getConfigDecimal("ranking_value_weight")).toBeCloseTo(0.6);
    });

    it("throws for non-numeric string", async () => {
      setConfigRows([{ ConfigKey: "bad", ConfigValue: "not-a-number" }]);
      await expect(getConfigDecimal("bad")).rejects.toThrow("not a valid decimal");
    });
  });

  describe("caching", () => {
    it("second read within 60s does not hit DB again", async () => {
      setConfigRows([{ ConfigKey: "key_a", ConfigValue: "val_a" }]);
      await getConfig("key_a");
      await getConfig("key_a");
      expect(mockDb.system_config.findMany).toHaveBeenCalledTimes(1);
    });

    it("invalidateConfigCache forces fresh read", async () => {
      setConfigRows([{ ConfigKey: "key_a", ConfigValue: "v1" }]);
      const first = await getConfig("key_a");
      expect(first).toBe("v1");

      invalidateConfigCache();
      setConfigRows([{ ConfigKey: "key_a", ConfigValue: "v2" }]);
      const second = await getConfig("key_a");
      expect(second).toBe("v2");
      expect(mockDb.system_config.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
