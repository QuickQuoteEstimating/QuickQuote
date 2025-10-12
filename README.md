QuickQuote

QuickQuote is an Expo
 mobile application built with the Expo Router for navigation, Supabase-backed authentication, and local SQLite persistence for reliable offline use.
It targets Expo SDK 54 and React Native 0.81.4, providing a modern, full-stack estimate management experience for contractors and service pros.

🧰 Getting Started

Set up your environment file

cp .env.example .env


Then open .env and fill in your Supabase project details.

ℹ️ Without valid keys, the app will start in a limited “offline-only” mode and Supabase calls will fail with configuration warnings.

Install dependencies

yarn install


We use Yarn (Berry) for dependency management.
All package scripts and workflows should use yarn, not npm.

🚀 Daily Development Workflow

Each time you start work:

Sync your local branch with main:

git checkout main
git pull origin main


Create or switch to your feature branch:

git checkout -b <feature-branch>
# or switch if it already exists
git checkout <feature-branch>


Start the development server:

yarn start


This runs the Expo CLI in offline-friendly mode so it works even if external services are unavailable.
You’ll see a QR code and device options appear in the terminal — keep this running for automatic reloads.

Build, test, and debug as you go.
Save often and watch the terminal for TypeScript or bundler messages.

Run the test suite before committing:

yarn test


Stage and commit your changes:

git add <files>
git commit -m "Add customer form validation"


Push and open a Pull Request:

git push origin <feature-branch>


Create a PR into main, confirm all checks pass, and request review.

📱 Running the App

Once you’ve started the dev server with yarn start, you can preview QuickQuote in multiple environments:

Physical device:
Install the Expo Go app, then scan the QR code (Android) or use the camera (iOS).

Android Emulator:

yarn android


or press a in the Expo CLI terminal.

iOS Simulator (macOS only):

yarn ios


or press i in the terminal.

Web Preview:

yarn web


or press w to open in a browser.

⚠️ Note: Expo Go currently doesn’t support the new React Native architecture.
Keep newArchEnabled set to false in app.config.ts for full compatibility.

If you add or remove native dependencies, stop and restart the dev server to ensure Metro picks up changes.

🧪 Running Tests

QuickQuote uses Jest with React Native Testing Library for automated tests.

Run all tests with:

yarn test


Jest runs in watch mode — press q to exit when done.
✅ Always ensure the test suite passes before pushing changes.

🧾 Estimate Builder Highlights

Saved Line Items:
Save frequently used materials or services to your personal item library for quick reuse in future estimates.

Labor Roll-Up:
Labor costs are summarized neatly in the PDF output, keeping the focus on the total value for your client.

Photo Attachments:
Snap and attach project photos — they’re automatically compressed and added to the end of your exported estimate PDF.

🔗 Useful Resources

Expo Documentation

Expo Router Docs

Yarn (Berry) Docs

Supabase Docs

SQLite in Expo