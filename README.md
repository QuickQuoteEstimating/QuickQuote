# QuickQuote

This project is an [Expo](https://expo.dev/) application that uses the Expo Router for navigation
alongside Supabase-backed authentication and local SQLite persistence. The project configuration targets
the latest stable Expo SDK (51) and the corresponding React Native 0.74 release.

## Getting started

1. Copy the provided `.env.example` file to `.env` and fill in your Supabase project details.
2. Install dependencies:
   ```bash
   npm install
   ```

## Daily workflow

Follow these steps each time you log in to work on the project:

1. **Sync with `main`:**
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Create or switch to your feature branch:**
   ```bash
   git checkout -b <feature-branch>
   # or, if the branch already exists
   git checkout <feature-branch>
   ```
3. **Run the development server to verify the project still boots:**
   ```bash
   npm run start
   ```
   The command runs Expo in offline mode so that the Metro bundler starts even when external network requests fail (for example, when the CLI cannot reach Expo's version service). You should now see the familiar QR code and device options in the terminal. Leave the server running while you work so the app reloads as you make changes.
4. **Implement your changes.** Save files frequently and monitor the terminal for TypeScript or bundler errors.
5. **Run the automated tests before committing:**
   ```bash
   npm test
   ```
6. **Review the git status and stage your work:**
   ```bash
   git status
   git add <files>
   ```
7. **Commit with a descriptive message and push to GitHub:**
   ```bash
   git commit -m "<summary of changes>"
   git push origin <feature-branch>
   ```
8. **Open a pull request** on GitHub targeting `main`, ensure CI passes, and request review.

## Viewing the mobile app

The project uses [Expo](https://expo.dev/) for local development. After running `npm run start`, the Expo CLI prints a QR code and URL:

- **Physical device:** Install the Expo Go app on your iOS or Android device. Scan the QR code (Android) or use the Expo Go camera (iOS) to load the project over the local network.
- **Android emulator:** With an Android emulator running, press `a` in the Expo CLI terminal or run `npm run android` to open the project.
- **iOS simulator (macOS only):** Press `i` in the Expo CLI terminal or run `npm run ios`.
- **Web preview:** Press `w` in the Expo CLI terminal or run `npm run web` to launch the Expo web build in a browser.
- **Architecture compatibility:** Expo Go currently ships without the React Native New Architecture enabled. Keep `newArchEnabled` disabled in `app.config.ts` when developing with Expo Go, otherwise the client will fail to download the JavaScript bundle.

If you change native modules or dependencies, stop the dev server (`Ctrl+C`) and restart it to ensure updates are picked up.

## Running tests

The project relies on Jest and React Native Testing Library. Execute the entire test suite with:

```bash
npm test
```

Jest runs in watch mode by default; press `q` to quit once the suite passes. Always ensure tests complete successfully before committing.

## Useful resources

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router documentation](https://docs.expo.dev/routing/introduction/)
