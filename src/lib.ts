export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const randomNumberFromRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

export function randChoice<T>(arr: Array<T>): T {
    return arr[Math.floor(Math.random() * arr.length)];
};