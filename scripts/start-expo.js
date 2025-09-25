#!/usr/bin/env node

const { spawn } = require("node:child_process");
let cliPath;

try {
  cliPath = require.resolve("expo/bin/cli");
} catch (error) {
  console.error(
    "Unable to find the Expo CLI in local dependencies. Make sure you've installed packages with `yarn install`."
  );
  process.exit(1);
}

const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    YARN_WRAP_OUTPUT: "0",
  },
});

child.on("error", (error) => {
  console.error("Failed to launch the Expo CLI", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
