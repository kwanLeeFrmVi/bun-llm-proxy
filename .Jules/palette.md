## 2024-05-15 - Add ARIA Labels to Icon-Only Buttons
**Learning:** Found multiple instances of icon-only buttons across the dashboard (sidebar toggles, pagination, connection rows) that were missing accessible names, making them difficult for screen reader users to identify. This is a common pattern when using UI component libraries where icons are passed as children.
**Action:** Always ensure any button containing only an icon component (like Lucide icons) includes a descriptive `aria-label` attribute explaining its action.
