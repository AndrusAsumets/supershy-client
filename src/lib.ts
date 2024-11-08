export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const randomNumberFromRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);