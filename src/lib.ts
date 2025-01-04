export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const randomNumberFromRange = (array: number[]): number => Math.floor(Math.random() * (array[1] - array[0] + 1) + array[0]);

export const shuffle = (array: any) => array.sort(() => Math.random() - 0.5);