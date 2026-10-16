/**
 * Pictures for the site's pages: illustrations with their author and licence, never records (nothing is read from them).
 * Two pools: the Commons lead pictures looked up on the Actions runner (`pipeline/scripts/mineral_images.py --places`,
 * written to /data/pictures.json by hand) and the companion project's credited pictures served with the site.
 */
import { fetchOnce } from "@/lib/data";

export interface Picture {
  /** the picture id: an ISO3 code for a country, or a theme key */
  id: string;
  article?: string | null;
  file: string;
  image_url: string;
  page_url?: string | null;
  author?: string | null;
  license?: string | null;
  license_url?: string | null;
  credit?: string | null;
  /** a caption written by the team, when the file name would not do */
  caption?: string | null;
}
export interface PicturesFile { generated_on: string; note: string; pictures: Record<string, Omit<Picture, "id">> }

let cache: Promise<Map<string, Picture>> | null = null;

/** Every picture by id; an empty map when the file is not in the release, so a page without pictures is just a page. */
export function loadPictures(): Promise<Map<string, Picture>> {
  if (!cache) {
    cache = fetchOnce<PicturesFile>("/data/pictures.json")
      .then((f) => new Map(Object.entries(f.pictures ?? {}).filter(([, p]) => p && p.image_url).map(([id, p]) => [id, { id, ...p }])))
      .catch(() => new Map<string, Picture>());
  }
  return cache;
}

/** A readable title for a Commons file name ("Salar_de_Uyuni_Décembre_2007.jpg" → "Salar de Uyuni Décembre 2007"). */
export const pictureTitle = (p: Picture) => p.caption ?? p.file.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ");
