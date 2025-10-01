# Environment Audit

This document captures the latest local verification of critical development commands.

## npm install

- **Command:** `npm install`
- **Result:** Completed successfully with no vulnerabilities reported.
- **Notes:** npm prints `Unknown env config "http-proxy"` because the environment exports
  `npm_config_http_proxy`. You can clear it with `unset npm_config_http_proxy` before running
  npm commands if you want to silence the warning.

## npm start -- --tunnel

- **Command:** `npm start -- --tunnel`
- **Result:** The Expo CLI installs `@expo/ngrok` but fails with `CommandError: ngrok tunnel took too long to connect.`
- **Notes:** The tunnel requires outbound network access. Confirm that ngrok is allowed through your
  firewall or proxy, or run the development server without `--tunnel` and connect over the LAN.

## npx expo-doctor

- **Command:** `npx expo-doctor`
- **Result:** Fails because the CLI cannot reach the Expo API. The checks that rely on
  fetching metadata from Expo report `TypeError: fetch failed`.
- **Notes:** Ensure the machine can reach `https://api.expo.dev`. When working in an offline
  environment, rerun the command once connectivity is restored.
