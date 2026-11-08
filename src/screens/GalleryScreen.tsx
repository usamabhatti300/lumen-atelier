/** Home: the hero with the two ways in, the stage (drop zone / continue), looks by category, and your edits. */
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ImagePlus, Pencil, Settings, Sparkles, SwatchBook, Trash2, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { InstallBanner, InstallButton } from '@/pwa/PwaUi';
import { takeSharedFiles } from '@/pwa/pwa';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Progress } from '@/components/ui/misc';
import { Wordmark } from '@/components/Wordmark';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { BUILTIN_PRESETS, CATEGORY_LABELS, PRESET_CATEGORIES } from '@/lib/presets/library';
import { categoryCode, categoryTint } from '@/lib/presets/codes';
import { presetThumb, setPreviewSource } from '@/engine/presetThumbs';
import { useSettings } from '@/state/settingsStore';
import { useEditor } from '@/state/editorStore';
import {
  createProject,
  deleteProject,
  getOriginal,
  getPhoto,
  listProjects,
  saveProject,
  type ProjectRecord,
} from '@/lib/storage/db';
import { importFiles } from '@/engine/importer';
import { useMediaQuery } from '@/lib/useMediaQuery';

interface ProjectCard extends ProjectRecord {
  cover: string | null;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

function defaultProjectName() {
  return `Edit ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

async function loadProjectCards(): Promise<ProjectCard[]> {
  const list = await listProjects();
  return Promise.all(
    list.map(async (p) => {
      const first = p.photoIds[0] ? await getPhoto(p.photoIds[0]) : undefined;
      return { ...p, cover: first ? URL.createObjectURL(first.thumbnail) : null };
    }),
  );
}

export function GalleryScreen() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectCard[] | null>(null);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [renaming, setRenaming] = useState<ProjectCard | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectCard | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const intent = useRef<'edit' | 'reference'>('edit');
  const lastProjectId = useSettings((s) => s.lastProjectId);
  const showToast = useEditor((s) => s.showToast);

  const refresh = useCallback(async () => {
    const cards = await loadProjectCards();
    setProjects((prev) => {
      prev?.forEach((c) => c.cover && URL.revokeObjectURL(c.cover));
      return cards;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    void loadProjectCards().then((cards) => alive && setProjects(cards));
    return () => {
      alive = false;
    };
  }, []);

  const startProject = useCallback(
    async (files: File[], mode: 'edit' | 'reference') => {
      const project = await createProject(defaultProjectName());
      if (files.length) {
        setImporting({ done: 0, total: files.length });
        const result = await importFiles(files, project.id, (done, total) => setImporting({ done, total }));
        setImporting(null);
        if (result.errors.length) showToast(result.errors.join(' '), 'error');
        if (!result.added.length) {
          await deleteProject(project.id);
          return;
        }
        await saveProject({ ...project, photoIds: result.added.map((p) => p.id), activePhotoId: result.added[0].id });
      }
      navigate(`/project/${project.id}${mode === 'reference' ? '?reference=1' : ''}`);
    },
    [navigate, showToast],
  );

  const onFiles = (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (files.length) void startProject(files, intent.current);
  };

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      intent.current = 'edit';
      onFiles(e.dataTransfer?.files ?? null);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  });

  // Arrivals from outside the app: the phone's share sheet, a home-screen shortcut, or
  // image files opened with the installed app on a computer.
  const [search, setSearch] = useSearchParams();
  const handledArrival = useRef(false);
  useEffect(() => {
    if (handledArrival.current) return;
    handledArrival.current = true;
    const share = search.get('share');
    const action = search.get('action');
    if (share || action) setSearch({}, { replace: true });
    if (share === '1') {
      void takeSharedFiles().then((files) => {
        if (files.length) void startProject(files, 'edit');
        else showToast('Nothing was shared, or the photos could not be read.', 'error');
      });
    } else if (share === 'failed') {
      showToast('The shared photos could not be received. Try opening them from the app instead.', 'error');
    } else if (action === 'reference') {
      // Home-screen shortcut "Match a reference look" (async: creates the project, then navigates).
      void Promise.resolve().then(() => startProject([], 'reference'));
    }
    const queue = (window as Window & { launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue;
    queue?.setConsumer(async ({ files }) => {
      if (!files?.length) return;
      void startProject(await Promise.all(files.map((h) => h.getFile())), 'edit');
    });
  }, [search, setSearch, startProject, showToast]);

  const resume = projects?.find((p) => p.id === lastProjectId);
  // The stage on the home screen holds the edit you were last in, else the newest one.
  const hero = resume ?? projects?.[0];
  const heroSrc = useHeroImage(hero?.photoIds[0]) ?? hero?.cover;
  const thumbs = useCategoryThumbs(projects === null ? undefined : (hero?.photoIds[0] ?? null));
  const pickPhotos = () => {
    intent.current = 'edit';
    fileInput.current?.click();
  };
  const matchLook = () => {
    intent.current = 'reference';
    void startProject([], 'reference');
  };

  // Orchestrated entrance: hero lines rise in order, then the stage, then the looks rail
  // (skipped with reduced motion, system or in-app).
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (document.documentElement.dataset.motion === 'reduced') return;
        const tl = gsap.timeline({ defaults: { ease: 'expo.out', duration: 0.9 } });
        tl.from('[data-reveal]', { y: 26, opacity: 0, stagger: 0.07 }, 0.05)
          .from('[data-stage]', { y: 34, opacity: 0, scale: 0.97, duration: 1.1 }, 0.2)
          .from('[data-look]', { x: 40, opacity: 0, stagger: 0.04, duration: 0.8 }, 0.45);
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="scroll-quiet h-full overflow-x-hidden overflow-y-auto bg-ground">
      <header className="sticky top-0 z-30 border-b border-line-soft/60 bg-ground/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-8">
          <Wordmark />
          <nav className="flex items-center gap-1.5" aria-label="App">
            <InstallButton className="hidden sm:flex" />
            <Link
              to="/presets"
              className="flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-fg-2 transition-colors hover:bg-control hover:text-fg coarse:h-11 coarse:w-11 coarse:justify-center coarse:px-0 sm:coarse:w-auto sm:coarse:px-3"
              aria-label="Looks"
            >
              <SwatchBook size={18} /> <span className="hidden sm:inline">Looks</span>
            </Link>
            <Link
              to="/settings"
              className="flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-fg-2 transition-colors hover:bg-control hover:text-fg coarse:h-11 coarse:w-11 coarse:justify-center coarse:px-0 sm:coarse:w-auto sm:coarse:px-3"
              aria-label="Settings"
            >
              <Settings size={18} /> <span className="hidden sm:inline">Settings</span>
            </Link>
          </nav>
        </div>
      </header>
      <InstallBanner />

      <main className="screen-enter mx-auto max-w-7xl px-4 pb-24 sm:px-8">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          data-testid="gallery-file-input"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <section className="relative grid gap-7 pt-6 pb-14 sm:pt-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16 lg:pt-16 lg:pb-20">
          {/* Ambient light behind the hero copy: the only glow on the page, never behind a photo. */}
          <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-accent/[0.07] blur-3xl" />
          <div className="relative">
            <p data-reveal className="label-caps inline-flex items-center gap-2 rounded-full border border-line bg-raised/70 py-1.5 pr-3 pl-2.5 text-fg-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_rgb(212_255_63/0.9)]" />
              Free · On this device · No account
            </p>
            <h1 className="display mt-5 text-[clamp(3rem,14vw,6.5rem)] text-fg sm:mt-6">
              <span data-reveal className="block">
                Any look.
              </span>
              <span data-reveal className="block">
                Made <span className="serif pr-2 text-[1.08em] text-accent">yours.</span>
              </span>
            </h1>
            <p data-reveal className="mt-5 max-w-[42ch] text-base leading-relaxed text-fg-2 sm:mt-6 sm:text-[17px]">
              Show Lumen Atelier a photo you love and it builds an editable look from it, or start from {BUILTIN_PRESETS.length} original
              looks. Your photos never leave this device.
            </p>
            <div data-reveal className="mt-7 grid grid-cols-2 gap-2.5 sm:mt-8 sm:flex sm:gap-3">
              <Button variant="accent" size="lg" className="h-13 px-4 text-[15px] sm:h-12 sm:px-6" icon={<Wand2 size={18} />} onClick={matchLook}>
                Match a look
              </Button>
              <Button variant="primary" size="lg" className="h-13 px-4 text-[15px] sm:h-12 sm:px-6" icon={<ImagePlus size={18} />} onClick={pickPhotos}>
                Open a photo
              </Button>
            </div>
            {importing && (
              <div className="mt-6 max-w-sm" role="status">
                <p className="mb-2 text-sm text-fg-3 tabular">
                  Importing {importing.done} of {importing.total}…
                </p>
                <Progress value={importing.done / importing.total} label="Import progress" />
              </div>
            )}
          </div>

          <div data-stage>
            <Stage dragOver={dragOver} hero={hero ? { id: hero.id, name: hero.name, updatedAt: hero.updatedAt, frames: hero.photoIds.length, src: heroSrc ?? null } : null} onPick={pickPhotos} />
          </div>
        </section>

        <section aria-labelledby="looks-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="label-caps text-fg-4">{hero ? 'Previewed on your last photo' : `${SHELF.length} collections`}</p>
              <h2 id="looks-title" className="display mt-2 text-[2rem] text-fg sm:text-[2.6rem]">
                Start from a <span className="serif">look</span>
              </h2>
            </div>
            <Link
              to="/presets"
              className="group mb-1 flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-fg-2 transition-colors hover:bg-control hover:text-fg"
            >
              All {BUILTIN_PRESETS.length}
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <ul className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0">
            {SHELF.map((c) => (
              <li key={c.id} data-look className="w-[148px] shrink-0 snap-start lg:w-auto">
                <CategoryTile category={c} src={thumbs[c.id]} rendering={!!hero} />
              </li>
            ))}
          </ul>
        </section>

        <section className="pt-16" aria-labelledby="edits-title">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <h2 id="edits-title" className="display text-[2rem] text-fg sm:text-[2.6rem]">
              Your edits
            </h2>
            {projects && projects.length > 0 && (
              <p className="label-caps text-fg-4 sm:mb-2">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'} · saved on this device
              </p>
            )}
          </div>
          {projects === null ? (
            <div className="h-40" />
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-line p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[48ch] text-[15px] leading-relaxed text-fg-3">
                Nothing here yet. Open a photo and it appears here; every edit saves on this device as you go.
              </p>
              <Button variant="secondary" icon={<ImagePlus size={16} />} onClick={pickPhotos}>
                Open a photo
              </Button>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4">
              <AnimatePresence initial={false}>
                {projects.map((p, i) => (
                  <motion.li
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 8) * 0.04 }}
                    className="group"
                  >
                    <Link
                      to={`/project/${p.id}`}
                      className="relative block aspect-[4/5] overflow-hidden rounded-lg bg-raised shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] transition-transform duration-300 ease-out hover:-translate-y-1 sm:aspect-[4/3]"
                    >
                      {p.cover ? (
                        <img src={p.cover} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-sm text-fg-4">Empty</span>
                      )}
                      {p.photoIds.length > 1 && (
                        <span className="label-caps absolute top-2 left-2 rounded-full bg-black/55 px-2 py-1 text-[10px] text-white backdrop-blur-md">
                          {p.photoIds.length} photos
                        </span>
                      )}
                    </Link>
                    <div className="mt-2.5 flex items-start justify-between gap-1">
                      <div className="min-w-0 pl-0.5">
                        <p className="truncate text-[15px] font-medium tracking-[-0.01em] text-fg">{p.name}</p>
                        <p className="font-mono text-xs text-fg-4">
                          {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="-mt-1 flex opacity-100 transition-opacity fine:opacity-0 fine:group-focus-within:opacity-100 fine:group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label={`Rename ${p.name}`}
                          onClick={() => setRenaming(p)}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-fg-3 hover:bg-control hover:text-fg coarse:h-11 coarse:w-11"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${p.name}`}
                          onClick={() => setConfirmDelete(p)}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-fg-3 hover:bg-control hover:text-danger coarse:h-11 coarse:w-11"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </main>

      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-ground/80 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-4">
              <PrismRing size={120} bright />
              <p className="display text-3xl text-fg">Drop to open</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RenameDialog
        key={renaming?.id ?? 'none'}
        project={renaming}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (renaming) await saveProject({ ...renaming, name });
          setRenaming(null);
          void refresh();
        }}
      />
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete project?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) await deleteProject(confirmDelete.id);
                setConfirmDelete(null);
                void refresh();
              }}
            >
              Delete project
            </Button>
          </>
        }
      >
        <p className="px-5 pb-5 text-sm leading-relaxed text-fg-3">
          “{confirmDelete?.name}” and its {confirmDelete?.photoIds.length} photos will be removed from this browser.
          Exported files on your computer are not affected. This cannot be undone.
        </p>
      </Dialog>
    </div>
  );
}

function RenameDialog({ project, onClose, onSave }: { project: ProjectCard | null; onClose: () => void; onSave: (n: string) => void }) {
  const [name, setName] = useState(project?.name ?? '');
  return (
    <Dialog
      open={!!project}
      onClose={onClose}
      title="Rename project"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name.trim().slice(0, 80))}>
            Save name
          </Button>
        </>
      }
    >
      <div className="px-5 pb-5">
        <label className="mb-1.5 block text-xs font-medium text-fg-3" htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          data-autofocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
          className="h-11 w-full rounded-sm border border-line bg-well px-3.5 text-sm text-fg outline-none transition-colors focus:border-accent/60"
        />
      </div>
    </Dialog>
  );
}

/**
 * Phones: the home stage is large, so the 360 px thumbnail looks soft. Load the stored original
 * for it (the browser decodes it at display size); the thumbnail shows until then.
 */
function useHeroImage(photoId: string | undefined) {
  const phone = useMediaQuery('(max-width: 639px)');
  const [img, setImg] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!phone || !photoId) return;
    let alive = true;
    let url: string | null = null;
    void getOriginal(photoId).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setImg({ id: photoId, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [phone, photoId]);
  return img && img.id === photoId ? img.url : undefined;
}

/** The categories on the home rail: one tile per category, previewed with its first look. */
const SHELF = PRESET_CATEGORIES.map((id) => {
  const looks = BUILTIN_PRESETS.filter((p) => p.category === id);
  return { id, label: CATEGORY_LABELS[id].replace(' Collection', ''), code: categoryCode(id), tint: categoryTint(id), count: looks.length, first: looks[0] };
}).filter((c) => c.count > 0);

/**
 * Real renders for the rail: each category's first look through the same pipeline, on the
 * user's latest photo. Without a photo (null) or while projects load (undefined), none.
 */
function useCategoryThumbs(photoId: string | null | undefined): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    // No photo yet: the tiles stay tint washes (the low-resolution test scene looks worse than none).
    if (!photoId) return;
    let alive = true;
    void (async () => {
      const rec = await getPhoto(photoId).catch(() => undefined);
      const bmp = rec ? await createImageBitmap(rec.thumbnail).catch(() => null) : null;
      if (!alive || !bmp) return;
      await setPreviewSource(`home:${photoId}`, bmp);
      bmp.close();
      for (const c of SHELF) {
        if (!alive || !c.first) return;
        const url = await presetThumb(c.first.id, c.first.adjustments).catch(() => null);
        if (alive && url) setThumbs((t) => ({ ...t, [c.id]: url }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [photoId]);
  return thumbs;
}

function CategoryTile({ category: c, src, rendering }: { category: (typeof SHELF)[number]; src: string | undefined; rendering: boolean }) {
  return (
    <Link
      to={`/presets?category=${c.id}`}
      className="group relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-lg bg-raised p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] transition-transform duration-300 ease-out hover:-translate-y-1"
    >
      {/* A wash of the category's tint until (and under) the real render. */}
      <span
        aria-hidden
        className="absolute inset-0 opacity-40 transition-opacity duration-500 group-hover:opacity-60"
        style={{ background: `radial-gradient(110% 70% at 25% 15%, ${c.tint}, transparent 65%), radial-gradient(90% 60% at 90% 100%, ${c.tint}55, transparent 70%)` }}
      />
      <AnimatePresence>
        {src && (
          <motion.img
            key={src}
            src={src}
            alt=""
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          />
        )}
      </AnimatePresence>
      {!src && rendering && <span aria-hidden className="skeleton absolute inset-0 opacity-50" />}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
      <span className="relative flex items-center justify-between font-mono text-[11px] font-medium tracking-[0.06em] text-white/85">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.tint }} />
          {c.code}
        </span>
        <span className="tabular">{c.count}</span>
      </span>
      <span className="relative text-[15px] leading-tight font-semibold tracking-[-0.015em] text-white">{c.label}</span>
    </Link>
  );
}

/** A ring of split light, slowly turning: the empty stage's invitation (static with reduced motion). */
function PrismRing({ size = 96, bright = false }: { size?: number; bright?: boolean }) {
  const ring = 'conic-gradient(from 0deg, var(--color-spec-1), var(--color-spec-2), var(--color-spec-3), var(--color-spec-4), var(--color-spec-5), var(--color-spec-1))';
  const mask = 'radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px))';
  return (
    <span aria-hidden className="relative block" style={{ width: size, height: size }}>
      <span
        className={`absolute inset-0 animate-[spin_14s_linear_infinite] rounded-full blur-xl ${bright ? 'opacity-80' : 'opacity-45'}`}
        style={{ background: ring }}
      />
      <span className="absolute inset-0 animate-[spin_14s_linear_infinite] rounded-full" style={{ background: ring, WebkitMask: mask, mask }} />
      <span className="absolute inset-0 m-auto h-[22%] w-[22%] rounded-full bg-accent shadow-[0_0_24px_rgb(212_255_63/0.8)]" />
    </span>
  );
}

/**
 * The stage: empty, it is the drop zone (tap or drop photos) with the prism ring; once there are
 * edits it holds the latest one as a big photo card, ready to continue.
 */
function Stage({
  dragOver,
  hero,
  onPick,
}: {
  dragOver: boolean;
  hero: { id: string; name: string; updatedAt: number; frames: number; src: string | null } | null;
  onPick: () => void;
}) {
  if (hero) {
    return (
      <Link
        to={`/project/${hero.id}`}
        aria-label={`Continue editing ${hero.name}`}
        className="group relative block aspect-[4/5] overflow-hidden rounded-xl bg-well shadow-float sm:aspect-[4/3]"
      >
        {hero.src ? (
          <img src={hero.src} alt="" decoding="async" className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.03]" />
        ) : (
          <span className="skeleton block h-full w-full" />
        )}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25" />
        <span className="label-caps absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-[10.5px] text-white/90 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Last edit
        </span>
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
          <span className="min-w-0">
            <span className="block truncate text-xl font-semibold tracking-[-0.02em] text-white sm:text-2xl">{hero.name}</span>
            <span className="mt-0.5 block font-mono text-xs text-white/65">
              {new Date(hero.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {hero.frames}{' '}
              {hero.frames === 1 ? 'photo' : 'photos'}
            </span>
          </span>
          <span className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-fg pr-4 pl-5 text-[15px] font-medium text-ground shadow-lift transition-transform duration-300 group-hover:translate-x-0.5">
            Continue <ArrowRight size={17} />
          </span>
        </span>
      </Link>
    );
  }
  return (
    <>
    <HowItWorks className="hidden coarse:block" />
    <button
      type="button"
      onClick={onPick}
      className={`group relative flex aspect-[4/3] w-full flex-col coarse:hidden items-center justify-center gap-5 overflow-hidden rounded-xl border bg-raised/60 text-center transition-[border-color,background-color] duration-300 ${
        dragOver ? 'border-accent bg-accent/5' : 'border-line hover:border-line-strong'
      }`}
    >
      <span aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,rgb(255_255_255/0.05),transparent)]" />
      <span className="transition-transform duration-500 ease-out group-hover:scale-110">
        <PrismRing size={88} bright={dragOver} />
      </span>
      <span className="relative">
        <span className="display block text-[1.9rem] text-fg">Drop a photo here</span>
        <span className="mt-2 block text-sm text-fg-3">or click to choose. Several at once is fine.</span>
      </span>
      <span className="label-caps relative text-fg-4">JPEG · PNG · WebP</span>
    </button>
    </>
  );
}

/**
 * Touch screens, first visit: the drop zone would only repeat the Open button, so the stage
 * explains the one idea that makes the app different, in three steps joined by the prism.
 */
const STEPS: { n: string; title: string; body: string; icon: typeof ImagePlus }[] = [
  { n: '01', title: 'Show it a photo you love', body: 'A saved post, a screenshot, a film still.', icon: ImagePlus },
  { n: '02', title: 'It becomes your look', body: 'Measured on this device into editable settings.', icon: Sparkles },
  { n: '03', title: 'Wear it, tweak it, keep it', body: 'On any photo, as a preset you can reuse.', icon: Wand2 },
];

function HowItWorks({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line-soft bg-raised/70 p-5 ${className}`}>
      <p className="label-caps text-fg-4">How it works</p>
      <ol className="relative mt-4 space-y-5">
        {/* The prism runs down the steps: light going in, a look coming out. */}
        <span aria-hidden className="absolute top-5 bottom-5 left-[19px] w-[2px] rounded-full bg-[linear-gradient(180deg,var(--color-spec-1),var(--color-spec-2),var(--color-spec-3),var(--color-spec-4),var(--color-spec-5))] opacity-70" />
        {STEPS.map((st) => (
          <li key={st.n} className="relative flex items-start gap-4">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised-2 text-fg ring-1 ring-line">
              <st.icon size={17} />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-fg-4">{st.n}</span>
                <span className="text-[15px] leading-snug font-semibold tracking-[-0.01em] text-fg">{st.title}</span>
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-fg-3">{st.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
