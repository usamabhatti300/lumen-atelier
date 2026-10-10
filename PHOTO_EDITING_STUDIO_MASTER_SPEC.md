# Premium AI Photo Editing Studio --- Master Build Specification

> **Purpose:** This is the single source of truth for building the
> application. The coding agent must read this file completely before
> implementation, keep it available as project guidance, and return to
> it throughout development. Do not treat it as a one-time prompt or
> attempt to implement every feature in one giant pass.

## 1. Product vision

Build an original, premium photo-editing application combining:

-   Lightroom-style photographic adjustments and color grading.
-   Photoshop-inspired retouching, masking, and adjustment layers.
-   A library of original, high-quality cinematic and editorial presets.
-   AI-powered reference-image analysis that generates an editable,
    reusable preset.
-   Portrait enhancement with natural-looking results.
-   A fast, non-destructive editing workflow.

The defining feature is **reference image → style analysis → editable
preset → apply to the user's photo → refine → save and reuse**.

A user may see a photograph on Instagram, Pinterest, a website, or
another app, save or otherwise lawfully obtain it, and upload it as a
reference. The application should analyze the reference's visual
characteristics and create a new preset that approximates its look. Do
not promise recovery of the exact original Lightroom/Photoshop settings:
a finished JPEG normally does not contain enough information to
reconstruct the original editing history.

The application's editing features and built-in preset library should be
available for free. Create original presets; do not copy or redistribute
proprietary commercial preset packs or imply affiliation with
third-party brands.

## 2. How the agent must work

1.  Inspect the repository, existing code, package manager, framework,
    scripts, dependencies, environment variables, and current
    functionality before making changes.
2.  Preserve existing working features and conventions where reasonable.
    Never overwrite or delete user work recklessly.
3.  If the repository is empty, initialize the stack in Section 3. If it
    is an existing project, adapt the stack to the existing architecture
    and document justified deviations.
4.  Produce a concise implementation plan, then start implementation. Do
    not stop after planning, a README, or a static mockup.
5.  Build in stages, keeping the application runnable. After each stage,
    run relevant tests, fix issues, and inspect the real application.
6.  Do not represent a mock, hardcoded response, decorative control,
    fake progress indicator, or unimplemented integration as functional.
7.  If a feature requires a model download, API key, account, or
    external service, implement the integration safely where feasible
    and document the exact setup still required.
8.  Keep a project status file (for example `PROJECT_STATUS.md`) with
    completed work, pending work, decisions, known issues, test results,
    and next steps. Re-read this specification when planning each stage.
9.  Do not ask the user to make technical decisions that can be
    reasonably made using this specification and repository inspection.
    Ask only when a genuine blocking decision is necessary.
10. Do not claim tests passed unless they were actually executed.

## 3. Required technology choices

For a new browser-based application, use the following default stack.
Evaluate compatibility and current stable versions before installation.

### Frontend

-   React + TypeScript.
-   Vite.
-   Tailwind CSS.
-   Lucide React for icons.
-   React Router only if multiple routes are useful.
-   Zustand for editor state, unless a suitable state solution already
    exists.
-   Zod for runtime validation of presets, projects, and AI outputs.
-   Vitest for unit/integration tests.
-   Playwright for end-to-end browser tests.
-   ESLint and Prettier.
-   TypeScript strict mode.

Use React Hook Form only if complex forms justify it. Avoid unnecessary
UI libraries and dependencies.

### Animation

-   Motion for React for panel, modal, drawer, and purposeful UI
    transitions.
-   CSS transitions/keyframes for simple hover, focus, and loading
    states.
-   GSAP only if a specific complex timeline truly benefits from it.
-   Do not add overlapping animation libraries without a clear reason.
-   Support `prefers-reduced-motion`.

### Image processing

Evaluate and use where appropriate: - WebGL2 and GLSL shaders for
responsive GPU color transformations. - Canvas APIs for decoding,
compositing, crop, and export. - Web Workers for CPU-heavy work. -
OffscreenCanvas where supported. - OpenCV.js or a suitable alternative
for selected computer-vision operations. - WebAssembly only where a
concrete task benefits from it.

Create a documented rendering pipeline and a CPU fallback when
practical. Do not rely exclusively on repeated full-resolution Canvas
filters if they cause sluggish controls. Use preview-resolution
processing for interactive work and full-resolution processing for final
export.

### AI and backend

Prefer a local-first frontend for core editing. Introduce a backend only
for real needs such as private AI credentials, model inference, account
features, or remote storage.

When a backend is needed, prefer Python + FastAPI for
image-analysis/computer-vision workloads, with Pydantic request/response
validation. A TypeScript backend is acceptable if it is simpler and
meets the requirements.

Use a vision-capable model to interpret visual style and produce
structured analysis. Combine semantic AI analysis with deterministic
image statistics. The AI model must not be treated as a source of
ground-truth slider values.

For portrait features, evaluate maintained face-landmark and
segmentation options such as MediaPipe Tasks Vision or an appropriate
alternative. Check current official documentation, browser support,
model size, licenses, and performance before choosing.

### Storage

For the initial local-first application: - IndexedDB for local projects,
settings, and custom presets where appropriate. - Versioned JSON schemas
for project and preset data. - Local downloads for exported images.

Do not add cloud accounts or a remote database without a product need.
If cloud accounts become necessary, evaluate Supabase for
authentication, Postgres, and object storage, with correct access
policies.

### Engineering rules

-   Pin compatible dependency versions in the lockfile.
-   Audit dependency health, licensing, and security.
-   Avoid abandoned packages and unnecessary abstractions.
-   Keep API secrets out of frontend environment variables.
-   Do not install every technology listed here blindly; select only
    what supports a real requirement and document significant
    deviations.

## 4. Official documentation and product references

Consult current official documentation before implementing relevant
systems:

-   React: https://react.dev/
-   Vite: https://vite.dev/guide/
-   TypeScript: https://www.typescriptlang.org/docs/
-   Tailwind CSS: https://tailwindcss.com/docs
-   Motion for React: https://motion.dev/docs/react
-   Lucide React: https://lucide.dev/guide/packages/lucide-react
-   Vitest: https://vitest.dev/guide/
-   Playwright: https://playwright.dev/docs/intro
-   MDN Canvas:
    https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
-   MDN WebGL:
    https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API
-   MDN Web Workers:
    https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
-   MDN OffscreenCanvas:
    https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
-   OpenCV: https://docs.opencv.org/
-   MediaPipe: https://ai.google.dev/edge/mediapipe/solutions/guide
-   Anthropic docs: https://docs.anthropic.com/
-   Claude platform docs: https://platform.claude.com/docs/
-   Hugging Face docs: https://huggingface.co/docs

If using another AI provider or model, use that provider's current
official documentation.

Study these products for workflow inspiration, not pixel-for-pixel
copying: Adobe Lightroom, Photoshop, Capture One, Darktable, Photopea,
and Polarr. Create an original identity and do not copy proprietary
assets or UI exactly.

## 5. Agent skills and project instructions

Inspect skills and plugins available in the current coding environment.
Use relevant, trusted skills for: - React/TypeScript architecture. -
High-quality frontend design and implementation. - WebGL/GLSL and image
processing. - Computer vision. - AI integration and structured output. -
Animation. - Accessibility and responsive design. - Testing and browser
automation. - Security and performance.

For Claude Code, inspect available skills and plugins before installing
anything. Useful starting references: - Skills repository:
https://github.com/anthropics/skills - Skills guide:
https://support.claude.com/en/articles/12512180-use-skills-in-claude

Do not assume a skill exists or claim to have installed one without
verifying it. Install only relevant skills from trusted sources;
understand their permissions and dependencies. If a skill is
unavailable, proceed using official docs and normal engineering
practice. Consider an `AGENTS.md` file with architecture, commands,
coding rules, and testing requirements.

## 6. Visual identity and user experience

The application must feel like a premium creative tool for
photographers, portrait editors, fashion creators, and content
creators---not a generic AI SaaS dashboard.

### Art direction

-   Dark editorial workspace using charcoal, graphite, warm-grey
    borders, and restrained ivory typography.
-   A limited, carefully chosen accent palette such as muted amber,
    champagne, or warm neutrals.
-   Large image canvas as the visual focus.
-   High-quality typography, precise alignment, professional control
    density, consistent spacing, and subtle borders.
-   Refined sliders, numeric inputs, tooltips, menus, and iconography.
-   Avoid generic purple/blue AI gradients, excessive neon, excessive
    rounded cards, random accent colors, heavy shadows, and decoration
    that harms usability.
-   Use design tokens for colors, typography, spacing, radii,
    elevations, motion durations, and interaction states.
-   Consider Inter or Geist for interface text and a carefully selected
    editorial display face where useful. Respect font licensing and
    prefer local font assets where practical.
-   Use tabular numerals for adjustment values.

### Main desktop workspace

-   Top toolbar: import, undo, redo, comparison, zoom, save, and export.
-   Left sidebar: photos, reference images, presets, and project
    navigation.
-   Center: large image canvas.
-   Right sidebar: adjustments, color grading, masks, and layers.
-   Bottom filmstrip for multi-image navigation where useful.
-   Collapsible sidebars and adjustable workspace density.

The reference-to-preset workflow must be obvious and accessible from the
main workspace.

### Screens

Implement real, coherent experiences for: 1. Welcome/project gallery. 2.
Main editor. 3. AI reference-to-preset workflow. 4. Preset library. 5.
Portrait retouching. 6. Masks and adjustment layers. 7. Saved presets
and favorites. 8. Project management and export. 9. Settings for
performance, privacy, and AI configuration.

Prioritize the editor and reference workflow over secondary screens.

### Responsive behavior

-   Desktop: full workspace.
-   Tablet: flexible canvas and panel drawers.
-   Mobile: prioritize importing, applying presets, reference analysis,
    and essential adjustments through compact panels or bottom sheets.
-   Do not simply shrink the desktop interface until controls are
    unusable.

## 7. Motion and animation requirements

Build a consistent, restrained motion system with documented durations
and easing. Motion should communicate state, not distract from image
editing.

Implement: - Subtle hover/pressed states. - Smooth slider interaction. -
Panel expand/collapse. - Refined modal and drawer transitions. -
Tooltips and active-tool states. - Small save/favorite state
transitions. - Preset selection feedback. - Subtle thumbnail and
filmstrip transitions. - A restrained canvas reveal where useful.

### AI analysis animation

When analyzing a reference: 1. Show the uploaded photo immediately. 2.
Display a restrained scanning/analysis overlay. 3. Show meaningful
stages such as image statistics, style interpretation, and preset
generation. 4. Report measurable progress only when it is actually
measurable; otherwise use an indeterminate indicator. 5. Reveal analysis
and generated settings with a subtle transition. 6. Support
cancellation, errors, retry, and recovery.

Never fabricate a percentage or claim a stage completed before it did.
Avoid full-resolution rerenders caused solely by animation. Respect
reduced-motion preferences and do not make information dependent on
motion.

## 8. Functional editing engine

All primary controls must affect the actual rendered photograph.

### Basic adjustments

-   Exposure, brightness, contrast.
-   Highlights, shadows, whites, blacks.
-   Temperature, tint, white balance.
-   Vibrance, saturation.
-   Texture, clarity, dehaze.
-   Sharpening and noise reduction where supported.
-   Vignette and film grain.
-   Crop, rotate, straighten, and flip.

### Advanced color grading

-   HSL hue, saturation, and luminance.
-   RGB tone curves.
-   Color wheels for shadows, midtones, and highlights.
-   Split toning and color balance.
-   Channel adjustments.
-   Black/white point.
-   Histogram and RGB channel visualization.
-   Before/after draggable divider and side-by-side comparison.
-   Zoom, pan, fit-to-screen, and actual-size viewing.

Document the order of operations and color-space assumptions. Where
feasible, process color transformations in linear light with correct
transfer functions. Do not assume RGB values are perceptually uniform.

### Non-destructive workflow

Represent edits as a versioned adjustment state; never repeatedly
overwrite the original. Implement: - Undo/redo with sensible history
grouping. - Reset individual controls and all edits. - Copy/paste
adjustments. - Preset blending/intensity. - Project save/reopen and
session recovery. - Adjustment visibility. - Original-image
preservation. - Bounded history to prevent excessive memory use.

## 9. Highest-priority feature: AI reference-to-preset engine

This is the product's signature feature. Give it priority over secondary
tools.

### User journey

1.  Upload a reference photograph.
2.  Preview and crop it if necessary.
3.  Analyze its visual properties.
4.  Show a readable style description and color palette.
5.  Select/upload a target photo.
6.  Generate an editable preset.
7.  Preview the preset on the target.
8.  Adjust intensity and individual controls.
9.  Save, rename, and reuse the preset.

### Reference analysis

Combine deterministic measurements with vision-model interpretation.
Measure or estimate: - Dominant colors and color histograms. - Luminance
distribution and contrast. - Shadow/highlight behavior. - Saturation
distribution. - Approximate white balance and warm/cool relationships. -
HSL patterns. - Skin-tone appearance when relevant. - Subject/background
color separation where feasible. - Matte/faded characteristics. - Grain
and vignette only when there is sufficient evidence.

Example style description: "Muted cinematic editorial with cool cyan
shadows, warm natural skin, subdued greens, lifted blacks, controlled
highlights, and moderate saturation." It must be derived from the actual
image, not hardcoded.

### Editable preset generation

Convert analysis into the same adjustment schema used by the editor.
Support relevant parameters for exposure, white balance, tonal controls,
HSL, curves, color grading, saturation, grain, and vignette.

-   Validate all output using Zod and, if a backend exists, Pydantic.
-   Clamp parameters to supported ranges.
-   Reject malformed model output and provide a safe fallback.
-   Keep the mapping from analysis to editor settings deterministic and
    documented.
-   Do not let the model return executable code.
-   Show explanations and uncertainty when estimates are weak.

### Target adaptation

The reference and target may have different lighting, exposure,
subjects, and cameras. Therefore: - Distinguish transferable style from
scene-specific exposure. - Offer optional exposure and white-balance
adaptation. - Preserve natural skin tones where possible. - Include
intensity blending. - Let users edit every generated adjustment. -
Explain when the images differ too much for a close match. - Never
promise exact original-setting recovery.

Where feasible, compare the target result with the reference and suggest
useful changes without blindly matching histograms or damaging the
target's lighting.

### Edge cases

Handle dark/overexposed photos, low-resolution and compressed images,
mixed lighting, night/neon scenes, monochrome, illustrations, multiple
faces and skin tones, screenshots with UI, multiple photos in a
screenshot, unsupported/corrupt files, and low-confidence analysis.
Allow cropping screenshots to isolate the reference. Provide helpful
errors and retry/fallback behavior.

## 10. Original preset library

Create at least 60 genuinely distinct original presets with real
adjustment values, not merely different names for the same filter. Every
preset needs a name, category, description, schema-valid adjustment
object, real preview, intensity control, favorites, search, and category
filters.

### Cinematic

Teal and Orange, Moody Blue Cinema, Hollywood-Inspired Cinema, Bleach
Bypass, Desaturated Drama, Night Neon, Cold Thriller, Warm Film Cinema,
Soft Cinematic Fade, Dark Cinematic Portrait.

### Pale and blue

Icy Blue, Pale Blue Editorial, Powder Blue, Cool Shadows, Nordic Winter,
Steel Blue, Airy Blue Film, Muted Pastel, Soft Grey Editorial, Blue
Hour.

### Film and analog

Portra-Inspired Warm Film, Fuji-Inspired Natural Film, Classic 35mm,
Vintage Negative, Disposable Camera, Analog Flash, Warm Grain, Faded
Film, Retro 70s, Nostalgic 90s.

### Portrait

Natural Skin, Warm Beauty, Soft Editorial Skin, Golden Skin, Clean
Studio, Moody Portrait, Rich Brown Skin, Soft Highlights, Fashion
Editorial, Neutral Headshot.

### Luxury and fashion

Old Money, Quiet Luxury, Creamy Beige, Champagne Editorial, Soft Gold,
High-End Fashion, Neutral Luxury, Rich Espresso, Warm Minimalism,
Magazine Editorial.

### Travel and landscape

Golden Hour, Tropical Greens, Muted Forest, Earthy Travel, Desert
Warmth, Coastal Film, Mediterranean Summer, Autumn Mood, Snow and Ice,
Vibrant Travel.

### Social and experimental

Y2K Flash, Direct Flash Editorial, Dreamy Glow, Cyberpunk Neon, Moody
Social, Clean Bright Lifestyle, High-Contrast Street, Soft Romantic,
Dark Academia, Classic Monochrome.

These are original style interpretations, not claims of affiliation with
film manufacturers or exact copies of proprietary commercial presets.

Allow users to create, duplicate, rename, edit, favorite, and delete
their own presets. The built-in library should be available without
mandatory payment.

## 11. Portrait retouching

Build a separate, understandable workflow for: - Skin smoothing that
preserves pores and texture. - Blemish/spot removal. - Eye and iris
enhancement. - Teeth whitening. - Subtle face lighting. - Under-eye
correction where feasible. - Subject/background separation. -
Hair/subject selection. - Background blur and color/exposure changes.

Use appropriate local image operations, landmarks, segmentation, or
specialized models. Do not pretend a global blur is advanced skin
retouching. Keep all effects reversible and adjustable. Handle profiles,
obscured faces, group portraits, and no-face images gracefully. Clearly
disclose model requirements and fallback limitations.

## 12. Masks and Photoshop-inspired features

Implement a practical subset: - Brush masks with size, softness, and
opacity. - Erase/restore. - Linear and radial gradients. - Subject masks
where a suitable model exists. - Background masks. - Independent
adjustments in selected regions. - Adjustment layers with visibility,
opacity, and ordering where supported. - Non-destructive crop and
transforms.

Use a consistent internal mask/layer representation. Do not expose
controls that have no effect on rendering.

## 13. Preset interoperability

Implement: - Versioned JSON import/export. - Preset editing,
duplication, renaming, and deletion. - Copy/paste adjustments. -
Applying a preset to multiple photos. - Batch application with progress
and cancellation. - Optional LUT import/export. - Optional
Lightroom-compatible XMP export if technically feasible.

Clearly document conversion limitations and never silently discard
unsupported settings. Validate imports and never execute arbitrary
imported code.

## 14. Import, color management, and export

Initially support JPEG, PNG, and WebP. Evaluate HEIC/HEIF and camera RAW
separately; do not claim support until tested.

Implement: - Drag/drop and file picker. - Multiple-image import. -
Thumbnails. - EXIF orientation correction. - Sensible color-profile
handling. - Crop/output dimensions. - JPEG quality, PNG, and WebP
export. - Full-resolution export where feasible. - Progress,
cancellation, and clear error states.

Handle transparency, unusual aspect ratios, corrupt metadata, large
panoramas, high-resolution images, GPU texture limits, memory
exhaustion, and unsupported formats. Never silently lower export
quality. Use worker, tiled, or server-side strategies if browser
resources are insufficient.

## 15. Performance

Performance is a product requirement. Implement and measure: - GPU
previews where supported. - Efficient texture reuse. -
Preview-resolution scaling. - Frame-synchronized or debounced slider
updates. - Worker-based CPU operations. - Lazy loading of nonessential
modules. - Thumbnail caching. - Bounded undo history. - Memory cleanup
on image switches. - Cancellation of stale AI requests. - Avoidance of
unnecessary React rerenders. - CPU fallback when GPU capabilities are
unavailable.

Define and test a target-device performance budget using representative
photos. Do not promise unmeasured frame rates or file-size limits.

## 16. Privacy and security

Treat photos as private user content: - Prefer local processing for core
edits where feasible. - Disclose before photos are sent to external AI
services. - Keep API keys server-side. - Validate file content and limit
upload sizes. - Safely handle filenames and metadata. - Rate-limit
backend services where needed. - Authorize access to saved projects. -
Clean up temporary files. - Document retention behavior. - Avoid
unnecessary analytics or third-party image sharing. - Review package and
model licenses and security.

Do not use Vite client-side environment variables for secrets. Do not
store photos remotely without a clear reason and appropriate user
disclosure.

## 17. Testing and verification

Use Vitest for unit/integration tests and Playwright for end-to-end
tests.

Test: - Adjustment calculations and ranges. - HSL and curves. - Preset
application and intensity blending. - Undo/redo. - Project
serialization. - Preset import/export. - Orientation and color
handling. - Export dimensions and formats. - AI response validation. -
Missing API keys. - Provider errors/timeouts. - Unsupported and corrupt
files. - Cancellation and memory handling. - Portrait fallback
behavior. - Accessibility and keyboard controls.

Critical end-to-end journey:

**Upload reference → analyze → generate preset → upload target → preview
→ refine → save preset → reload project → reapply preset → export edited
photograph.**

Verify that the exported photo contains the actual adjustments, the
original remains unchanged, saved projects survive reload, controls
work, and errors provide recovery paths. Run the production build.
Report only tests actually executed.

## 18. Staged implementation plan

### Stage 1 --- Foundation

Inspect the project, establish design tokens, build the workspace, and
verify the dev server.

### Stage 2 --- Working image editor

Implement import, canvas rendering, basic adjustments, undo/redo, and
export.

### Stage 3 --- Advanced color grading

Implement HSL, curves, color wheels, and the versioned adjustment
schema.

### Stage 4 --- Preset library

Create the original preset set and verify effects on real photographs.

### Stage 5 --- Signature AI workflow

Implement reference analysis, structured preset generation, target
adaptation, preview, refinement, and saving. Test the complete journey.

### Stage 6 --- Portrait and masks

Implement real retouching and regional adjustment functionality.

### Stage 7 --- Persistence and interoperability

Implement project recovery, preset exchange, and batch workflows.

### Stage 8 --- Production polish

Finish animation, responsive layouts, accessibility, performance,
security review, and automated tests.

Keep the application runnable after each stage. Adjust the sequence only
when repository constraints justify it.

## 19. Definition of done

The application is not complete until: - It starts using documented
commands. - Core controls change the actual image. - Built-in presets
are meaningfully distinct. - Reference analysis creates a real editable
preset. - That preset can be refined and reused on other photos. -
Portrait/masking features work as advertised or clearly disclose
limitations. - Projects and presets save and reopen. - Edited photos
export correctly. - UI is responsive and accessible. - Expensive
operations have sensible error/recovery behavior. - Critical automated
tests pass. - External service setup is documented. - No fake
functionality is presented as complete.

Do not claim full Photoshop parity or exact preset recovery.

## 20. Required final report

At completion, provide: 1. Implemented functionality. 2. Architecture
and important decisions. 3. Actual technology stack and dependencies. 4.
Setup and run commands. 5. Required environment variables. 6. AI
model/provider setup. 7. Skills reused or installed, if any. 8. Tests
actually run and their results. 9. Performance observations and known
limitations. 10. Remaining work and the next recommended stage.

**Begin by inspecting the repository, then implement and verify the
application. This file is the long-term specification. Revisit it
throughout development instead of trying to complete everything in a
single pass.**
