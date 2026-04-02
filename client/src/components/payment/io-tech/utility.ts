
/**
 * Used to pause execution while other things are operating
 * @param ms 
 * @returns 
 */

export const sleep = (ms:number) => new Promise((resolve) => setTimeout(resolve, ms))