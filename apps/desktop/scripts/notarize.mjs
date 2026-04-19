import path from "node:path";
import { fileURLToPath } from "node:url";
import { notarize } from "@electron/notarize";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const log = (message) => {
  console.log(`[desktop][notarize] ${message}`);
};

const hasAppleIdCredentials = () =>
  Boolean(
    process.env.APPLE_ID &&
      process.env.APPLE_APP_SPECIFIC_PASSWORD &&
      process.env.APPLE_TEAM_ID
  );

const hasApiKeyCredentials = () =>
  Boolean(
    process.env.APPLE_API_KEY &&
      process.env.APPLE_API_KEY_ID &&
      process.env.APPLE_API_ISSUER
  );

export default async function notarizeApp(context) {
  if (process.platform !== "darwin") {
    log("skipping notarization on non-macOS host");
    return;
  }

  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== "darwin") {
    log(`skipping notarization for platform ${electronPlatformName}`);
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appBundleId = packager.appInfo.id;
  const appPath = path.join(appOutDir, `${appName}.app`);

  if (!hasAppleIdCredentials() && !hasApiKeyCredentials()) {
    log("skipping notarization because no Apple credentials were provided");
    return;
  }

  const opts = hasApiKeyCredentials()
    ? {
        tool: "notarytool",
        appBundleId,
        appPath,
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER
      }
    : {
        tool: "notarytool",
        appBundleId,
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      };

  log(`submitting ${appPath.replace(`${__dirname}/../`, "")} for notarization`);
  await notarize(opts);
  log("notarization completed");
}
