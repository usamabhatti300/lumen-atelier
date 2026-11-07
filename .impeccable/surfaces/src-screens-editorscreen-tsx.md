---
version: 1
slug: "src-screens-editorscreen-tsx"
primary_target: "src/screens/EditorScreen.tsx"
related_targets: ["src/screens/GalleryScreen.tsx","src/screens/PresetLibraryScreen.tsx","src/screens/SettingsScreen.tsx"]
---

Scope: the whole app shell (home, editor, match a look, presets, settings); visitor mode Operate. Phone first, desktop deep.
Audience/job: phone hobbyists and enthusiasts putting a look they admired onto their own photo, refining it, keeping it.
Constraints: name Lumen Atelier; AGENTS.md engineering rules; no brand-like film cartons (no real stock names, logos or trade dress).

## Direction contract

THESIS: Every look is a box of film you pick off a shelf and load into your photo. Refuses the category's neutral dark-grey editor with one blue accent.

OWN-WORLD: Printed carton paper #F4F1EA for chrome, ink #121212 type, a chrome-yellow shell bar #E4A11B with black pill buttons, a red/yellow/blue band strip under every bar, and a black frame (#121212→#000) around the photo. Barlow Condensed caps as carton type, Barlow for UI. Crisp 4px corners. Each look is a colour-banded carton with a catalogue code and a photo window.

STORY: The visitor sees their photo framed and loaded, knows which look is in the camera (edge print), picks another box from the shelf, and fine-tunes in a sheet of plain controls.

FIRST VIEWPORT: Phone: yellow bar (Back, LUMEN ATELIER, Save/Export), band strip, black frame with the photo centred, edge-print line "FRAME 01A · LOOK … · 80%", paper shelf "Pick a look" with carton cards, bottom nav (Looks active). Desktop: same bar across the top, shelf as left rail, frame centre, tools rail right.

FORM: Film stock packaging, position 1 on the ordered list (impeccable's pick). seed:0e86fc8b84b211ba

SIGNATURE: loading a look: the edge-print line advances (characters roll in) and the chosen carton lifts with its band lit.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
