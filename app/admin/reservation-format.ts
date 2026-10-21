export const money = (amount: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
export const status = (value: string | null) => value ? value.replaceAll("_", " ") : "Not recorded";
