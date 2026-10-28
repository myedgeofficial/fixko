// Iz iste kode nastaneta dve aplikaciji: Popravko (Slovenija, slovensko) in Fixko (tujina, 10 jezikov).
// Izdajo določi gradnja (FIXKO_IZDAJA v app/scripts/build-www.js); privzeto je Popravko.
export const FIXKO = typeof window !== "undefined" && window.FIXKO_IZDAJA === "fixko";
