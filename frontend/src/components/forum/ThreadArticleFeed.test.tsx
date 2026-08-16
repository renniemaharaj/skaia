import { describe, expect, it } from "vitest";
import { extractThreadPreview } from "./ThreadArticleFeed";

describe("extractThreadPreview", () => {
  it("creates a readable article excerpt from rich thread content", () => {
    const preview = extractThreadPreview(`
      <h2>A Sky of Stars</h2>
      <p>Clouds of colors, <strong>of spectrums</strong>, they're loud.</p>
    `);

    expect(preview.text).toBe("A Sky of Stars Clouds of colors, of spectrums, they're loud.");
  });

  it("collects and deduplicates embedded thread uploads", () => {
    const preview = extractThreadPreview(`
      <p>Article body</p>
      <img src="/uploads/users/4/images/stars.jpg" />
      <img src="/uploads/users/4/images/stars.jpg" />
      <video><source src="/uploads/users/4/videos/reading.webm" /></video>
      <span class="attachment"><a href="/uploads/users/4/files/draft%20one.pdf">Draft</a></span>
    `);

    expect(preview.media).toEqual([
      {
        url: "/uploads/users/4/images/stars.jpg",
        type: "image",
        name: "stars.jpg",
      },
      {
        url: "/uploads/users/4/videos/reading.webm",
        type: "video",
        name: "reading.webm",
      },
      {
        url: "/uploads/users/4/files/draft%20one.pdf",
        type: "file",
        name: "draft one.pdf",
      },
    ]);
  });

  it("ignores inline SVG placeholders and empty attachment links", () => {
    const preview = extractThreadPreview(`
      <img src="data:image/svg+xml;base64,placeholder" />
      <span class="attachment"><a href="#">Empty</a></span>
    `);

    expect(preview.media).toEqual([]);
  });
});
