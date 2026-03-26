import chalk from "chalk";

export const green = chalk.hex("#00DE91");
export const dim = chalk.dim;
export const bold = chalk.bold;
export const red = chalk.red;
export const yellow = chalk.yellow;
export const cyan = chalk.cyan;

export function trunc(address: string, len = 8): string {
  if (address.length <= len + 3) return address;
  return address.slice(0, len) + "...";
}

export function header(title: string): void {
  console.log();
  console.log(bold(`  ${title}`));
  console.log();
}

export function kvLine(key: string, value: string): void {
  console.log(`  ${dim(key.padEnd(16))} ${value}`);
}

export function success(msg: string): void {
  console.log(`  ${green("✔")} ${msg}`);
}

export function fail(msg: string): void {
  console.log(`  ${red("✘")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${yellow("⚠")} ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${msg}`);
}

export function explorerLink(type: "tx" | "address", value: string, network: string): string {
  const cluster = network.includes("mainnet") ? "" : "?cluster=devnet";
  return `https://explorer.solana.com/${type}/${value}${cluster}`;
}

export function usdcAmount(smallest: bigint | number | string): string {
  const n = Number(smallest) / 1_000_000;
  return n.toFixed(n < 0.01 ? 4 : 2);
}

export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
  );
  const sep = "─";
  const top =
    "  ┌" + widths.map((w) => sep.repeat(w + 2)).join("┬") + "┐";
  const mid =
    "  ├" + widths.map((w) => sep.repeat(w + 2)).join("┼") + "┤";
  const bot =
    "  └" + widths.map((w) => sep.repeat(w + 2)).join("┴") + "┘";

  const fmtRow = (r: string[]) =>
    "  │" + r.map((c, i) => ` ${(c || "").padEnd(widths[i])} `).join("│") + "│";

  console.log(top);
  console.log(fmtRow(headers));
  console.log(mid);
  rows.forEach((r) => console.log(fmtRow(r)));
  console.log(bot);
}
