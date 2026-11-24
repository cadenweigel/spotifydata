/**
 * Tests for bucketPlatform. Each case is one realistic platform string
 * and the coarse label it should get.
 */

import { describe, expect, it } from "vitest";
import { bucketPlatform } from "./platform";

describe("bucketPlatform", () => {
  // Matches each bucket from a string Spotify actually sends, ignoring case.
  // Input: one platform string per bucket, plus an all-caps Android string.
  // Expected: iOS, Android, Windows, macOS, Web Player, and Other device.
  it("buckets one real-looking string per label", () => {
    expect(bucketPlatform("iOS 14.4.2 (iPhone13,2)")).toBe("iOS");
    expect(bucketPlatform("iPadOS 15.1")).toBe("iOS");
    expect(bucketPlatform("Android OS 11 API 30 (Google, Pixel 4a)")).toBe(
      "Android",
    );
    expect(bucketPlatform("ANDROID OS 9")).toBe("Android");
    expect(bucketPlatform("Windows 10 (10.0.19041; x64)")).toBe("Windows");
    expect(bucketPlatform("OS X 11.2.3 [arm 64]")).toBe("macOS");
    expect(bucketPlatform("Spotify (Macintosh)")).toBe("macOS");
    expect(bucketPlatform("web_player linux;firefox 88.0;desktop")).toBe(
      "Web Player",
    );
    expect(bucketPlatform("Google Cast")).toBe("Other device");
    expect(bucketPlatform("Samsung Smart TV")).toBe("Other device");
    expect(bucketPlatform("PlayStation 4")).toBe("Other device");
    expect(bucketPlatform("Xbox One")).toBe("Other device");
  });

  // Android is listed before TV, so a TV that runs Android stays Android.
  // Input: "Android TV".
  // Expected: "Android".
  it("checks Android before TV", () => {
    expect(bucketPlatform("Android TV")).toBe("Android");
  });

  // Keeps an uncommon platform, shortened when it is long.
  // Input: "Sonos", a 45-character label, and a label of exactly 40 characters.
  // Expected: "Sonos", the first 40 characters, and the 40-character label unchanged.
  it("keeps an unmatched string, cut to 40 characters", () => {
    expect(bucketPlatform("Sonos")).toBe("Sonos");
    const long = "Partner device abcdefghijklmnopqrstuvwxyz!!!!";
    expect(long.length).toBeGreaterThan(40);
    expect(bucketPlatform(long)).toBe(long.slice(0, 40));
    const exact = "x".repeat(40);
    expect(bucketPlatform(exact)).toBe(exact);
  });

  // Missing and blank platforms are unknown, not a bucket.
  // Input: null, a number, "", and spaces.
  // Expected: null for each.
  it("returns null when the platform is missing or blank", () => {
    expect(bucketPlatform(null)).toBeNull();
    expect(bucketPlatform(undefined)).toBeNull();
    expect(bucketPlatform(12)).toBeNull();
    expect(bucketPlatform("")).toBeNull();
    expect(bucketPlatform("   ")).toBeNull();
  });
});
