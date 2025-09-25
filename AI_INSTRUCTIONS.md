# QuickQuote Project Guide

## Overview
QuickQuote is a cross-platform estimating app built with:
- **Expo (React Native)** for the frontend
- **expo-router** for file-based navigation
- **TypeScript** for type safety
- GitHub for version control and collaboration

The app will eventually connect to a backend (e.g., Supabase or Firebase) for authentication, customers, and estimates.

---

## Project Structure
- `app/` → Screens and navigation (`_layout.tsx`, `index.tsx`, `customers.tsx`, `estimates.tsx`)
- `app.config.ts` → Expo app config
- `package.json` → Dependencies and scripts
- `tsconfig.json` → TypeScript settings
- `.gitignore` → Ignores unnecessary files

---

## Navigation
We use **expo-router**:
- `_layout.tsx` defines the tab navigation
- `index.tsx` = Home
- `customers.tsx` = Customer list
- `estimates.tsx` = Estimate list

To add a new page:
1. Create a new `.tsx` file in `app/`.
2. Add it to the TabNavigator in `_layout.tsx`.

---

## How Codex/AI Can Help
When working with this repo, Codex (or ChatGPT) should:
1. **Respect our stack** (Expo + TypeScript + expo-router).
2. Generate **clean, strongly typed code** (avoid `any`).
3. Suggest UI using **React Native components** (no web-only code).
4. Follow the existing **navigation pattern** (`_layout.tsx` with bottom tabs).
5. Keep code **mobile-first** (touch-friendly, responsive).
6. Only store secrets in `.env` files (never hardcoded).

---

## Contribution Workflow
1. Create a new branch (`git checkout -b feature/my-feature`)
2. Commit your changes (`git commit -m "Add feature"`)
3. Push branch (`git push origin feature/my-feature`)
4. Open a Pull Request

---

## Future Plans
- Add **authentication** (Supabase)
- Add **database integration** for estimates/customers
- Deploy via **Expo EAS**

