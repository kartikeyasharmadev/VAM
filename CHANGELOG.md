# Changelog

## Gatewise UI refresh

- Added a shared neutral design token layer and reusable button, card, badge, stat card, and empty state primitives.
- Updated the product wordmark and favicon to the Gatewise name and a single-color doorway/check mark.
- Refined the application shell, super-admin workspace/plan/billing surfaces, forms, and tables for clearer hierarchy.
- Added a responsive navigation drawer for phones, a compact sidebar for tablets, and system dark-mode styling.
- Kept existing routes, navigation items, records, workflows, role checks, and billing behavior unchanged.

## Gatewise PWA foundation

- Added an App Router web manifest, SVG logo source, generated PNG app icons, maskable icons, Apple touch icon, and ICO/SVG favicons.
- Added a production-only service worker with versioned static asset caching and a public offline fallback; authenticated documents and API responses are network-only.
- Added install/update prompts, online/offline status, standalone kiosk wake-lock support, safe-area styles, and production security headers.
- Documented installation and manual checks. Offline check-in queuing and Web Push remain pending explicit approval for the submit-handler and database-schema changes.
- PWA additions do not change app routes, visitor flows, business logic, or permission rules.

## Platform branding and appearance

- Added a cookie-backed Light / Dark / System switcher and shared theme tokens, with server-rendered initial theme to avoid a mode flash.
- Added a Platform Super Admin-only Branding & appearance page with product name, light/dark logos, icon, accessible color presets, AA contrast checks, and a responsive live preview.
- Added server-side role checks for the page and save API. Branding reads safely fall back to Gatewise defaults until the approved platform branding schema is installed; save stays disabled until then.
- Updated global metadata and the PWA manifest to use the saved platform name, icon, and colors when available.
- Fixed plan card surfaces and page header spacing for both themes. Hid the Next.js development indicator through the supported configuration option.
- Added optional visitor company/mobile fields, consent-gated live camera capture or photo upload, private photo upload handling, and short-lived signed photo previews in the staff visitor log. The approval/rejection/check-in states and role checks remain unchanged.
- Added a review-only visitor-photo migration at `supabase/migrations/20261116000500_visitor_photo_details.sql`. The feature requires this migration before submissions with the new fields can work. No migration was applied to Supabase.
- Platform branding storage remains a separate unapproved schema request. See `docs/platform-branding-and-visitor-schema-proposal.md` and `docs/manual-test-checklist.md`.

## Platform console top navigation and viewing mode (Phase 1)

- Added sticky two-row top navigation layout (`PlatformShell`) for Platform Super Admin console:
  - Row 1: Brand logo (mobile icon-only mark), divider, "Platform console" label, "Open workspace" / "Stop viewing" action buttons (when viewing a workspace), notification bell, and accessible profile dropdown menu.
  - Row 2: Horizontal tab strip (Overview, Workspaces, Plans, Billing & attention, Settings) with 20px line icons, 2px active primary underline, and mobile horizontal snap scrolling with edge fade.
  - Profile menu: User name, email initials avatar, Platform Super Admin badge, inline Light / Dark / System switcher, Branding link, Settings link, and sign-out button (Escape key and outside-click support).
  - Centered max-1280px content container with top padding preventing any header overlap.
- Added sticky full-width warning banner above customer workspace header when viewed by a platform operator:
  - *"Viewing {workspace name} as a platform operator. Changes you make are real."* with links to "Platform console" and "Stop viewing".
  - Customer workspace retains its sidebar navigation and routes.
- Restyled Platform Overview (`/super-admin`):
  - 4 neutral stat cards (neutral line icon in subtle tinted square, label, metric, helper text; no colored blobs or gradients).
  - Registrations card with segmented controls (Workspaces / Users and 7D / 30D / 6M / 1Y), token-based SVG line/area chart, tooltips, labeled axes, empty state, and accessible text summary.
  - Workspace status card with token-based SVG donut chart, total count, legend breakdown with percentages, and accessible text summary.
- UI bug fixes:
  - Fixed dark-mode readability and contrast for plan options (`.plan-option`) in Create workspace.
  - Added top padding and scroll offsets (`scroll-margin-top: 130px`) so sticky headers never overlap headings or subtitles.
- Workflow and business logic integrity:
  - Verified visitor check-in flows, staff approvals, billing subscriptions, role permissions, routes, and workspace-role behaviors are 100% unchanged.

## Workspace tokens & database migration files (Phase 2)

- Verified all customer workspace pages (`/visitors`, `/billing`, `/staff`, `/branches`, `/branding`, `/settings`, `/notifications`) and components against the design token system.
- Replaced all remaining hard-coded banner/preview hex values with semantic tokens (`var(--primary-fg)`), leaving zero hex literals across workspace and platform components.
- Added approved database migration and rollback SQL files:
  - `supabase/migrations/20261116000600_platform_branding_and_audit.sql`: Singleton `platform_branding` table with RLS, `platform-brand-assets` storage bucket with Super Admin policies, and `platform_branding_audit` table with transactional trigger.
  - `supabase/migrations/rollback/20261116000600_platform_branding_and_audit_rollback.sql`: Clean rollback script.
- Verified PWA manifest (`manifest.webmanifest`), favicon, page title, and theme-color metadata dynamically derive from `getPlatformBranding()` with Gatewise fallbacks.
- Verified both `npm run lint` (0 errors) and `npm run build` (all 26 routes generated cleanly with exit code 0).

## Platform operator banner layout and shell restructuring

- Fixed layout bug where the "Viewing workspace as a platform operator" banner rendered as a column inside `.app-frame`'s grid container.
- Restructured `AppShell` with an outer `.app-shell-root` flex container:
  - Banner now renders above the app area across 100% of the viewport width with a slim 44px min-height.
  - `.app-frame` receives exactly two direct children: `<aside className="sidebar">` (fixed 260px desktop, 72px tablet) and `<section className="app-main">` (`minmax(0, 1fr)`).
  - Set CSS variable `--banner-h` dynamically (`44px` when viewing workspace, `0px` otherwise) with independent scrolling for both the sidebar and main content area.
- Redesigned banner with token-based amber warning tint (`color-mix(in srgb, var(--warning) 12%, var(--surface))`), exceeding WCAG AA 4.5:1 contrast in both light and dark modes. Replaced solid block with slim amber bar, warning icon, readable text, ghost "Platform console" button, and primary "Stop viewing" action button.
- Cleaned up sidebar presentation:
  - Added distinct icons for all navigation items (`building` for Workspaces, `palette` for Branding, `platform` for Overview).
  - Added left indicator (`border-left: 3px solid var(--primary)`) and subtle tint on active items.
  - Added "Platform console" return button and collapsible platform operations accordion.
  - Improved workspace card truncation for long workspace names.
- Verified zero changes to workflows, routes, impersonation or access logic, permissions, data models, or business logic.


