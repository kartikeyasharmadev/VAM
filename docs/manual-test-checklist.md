# Manual test checklist

## Platform console top navigation and viewing mode

- [ ] Sign in as Platform Super Admin and verify the two-row sticky header:
  - Row 1: Brand logo (mobile icon-only mark), divider, "Platform console" label, bell, profile menu.
  - Row 2: Horizontal tab strip (Overview, Workspaces, Plans, Billing & attention, Settings) with 20px icons and 2px active primary indicator.
- [ ] Viewport responsiveness tests:
  - 360px: Header collapses logo to square mark; tab strip allows smooth horizontal touch swipe/snap scroll with edge fades; no horizontal page scroll.
  - 768px (Tablet): All tabs visible, spacing adapts cleanly.
  - 1024px / 1280px / 1920px (Desktop): Content sits in centered max-1280px container with clear spacing.
- [ ] Profile dropdown menu:
  - Click profile trigger: opens dropdown showing user name, initials avatar, "Platform Super Admin" badge, theme buttons, Branding, Settings, Sign out.
  - Keyboard accessibility: closes on `Escape` key and outside clicks.
  - Switch Light, Dark, System: theme updates instantly across all platform pages without flash.
- [ ] Viewing workspace mode:
  - When Super Admin impersonates / views a workspace, verify sticky full-width warning banner:
    *"Viewing {workspace name} as a platform operator. Changes you make are real."*
  - Banner links: click "Platform console" and "Stop viewing" to return to console.
  - Customer workspace retains its sidebar navigation and routes.
- [ ] Platform Overview page (`/super-admin`):
  - 4 neutral stat cards display with subtle tinted icon squares, metrics, and helper text (no colored blobs/gradients).
  - Registrations card: test segmented controls (`Workspaces` / `Users` and `7D` / `30D` / `6M` / `1Y`); hover chart to verify tooltip; test empty state.
  - Workspace status card: verify SVG donut chart, center total, and legend breakdown percentages.
- [ ] UI bug fixes:
  - Plan options in Create workspace: verify plan card text, borders, and radio buttons are readable in Dark mode.
  - Sticky header: verify page intro titles and subtitles are not clipped or overlapped on page load.

## Theme and navigation

- [ ] Sign in as Platform Super Admin and switch Light, Dark, and System in the header. Reload after each choice and confirm the selected mode persists without flashing.
- [ ] Repeat at 360, 768, 1024, and 1440 px. Confirm header controls remain usable and page content does not sit behind the sticky header.
- [ ] Sign in as a workspace admin, receptionist, and member. Confirm none can open or see Platform Branding.
- [ ] Check Overview, Workspaces, Plans, and Billing cards, tables, inputs, empty states, badges, and plan selection in each theme.

## Platform branding (requires approved schema and bucket)

- [ ] As Platform Super Admin, open `/platform/branding`. Confirm product name limit, logo previews/fallback, all eight presets, custom colors, and AA contrast feedback.
- [ ] Confirm invalid colors cannot save; choose a passing pair and save. Verify the toast, then reload and check name, colors, and logos persist.
- [ ] Test Discard changes and Reset to default. Verify these actions update the preview and persisted settings as expected.
- [ ] Confirm favicon, page title, theme-color metadata, and installed-app manifest use current branding.
- [ ] As a non-platform user, call the branding API and open the page directly; verify server-side denial.
- [ ] Review audit rows for actor, timestamp, changed fields, and before/after values.

## Existing visitor workflow

- [ ] Confirm existing visitor submission, branch selection, member/front-desk handling, visit approval/rejection, and check-in behavior are unchanged.
- [ ] Do not expect offline form submission or push notifications; both remain deferred.

## Visitor photo/details (requires applying the reviewed migration first)

- [ ] Verify optional company/mobile/photo capture and explicit photo consent before live camera use.
- [ ] Test browser camera permission denied, unavailable camera, and file/photo size/type validation.
- [ ] Verify visitor photos remain private, workspace scoped, and only display via authorized short-lived URLs.
- [ ] Confirm existing approval, rejection, and check-in states and role checks remain unchanged.
