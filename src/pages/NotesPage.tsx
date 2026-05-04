import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useActiveOrganization } from "../contexts/OrganizationContext";
import { RequirePermission } from "../components/RequirePermission";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import type { Database } from "../types/database";

type NoteRow = Database["public"]["Tables"]["UserNote"]["Row"];

const DEBOUNCE_MS = 2000;

export function NotesPage() {
  const { user } = useAuth();
  const org = useActiveOrganization();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDetail, setDraftDetail] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef({ title: "", detail: "" });
  const selectedRef = useRef<string | null>(null);
  const lastSavedRef = useRef<{ id: string; title: string; detail: string } | null>(null);

  useEffect(() => {
    draftRef.current = { title: draftTitle, detail: draftDetail };
    selectedRef.current = selectedId;
  }, [draftTitle, draftDetail, selectedId]);

  const reloadNotes = useCallback(async (): Promise<NoteRow[]> => {
    if (!user?.id) return [];
    const { data, error } = await supabase
      .from("UserNote")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      setMsg(error.message);
      return [];
    }
    const list = (data as NoteRow[]) ?? [];
    setNotes(list);
    return list;
  }, [user]);

  const persist = useCallback(async (noteId: string, title: string, detail: string) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from("UserNote")
      .update({ title, detail })
      .eq("id", noteId)
      .eq("user_id", user.id);
    if (error) {
      setMsg(error.message);
      return;
    }
    lastSavedRef.current = { id: noteId, title, detail };
    void reloadNotes();
  }, [reloadNotes, user]);

  const flushTimers = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flushNow = useCallback(async () => {
    flushTimers();
    const sid = selectedRef.current;
    if (!sid || !user?.id) return;
    const { title, detail } = draftRef.current;
    await persist(sid, title, detail);
  }, [persist, user]);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    void (async () => {
      const list = await reloadNotes();
      setLoading(false);
      if (!list.length) {
        setSelectedId(null);
        setDraftTitle("");
        setDraftDetail("");
        lastSavedRef.current = null;
      } else if (!selectedRef.current || !list.some((n) => n.id === selectedRef.current)) {
        const n = list[0];
        setSelectedId(n.id);
        setDraftTitle(n.title);
        setDraftDetail(n.detail);
        lastSavedRef.current = { id: n.id, title: n.title, detail: n.detail };
      }
    })();
  }, [reloadNotes, user?.id, org.id]);

  useEffect(() => {
    if (!selectedId) return;
    const baseline = lastSavedRef.current;
    const unchanged =
      baseline &&
      baseline.id === selectedId &&
      baseline.title === draftTitle &&
      baseline.detail === draftDetail;
    if (unchanged) return;

    flushTimers();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist(selectedId, draftRef.current.title, draftRef.current.detail);
    }, DEBOUNCE_MS);

    return () => flushTimers();
  }, [draftTitle, draftDetail, selectedId, persist]);

  useEffect(
    () => () => {
      flushTimers();
      const sid = selectedRef.current;
      if (!sid || !user?.id) return;
      const baseline = lastSavedRef.current;
      const { title, detail } = draftRef.current;
      if (!baseline || baseline.id !== sid || baseline.title !== title || baseline.detail !== detail) {
        void persist(sid, title, detail);
      }
    },
    [persist, user?.id],
  );

  async function selectNote(note: NoteRow) {
    if (selectedId === note.id) return;
    setMsg(null);
    await flushNow();
    setSelectedId(note.id);
    setDraftTitle(note.title);
    setDraftDetail(note.detail);
    lastSavedRef.current = { id: note.id, title: note.title, detail: note.detail };
  }

  async function addNote() {
    if (!user?.id) return;
    setMsg(null);
    await flushNow();
    const { data, error } = await supabase
      .from("UserNote")
      .insert({
        organization_id: org.id,
        user_id: user.id,
        title: "Sin título",
        detail: "",
      })
      .select("*")
      .single();
    if (error || !data) {
      setMsg(error?.message ?? "No se pudo crear la nota");
      return;
    }
    const row = data as NoteRow;
    await reloadNotes();
    setSelectedId(row.id);
    setDraftTitle(row.title);
    setDraftDetail(row.detail);
    lastSavedRef.current = { id: row.id, title: row.title, detail: row.detail };
  }

  async function confirmDeleteNote() {
    if (!selectedId || !user?.id) return;
    setMsg(null);
    await flushNow();
    const { error } = await supabase.from("UserNote").delete().eq("id", selectedId).eq("user_id", user.id);
    setDeleteModalOpen(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    const list = await reloadNotes();
    if (list.length) {
      const n = list[0];
      setSelectedId(n.id);
      setDraftTitle(n.title);
      setDraftDetail(n.detail);
      lastSavedRef.current = { id: n.id, title: n.title, detail: n.detail };
    } else {
      setSelectedId(null);
      setDraftTitle("");
      setDraftDetail("");
      lastSavedRef.current = null;
    }
  }

  return (
    <RequirePermission slug="view_dashboard">
      <div className="jif-page flex min-h-[calc(100dvh-7.5rem)] flex-col gap-8">
        <header className="border-b border-[var(--jif-line)] pb-6">
          <div>
            <h1 className="jif-hero">Notas</h1>
            <p className="jif-caps jif-dim mt-1">
              Bloc personal por usuario; el contenido se guarda solo unos segundos después de que dejás de escribir.
            </p>
          </div>
        </header>
        {msg ? <p className="text-sm text-red-400">{msg}</p> : null}

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:items-stretch">
          <div className="flex w-full shrink-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 md:w-72">
            <Button type="button" variant="secondary" size="sm" className="w-full shrink-0" onClick={() => void addNote()}>
              Nueva nota
            </Button>
            <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto md:max-h-none">
              {loading ? (
                <p className="text-sm text-[var(--muted)]">Cargando…</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Todavía no hay notas.</p>
              ) : (
                notes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void selectNote(n)}
                    className={
                      selectedId === n.id
                        ? "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-sm font-medium"
                        : "w-full rounded-lg border border-transparent px-3 py-2 text-left text-sm text-[var(--foreground)] hover:border-[var(--border)]"
                    }
                  >
                    <span className="line-clamp-2">{n.title || "(sin título)"}</span>
                    <span className="block text-xs text-[var(--muted)]">{new Date(n.updated_at).toLocaleString()}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="relative flex min-h-[min(28rem,calc(100dvh-14rem))] min-w-0 flex-1 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:min-h-0">
            {selectedId ? (
              <>
                <input
                  className="w-full shrink-0 border-b border-[var(--border)] bg-transparent pb-2 text-lg font-semibold outline-none placeholder:text-[var(--muted)]"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Título"
                />
                <textarea
                  className="mt-3 min-h-0 w-full flex-1 resize-none border-0 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                  value={draftDetail}
                  onChange={(e) => setDraftDetail(e.target.value)}
                  placeholder="Detalle…"
                />
                <div className="mt-auto flex justify-end border-t border-[var(--border)] pt-3">
                  <Button type="button" variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>
                    Eliminar nota
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">Creá una nota o esperá que carguen.</p>
            )}
          </div>
        </div>

        <Modal
          open={deleteModalOpen}
          title="Eliminar nota"
          onClose={() => setDeleteModalOpen(false)}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setDeleteModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" onClick={() => void confirmDeleteNote()}>
                Sí, eliminar
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--foreground)]">
            ¿Estás seguro de que querés eliminar esta nota? Esta acción no se puede deshacer.
          </p>
        </Modal>
      </div>
    </RequirePermission>
  );
}
