import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Star, Trash2, GripVertical } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../lib/permissions";
import { RequirePermission } from "../../components/RequirePermission";
import { PhotoLightbox } from "../../components/ui/photo-lightbox";
import { Button } from "../../components/ui/button";
import type { Database } from "../../types/database";

type FileRow = Database["public"]["Tables"]["PropertyFile"]["Row"];

export function PropertyPhotosPage() {
  const { id } = useParams<{ id: string }>();
  const { permissions } = useAuth();
  const canEdit = hasPermission(permissions, "manage_properties");
  const [photos, setPhotos] = useState<FileRow[]>([]);
  const [propertyTitle, setPropertyTitle] = useState("Propiedad");
  const [photoLbIndex, setPhotoLbIndex] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const [{ data: prop }, { data: files }] = await Promise.all([
        supabase.from("Property").select("title").eq("id", id).maybeSingle(),
        supabase.from("PropertyFile").select("*").eq("property_id", id).in("kind", ["photo", "cover"]),
      ]);
      if (prop?.title) setPropertyTitle(prop.title);
      const sorted = ((files as FileRow[]) ?? []).sort((a, b) => {
        if (a.kind === "cover") return -1;
        if (b.kind === "cover") return 1;
        return 0;
      });
      setPhotos(sorted);
    })();
  }, [id]);

  async function deletePhoto(photo: FileRow) {
    if (!window.confirm(`¿Eliminar "${photo.label ?? "esta foto"}"?`)) return;
    const { error } = await supabase.from("PropertyFile").delete().eq("id", photo.id);
    if (error) {
      setMsg(error.message);
      return;
    }
    setPhotos((prev) => {
      const removedIdx = prev.findIndex((p) => p.id === photo.id);
      const next = prev.filter((p) => p.id !== photo.id);
      setPhotoLbIndex((idx) => {
        if (idx === null) return null;
        if (next.length === 0) return null;
        if (removedIdx === -1) return Math.min(idx, next.length - 1);
        if (idx > removedIdx) return idx - 1;
        return Math.min(idx, next.length - 1);
      });
      return next;
    });
    setMsg("Foto eliminada.");
  }

  async function toggleCover(photo: FileRow) {
    const isCover = photo.kind === "cover";
    const newKind = isCover ? "photo" : "cover";
    const { error } = await supabase.from("PropertyFile").update({ kind: newKind }).eq("id", photo.id);
    if (error) {
      setMsg(error.message);
      return;
    }
    setPhotos((prev) => {
      const updated = prev.map((p) =>
        p.id === photo.id
          ? { ...p, kind: newKind }
          : p.kind === "cover" && newKind === "cover"
            ? { ...p, kind: "photo" }
            : p,
      );
      return updated.sort((a, b) => {
        if (a.kind === "cover") return -1;
        if (b.kind === "cover") return 1;
        return 0;
      });
    });
    setMsg(isCover ? "Portada eliminada." : "Marcada como portada.");
  }

  function onDragStart(photoId: string) {
    dragRef.current = photoId;
  }

  function onDrop(targetId: string) {
    const fromId = dragRef.current;
    if (!fromId || fromId === targetId) {
      setDragOverId(null);
      return;
    }
    setPhotos((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((p) => p.id === fromId);
      const toIdx = arr.findIndex((p) => p.id === targetId);
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
    dragRef.current = null;
    setDragOverId(null);
  }

  if (!id) return null;

  const cover = photos.find((p) => p.kind === "cover");
  const lbFooterPhoto = photoLbIndex !== null ? (photos[photoLbIndex] ?? null) : null;

  return (
    <RequirePermission slug="view_properties">
      <div className="space-y-6">
        <p className="text-sm text-[var(--muted)]">
          <Link to="/dashboard/properties" className="text-[var(--accent)] hover:underline">
            Propiedades
          </Link>{" "}
          /{" "}
          <Link to={`/dashboard/properties/${id}#fotos-galeria`} className="text-[var(--accent)] hover:underline">
            {propertyTitle}
          </Link>{" "}
          / Galería
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Galería de fotos</h1>
            <p className="text-sm text-[var(--muted)]">
              {photos.length} foto(s){cover ? " · Portada definida" : ""}
              {canEdit ? " · Arrastrá para reordenar" : ""}
            </p>
          </div>
          <Link to={`/dashboard/properties/${id}#fotos-galeria`}>
            <Button type="button" variant="ghost">
              Volver a la propiedad
            </Button>
          </Link>
        </div>

        {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}

        {photos.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[var(--muted)]">
            No hay fotos cargadas.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {photos.map((photo) => {
            const isCover = photo.kind === "cover";
            const isOver = dragOverId === photo.id;
            return (
              <div
                key={photo.id}
                draggable={canEdit}
                onDragStart={() => onDragStart(photo.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(photo.id);
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={() => onDrop(photo.id)}
                className={[
                  "group relative overflow-hidden rounded-xl border transition-all",
                  isCover ? "border-amber-400/70 ring-2 ring-amber-400/40" : "border-[var(--border)]",
                  isOver ? "scale-95 opacity-60" : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => setPhotoLbIndex(photos.findIndex((p) => p.id === photo.id))}
                >
                  <img
                    src={photo.url}
                    alt={photo.label ?? "Foto"}
                    className="h-44 w-full object-cover"
                  />
                </button>

                {isCover && (
                  <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold text-black">
                    <Star className="size-3" />
                    Portada
                  </div>
                )}

                {canEdit && (
                  <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      title={isCover ? "Quitar portada" : "Marcar como portada"}
                      onClick={(e) => { e.stopPropagation(); void toggleCover(photo); }}
                      className={[
                        "rounded-full p-1.5 text-xs shadow",
                        isCover ? "bg-amber-400 text-black" : "bg-black/70 text-amber-300 hover:bg-amber-400 hover:text-black",
                      ].join(" ")}
                    >
                      <Star className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Eliminar foto"
                      onClick={(e) => { e.stopPropagation(); void deletePhoto(photo); }}
                      className="rounded-full bg-black/70 p-1.5 text-red-400 shadow hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <div className="cursor-grab rounded-full bg-black/70 p-1.5 text-[var(--muted)] shadow">
                      <GripVertical className="size-3.5" />
                    </div>
                  </div>
                )}

                {photo.label ? (
                  <p className="truncate bg-black/50 px-2 py-1 text-xs text-white">{photo.label}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <PhotoLightbox
          open={photoLbIndex !== null && photos.length > 0}
          items={photos.map((p) => ({ id: p.id, url: p.url, label: p.label }))}
          index={photoLbIndex ?? 0}
          onClose={() => setPhotoLbIndex(null)}
          onIndexChange={setPhotoLbIndex}
          footer={
            canEdit && lbFooterPhoto ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => void toggleCover(lbFooterPhoto)}
                >
                  <Star className="mr-1 size-3.5" />
                  {lbFooterPhoto.kind === "cover" ? "Quitar portada" : "Marcar como portada"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-300 hover:bg-white/10 hover:text-red-200"
                  onClick={() => void deletePhoto(lbFooterPhoto)}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  Eliminar
                </Button>
              </div>
            ) : null
          }
        />
      </div>
    </RequirePermission>
  );
}
