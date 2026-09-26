import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind クラスを条件付きで結合し、競合を解決する。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
