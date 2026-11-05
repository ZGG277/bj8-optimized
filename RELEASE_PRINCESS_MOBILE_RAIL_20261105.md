# Princess mobile right rail correction

The scoreboard stays at the top. Scene, help, card book, pause and view controls become small right-side controls on mobile. All use the existing stationary long-press, free dragging, edge docking and persistence rules. Short landscape uses two neighboring columns. Desktop entries and the bottom aiming dial remain.

115 test files / 852 tests, typecheck, production build and static audit passed. Native touch verified buttons, drag without accidental menu opening, reload persistence, re-docking, free-ball placement, charge/cancel and one-shot release. The result card book is also on the mobile right rail.

See PUBLIC_SOURCE_MANIFEST.json for exact source identity. The earlier phone preview reported a crowded HUD and was not submitted. This build requires a new phone preview before submission. GitHub deployment is separate from platform review and public release.
