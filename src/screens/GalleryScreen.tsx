/** Home: one line of promise and the two ways in, your edits as a contact sheet, and the rolls. */
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Ellipsis, ImagePlus, Pencil, Settings, Trash2 } from 'lucide-react';
import { LooksIcon, MatchIcon } from '@/components/icons';
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
import { BUILTIN_PRESETS, PRESET_CATEGORIES } from '@/lib/presets/library';
import { rollOf } from '@/lib/presets/rolls';
import { presetThumb, setPreviewSource } from '@/engine/presetThumbs';
import { useSettings } from '@/state/settingsStore';
import { useEditor } from '@/state/editorStore';
import {
  createProject,
  deleteProject,
  getPhoto,
  listProjects,
  saveProject,
  type ProjectRecord,
} from '@/lib/storage/db';
import { importFiles } from '@/engine/importer';
import { SAMPLE_PHOTO, sampleFile } from '@/lib/samples';

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
  // The open "⋯" menu on one of your edits (closes on any tap outside it).
  const [menuFor, setMenuFor] = useState<string | null>(null);
  useEffect(() => {
    if (!menuFor) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!t.closest('[data-frame-menu]') && !t.closest('[aria-haspopup="menu"]')) setMenuFor(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuFor(null);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [menuFor]);
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
              <LooksIcon size={18} /> <span className="hidden sm:inline">Looks</span>
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

      <main className="screen-enter mx-auto max-w-5xl px-4 pb-24 sm:px-8">
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

        {/* One line of promise, the two ways in, nothing else. */}
        <section className="pt-8 pb-12 sm:pt-16 sm:pb-16">
          <h1 className="display text-[clamp(2.9rem,13vw,5.5rem)] text-fg">
            <span data-reveal className="block">
              Any look.
            </span>
            <span data-reveal className="block">
              Made <span className="voice pr-2 text-accent">yours.</span>
            </span>
          </h1>
          <div data-reveal className="mt-8 grid grid-cols-2 gap-2.5 sm:flex sm:gap-3">
            <Button variant="accent" size="lg" className="h-13 px-4 text-[15px] sm:h-12 sm:px-6" icon={<MatchIcon size={18} strokeWidth={2} />} onClick={matchLook}>
              Match a look
            </Button>
            <Button variant="secondary" size="lg" className="h-13 px-4 text-[15px] sm:h-12 sm:px-6" icon={<ImagePlus size={18} />} onClick={pickPhotos}>
              Open a photo
            </Button>
          </div>
          <p data-reveal className="mt-4 font-mono text-[11px] text-fg-4">
            free · private · on this device
          </p>
          {importing && (
            <div className="mt-6 max-w-sm" role="status">
              <p className="mb-2 font-mono text-xs text-fg-3">
                importing {importing.done} of {importing.total}
              </p>
              <Progress value={importing.done / importing.total} label="Import progress" />
            </div>
          )}
        </section>

        {/* Your edits as a contact sheet: numbered frames with their dates. */}
        <section aria-labelledby="edits-title" className="pb-14">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="edits-title" className="font-mono text-[13px] font-medium text-fg lowercase [font-stretch:100%]">
              Your edits
            </h2>
            {projects && projects.length > 0 && (
              <span className="font-mono text-[11px] text-fg-4">
                {projects.length} {projects.length === 1 ? 'frame' : 'frames'}
              </span>
            )}
          </div>
          {projects === null ? (
            <div className="h-40" />
          ) : projects.length === 0 ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <li>
                <button
                  type="button"
                  onClick={pickPhotos}
                  className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-line-strong text-fg-3 transition-colors hover:border-accent hover:text-fg"
                >
                  <FinderMark size={34} bright={dragOver} />
                  <span className="font-mono text-[10px]">add a photo</span>
                </button>
              </li>
              {/* First visit: a bundled CC0 photo to try every look on, one tap away. */}
              <li>
                <button
                  type="button"
                  onClick={() =>
                    void sampleFile()
                      .then((f) => startProject([f], 'edit'))
                      .catch((e: unknown) => showToast(e instanceof Error ? e.message : 'The sample photo could not be loaded.', 'error'))
                  }
                  className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[8px] bg-raised-2 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-offset"
                  data-testid="try-sample"
                >
                  <img src={SAMPLE_PHOTO.thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  <span className="absolute inset-x-0 bottom-2 text-center font-mono text-[10px] text-white">try a sample</span>
                </button>
              </li>
              <li aria-hidden className="aspect-[4/5] rounded-[8px] border border-dashed border-line-soft" />
            </ul>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
              <AnimatePresence initial={false}>
                {projects.map((p, i) => {
                  const current = p.id === hero?.id;
                  const d = new Date(p.updatedAt);
                  const date = `${String(d.getMonth() + 1).padStart(2, '0')}·${String(d.getDate()).padStart(2, '0')}`;
                  return (
                    <motion.li
                      key={p.id}
                      layout
                      data-frame
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 8) * 0.03 }}
                      className="group relative"
                    >
                      <Link
                        to={`/project/${p.id}`}
                        aria-label={`Open ${p.name}`}
                        title={p.name}
                        className={`relative flex flex-col gap-1.5 rounded-[8px] border bg-well px-1.5 pt-3 pb-1.5 transition-[transform,border-color,box-shadow] duration-200 active:scale-[0.98] ${
                          current ? 'border-accent shadow-offset-sm' : 'border-line hover:border-line-strong'
                        }`}
                      >
                        <span aria-hidden className="absolute top-[5px] right-2 left-2 h-[3px] bg-[repeating-linear-gradient(90deg,var(--color-line-strong)_0_5px,transparent_5px_10px)] opacity-70" />
                        <span className="relative block aspect-[4/5] overflow-hidden rounded-[3px] bg-raised-2">
                          {p.cover ? (
                            <img src={p.cover} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                          ) : (
                            <span className="skeleton block h-full w-full" />
                          )}
                          {p.photoIds.length > 1 && (
                            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-1.5 font-mono text-[9px] text-white">
                              ×{p.photoIds.length}
                            </span>
                          )}
                        </span>
                        <span className="flex justify-between px-0.5 font-mono text-[10px]">
                          <span className={current ? 'text-fg' : 'text-fg-4'}>{String(projects.length - i).padStart(2, '0')}</span>
                          <span className="text-fg-4">{date}</span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`Options for ${p.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === p.id}
                        onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                        className="absolute top-4 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-opacity coarse:h-9 coarse:w-9 fine:opacity-0 fine:group-focus-within:opacity-100 fine:group-hover:opacity-100"
                      >
                        <Ellipsis size={14} />
                      </button>
                      {menuFor === p.id && (
                        <div role="menu" data-frame-menu className="absolute top-12 right-1.5 z-20 w-36 rounded-md border border-line bg-raised-2 p-1 shadow-float">
                          <button
                            type="button"
                            role="menuitem"
                            aria-label={`Rename ${p.name}`}
                            onClick={() => {
                              setMenuFor(null);
                              setRenaming(p);
                            }}
                            className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-[13px] text-fg-2 hover:bg-control hover:text-fg coarse:h-11"
                          >
                            <Pencil size={13} /> Rename
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => {
                              setMenuFor(null);
                              setConfirmDelete(p);
                            }}
                            className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-[13px] text-danger hover:bg-control coarse:h-11"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {/* The rolls, each cover rendered with its first look on your last photo. */}
        <section aria-labelledby="looks-title">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="looks-title" className="font-mono text-[13px] font-medium text-fg lowercase [font-stretch:100%]">
              Rolls
            </h2>
            <Link to="/presets" className="group flex items-center gap-1 font-mono text-[11px] text-fg-3 transition-colors hover:text-fg">
              all {BUILTIN_PRESETS.length}
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <ul className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8">
            {SHELF.map((c) => (
              <li key={c.id} data-look className="w-[132px] shrink-0 snap-start sm:w-[150px]">
                <CategoryTile category={c} src={thumbs[c.id]} rendering={projects !== null} />
              </li>
            ))}
          </ul>
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
              <FinderMark size={120} bright />
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


/** The rolls on the home rail: one tile per roll, its cover rendered with its first look on your last photo. */
const SHELF = PRESET_CATEGORIES.map((id) => {
  const looks = BUILTIN_PRESETS.filter((p) => p.category === id);
  const roll = rollOf(id);
  return { id, label: roll.name, mood: roll.mood, code: `roll ${roll.no}`, count: looks.length, first: looks[0] };
}).filter((c) => c.count > 0);

/**
 * Real renders for the rail: each category's first look through the same pipeline, on the
 * user's latest photo, or on the bundled sample photo before they have one (null). While projects
 * load (undefined), none.
 */
function useCategoryThumbs(photoId: string | null | undefined): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (photoId === undefined) return;
    let alive = true;
    void (async () => {
      const blob = photoId
        ? (await getPhoto(photoId).catch(() => undefined))?.thumbnail
        : await fetch(SAMPLE_PHOTO.thumbUrl)
            .then((r) => (r.ok ? r.blob() : undefined))
            .catch(() => undefined);
      const bmp = blob ? await createImageBitmap(blob).catch(() => null) : null;
      if (!alive || !bmp) return;
      await setPreviewSource(`home:${photoId ?? 'sample'}`, bmp);
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
      className="group relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-lg bg-raised-2 p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-offset"
    >
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
      <span className="relative flex items-center justify-between font-mono text-[11px] font-medium text-white/85">
        <span>{c.code}</span>
        <span className="tabular">{c.count}</span>
      </span>
      <span className="relative">
        <span className="block text-[15px] leading-tight font-semibold tracking-[-0.015em] text-white">{c.label}</span>
        <span className="mt-1 block font-mono text-[10px] text-white/70">{c.mood}</span>
      </span>
    </Link>
  );
}

/** Viewfinder corners around a lilac point: the empty stage's invitation. `bright` while a drop hovers. */
function FinderMark({ size = 96, bright = false }: { size?: number; bright?: boolean }) {
  const corner = `absolute h-[30%] w-[30%] border-solid transition-colors duration-300 ${bright ? 'border-accent' : 'border-fg-3'}`;
  return (
    <span aria-hidden className="relative block" style={{ width: size, height: size }}>
      <span className={`${corner} top-0 left-0 border-t-2 border-l-2`} />
      <span className={`${corner} top-0 right-0 border-t-2 border-r-2`} />
      <span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${corner} right-0 bottom-0 border-r-2 border-b-2`} />
      <span className="absolute inset-0 m-auto h-[18%] w-[18%] rounded-full bg-accent shadow-offset-sm" />
    </span>
  );
}


