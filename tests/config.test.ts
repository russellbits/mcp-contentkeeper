import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const tmpProject = join(tmpdir(), "ck-test-" + Date.now());

beforeAll(() => {
  mkdirSync(tmpProject, { recursive: true });
  writeFileSync(
    join(tmpProject, "contentkeeper.config.json"),
    JSON.stringify({
      project: { name: "TestSite", author: "tester", baseUrl: "https://test.com" },
      content: { dir: "./content", extension: ".md", defaultStatus: "draft" },
      staging: { dir: "./src/routes/articles", format: "svx", filenamePattern: "[slug]/+page.svx" },
      build: { adapter: "shell", command: "npm run build", outputDir: "./build", validationFiles: ["index.html"] },
      deploy: {
        adapter: "ftp",
        host: "${FTP_HOST}",
        port: 21,
        user: "${FTP_USER}",
        password: "${FTP_PASSWORD}",
        remotePath: "/public/",
        sync: "additive",
      },
      statuses: ["pitch", "draft", "review", "ready", "published", "archived"],
    })
  );
  writeFileSync(join(tmpProject, ".env"), "FTP_HOST=ftp.example.com\nFTP_USER=user\nFTP_PASSWORD=secret\n");
});

afterAll(() => rmSync(tmpProject, { recursive: true, force: true }));

describe("loadConfig", () => {
  it("loads and interpolates config from CK_PROJECT", async () => {
    process.env["CK_PROJECT"] = tmpProject;
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.project.name).toBe("TestSite");
    expect(config.deploy.host).toBe("ftp.example.com");
    expect(config.deploy.user).toBe("user");
    expect(config.deploy.password).toBe("secret");
  });

  it("throws if CK_PROJECT is not set", async () => {
    delete process.env["CK_PROJECT"];
    const { loadConfig } = await import("../src/config.ts");
    expect(() => loadConfig()).toThrow("CK_PROJECT");
  });

  it("resolves content dir as absolute path", async () => {
    process.env["CK_PROJECT"] = tmpProject;
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.content.dir).toBe(join(tmpProject, "content"));
  });
});
