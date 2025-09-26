# QuickQuote

This project is an [Expo](https://expo.dev/) application that uses the Expo Router for navigation
alongside Supabase-backed authentication and local SQLite persistence. The project configuration targets
Expo SDK 54 and the matching React Native 0.74 release train.

## Getting started

1. Copy the provided `.env.example` file to `.env` and fill in your Supabase project details. The Expo app
   will refuse to start unless both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are
   defined, so confirm these values are present before running `yarn start`.
2. Install dependencies with **Yarn 3.6.4**. We manage Yarn via **Corepack** so every contributor runs the
   same toolchain and avoids the default Yarn 1.22.x that ships with Node installations:
   ```bash
   corepack enable
   corepack prepare yarn@3.6.4 --activate
   yarn install
   ```
3. Start the development server:
   ```bash
   yarn start
   ```

The start script disables Yarn's output wrapper so the Expo CLI can display its interactive dashboard
and QR code correctly. Once Metro has finished bundling, follow the on-screen prompts to launch the
application on a connected device, emulator, or the web.

## Daily development workflow

Follow these steps whenever you sit down to work on the project:

1. Pull the latest code so you start from an up-to-date main branch:
   ```bash
   git pull
   ```
2. Ensure your environment file is present and current. If anything in `.env.example` has changed,
   re-copy the file and update the secrets as needed:
   ```bash
   cp .env.example .env # only if you need to refresh values
   ```
3. Install any new dependencies that may have been added since your last session:
   ```bash
   yarn install
   ```
4. Launch the Expo development server (clear the Metro cache when you run into bundler issues):
   ```bash
   yarn start --tunnel --clear
   ```
5. From the Expo CLI prompt, open the app on your preferred target (press `i` for iOS simulator,
   `a` for Android emulator, or `w` for the web preview). Leave the server running while you work on code.
6. When you finish coding for the day, stop the Expo server with `Ctrl+C` in the terminal that is running
   it. In Codespaces you can either reuse that terminal tab or open a new one from the command palette
   (**Ctrl+Shift+P** → “New Terminal”).
7. Review the files you changed and stage anything that should be committed:
   ```bash
   git status
   git add <files to include> # use `git add .` to stage everything
   ```
8. Create a commit with a concise message that describes the work you just completed:
   ```bash
   git commit -m "short description of changes"
   ```
9. Push your branch back to GitHub from within Codespaces so the repository stays in sync:
   ```bash
   git push origin <branch-name>
   ```
   (Replace `<branch-name>` with the branch you are using, for example `main`.)

## Useful resources

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router documentation](https://docs.expo.dev/routing/introduction/)

## Troubleshooting common environment issues

- Delete cached artefacts when Metro refuses to bundle:
  ```bash
  rm -rf node_modules .expo .expo-shared
  yarn cache clean
  yarn install
  yarn start --clear
  ```
- Run Expo's dependency check if you suspect a mismatched native module:
  ```bash
  npx expo doctor --fix
  ```
- Keep the Expo CLI up to date:
  ```bash
  npm install -g expo@latest
  ```
