export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const randomNumberFromRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

export const shuffle = (array: any) => array.sort(() => Math.random() - 0.5);

export const isDiff = (a: string, b: string): boolean => a != b;