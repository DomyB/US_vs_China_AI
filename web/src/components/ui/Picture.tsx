"use client";

import { useEffect, useState } from "react";
import { loadPictures, pictureTitle, type Picture as Pic } from "@/lib/pictures";

/** The pictures file, loaded once per page; an empty map until it arrives or when the release has none. */
export function usePictures(): Map<string, Pic> | null {
  const [m, setM] = useState<Map<string, Pic> | null>(null);
  useEffect(() => {
    loadPictures().then(setM);
  }, []);
  return m;
}

/** A page's header picture that loads the file itself, so a server-rendered page can carry one with a single line. */
export function HeaderPicture({ id, caption, ratio = "header", className = "" }: { id: string; caption?: string; ratio?: keyof typeof RATIO; className?: string }) {
  const pictures = usePictures();
  return <Picture id={id} pictures={pictures} ratio={ratio} caption={caption} className={className} />;
}

const RATIO = { header: "aspect-[3/1]", card: "aspect-[16/9]", square: "aspect-square", tall: "aspect-[4/5]" } as const;

/**
 * A credited illustration: the picture, its title, author and licence, and a link to its Commons page. It renders nothing
 * when the id is not in the file, so a page is laid out the same with or without its pictures. Not a record: the caption
 * says so where the picture stands beside data.
 */
export function Picture({ id, pictures, ratio = "card", className = "", caption, bare = false }: { id: string; pictures: Map<string, Pic> | null; ratio?: keyof typeof RATIO; className?: string; caption?: string; bare?: boolean }) {
  const p = pictures?.get(id);
  if (!p) return null;
  const title = caption ?? pictureTitle(p);
  const credit = (
    <span className="picture-credit">
      {p.page_url ? <a href={p.page_url} target="_blank" rel="noreferrer" className="underline decoration-dotted">{pictureTitle(p)}</a> : pictureTitle(p)}
      {p.author ? `, ${p.author}` : ""}
      {p.license ? <>, {p.license_url ? <a href={p.license_url} target="_blank" rel="noreferrer" className="underline decoration-dotted">{p.license}</a> : p.license}</> : null}
      {p.image_url.startsWith("/") ? "" : ", via Wikimedia Commons"}
    </span>
  );
  return (
    <figure className={`picture ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- credited Commons pictures hot-linked or served with the site; no image pipeline */}
      <img src={p.image_url} alt={title} loading="lazy" className={`picture-img ${RATIO[ratio]}`} />
      {!bare && <figcaption className="picture-caption">{caption ? <><span className="text-ink-2">{caption}</span> <br /></> : null}{credit}</figcaption>}
    </figure>
  );
}
