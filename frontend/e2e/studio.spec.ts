import { test, expect } from "@playwright/test";

test("local application loads and rejects an unsupported source", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Local server connected")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Great media. Yours to keep." }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "YouTube video URL" })
    .fill("https://example.com/video");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("YouTube");
  expect(failures).toEqual([]);
});

test("analysis, source selection and audio download request", async ({
  page,
}) => {
  // Browser-level fixture exercises controls; real extraction/conversion is covered in Python integration tests.
  await page.route("**/api/analyze", (r) =>
    r.fulfill({
      json: {
        id: "BaW_jenozKc",
        url: "https://www.youtube.com/watch?v=BaW_jenozKc",
        title: "My original travel film",
        uploader: "Your collection",
        duration: 120,
        thumbnail: "",
        heights: [2160, 1080, 720],
        formats: [
          {
            format_id: "137",
            ext: "mp4",
            height: 1080,
            fps: 60,
            vcodec: "avc1",
            acodec: "none",
            filesize: 1000000,
          },
        ],
      },
    }),
  );
  let download: any;
  await page.route("**/api/jobs", async (r) => {
    if (r.request().method() === "POST") {
      download = r.request().postDataJSON();
      await r.fulfill({
        status: 201,
        json: { id: "browser-fixture", status: "queued" },
      });
    } else await r.continue();
  });
  await page.goto("/");
  await expect(page.getByText("Local server connected")).toBeVisible();
  await page
    .getByRole("textbox", { name: "YouTube video URL" })
    .fill("https://youtu.be/BaW_jenozKc");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My original travel film" }),
  ).toBeVisible();
  await page.getByLabel("Specific source").selectOption("137");
  await expect(page.getByLabel("Video quality")).toBeDisabled();
  await page.getByRole("tab", { name: "Audio only" }).click();
  await page.getByLabel("Audio format").selectOption("mp3");
  await page.getByLabel("Encoding quality").selectOption("320");
  await page.getByRole("button", { name: /Download audio/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Added to your download queue",
  );
  expect(download.mode).toBe("audio");
  expect(download.container).toBe("mp3");
  expect(download.audio_quality).toBe(320);
  expect(download.format_id).toBeNull();
});

test("settings, help and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Audio only" }).click();
  await page.getByLabel("Audio format").selectOption("flac");
  await expect(
    page.getByText(
      "WAV and FLAC do not restore detail lost in compressed source audio.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Encoding quality")).toBeDisabled();
});

test("clear history asks for confirmation and keeps active downloads", async ({
  page,
}) => {
  let jobs = [
    {
      id: "finished",
      title: "Saved original video",
      status: "completed",
      created: 1,
      downloaded: 100,
      total: 100,
      size: 100,
      folder: "~/Downloads",
    },
    {
      id: "active",
      title: "Still downloading",
      status: "downloading",
      created: 2,
      downloaded: 50,
      total: 100,
      folder: "~/Downloads",
    },
  ];
  let clears = 0;
  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() === "DELETE") {
      clears++;
      jobs = jobs.filter((job) => job.status !== "completed");
      await route.fulfill({ json: { cleared: 1 } });
    } else await route.fulfill({ json: jobs });
  });
  await page.goto("/");
  await expect(
    page.getByText("Saved original video", { exact: true }),
  ).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("files will stay on your Mac");
    await dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  expect(clears).toBe(0);
  await expect(
    page.getByText("Saved original video", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "saved files have not been deleted",
  );
  await expect(
    page.getByText("Saved original video", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Still downloading", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear history", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText("Still downloading", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Saved original video", { exact: true }),
  ).toHaveCount(0);
});
