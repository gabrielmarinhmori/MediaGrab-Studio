import { test, expect } from "@playwright/test";
import { formatETA, parseTimestamp, timestamp } from "../src/time";

test("time formatting handles minute/hour boundaries and unknown estimates", () => {
  for (const [seconds, expected] of [
    [0, "0s"],
    [59, "59s"],
    [60, "1m 0s"],
    [61, "1m 1s"],
    [3599, "59m 59s"],
    [3600, "1h 0m 0s"],
    [3661, "1h 1m 1s"],
  ] as const)
    expect(formatETA(seconds)).toBe(expected);
  expect(formatETA(null)).toBeNull();
  expect(formatETA(NaN)).toBeNull();
  expect(formatETA(-1)).toBeNull();
  expect(parseTimestamp("1:02:03")).toBe(3723);
  expect(parseTimestamp("120")).toBe(120);
  expect(parseTimestamp("0:60")).toBeNull();
  expect(parseTimestamp("1:60:00")).toBeNull();
  expect(parseTimestamp("-1")).toBeNull();
  expect(timestamp(43200)).toBe("12:00:00");
});

test("select two minutes from a twelve-hour video and validate clip bounds", async ({
  page,
}) => {
  await page.route("**/api/analyze", (r) =>
    r.fulfill({
      json: {
        id: "BaW_jenozKc",
        url: "https://www.youtube.com/watch?v=BaW_jenozKc",
        title: "My long recording",
        duration: 43200,
        thumbnail: "",
        uploader: "Me",
        heights: [1080],
        formats: [],
      },
    }),
  );
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/jobs", async (r) => {
    if (r.request().method() === "POST") {
      requests.push(r.request().postDataJSON());
      await r.fulfill({ status: 201, json: { id: "clip-test" } });
    } else await r.fulfill({ json: [] });
  });
  await page.goto("/");
  await expect(page.getByText("Local server connected")).toBeVisible();
  await page
    .getByRole("textbox", { name: "YouTube video URL" })
    .fill("https://youtu.be/BaW_jenozKc");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("checkbox", { name: "Download a clip" }).check();
  await page.getByLabel("Clip start time", { exact: true }).fill("1:00:00");
  await page.getByLabel("Clip end time", { exact: true }).fill("1:02:00");
  await expect(page.getByText("2:00 selected", { exact: true })).toBeVisible();
  await page.getByLabel("Clip end time", { exact: true }).fill("0:59:00");
  await expect(
    page.getByRole("button", { name: /Download video/ }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "start must be before end",
  );
  await page.getByLabel("Clip end time", { exact: true }).fill("13:00:00");
  await expect(
    page.getByRole("button", { name: /Download video/ }),
  ).toBeDisabled();
  await page.getByLabel("Clip end time", { exact: true }).fill("1:02:00");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Download video/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Added to your download queue",
  );
  expect(requests[0].clip_start).toBe(3600);
  expect(requests[0].clip_end).toBe(3720);
  await page.getByRole("checkbox", { name: "Download a clip" }).uncheck();
  await page.getByRole("tab", { name: "Audio only" }).click();
  await page.getByRole("button", { name: /Download audio/ }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].clip_start).toBeNull();
  expect(requests[1].clip_end).toBeNull();
});

test("download history displays seconds, minutes and hours for remaining time", async ({
  page,
}) => {
  await page.route("**/api/jobs", (r) =>
    r.fulfill({
      json: [59, 61, 3661].map((eta, i) => ({
        id: String(i),
        title: `Recording ${i}`,
        status: "downloading",
        created: 1,
        downloaded: 10,
        total: 100,
        eta,
        folder: "~/Downloads",
      })),
    }),
  );
  await page.goto("/");
  await expect(page.getByText(/59s left/)).toBeVisible();
  await expect(page.getByText(/ · 1m 1s left/)).toBeVisible();
  await expect(page.getByText(/1h 1m 1s left/)).toBeVisible();
});
